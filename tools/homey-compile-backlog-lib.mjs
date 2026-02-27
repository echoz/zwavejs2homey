import fs from 'node:fs';
import path from 'node:path';
import {
  formatJsonCompact,
  formatJsonPretty,
  formatNdjson,
  isSupportedDiagnosticFormat,
} from './output-format-lib.mjs';

const DIFF_ONLY_FILTERS = new Set([
  'all',
  'worsened',
  'improved',
  'neutral',
  'added',
  'removed',
  'changed',
  'unchanged',
]);
const NEXT_FALLBACK_MODES = new Set(['summary', 'none']);
const NEXT_CANDIDATE_POLICIES = new Set(['curation', 'pressure']);
const NEXT_FORMATS = new Set([
  'summary',
  'list',
  'markdown',
  'json',
  'json-pretty',
  'json-compact',
]);

function parseFlagMap(argv) {
  const flags = new Map();
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const [key, inline] = token.split('=', 2);
    if (inline !== undefined) {
      flags.set(key, inline);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, 'true');
    }
  }
  return { flags, positionals };
}

function readJsonFile(filePath, label) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${label} "${resolved}": ${reason}`);
  }
  return { filePath: resolved, raw };
}

function loadBacklogArtifact(filePath, label) {
  const loaded = readJsonFile(filePath, label);
  if (!loaded.raw || typeof loaded.raw !== 'object' || Array.isArray(loaded.raw)) {
    throw new Error(`${label} "${loaded.filePath}" must be a JSON object`);
  }
  if (loaded.raw.schemaVersion !== 'curation-backlog/v1') {
    throw new Error(
      `${label} "${loaded.filePath}" schemaVersion must be "curation-backlog/v1" (received: ${String(loaded.raw.schemaVersion)})`,
    );
  }
  if (!Array.isArray(loaded.raw.entries)) {
    throw new Error(`${label} "${loaded.filePath}" must include an "entries" array`);
  }
  return loaded;
}

function parsePositiveInt(rawValue, flagName, defaultValue) {
  const value = rawValue ?? String(defaultValue);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flagName} must be a positive integer (received: ${String(value)})`);
  }
  return parsed;
}

function normalizeCount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countMapToSortedEntries(rawCounts) {
  if (!rawCounts || typeof rawCounts !== 'object' || Array.isArray(rawCounts)) return [];
  return Object.entries(rawCounts)
    .map(([key, value]) => [key, normalizeCount(value)])
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
}

function topReason(actionableReasonCounts) {
  const sorted = countMapToSortedEntries(actionableReasonCounts);
  return sorted[0]?.[0] ?? '';
}

function normalizeBacklogEntry(rawEntry, index) {
  const entry =
    rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry) ? rawEntry : {};
  const rank = Number.isInteger(Number(entry.rank)) ? Number(entry.rank) : index + 1;
  const signature =
    typeof entry.signature === 'string' && entry.signature.length > 0
      ? entry.signature
      : `unknown:${index + 1}`;
  const pressure =
    entry.pressure && typeof entry.pressure === 'object' && !Array.isArray(entry.pressure)
      ? entry.pressure
      : {};
  return {
    ...entry,
    rank,
    signature,
    nodeCount: normalizeCount(entry.nodeCount),
    reviewNodeCount: normalizeCount(entry.reviewNodeCount),
    genericNodeCount: normalizeCount(entry.genericNodeCount),
    emptyNodeCount: normalizeCount(entry.emptyNodeCount),
    pressure: {
      suppressedFillActionsTotal: normalizeCount(pressure.suppressedFillActionsTotal),
      unmatchedActionsTotal: normalizeCount(pressure.unmatchedActionsTotal),
      appliedActionsTotal: normalizeCount(pressure.appliedActionsTotal),
      unmatchedRatio: normalizeNumber(pressure.unmatchedRatio),
      highUnmatchedRatioSignalCount: normalizeCount(pressure.highUnmatchedRatioSignalCount),
    },
  };
}

function sortBacklogEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.reviewNodeCount !== b.reviewNodeCount) return b.reviewNodeCount - a.reviewNodeCount;
    if (a.genericNodeCount !== b.genericNodeCount) return b.genericNodeCount - a.genericNodeCount;
    if (a.emptyNodeCount !== b.emptyNodeCount) return b.emptyNodeCount - a.emptyNodeCount;
    if (a.nodeCount !== b.nodeCount) return b.nodeCount - a.nodeCount;
    return a.signature.localeCompare(b.signature);
  });
}

function renderTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? '').length)),
  );
  const renderRow = (row) =>
    row
      .map((cell, index) => String(cell ?? '').padEnd(widths[index], ' '))
      .join('  ')
      .trimEnd();
  return [
    renderRow(headers),
    renderRow(widths.map((w) => '-'.repeat(w))),
    ...rows.map(renderRow),
  ].join('\n');
}

function formatSignedDelta(value) {
  if (!Number.isFinite(value)) return '';
  if (value > 0) return `+${value}`;
  return String(value);
}

function renderMarkdownTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? '')).join(' | ')} |`);
  return [headerLine, divider, ...body].join('\n');
}

function summarizeBacklog(artifact, command, filePath) {
  const entries = sortBacklogEntries(artifact.entries.map(normalizeBacklogEntry));
  const top = entries.slice(0, command.top);
  const counts =
    artifact.counts && typeof artifact.counts === 'object' && !Array.isArray(artifact.counts)
      ? artifact.counts
      : {};
  const totalNodes = normalizeCount(counts.totalNodes);
  const reviewNodes = normalizeCount(counts.reviewNodes);
  return {
    kind: 'summary',
    filePath,
    generatedAt: artifact.generatedAt ?? null,
    totals: {
      signatures: entries.length,
      totalNodes,
      reviewNodes,
    },
    topLimit: command.top,
    entries: top,
  };
}

function metricFromEntry(entry) {
  if (!entry) {
    return {
      nodeCount: 0,
      reviewNodeCount: 0,
      genericNodeCount: 0,
      emptyNodeCount: 0,
    };
  }
  return {
    nodeCount: normalizeCount(entry.nodeCount),
    reviewNodeCount: normalizeCount(entry.reviewNodeCount),
    genericNodeCount: normalizeCount(entry.genericNodeCount),
    emptyNodeCount: normalizeCount(entry.emptyNodeCount),
  };
}

function diffDirection(status, before, after, delta) {
  if (status === 'added') {
    return after.reviewNodeCount > 0 || after.genericNodeCount > 0 || after.emptyNodeCount > 0
      ? 'worsened'
      : 'neutral';
  }
  if (status === 'removed') {
    return before.reviewNodeCount > 0 || before.genericNodeCount > 0 || before.emptyNodeCount > 0
      ? 'improved'
      : 'neutral';
  }
  if (delta.reviewNodeCount > 0 || delta.genericNodeCount > 0 || delta.emptyNodeCount > 0) {
    return 'worsened';
  }
  if (delta.reviewNodeCount < 0 || delta.genericNodeCount < 0 || delta.emptyNodeCount < 0) {
    return 'improved';
  }
  return 'neutral';
}

function includeDiffEntry(entry, only) {
  if (!only || only === 'all') return true;
  if (only === 'worsened' || only === 'improved' || only === 'neutral') {
    return entry.direction === only;
  }
  return entry.status === only;
}

function buildBacklogDiff(fromArtifact, toArtifact, command, filePathFrom, filePathTo) {
  const fromEntries = sortBacklogEntries(fromArtifact.entries.map(normalizeBacklogEntry));
  const toEntries = sortBacklogEntries(toArtifact.entries.map(normalizeBacklogEntry));
  const fromBySignature = new Map(fromEntries.map((entry) => [entry.signature, entry]));
  const toBySignature = new Map(toEntries.map((entry) => [entry.signature, entry]));
  const signatures = [...new Set([...fromBySignature.keys(), ...toBySignature.keys()])].sort();

  const entries = signatures.map((signature) => {
    const beforeEntry = fromBySignature.get(signature);
    const afterEntry = toBySignature.get(signature);
    const before = metricFromEntry(beforeEntry);
    const after = metricFromEntry(afterEntry);
    const delta = {
      nodeCount: after.nodeCount - before.nodeCount,
      reviewNodeCount: after.reviewNodeCount - before.reviewNodeCount,
      genericNodeCount: after.genericNodeCount - before.genericNodeCount,
      emptyNodeCount: after.emptyNodeCount - before.emptyNodeCount,
    };
    const status = beforeEntry
      ? afterEntry
        ? delta.nodeCount === 0 &&
          delta.reviewNodeCount === 0 &&
          delta.genericNodeCount === 0 &&
          delta.emptyNodeCount === 0
          ? 'unchanged'
          : 'changed'
        : 'removed'
      : 'added';
    const direction = diffDirection(status, before, after, delta);
    return {
      signature,
      status,
      direction,
      before,
      after,
      delta,
      topReasonBefore: topReason(beforeEntry?.actionableReasonCounts),
      topReasonAfter: topReason(afterEntry?.actionableReasonCounts),
    };
  });

  const filtered = entries.filter((entry) => includeDiffEntry(entry, command.only));
  const directionOrder = { worsened: 0, neutral: 1, improved: 2 };
  filtered.sort((a, b) => {
    const byDirection = directionOrder[a.direction] - directionOrder[b.direction];
    if (byDirection !== 0) return byDirection;
    if (a.delta.reviewNodeCount !== b.delta.reviewNodeCount) {
      return b.delta.reviewNodeCount - a.delta.reviewNodeCount;
    }
    if (a.delta.genericNodeCount !== b.delta.genericNodeCount) {
      return b.delta.genericNodeCount - a.delta.genericNodeCount;
    }
    if (a.delta.emptyNodeCount !== b.delta.emptyNodeCount) {
      return b.delta.emptyNodeCount - a.delta.emptyNodeCount;
    }
    return a.signature.localeCompare(b.signature);
  });

  const top = filtered.slice(0, command.top);
  const statusCounts = {
    added: filtered.filter((entry) => entry.status === 'added').length,
    removed: filtered.filter((entry) => entry.status === 'removed').length,
    changed: filtered.filter((entry) => entry.status === 'changed').length,
    unchanged: filtered.filter((entry) => entry.status === 'unchanged').length,
  };
  const directionCounts = {
    worsened: filtered.filter((entry) => entry.direction === 'worsened').length,
    improved: filtered.filter((entry) => entry.direction === 'improved').length,
    neutral: filtered.filter((entry) => entry.direction === 'neutral').length,
  };

  return {
    kind: 'diff',
    fromFilePath: filePathFrom,
    toFilePath: filePathTo,
    topLimit: command.top,
    filter: command.only ?? 'changed',
    totals: {
      signaturesCompared: signatures.length,
      entriesAfterFilter: filtered.length,
      statusCounts,
      directionCounts,
    },
    entries: top,
  };
}

function isCurationCandidateEntry(entry) {
  if (!entry) return false;
  if (entry.reviewNodeCount > 0) return true;
  if (entry.genericNodeCount > 0) return true;
  if (entry.emptyNodeCount > 0) return true;
  return topReason(entry.actionableReasonCounts).length > 0;
}

function isPressureCandidateEntry(entry) {
  if (isCurationCandidateEntry(entry)) return true;
  const pressure =
    entry.pressure && typeof entry.pressure === 'object' && !Array.isArray(entry.pressure)
      ? entry.pressure
      : {};
  return (
    normalizeCount(pressure.suppressedFillActionsTotal) > 0 ||
    normalizeCount(pressure.unmatchedActionsTotal) > 0
  );
}

function filterEntriesByCandidatePolicy(entries, candidatePolicy) {
  if (candidatePolicy === 'pressure') return entries.filter(isPressureCandidateEntry);
  return entries.filter(isCurationCandidateEntry);
}

function pickNextEntry(entries, command, options = {}) {
  const label = options.label ?? 'candidates';
  const filtered = filterEntriesByCandidatePolicy(entries, command.candidatePolicy);
  if (filtered.length === 0) {
    return { candidateCount: 0, selectedEntry: null };
  }
  const index = command.pick - 1;
  if (index >= filtered.length) {
    throw new Error(`--pick ${command.pick} is out of range (${label}: ${filtered.length})`);
  }
  return { candidateCount: filtered.length, selectedEntry: filtered[index] };
}

function isUsableSourcePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('REDACTED');
}

function resolveSourceUrl(source) {
  const raw = source && typeof source === 'object' ? source.url : undefined;
  if (typeof raw === 'string' && /^wss?:\/\//.test(raw) && !raw.includes('REDACTED')) {
    return raw;
  }
  return 'ws://HOST:PORT';
}

function buildSourceScopeArgs(source) {
  const scope = source && typeof source === 'object' ? source.scope : undefined;
  if (scope === 'all-nodes') return ['--all-nodes'];
  if (typeof scope === 'string') {
    const match = /^node:(\d+)$/.exec(scope);
    if (match) return ['--node', match[1]];
  }
  return ['--all-nodes'];
}

function buildSourceRuleInputArgs(source) {
  const mode = source && typeof source === 'object' ? source.ruleInputMode : undefined;
  const manifestFile = isUsableSourcePath(source?.manifestFile) ? source.manifestFile : undefined;
  const rulesFiles = Array.isArray(source?.rulesFiles)
    ? source.rulesFiles.filter(isUsableSourcePath)
    : [];
  const compiledFile = isUsableSourcePath(source?.compiledFile) ? source.compiledFile : undefined;

  if ((mode === 'manifest-file' || mode === 'default-manifest') && manifestFile) {
    return ['--manifest-file', manifestFile];
  }
  if (mode === 'rules-files' && rulesFiles.length > 0) {
    return rulesFiles.flatMap((filePath) => ['--rules-file', filePath]);
  }
  if (mode === 'compiled-file' && compiledFile) {
    return ['--compiled-file', compiledFile];
  }
  if (manifestFile) return ['--manifest-file', manifestFile];
  if (rulesFiles.length > 0) {
    return rulesFiles.flatMap((filePath) => ['--rules-file', filePath]);
  }
  if (compiledFile) return ['--compiled-file', compiledFile];
  return ['--manifest-file', path.join('rules', 'manifest.json')];
}

function shellQuote(rawArg) {
  const arg = String(rawArg ?? '');
  if (/^[A-Za-z0-9_./:@=,+-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function renderCommand(args) {
  return args.map((arg) => shellQuote(arg)).join(' ');
}

function buildNextCommandHints(signature, backlogFilePath, source) {
  const url = resolveSourceUrl(source);
  const scopeArgs = buildSourceScopeArgs(source);
  const ruleInputArgs = buildSourceRuleInputArgs(source);

  return {
    scaffold: renderCommand([
      'npm',
      'run',
      'compiler:backlog',
      '--',
      'scaffold',
      '--input-file',
      backlogFilePath,
      '--signature',
      signature,
      '--format',
      'json-pretty',
    ]),
    inspectLive: renderCommand([
      'npm',
      'run',
      'compiler:inspect-live',
      '--',
      '--url',
      url,
      ...scopeArgs,
      ...ruleInputArgs,
      '--signature',
      signature,
      '--format',
      'list',
    ]),
    validateLive: renderCommand([
      'npm',
      'run',
      'compiler:validate-live',
      '--',
      '--url',
      url,
      ...scopeArgs,
      ...ruleInputArgs,
      '--signature',
      signature,
    ]),
    loop: renderCommand([
      'npm',
      'run',
      'compiler:loop',
      '--',
      '--url',
      url,
      ...scopeArgs,
      ...ruleInputArgs,
      '--signature',
      signature,
    ]),
  };
}

function buildNextResultFromEntry({
  selectedEntry,
  command,
  sourceFilePath,
  source,
  selectionMode,
  fallbackUsed,
  diffEntry,
  fromFilePath,
  toFilePath,
}) {
  return {
    kind: 'next',
    selectionMode,
    fallbackUsed,
    fallbackMode: command.fallback,
    candidatePolicy: command.candidatePolicy,
    fromFilePath: fromFilePath ?? null,
    toFilePath: toFilePath ?? null,
    sourceFilePath,
    filter: command.only ?? null,
    pick: command.pick,
    selected: {
      signature: selectedEntry.signature,
      rank: selectedEntry.rank,
      nodeCount: selectedEntry.nodeCount,
      reviewNodeCount: selectedEntry.reviewNodeCount,
      genericNodeCount: selectedEntry.genericNodeCount,
      emptyNodeCount: selectedEntry.emptyNodeCount,
      topReason: topReason(selectedEntry.actionableReasonCounts),
      pressure: selectedEntry.pressure,
    },
    diff: diffEntry
      ? {
          status: diffEntry.status,
          direction: diffEntry.direction,
          delta: diffEntry.delta,
        }
      : null,
    commands: buildNextCommandHints(selectedEntry.signature, sourceFilePath, source),
  };
}

function buildNextFromSummary(artifact, command, filePath) {
  const entries = sortBacklogEntries(artifact.entries.map(normalizeBacklogEntry));
  const pick = pickNextEntry(entries, command, { label: `${command.candidatePolicy} candidates` });
  if (!pick.selectedEntry) {
    throw new Error(`No ${command.candidatePolicy} signatures found in backlog: ${filePath}`);
  }
  return {
    ...buildNextResultFromEntry({
      selectedEntry: pick.selectedEntry,
      command,
      sourceFilePath: filePath,
      source: artifact.source,
      selectionMode: 'summary',
      fallbackUsed: false,
    }),
    candidateCount: pick.candidateCount,
  };
}

function entryMapBySignature(artifact) {
  return new Map(
    sortBacklogEntries(artifact.entries.map(normalizeBacklogEntry)).map((entry) => [
      entry.signature,
      entry,
    ]),
  );
}

function buildNextFromDiff(fromArtifact, toArtifact, command, fromFilePath, toFilePath) {
  const diffAll = buildBacklogDiff(
    fromArtifact,
    toArtifact,
    { ...command, top: Number.MAX_SAFE_INTEGER },
    fromFilePath,
    toFilePath,
  );
  const toBySignature = entryMapBySignature(toArtifact);
  const fromBySignature = entryMapBySignature(fromArtifact);
  const diffEntries = diffAll.entries.filter(
    (diffEntry) =>
      filterEntriesByCandidatePolicy(
        [toBySignature.get(diffEntry.signature) ?? fromBySignature.get(diffEntry.signature)].filter(
          Boolean,
        ),
        command.candidatePolicy,
      ).length > 0,
  );
  const pickIndex = command.pick - 1;

  if (diffEntries.length > 0) {
    if (pickIndex >= diffEntries.length) {
      throw new Error(
        `--pick ${command.pick} is out of range (${command.candidatePolicy} candidates: ${diffEntries.length})`,
      );
    }
    const diffEntry = diffEntries[pickIndex];
    const selectedEntry =
      toBySignature.get(diffEntry.signature) ?? fromBySignature.get(diffEntry.signature);
    if (!selectedEntry) {
      throw new Error(`No backlog entry found for signature "${diffEntry.signature}"`);
    }
    const sourceFilePath = toBySignature.has(diffEntry.signature) ? toFilePath : fromFilePath;
    const source = toBySignature.has(diffEntry.signature) ? toArtifact.source : fromArtifact.source;
    return {
      ...buildNextResultFromEntry({
        selectedEntry,
        command,
        sourceFilePath,
        source,
        selectionMode: 'diff',
        fallbackUsed: false,
        diffEntry,
        fromFilePath,
        toFilePath,
      }),
      candidateCount: diffEntries.length,
    };
  }

  if (command.fallback === 'none') {
    throw new Error(
      `No diff ${command.candidatePolicy} candidates found for --only ${command.only} and --fallback none (from: ${fromFilePath}, to: ${toFilePath})`,
    );
  }

  const summaryEntries = sortBacklogEntries(toArtifact.entries.map(normalizeBacklogEntry));
  const pick = pickNextEntry(summaryEntries, command, {
    label: `fallback ${command.candidatePolicy} candidates`,
  });
  if (!pick.selectedEntry) {
    throw new Error(
      `No ${command.candidatePolicy} signatures found in fallback summary backlog: ${toFilePath}`,
    );
  }
  return {
    ...buildNextResultFromEntry({
      selectedEntry: pick.selectedEntry,
      command,
      sourceFilePath: toFilePath,
      source: toArtifact.source,
      selectionMode: 'fallback-summary',
      fallbackUsed: true,
      fromFilePath,
      toFilePath,
    }),
    candidateCount: pick.candidateCount,
  };
}

function parseSignatureTriple(signature) {
  const match = /^(\d+):(\d+):(\d+)$/.exec(signature);
  if (!match) return null;
  return {
    manufacturerId: Number(match[1]),
    productType: Number(match[2]),
    productId: Number(match[3]),
  };
}

function buildScaffoldResult(artifact, command, filePath, nowDate) {
  const entries = artifact.entries.map(normalizeBacklogEntry);
  const entry = entries.find((candidate) => candidate.signature === command.signature);
  if (!entry) {
    throw new Error(`Signature "${command.signature}" not found in backlog: ${filePath}`);
  }
  const triple = parseSignatureTriple(entry.signature);
  if (!triple) {
    throw new Error(
      `Signature "${entry.signature}" is not a numeric product triple (expected manufacturer:productType:productId)`,
    );
  }

  const safeSignature = entry.signature.replace(/:/g, '-');
  const inferredHomeyClass =
    command.homeyClass ??
    (Array.isArray(entry.sampleNodes) && entry.sampleNodes[0]?.homeyClass) ??
    'other';
  const driverTemplateId =
    command.driverTemplateId ?? `${command.ruleIdPrefix}-${safeSignature}`.toLowerCase();
  const ruleId = `${command.ruleIdPrefix}-${safeSignature}-identity`.toLowerCase();
  const rule = {
    ruleId,
    layer: 'project-product',
    device: {
      manufacturerId: [triple.manufacturerId],
      productType: [triple.productType],
      productId: [triple.productId],
    },
    value: {
      readable: true,
    },
    actions: [
      {
        type: 'device-identity',
        mode: 'replace',
        homeyClass: inferredHomeyClass,
        driverTemplateId,
      },
    ],
  };

  return {
    kind: 'scaffold',
    backlogFilePath: filePath,
    signature: entry.signature,
    generatedAt: nowDate.toISOString(),
    entry: {
      rank: entry.rank,
      nodeCount: entry.nodeCount,
      reviewNodeCount: entry.reviewNodeCount,
      genericNodeCount: entry.genericNodeCount,
      emptyNodeCount: entry.emptyNodeCount,
      topReason: topReason(entry.actionableReasonCounts),
    },
    fileHint: `rules/project/product/${command.ruleIdPrefix}-${safeSignature}.json`,
    templateRules: [rule],
  };
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-compile-backlog summary --input-file <curation-backlog.json>',
    '                               [--top N]',
    '                               [--format list|summary|markdown|json|json-pretty|json-compact|ndjson]',
    '',
    '  homey-compile-backlog diff --from-file <baseline-backlog.json> --to-file <current-backlog.json>',
    '                            [--only all|worsened|improved|neutral|added|removed|changed|unchanged]',
    '                            [--top N]',
    '                            [--format summary|markdown|json|json-pretty|json-compact|ndjson]',
    '',
    '  homey-compile-backlog scaffold --input-file <curation-backlog.json> --signature <manufacturer:productType:productId>',
    '                                [--rule-id-prefix product]',
    '                                [--driver-template-id product-template-id]',
    '                                [--homey-class socket]',
    '                                [--format summary|markdown|json|json-pretty|json-compact]',
    '',
    '  homey-compile-backlog next --input-file <curation-backlog.json>',
    '                            [--candidate-policy curation|pressure]',
    '                            [--pick N]',
    '                            [--format summary|list|markdown|json|json-pretty|json-compact]',
    '',
    '  homey-compile-backlog next --from-file <baseline-backlog.json> --to-file <current-backlog.json>',
    '                            [--only worsened|improved|neutral|added|removed|changed|unchanged|all]',
    '                            [--candidate-policy curation|pressure]',
    '                            [--fallback summary|none]',
    '                            [--pick N]',
    '                            [--format summary|list|markdown|json|json-pretty|json-compact]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const { flags, positionals } = parseFlagMap(argv);
  const subcommand = positionals[0];
  if (!subcommand) return { ok: false, error: getUsageText() };
  if (!['summary', 'diff', 'scaffold', 'next'].includes(subcommand)) {
    return { ok: false, error: `Unsupported backlog subcommand: ${subcommand}` };
  }

  if (subcommand === 'next') {
    const format = flags.get('--format') ?? 'summary';
    if (
      !NEXT_FORMATS.has(format) &&
      !(isSupportedDiagnosticFormat(format) && format !== 'ndjson')
    ) {
      return { ok: false, error: `Unsupported format for next: ${format}` };
    }

    let pick;
    try {
      pick = parsePositiveInt(flags.get('--pick'), '--pick', 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, error: reason };
    }
    const candidatePolicy = flags.get('--candidate-policy') ?? 'curation';
    if (!NEXT_CANDIDATE_POLICIES.has(candidatePolicy)) {
      return {
        ok: false,
        error: `Unsupported --candidate-policy for next: ${candidatePolicy} (expected curation|pressure)`,
      };
    }

    const inputFile = flags.get('--input-file');
    const fromFile = flags.get('--from-file');
    const toFile = flags.get('--to-file');
    if (inputFile && (fromFile || toFile)) {
      return {
        ok: false,
        error: 'Use either --input-file or --from-file/--to-file for next, not both',
      };
    }
    if (inputFile) {
      if (flags.has('--only')) {
        return { ok: false, error: '--only is only supported for diff-based next mode' };
      }
      if (flags.has('--fallback')) {
        return { ok: false, error: '--fallback is only supported for diff-based next mode' };
      }
      return {
        ok: true,
        command: {
          subcommand,
          mode: 'summary',
          inputFile,
          candidatePolicy,
          pick,
          format,
        },
      };
    }

    if (!fromFile || !toFile) {
      return {
        ok: false,
        error: 'Provide --input-file or both --from-file and --to-file for next',
      };
    }
    const only = flags.get('--only') ?? 'worsened';
    if (!DIFF_ONLY_FILTERS.has(only)) {
      return { ok: false, error: `Unsupported --only for next diff mode: ${only}` };
    }
    const fallback = flags.get('--fallback') ?? 'summary';
    if (!NEXT_FALLBACK_MODES.has(fallback)) {
      return {
        ok: false,
        error: `Unsupported --fallback for next: ${fallback} (expected summary|none)`,
      };
    }
    return {
      ok: true,
      command: {
        subcommand,
        mode: 'diff',
        fromFile,
        toFile,
        only,
        candidatePolicy,
        fallback,
        pick,
        format,
      },
    };
  }

  const format = flags.get('--format') ?? (subcommand === 'summary' ? 'list' : 'summary');
  const supportsList = subcommand === 'summary';
  const supportsNdjson = subcommand !== 'scaffold';
  if (
    !(
      (supportsList && format === 'list') ||
      (isSupportedDiagnosticFormat(format) && (supportsNdjson || format !== 'ndjson'))
    )
  ) {
    return { ok: false, error: `Unsupported format for ${subcommand}: ${format}` };
  }

  let top;
  try {
    top = parsePositiveInt(flags.get('--top'), '--top', subcommand === 'summary' ? 15 : 25);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }

  if (subcommand === 'summary') {
    const inputFile = flags.get('--input-file');
    if (!inputFile) return { ok: false, error: '--input-file is required for summary' };
    return {
      ok: true,
      command: {
        subcommand,
        inputFile,
        top,
        format,
      },
    };
  }

  if (subcommand === 'diff') {
    const fromFile = flags.get('--from-file');
    const toFile = flags.get('--to-file');
    if (!fromFile) return { ok: false, error: '--from-file is required for diff' };
    if (!toFile) return { ok: false, error: '--to-file is required for diff' };
    const only = flags.get('--only') ?? 'changed';
    if (!DIFF_ONLY_FILTERS.has(only)) {
      return { ok: false, error: `Unsupported --only for diff: ${only}` };
    }
    return {
      ok: true,
      command: {
        subcommand,
        fromFile,
        toFile,
        only,
        top,
        format,
      },
    };
  }

  const inputFile = flags.get('--input-file');
  const signature = flags.get('--signature');
  if (!inputFile) return { ok: false, error: '--input-file is required for scaffold' };
  if (!signature) return { ok: false, error: '--signature is required for scaffold' };
  return {
    ok: true,
    command: {
      subcommand,
      inputFile,
      signature,
      ruleIdPrefix: flags.get('--rule-id-prefix') ?? 'product',
      driverTemplateId: flags.get('--driver-template-id'),
      homeyClass: flags.get('--homey-class'),
      format,
    },
  };
}

function formatSummaryResult(result, format) {
  if (format === 'json' || format === 'json-pretty') return formatJsonPretty(result);
  if (format === 'json-compact') return formatJsonCompact(result);
  if (format === 'ndjson') {
    return formatNdjson([
      {
        type: 'backlogSummary',
        filePath: result.filePath,
        totals: result.totals,
      },
      ...result.entries.map((entry) => ({ type: 'backlogEntry', entry })),
    ]);
  }

  const rows = result.entries.map((entry) => [
    entry.rank,
    entry.signature,
    entry.nodeCount,
    entry.reviewNodeCount,
    entry.genericNodeCount,
    entry.emptyNodeCount,
    topReason(entry.actionableReasonCounts),
    `${entry.pressure.suppressedFillActionsTotal}/${entry.pressure.unmatchedActionsTotal}`,
  ]);

  if (format === 'markdown') {
    return [
      '# Curation Backlog',
      '',
      `- Backlog file: ${result.filePath}`,
      `- Generated at: ${result.generatedAt ?? ''}`,
      `- Signatures: ${result.totals.signatures}`,
      `- Nodes: ${result.totals.totalNodes}`,
      `- Review nodes: ${result.totals.reviewNodes}`,
      `- Showing top: ${result.entries.length} (limit ${result.topLimit})`,
      '',
      renderMarkdownTable(
        ['Rank', 'Signature', 'Nodes', 'Review', 'Generic', 'Empty', 'Top reason', 'Sup/Unmatched'],
        rows,
      ),
      '',
    ].join('\n');
  }

  if (format === 'list') {
    return renderTable(
      ['Rank', 'Signature', 'Nodes', 'Review', 'Generic', 'Empty', 'Top reason', 'Sup/Unmatched'],
      rows,
    );
  }

  return [
    `Backlog file: ${result.filePath}`,
    `Generated at: ${result.generatedAt ?? ''}`,
    `Signatures: ${result.totals.signatures}`,
    `Nodes: ${result.totals.totalNodes}`,
    `Review nodes: ${result.totals.reviewNodes}`,
    `Showing top: ${result.entries.length} (limit ${result.topLimit})`,
    '',
    ...result.entries.map(
      (entry) =>
        `${entry.rank}. ${entry.signature} review=${entry.reviewNodeCount} generic=${entry.genericNodeCount} empty=${entry.emptyNodeCount} reason=${topReason(entry.actionableReasonCounts) || '-'}`,
    ),
  ].join('\n');
}

function formatDiffResult(result, format) {
  if (format === 'json' || format === 'json-pretty') return formatJsonPretty(result);
  if (format === 'json-compact') return formatJsonCompact(result);
  if (format === 'ndjson') {
    return formatNdjson([
      {
        type: 'backlogDiffSummary',
        fromFilePath: result.fromFilePath,
        toFilePath: result.toFilePath,
        totals: result.totals,
        filter: result.filter,
      },
      ...result.entries.map((entry) => ({ type: 'backlogDiff', entry })),
    ]);
  }

  const rows = result.entries.map((entry) => [
    entry.signature,
    entry.status,
    entry.direction,
    formatSignedDelta(entry.delta.reviewNodeCount),
    formatSignedDelta(entry.delta.genericNodeCount),
    formatSignedDelta(entry.delta.emptyNodeCount),
    formatSignedDelta(entry.delta.nodeCount),
    entry.topReasonAfter || entry.topReasonBefore || '',
  ]);

  if (format === 'markdown') {
    return [
      '# Curation Backlog Diff',
      '',
      `- From: ${result.fromFilePath}`,
      `- To: ${result.toFilePath}`,
      `- Filter: ${result.filter}`,
      `- Signatures compared: ${result.totals.signaturesCompared}`,
      `- Diff entries: ${result.totals.entriesAfterFilter}`,
      `- Worsened: ${result.totals.directionCounts.worsened}, Improved: ${result.totals.directionCounts.improved}, Neutral: ${result.totals.directionCounts.neutral}`,
      '',
      renderMarkdownTable(
        [
          'Signature',
          'Status',
          'Direction',
          'Review Δ',
          'Generic Δ',
          'Empty Δ',
          'Nodes Δ',
          'Top reason',
        ],
        rows,
      ),
      '',
    ].join('\n');
  }

  return [
    `From: ${result.fromFilePath}`,
    `To: ${result.toFilePath}`,
    `Filter: ${result.filter}`,
    `Signatures compared: ${result.totals.signaturesCompared}`,
    `Diff entries: ${result.totals.entriesAfterFilter}`,
    `Worsened: ${result.totals.directionCounts.worsened}, Improved: ${result.totals.directionCounts.improved}, Neutral: ${result.totals.directionCounts.neutral}`,
    '',
    renderTable(
      ['Signature', 'Status', 'Direction', 'Review Δ', 'Generic Δ', 'Empty Δ', 'Nodes Δ', 'Reason'],
      rows,
    ),
  ].join('\n');
}

function formatScaffoldResult(result, format) {
  if (format === 'json' || format === 'json-pretty') return formatJsonPretty(result);
  if (format === 'json-compact') return formatJsonCompact(result);
  const rulesJson = formatJsonPretty(result.templateRules);

  if (format === 'markdown') {
    return [
      '# Product Rule Scaffold',
      '',
      `- Backlog file: ${result.backlogFilePath}`,
      `- Signature: ${result.signature}`,
      `- File hint: ${result.fileHint}`,
      `- Backlog rank: ${result.entry.rank}`,
      `- Review nodes: ${result.entry.reviewNodeCount}`,
      '',
      '```json',
      rulesJson,
      '```',
      '',
    ].join('\n');
  }

  return [
    `Backlog file: ${result.backlogFilePath}`,
    `Signature: ${result.signature}`,
    `File hint: ${result.fileHint}`,
    `Backlog rank: ${result.entry.rank}`,
    `Review nodes: ${result.entry.reviewNodeCount}`,
    '',
    rulesJson,
  ].join('\n');
}

function formatNextResult(result, format) {
  if (format === 'json' || format === 'json-pretty') return formatJsonPretty(result);
  if (format === 'json-compact') return formatJsonCompact(result);
  const selected = result.selected ?? {};
  const diff = result.diff ?? null;
  const commands = result.commands ?? {};
  const selectionHeader = `${selected.signature} (rank ${selected.rank}, review ${selected.reviewNodeCount}, generic ${selected.genericNodeCount}, empty ${selected.emptyNodeCount})`;

  if (format === 'list') {
    const rows = [
      ['Selection mode', result.selectionMode],
      ['Candidate policy', result.candidatePolicy],
      ['Fallback mode', result.fallbackMode],
      ['Fallback used', result.fallbackUsed ? 'yes' : 'no'],
      ['Source backlog', result.sourceFilePath],
      ['From backlog', result.fromFilePath ?? ''],
      ['To backlog', result.toFilePath ?? ''],
      ['Diff filter', result.filter ?? ''],
      ['Candidate count', result.candidateCount],
      ['Pick', result.pick],
      ['Selected', selectionHeader],
      ['Top reason', selected.topReason || '-'],
      [
        'Diff',
        diff
          ? `status=${diff.status}, direction=${diff.direction}, reviewΔ=${formatSignedDelta(diff.delta?.reviewNodeCount ?? 0)}, genericΔ=${formatSignedDelta(diff.delta?.genericNodeCount ?? 0)}, emptyΔ=${formatSignedDelta(diff.delta?.emptyNodeCount ?? 0)}`
          : '',
      ],
      ['Scaffold rule', commands.scaffold ?? ''],
      ['Inspect live', commands.inspectLive ?? ''],
      ['Validate live', commands.validateLive ?? ''],
      ['Iteration loop', commands.loop ?? ''],
    ];
    return renderTable(['Field', 'Value'], rows);
  }

  if (format === 'markdown') {
    return [
      '# Next Curation Target',
      '',
      `- Selection mode: ${result.selectionMode}`,
      `- Candidate policy: ${result.candidatePolicy}`,
      `- Fallback mode: ${result.fallbackMode}`,
      `- Fallback used: ${result.fallbackUsed ? 'yes' : 'no'}`,
      `- Source backlog: ${result.sourceFilePath}`,
      result.fromFilePath ? `- From backlog: ${result.fromFilePath}` : null,
      result.toFilePath ? `- To backlog: ${result.toFilePath}` : null,
      result.filter ? `- Diff filter: ${result.filter}` : null,
      `- Candidate count: ${result.candidateCount}`,
      `- Pick: ${result.pick}`,
      `- Selected: ${selectionHeader}`,
      `- Top reason: ${selected.topReason || '-'}`,
      diff
        ? `- Diff: status=${diff.status}, direction=${diff.direction}, reviewΔ=${formatSignedDelta(diff.delta?.reviewNodeCount ?? 0)}, genericΔ=${formatSignedDelta(diff.delta?.genericNodeCount ?? 0)}, emptyΔ=${formatSignedDelta(diff.delta?.emptyNodeCount ?? 0)}`
        : null,
      '',
      '## Suggested Commands',
      '',
      `- Scaffold rule: \`${commands.scaffold ?? ''}\``,
      `- Inspect live: \`${commands.inspectLive ?? ''}\``,
      `- Validate live: \`${commands.validateLive ?? ''}\``,
      `- Iteration loop: \`${commands.loop ?? ''}\``,
      '',
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  return [
    `Selection mode: ${result.selectionMode}`,
    `Candidate policy: ${result.candidatePolicy}`,
    `Fallback mode: ${result.fallbackMode}`,
    `Fallback used: ${result.fallbackUsed ? 'yes' : 'no'}`,
    `Source backlog: ${result.sourceFilePath}`,
    result.fromFilePath ? `From backlog: ${result.fromFilePath}` : null,
    result.toFilePath ? `To backlog: ${result.toFilePath}` : null,
    result.filter ? `Diff filter: ${result.filter}` : null,
    `Candidate count: ${result.candidateCount}`,
    `Pick: ${result.pick}`,
    `Selected: ${selectionHeader}`,
    `Top reason: ${selected.topReason || '-'}`,
    diff
      ? `Diff: status=${diff.status}, direction=${diff.direction}, reviewΔ=${formatSignedDelta(diff.delta?.reviewNodeCount ?? 0)}, genericΔ=${formatSignedDelta(diff.delta?.genericNodeCount ?? 0)}, emptyΔ=${formatSignedDelta(diff.delta?.emptyNodeCount ?? 0)}`
      : null,
    '',
    'Suggested commands:',
    `  Scaffold rule: ${commands.scaffold ?? ''}`,
    `  Inspect live: ${commands.inspectLive ?? ''}`,
    `  Validate live: ${commands.validateLive ?? ''}`,
    `  Iteration loop: ${commands.loop ?? ''}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function runBacklogCommand(command, options = {}) {
  if (command.subcommand === 'summary') {
    const loaded = loadBacklogArtifact(command.inputFile, 'backlog file');
    return summarizeBacklog(loaded.raw, command, loaded.filePath);
  }
  if (command.subcommand === 'diff') {
    const fromLoaded = loadBacklogArtifact(command.fromFile, 'from backlog file');
    const toLoaded = loadBacklogArtifact(command.toFile, 'to backlog file');
    return buildBacklogDiff(
      fromLoaded.raw,
      toLoaded.raw,
      command,
      fromLoaded.filePath,
      toLoaded.filePath,
    );
  }
  if (command.subcommand === 'next') {
    const normalized = {
      ...command,
      candidatePolicy: command.candidatePolicy ?? 'curation',
      fallback: command.fallback ?? 'summary',
    };
    if (command.mode === 'summary') {
      const loaded = loadBacklogArtifact(command.inputFile, 'backlog file');
      return buildNextFromSummary(loaded.raw, normalized, loaded.filePath);
    }
    const fromLoaded = loadBacklogArtifact(command.fromFile, 'from backlog file');
    const toLoaded = loadBacklogArtifact(command.toFile, 'to backlog file');
    return buildNextFromDiff(
      fromLoaded.raw,
      toLoaded.raw,
      normalized,
      fromLoaded.filePath,
      toLoaded.filePath,
    );
  }
  const loaded = loadBacklogArtifact(command.inputFile, 'backlog file');
  const nowDate = options.nowDate ?? new Date();
  return buildScaffoldResult(loaded.raw, command, loaded.filePath, nowDate);
}

export function formatBacklogOutput(result, format) {
  if (result.kind === 'summary') return formatSummaryResult(result, format);
  if (result.kind === 'diff') return formatDiffResult(result, format);
  if (result.kind === 'scaffold') return formatScaffoldResult(result, format);
  if (result.kind === 'next') return formatNextResult(result, format);
  return formatJsonPretty(result);
}

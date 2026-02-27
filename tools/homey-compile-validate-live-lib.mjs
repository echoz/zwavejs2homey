import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCompiledProfilesArtifact } from './homey-compile-build-lib.mjs';
import { runLiveInspectCommand } from './homey-compile-inspect-live-lib.mjs';
import { formatJsonPretty } from './output-format-lib.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_RULE_MANIFEST_FILE = path.join(REPO_ROOT, 'rules', 'manifest.json');

function parseFlagMap(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
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
  return flags;
}

function collectRepeatedFlag(argv, flagName) {
  const values = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flagName && argv[i + 1]) values.push(argv[i + 1]);
    if (argv[i].startsWith(`${flagName}=`)) values.push(argv[i].split('=', 2)[1]);
  }
  return values;
}

function hasFlagOccurrence(argv, flagName) {
  return argv.some((token) => token === flagName || token.startsWith(`${flagName}=`));
}

function resolveFilePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

function parseOptionalNonNegativeInt(rawValue, flagName) {
  if (rawValue === undefined) return undefined;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${flagName}: ${rawValue}`);
  }
  return parsed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseNonNegativeIntValue(rawValue, fieldName) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Field "${fieldName}" must be a non-negative integer`);
  }
  return parsed;
}

function parseCounterMap(raw, fieldName, options = {}) {
  const { required = false } = options;
  if (raw === undefined) {
    if (required) {
      throw new Error(`Field "${fieldName}" is required`);
    }
    return new Map();
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Field "${fieldName}" must be an object`);
  }
  const result = new Map();
  for (const [key, value] of Object.entries(raw)) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`Field "${fieldName}.${key}" must be a non-negative integer`);
    }
    result.set(key, parsed);
  }
  return result;
}

function loadSummaryGateInput(inputSummaryJsonFile) {
  const resolvedFilePath = resolveFilePath(inputSummaryJsonFile);
  let raw;
  try {
    raw = readJson(resolvedFilePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read input summary JSON file "${resolvedFilePath}": ${reason}`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Input summary JSON "${resolvedFilePath}" must be a JSON object`);
  }
  const counts = raw.counts;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
    throw new Error(`Input summary JSON "${resolvedFilePath}" must include object field "counts"`);
  }

  const outcomes = parseCounterMap(counts.outcomes, 'counts.outcomes', { required: true });
  const reviewReasonCounts = parseCounterMap(counts.reasons, 'counts.reasons');
  const reviewNodes = parseNonNegativeIntValue(counts.reviewNodes, 'counts.reviewNodes');
  const totalNodes =
    counts.totalNodes === undefined
      ? [...outcomes.values()].reduce((sum, value) => sum + value, 0)
      : parseNonNegativeIntValue(counts.totalNodes, 'counts.totalNodes');

  return {
    filePath: resolvedFilePath,
    machineSummary: raw,
    summary: {
      totalNodes,
      reviewNodes,
      outcomes,
      reviewReasonCounts,
    },
  };
}

function loadGateProfile(gateProfileFile) {
  const resolvedFilePath = resolveFilePath(gateProfileFile);
  let raw;
  try {
    raw = readJson(resolvedFilePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read gate profile file "${resolvedFilePath}": ${reason}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Gate profile "${resolvedFilePath}" must be a JSON object`);
  }

  const allowedKeys = new Set([
    'maxReviewNodes',
    'maxGenericNodes',
    'maxEmptyNodes',
    'failOnReasons',
    'artifactFile',
    'reportFile',
    'summaryJsonFile',
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Gate profile "${resolvedFilePath}" has unsupported field "${key}"`);
    }
  }

  const profileDir = path.dirname(resolvedFilePath);
  const resolveProfilePath = (value, fieldName) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(
        `Gate profile "${resolvedFilePath}" field "${fieldName}" must be a non-empty string`,
      );
    }
    return path.isAbsolute(value) ? value : path.resolve(profileDir, value);
  };

  let maxReviewNodes;
  let maxGenericNodes;
  let maxEmptyNodes;
  try {
    maxReviewNodes = parseOptionalNonNegativeInt(raw.maxReviewNodes, 'gateProfile.maxReviewNodes');
    maxGenericNodes = parseOptionalNonNegativeInt(
      raw.maxGenericNodes,
      'gateProfile.maxGenericNodes',
    );
    maxEmptyNodes = parseOptionalNonNegativeInt(raw.maxEmptyNodes, 'gateProfile.maxEmptyNodes');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid gate profile "${resolvedFilePath}": ${reason}`);
  }

  let failOnReasons;
  if (raw.failOnReasons !== undefined) {
    if (
      !Array.isArray(raw.failOnReasons) ||
      !raw.failOnReasons.every((item) => typeof item === 'string' && item.length > 0)
    ) {
      throw new Error(
        `Gate profile "${resolvedFilePath}" field "failOnReasons" must be an array of non-empty strings`,
      );
    }
    failOnReasons = raw.failOnReasons;
  }

  return {
    filePath: resolvedFilePath,
    maxReviewNodes,
    maxGenericNodes,
    maxEmptyNodes,
    failOnReasons,
    artifactFile: resolveProfilePath(raw.artifactFile, 'artifactFile'),
    reportFile: resolveProfilePath(raw.reportFile, 'reportFile'),
    summaryJsonFile: resolveProfilePath(raw.summaryJsonFile, 'summaryJsonFile'),
  };
}

function isTechnicalCurationReason(reason) {
  return (
    typeof reason === 'string' &&
    (reason.startsWith('suppressed-fill-actions:') || reason.startsWith('high-unmatched-ratio:'))
  );
}

function firstActionableReason(reasons) {
  const list = Array.isArray(reasons) ? reasons : [];
  return list.find((reason) => !isTechnicalCurationReason(reason)) ?? list[0] ?? '';
}

function humanizeReason(reason) {
  if (!reason) return '';
  if (reason === 'no-applied-actions') return 'No applied actions';
  if (reason === 'no-meaningful-mapping') return 'No meaningful mapping';
  if (reason === 'known-device-unmapped') return 'Known device unmapped';
  if (reason === 'known-device-generic-fallback') return 'Known device generic fallback';
  if (reason === 'unknown-device-generic-fallback') return 'Unknown device generic fallback';
  if (reason.startsWith('uncurated-profile:')) {
    const confidence = reason.split(':', 2)[1] ?? 'unknown';
    return `Uncurated profile (${confidence})`;
  }
  if (reason.startsWith('suppressed-fill-actions:')) {
    const count = reason.split(':', 2)[1] ?? '?';
    return `Suppressed fill actions (${count})`;
  }
  if (reason.startsWith('high-unmatched-ratio:')) {
    const ratio = reason.split(':', 2)[1] ?? '?';
    return `High unmatched ratio (${ratio})`;
  }
  return reason;
}

function incrementCounter(map, key, delta = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + delta);
}

function topEntries(counter, top) {
  return [...counter.entries()]
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, top);
}

function mapToSortedObject(counter) {
  return Object.fromEntries([...counter.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function mapOutcomes(results) {
  const outcomes = new Map([
    ['curated', 0],
    ['ha-derived', 0],
    ['generic', 0],
    ['empty', 0],
  ]);
  for (const row of results) {
    const outcome = row?.compiled?.report?.profileOutcome ?? 'unknown';
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
  }
  return outcomes;
}

function summarizeValidationResults(results, top) {
  const reviewReasonCounts = new Map();
  const unmatchedByRule = new Map();
  const suppressedBySlot = new Map();
  const rows = [];
  let reviewNodes = 0;

  for (const row of results) {
    const node = row?.node ?? {};
    const profile = row?.compiled?.profile ?? {};
    const report = row?.compiled?.report ?? {};
    const curation = report?.curationCandidates ?? {};
    const reasons = Array.isArray(curation.reasons) ? curation.reasons : [];
    const likelyNeedsReview = curation.likelyNeedsReview === true;
    if (likelyNeedsReview) reviewNodes += 1;

    for (const reason of reasons) {
      incrementCounter(reviewReasonCounts, reason, 1);
    }

    const byRule = Array.isArray(report.byRule) ? report.byRule : [];
    for (const entry of byRule) {
      if (!entry || typeof entry !== 'object') continue;
      const unmatched = Number(entry.unmatched ?? 0);
      if (unmatched <= 0) continue;
      const key = `${String(entry.layer)}:${String(entry.ruleId)}`;
      incrementCounter(unmatchedByRule, key, unmatched);
    }

    const bySuppressedSlot = Array.isArray(report.bySuppressedSlot) ? report.bySuppressedSlot : [];
    for (const entry of bySuppressedSlot) {
      if (!entry || typeof entry !== 'object') continue;
      const count = Number(entry.count ?? 0);
      if (count <= 0) continue;
      const key = `${String(entry.layer)}:${String(entry.ruleId)}:${String(entry.slot)}`;
      incrementCounter(suppressedBySlot, key, count);
    }

    rows.push({
      nodeId: node.nodeId,
      name: node.name ?? '',
      homeyClass: profile?.classification?.homeyClass ?? 'other',
      outcome: report?.profileOutcome ?? 'unknown',
      confidence: profile?.classification?.confidence ?? '',
      review: likelyNeedsReview ? humanizeReason(firstActionableReason(reasons)) : '',
    });
  }

  return {
    totalNodes: results.length,
    reviewNodes,
    outcomes: mapOutcomes(results),
    reviewReasonCounts,
    topReasons: topEntries(reviewReasonCounts, top),
    topUnmatched: topEntries(unmatchedByRule, top),
    topSuppressed: topEntries(suppressedBySlot, top),
    rows,
  };
}

function renderTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map((col) => String(col ?? '')).join(' | ')} |`);
  return [headerLine, divider, ...body].join('\n');
}

function formatOutcomeSummary(outcomes) {
  const orderedKeys = ['curated', 'ha-derived', 'generic', 'empty'];
  const extras = [...outcomes.keys()].filter((key) => !orderedKeys.includes(key)).sort();
  return [...orderedKeys, ...extras].map((key) => `${key}=${outcomes.get(key) ?? 0}`).join(', ');
}

function describeRuleSource(command) {
  if (command.ruleInputMode === 'compiled-file') {
    return `compiled-file (${command.compiledFile})`;
  }
  if (command.ruleInputMode === 'default-manifest') {
    return `default-manifest (${command.manifestFile})`;
  }
  if (command.manifestFile) {
    return `manifest-file (${command.manifestFile})`;
  }
  return `rules-files (${command.rulesFiles.join(', ')})`;
}

function formatMarkdownReport(command, summary, generatedAtIso) {
  const outcomeRows = [...summary.outcomes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([outcome, count]) => [outcome, count]);
  const reasonRows =
    summary.topReasons.length > 0
      ? summary.topReasons.map(([reason, count]) => [humanizeReason(reason), count, reason])
      : [['(none)', 0, '']];
  const unmatchedRows =
    summary.topUnmatched.length > 0
      ? summary.topUnmatched.map(([signature, count]) => [signature, count])
      : [['(none)', 0]];
  const suppressedRows =
    summary.topSuppressed.length > 0
      ? summary.topSuppressed.map(([signature, count]) => [signature, count])
      : [['(none)', 0]];
  const nodeRows =
    summary.rows.length > 0
      ? summary.rows.map((row) => [
          row.nodeId ?? '',
          row.name ?? '',
          row.homeyClass ?? '',
          row.outcome ?? '',
          row.confidence ?? '',
          row.review ?? '',
        ])
      : [['(none)', '', '', '', '', '']];

  return [
    '# Live Compiler Validation',
    '',
    `- Generated at: ${generatedAtIso}`,
    `- ZWJS URL: ${command.url}`,
    `- Scope: ${command.allNodes ? 'all-nodes' : `node ${command.nodeId}`}`,
    `- Rule source: ${describeRuleSource(command)}`,
    `- Compiled artifact: ${command.artifactFile}`,
    `- Nodes validated: ${summary.totalNodes}`,
    `- Nodes needing review: ${summary.reviewNodes}`,
    '',
    '## Outcomes',
    '',
    renderTable(['Outcome', 'Count'], outcomeRows),
    '',
    '## Top Review Reasons',
    '',
    renderTable(['Reason', 'Count', 'Raw'], reasonRows),
    '',
    '## Top Unmatched Rule Signatures',
    '',
    renderTable(['Layer:Rule', 'Unmatched Actions'], unmatchedRows),
    '',
    '## Top Suppressed Slot Signatures',
    '',
    renderTable(['Layer:Rule:Slot', 'Suppressed Actions'], suppressedRows),
    '',
    '## Node Snapshot',
    '',
    renderTable(['Node', 'Name', 'Class', 'Outcome', 'Confidence', 'Review'], nodeRows),
    '',
  ].join('\n');
}

function buildDefaultArtifactPath(nowDate) {
  const iso = nowDate.toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
  return path.join('/tmp', `compiled-live-${iso}.json`);
}

function buildDefaultReportPath(artifactFile) {
  if (artifactFile.endsWith('.json')) {
    return artifactFile.replace(/\.json$/, '.validation.md');
  }
  return `${artifactFile}.validation.md`;
}

function evaluateValidationGates(command, summary) {
  const violations = [];
  const genericNodes = summary.outcomes.get('generic') ?? 0;
  const emptyNodes = summary.outcomes.get('empty') ?? 0;

  if (
    command.maxReviewNodes !== undefined &&
    Number.isInteger(command.maxReviewNodes) &&
    summary.reviewNodes > command.maxReviewNodes
  ) {
    violations.push(
      `review nodes ${summary.reviewNodes} exceeded max ${command.maxReviewNodes} (--max-review-nodes)`,
    );
  }
  if (
    command.maxGenericNodes !== undefined &&
    Number.isInteger(command.maxGenericNodes) &&
    genericNodes > command.maxGenericNodes
  ) {
    violations.push(
      `generic outcome nodes ${genericNodes} exceeded max ${command.maxGenericNodes} (--max-generic-nodes)`,
    );
  }
  if (
    command.maxEmptyNodes !== undefined &&
    Number.isInteger(command.maxEmptyNodes) &&
    emptyNodes > command.maxEmptyNodes
  ) {
    violations.push(
      `empty outcome nodes ${emptyNodes} exceeded max ${command.maxEmptyNodes} (--max-empty-nodes)`,
    );
  }
  for (const reason of command.failOnReasons ?? []) {
    const reasonCount = summary.reviewReasonCounts.get(reason) ?? 0;
    if (reasonCount > 0) {
      violations.push(
        `reason "${reason}" found ${reasonCount} time(s) (--fail-on-reason ${reason})`,
      );
    }
  }

  return {
    genericNodes,
    emptyNodes,
    passed: violations.length === 0,
    violations,
  };
}

function buildEffectiveGateConfig(command) {
  const mode = command.inputSummaryJsonFile
    ? 'input-summary'
    : command.compiledFile
      ? 'compiled-file'
      : 'live-build';
  return {
    mode,
    inputSummaryJsonFile: command.inputSummaryJsonFile ?? null,
    gateProfileFile: command.gateProfileFile ?? null,
    thresholds: {
      maxReviewNodes: command.maxReviewNodes ?? null,
      maxGenericNodes: command.maxGenericNodes ?? null,
      maxEmptyNodes: command.maxEmptyNodes ?? null,
    },
    failOnReasons: command.failOnReasons ?? [],
    outputs: {
      artifactFile: command.artifactFile ?? null,
      reportFile: command.reportFile ?? null,
      summaryJsonFile: command.summaryJsonFile ?? null,
    },
  };
}

function buildMachineSummary(command, summary, gateResult, generatedAtIso) {
  return {
    generatedAt: generatedAtIso,
    source: {
      url: command.url,
      scope: command.allNodes ? 'all-nodes' : `node:${command.nodeId}`,
      ruleInputMode: command.ruleInputMode,
      inputSummaryJsonFile: command.inputSummaryJsonFile,
      manifestFile: command.manifestFile,
      rulesFiles: command.rulesFiles,
      compiledFile: command.compiledFile,
      artifactFile: command.artifactFile,
      reportFile: command.reportFile,
      gateProfileFile: command.gateProfileFile,
    },
    counts: {
      totalNodes: summary.totalNodes,
      reviewNodes: summary.reviewNodes,
      genericNodes: gateResult.genericNodes,
      emptyNodes: gateResult.emptyNodes,
      outcomes: mapToSortedObject(summary.outcomes),
      reasons: mapToSortedObject(summary.reviewReasonCounts),
    },
    top: {
      reviewReasons: summary.topReasons.map(([reason, count]) => ({ reason, count })),
      unmatchedRules: summary.topUnmatched.map(([signature, count]) => ({ signature, count })),
      suppressedSlots: summary.topSuppressed.map(([signature, count]) => ({ signature, count })),
    },
    gates: {
      configured: {
        gateProfileFile: command.gateProfileFile,
        maxReviewNodes: command.maxReviewNodes,
        maxGenericNodes: command.maxGenericNodes,
        maxEmptyNodes: command.maxEmptyNodes,
        failOnReasons: command.failOnReasons,
      },
      passed: gateResult.passed,
      violations: gateResult.violations,
    },
  };
}

function buildMachineSummaryFromInput(command, input, gateResult, generatedAtIso) {
  const source =
    input?.source && typeof input.source === 'object' && !Array.isArray(input.source)
      ? input.source
      : {};
  const configured = {
    gateProfileFile: command.gateProfileFile,
    maxReviewNodes: command.maxReviewNodes,
    maxGenericNodes: command.maxGenericNodes,
    maxEmptyNodes: command.maxEmptyNodes,
    failOnReasons: command.failOnReasons,
  };
  return {
    ...input,
    generatedAt: generatedAtIso,
    source: {
      ...source,
      inputSummaryJsonFile: command.inputSummaryJsonFile,
      gateProfileFile: command.gateProfileFile,
    },
    gates: {
      configured,
      passed: gateResult.passed,
      violations: gateResult.violations,
    },
  };
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-compile-validate-live --url ws://host:port (--all-nodes | --node <id>)',
    '                            [--manifest-file <manifest.json> | --rules-file <rules.json> [--rules-file ...]]',
    '                            [--compiled-file <compiled-homey-profiles.json>]',
    '                            (defaults to rules/manifest.json when no rules source is provided)',
    '                            [--catalog-file <catalog.json>]',
    '                            [--token ...] [--schema-version 0]',
    '                            [--include-values none|summary|full] [--max-values N]',
    '                            [--include-controller-nodes]',
    '                            [--artifact-file </tmp/compiled-live.json>]',
    '                            [--report-file </tmp/compiled-live.validation.md>]',
    '                            [--summary-json-file </tmp/compiled-live.summary.json>]',
    '                            [--gate-profile-file <validation-gates.json>]',
    '                            [--max-review-nodes N] [--max-generic-nodes N] [--max-empty-nodes N]',
    '                            [--fail-on-reason <reason> ...]',
    '                            [--print-effective-gates]',
    '                            [--top N]',
    '',
    '  homey-compile-validate-live --input-summary-json-file </tmp/compiled-live.summary.json>',
    '                            [--gate-profile-file <validation-gates.json>]',
    '                            [--max-review-nodes N] [--max-generic-nodes N] [--max-empty-nodes N]',
    '                            [--fail-on-reason <reason> ...]',
    '                            [--summary-json-file </tmp/compiled-live.summary.recheck.json>]',
    '                            [--print-effective-gates]',
  ].join('\n');
}

export function parseCliArgs(argv, options = {}) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };

  const flags = parseFlagMap(argv);
  const inputSummaryJsonFileFlag = flags.get('--input-summary-json-file');
  let inputSummaryJsonFile;
  if (inputSummaryJsonFileFlag !== undefined) {
    if (!inputSummaryJsonFileFlag || inputSummaryJsonFileFlag === 'true') {
      return { ok: false, error: '--input-summary-json-file requires a value' };
    }
    inputSummaryJsonFile = resolveFilePath(inputSummaryJsonFileFlag);
  }
  const summaryInputMode = inputSummaryJsonFile !== undefined;

  if (summaryInputMode) {
    const unsupportedFlags = [
      '--url',
      '--all-nodes',
      '--node',
      '--manifest-file',
      '--rules-file',
      '--compiled-file',
      '--catalog-file',
      '--token',
      '--schema-version',
      '--include-values',
      '--max-values',
      '--include-controller-nodes',
      '--artifact-file',
      '--report-file',
      '--top',
    ];
    const unsupported = unsupportedFlags.find((flagName) => hasFlagOccurrence(argv, flagName));
    if (unsupported) {
      return {
        ok: false,
        error: `--input-summary-json-file cannot be combined with ${unsupported}`,
      };
    }
  }

  let url;
  let allNodes = false;
  let nodeId;
  if (!summaryInputMode) {
    url = flags.get('--url');
    if (!url) return { ok: false, error: '--url is required' };

    allNodes = flags.has('--all-nodes');
    const nodeRaw = flags.get('--node');
    if (!allNodes && nodeRaw === undefined) {
      return { ok: false, error: 'Provide --all-nodes or --node <id>' };
    }
    if (allNodes && nodeRaw !== undefined) {
      return { ok: false, error: 'Use either --all-nodes or --node, not both' };
    }
    nodeId = nodeRaw === undefined ? undefined : Number.parseInt(nodeRaw, 10);
    if (nodeRaw !== undefined && !Number.isInteger(nodeId)) {
      return { ok: false, error: `Invalid --node: ${nodeRaw}` };
    }
  }

  let compiledFile;
  if (!summaryInputMode) {
    const compiledFileFlag = flags.get('--compiled-file');
    if (compiledFileFlag !== undefined) {
      if (!compiledFileFlag || compiledFileFlag === 'true') {
        return { ok: false, error: '--compiled-file requires a value' };
      }
      compiledFile = resolveFilePath(compiledFileFlag);
    }
    if (compiledFile && flags.get('--artifact-file') !== undefined) {
      return { ok: false, error: 'Use either --compiled-file or --artifact-file, not both' };
    }
  }

  const manifestFlag = flags.get('--manifest-file');
  const rulesFileFlags = collectRepeatedFlag(argv, '--rules-file');
  let manifestFile;
  let rulesFiles = [];
  let ruleInputMode;
  if (summaryInputMode) {
    ruleInputMode = 'summary-input';
  } else {
    if (compiledFile && (manifestFlag || rulesFileFlags.length > 0)) {
      return {
        ok: false,
        error: 'Use either --compiled-file or rules source flags (--manifest-file/--rules-file)',
      };
    }
    if (manifestFlag && rulesFileFlags.length > 0) {
      return { ok: false, error: 'Use either --manifest-file or --rules-file, not both' };
    }

    const defaultManifestFile = resolveFilePath(
      options.defaultManifestFile ?? DEFAULT_RULE_MANIFEST_FILE,
    );
    if (compiledFile) {
      ruleInputMode = 'compiled-file';
    } else {
      manifestFile = manifestFlag ? resolveFilePath(manifestFlag) : undefined;
      ruleInputMode = manifestFlag ? 'manifest-file' : 'rules-files';
      if (!manifestFile && rulesFileFlags.length === 0) {
        if (!fs.existsSync(defaultManifestFile)) {
          return {
            ok: false,
            error:
              `No rules source provided and default manifest not found: ${defaultManifestFile}. ` +
              'Provide --manifest-file or at least one --rules-file',
          };
        }
        manifestFile = defaultManifestFile;
        ruleInputMode = 'default-manifest';
      }
    }
    rulesFiles = rulesFileFlags.map((filePath) => resolveFilePath(filePath));
  }

  let includeValues;
  let maxValues;
  let schemaVersion;
  let top = 5;
  let catalogFile;
  let token;
  let includeControllerNodes = false;
  if (!summaryInputMode) {
    includeValues = flags.get('--include-values') ?? (allNodes ? 'summary' : 'full');
    if (!['none', 'summary', 'full'].includes(includeValues)) {
      return { ok: false, error: `Unsupported --include-values: ${includeValues}` };
    }

    const maxValuesRaw = flags.get('--max-values') ?? (allNodes ? '100' : '200');
    maxValues = Number(maxValuesRaw);
    if (!Number.isInteger(maxValues) || maxValues < 1) {
      return { ok: false, error: `Invalid --max-values: ${maxValuesRaw}` };
    }

    const schemaVersionRaw = flags.get('--schema-version') ?? '0';
    schemaVersion = Number(schemaVersionRaw);
    if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
      return { ok: false, error: `Invalid --schema-version: ${schemaVersionRaw}` };
    }

    const topRaw = flags.get('--top') ?? '5';
    top = Number.parseInt(topRaw, 10);
    if (!Number.isInteger(top) || top < 1) {
      return { ok: false, error: `Invalid --top: ${topRaw}` };
    }

    token = flags.get('--token');
    includeControllerNodes = flags.has('--include-controller-nodes');
    catalogFile = flags.get('--catalog-file')
      ? resolveFilePath(flags.get('--catalog-file'))
      : undefined;
  } else {
    schemaVersion = 0;
  }

  let gateProfile;
  const gateProfileFileFlag = flags.get('--gate-profile-file');
  if (gateProfileFileFlag !== undefined) {
    if (!gateProfileFileFlag || gateProfileFileFlag === 'true') {
      return { ok: false, error: '--gate-profile-file requires a value' };
    }
    try {
      gateProfile = loadGateProfile(gateProfileFileFlag);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, error: reason };
    }
  }

  let cliMaxReviewNodes;
  let cliMaxGenericNodes;
  let cliMaxEmptyNodes;
  try {
    cliMaxReviewNodes = parseOptionalNonNegativeInt(
      flags.get('--max-review-nodes'),
      '--max-review-nodes',
    );
    cliMaxGenericNodes = parseOptionalNonNegativeInt(
      flags.get('--max-generic-nodes'),
      '--max-generic-nodes',
    );
    cliMaxEmptyNodes = parseOptionalNonNegativeInt(
      flags.get('--max-empty-nodes'),
      '--max-empty-nodes',
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }
  const maxReviewNodes = cliMaxReviewNodes ?? gateProfile?.maxReviewNodes;
  const maxGenericNodes = cliMaxGenericNodes ?? gateProfile?.maxGenericNodes;
  const maxEmptyNodes = cliMaxEmptyNodes ?? gateProfile?.maxEmptyNodes;
  const cliFailOnReasons = collectRepeatedFlag(argv, '--fail-on-reason');
  const failOnReasons =
    cliFailOnReasons.length > 0 ? cliFailOnReasons : (gateProfile?.failOnReasons ?? []);

  let artifactFile;
  let reportFile;
  const nowDate = options.nowDate ?? new Date();
  if (!summaryInputMode) {
    artifactFile = resolveFilePath(
      compiledFile ??
        flags.get('--artifact-file') ??
        gateProfile?.artifactFile ??
        buildDefaultArtifactPath(nowDate),
    );
    reportFile = resolveFilePath(
      flags.get('--report-file') ?? gateProfile?.reportFile ?? buildDefaultReportPath(artifactFile),
    );
  }
  const summaryJsonFileRaw = flags.get('--summary-json-file') ?? gateProfile?.summaryJsonFile;
  const summaryJsonFile = summaryJsonFileRaw ? resolveFilePath(summaryJsonFileRaw) : undefined;

  return {
    ok: true,
    command: {
      url,
      token,
      schemaVersion,
      allNodes,
      nodeId,
      includeValues,
      maxValues,
      includeControllerNodes,
      manifestFile,
      rulesFiles,
      ruleInputMode,
      compiledFile,
      inputSummaryJsonFile,
      catalogFile,
      artifactFile,
      reportFile,
      summaryJsonFile,
      gateProfileFile: gateProfile?.filePath,
      maxReviewNodes,
      maxGenericNodes,
      maxEmptyNodes,
      failOnReasons,
      printEffectiveGates: flags.has('--print-effective-gates'),
      top,
    },
  };
}

export async function runValidateLiveCommand(command, io = console, deps = {}) {
  const buildImpl = deps.buildCompiledProfilesArtifactImpl ?? buildCompiledProfilesArtifact;
  const inspectImpl = deps.runLiveInspectCommandImpl ?? runLiveInspectCommand;
  const nowDate = deps.nowDate ?? new Date();
  const generatedAtIso = nowDate.toISOString();

  if (command.printEffectiveGates) {
    io.log(`Effective gates:\n${formatJsonPretty(buildEffectiveGateConfig(command))}`);
  }

  if (command.inputSummaryJsonFile) {
    const loaded = loadSummaryGateInput(command.inputSummaryJsonFile);
    const summary = loaded.summary;
    const gateResult = evaluateValidationGates(command, summary);
    const machineSummary = buildMachineSummaryFromInput(
      command,
      loaded.machineSummary,
      gateResult,
      generatedAtIso,
    );
    if (command.summaryJsonFile) {
      fs.writeFileSync(command.summaryJsonFile, `${formatJsonPretty(machineSummary)}\n`, 'utf8');
    }

    io.log(`Input summary JSON: ${loaded.filePath}`);
    if (command.summaryJsonFile) {
      io.log(`Validation summary JSON: ${command.summaryJsonFile}`);
    }
    io.log(`Nodes validated: ${summary.totalNodes}`);
    io.log(`Outcomes: ${formatOutcomeSummary(summary.outcomes)}`);
    io.log(`Needs review: ${summary.reviewNodes}`);
    if (!gateResult.passed) {
      throw new Error(`Validation gates failed:\n- ${gateResult.violations.join('\n- ')}`);
    }

    return {
      artifact: undefined,
      results: undefined,
      summary,
      markdown: undefined,
      gateResult,
      machineSummary,
    };
  }

  let artifact;
  if (command.compiledFile) {
    try {
      artifact = readJson(command.compiledFile);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read compiled file "${command.compiledFile}": ${reason}`);
    }
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
      throw new Error(`Compiled file "${command.compiledFile}" must contain a JSON object`);
    }
  } else {
    const buildCommand = {
      url: command.url,
      token: command.token,
      schemaVersion: command.schemaVersion,
      allNodes: command.allNodes,
      nodeId: command.nodeId,
      includeValues: command.includeValues,
      maxValues: command.maxValues,
      includeControllerNodes: command.includeControllerNodes,
      deviceFiles: [],
      manifestFile: command.manifestFile,
      rulesFiles: command.rulesFiles,
      catalogFile: command.catalogFile,
      outputFile: undefined,
      format: 'summary',
      ruleInputMode: command.ruleInputMode,
    };

    artifact = await buildImpl(buildCommand, deps);
    fs.writeFileSync(command.artifactFile, `${formatJsonPretty(artifact)}\n`, 'utf8');
  }

  const inspectLogs = [];
  await inspectImpl(
    {
      url: command.url,
      token: command.token,
      schemaVersion: command.schemaVersion,
      allNodes: command.allNodes,
      nodeId: command.nodeId,
      compiledFile: command.artifactFile,
      manifestFile: undefined,
      rulesFiles: [],
      catalogFile: command.catalogFile,
      format: 'json-compact',
      includeValues: command.includeValues,
      maxValues: command.maxValues,
      includeControllerNodes: command.includeControllerNodes,
      focus: 'all',
      top: command.top,
      show: 'none',
      explainAll: false,
      explainOnly: false,
      homeyClass: undefined,
      driverTemplateId: undefined,
    },
    { log: (line) => inspectLogs.push(line) },
    deps,
  );

  const inspectOutput = inspectLogs.join('\n').trim();
  let parsed;
  try {
    parsed = JSON.parse(inspectOutput);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse live inspect output as JSON: ${reason}`);
  }
  const results = Array.isArray(parsed?.results) ? parsed.results : null;
  if (!results) {
    throw new Error('Live inspect output did not include results array');
  }

  const summary = summarizeValidationResults(results, command.top);
  const gateResult = evaluateValidationGates(command, summary);
  const markdown = formatMarkdownReport(command, summary, generatedAtIso);
  fs.writeFileSync(command.reportFile, markdown, 'utf8');
  const machineSummary = buildMachineSummary(command, summary, gateResult, generatedAtIso);
  if (command.summaryJsonFile) {
    fs.writeFileSync(command.summaryJsonFile, `${formatJsonPretty(machineSummary)}\n`, 'utf8');
  }

  if (command.compiledFile) {
    io.log(`Using compiled artifact: ${command.artifactFile}`);
  } else {
    io.log(`Compiled artifact: ${command.artifactFile}`);
  }
  io.log(`Validation report: ${command.reportFile}`);
  if (command.summaryJsonFile) {
    io.log(`Validation summary JSON: ${command.summaryJsonFile}`);
  }
  io.log(`Nodes validated: ${summary.totalNodes}`);
  io.log(`Outcomes: ${formatOutcomeSummary(summary.outcomes)}`);
  io.log(`Needs review: ${summary.reviewNodes}`);
  if (!gateResult.passed) {
    throw new Error(`Validation gates failed:\n- ${gateResult.violations.join('\n- ')}`);
  }

  return { artifact, results, summary, markdown, gateResult, machineSummary };
}

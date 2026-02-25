import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  isSupportedDiagnosticFormat,
  formatJsonCompact,
  formatJsonPretty,
  formatNdjson,
} from './output-format-lib.mjs';
import { connectAndInitialize, fetchNodeDetails, fetchNodesList } from './zwjs-inspect-lib.mjs';
import { formatCompileOutput } from './homey-compile-inspect-lib.mjs';
import {
  isControllerLikeZwjsNodeDetail,
  normalizeCompilerDeviceFactsFromZwjsDetail,
} from './zwjs-to-compiler-facts-lib.mjs';

export {
  isControllerLikeZwjsNodeDetail,
  normalizeCompilerDeviceFactsFromZwjsDetail,
} from './zwjs-to-compiler-facts-lib.mjs';

const require = createRequire(import.meta.url);
const {
  assertCompiledHomeyProfilesArtifactV1,
  compileProfilePlanFromLoadedRuleSetManifest,
  compileProfilePlanFromRuleSetManifest,
  loadJsonRuleSetManifest,
} = require('../packages/compiler/dist');

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function coerceManifestEntries(raw, manifestPath) {
  if (!Array.isArray(raw)) throw new Error('Manifest JSON must be an array');
  const manifestDir = path.dirname(manifestPath);
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object')
      throw new Error(`Manifest entry ${index} must be an object`);
    if (typeof entry.filePath !== 'string' || entry.filePath.length === 0) {
      throw new Error(`Manifest entry ${index} requires a non-empty filePath`);
    }
    if (
      entry.kind !== undefined &&
      entry.kind !== 'rules-json' &&
      entry.kind !== 'ha-derived-generated'
    ) {
      throw new Error(`Manifest entry ${index} has unsupported kind "${String(entry.kind)}"`);
    }
    return {
      ...entry,
      filePath: path.isAbsolute(entry.filePath)
        ? entry.filePath
        : path.resolve(manifestDir, entry.filePath),
    };
  });
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-compile-inspect-live --url ws://host:port (--all-nodes | --node <id>)',
    '                           (--compiled-file <compiled-profiles.json> | --manifest-file <manifest.json> | --rules-file <rules.json> [--rules-file ...])',
    '                           [--catalog-file <catalog.json>]',
    '                           [--format list|summary|markdown|json|json-pretty|json-compact|ndjson]',
    '                           [--schema-version 0] [--token ...]',
    '                           [--include-values none|summary|full] [--max-values N]',
    '                           [--include-controller-nodes]',
    '                           [--focus ...] [--top N] [--show ...] [--explain <cap>] [--explain-all] [--explain-only]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const flags = parseFlagMap(argv);
  const url = flags.get('--url');
  if (!url) return { ok: false, error: '--url is required' };
  const allNodes = flags.has('--all-nodes');
  const nodeRaw = flags.get('--node');
  if (!allNodes && !nodeRaw) return { ok: false, error: 'Provide --all-nodes or --node <id>' };
  if (allNodes && nodeRaw)
    return { ok: false, error: 'Use either --all-nodes or --node, not both' };
  const nodeId = nodeRaw === undefined ? undefined : Number.parseInt(nodeRaw, 10);
  if (nodeRaw !== undefined && !Number.isInteger(nodeId)) {
    return { ok: false, error: `Invalid --node: ${nodeRaw}` };
  }

  const compiledFile = flags.get('--compiled-file');
  const manifestFile = flags.get('--manifest-file');
  const rulesFiles = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rules-file' && argv[i + 1]) rulesFiles.push(argv[i + 1]);
    if (argv[i].startsWith('--rules-file=')) rulesFiles.push(argv[i].split('=', 2)[1]);
  }
  const sourceModeCount =
    (compiledFile ? 1 : 0) + (manifestFile ? 1 : 0) + (rulesFiles.length > 0 ? 1 : 0);
  if (sourceModeCount === 0) {
    return {
      ok: false,
      error: 'Provide --compiled-file, --manifest-file, or at least one --rules-file',
    };
  }
  if (sourceModeCount > 1) {
    return {
      ok: false,
      error: 'Use only one of --compiled-file, --manifest-file, or --rules-file',
    };
  }

  const format = flags.get('--format') ?? 'list';
  if (format !== 'list' && !isSupportedDiagnosticFormat(format)) {
    return { ok: false, error: `Unsupported format: ${format}` };
  }

  const schemaVersionRaw = flags.get('--schema-version') ?? '0';
  const schemaVersion = Number(schemaVersionRaw);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    return { ok: false, error: `Invalid --schema-version: ${schemaVersionRaw}` };
  }

  const includeValues = flags.get('--include-values') ?? (allNodes ? 'summary' : 'full');
  if (!['none', 'summary', 'full'].includes(includeValues)) {
    return { ok: false, error: `Unsupported --include-values: ${includeValues}` };
  }
  const maxValuesRaw = flags.get('--max-values') ?? (allNodes ? '100' : '200');
  const maxValues = Number(maxValuesRaw);
  if (!Number.isInteger(maxValues) || maxValues < 1) {
    return { ok: false, error: `Invalid --max-values: ${maxValuesRaw}` };
  }

  const focus = flags.get('--focus') ?? 'all';
  if (!['all', 'unmatched', 'suppressed', 'curation'].includes(focus)) {
    return { ok: false, error: `Unsupported focus: ${focus}` };
  }
  const topRaw = flags.get('--top');
  const top = topRaw === undefined ? 3 : Number.parseInt(topRaw, 10);
  if (!Number.isInteger(top) || top <= 0) {
    return { ok: false, error: `--top must be a positive integer (received: ${String(topRaw)})` };
  }
  const show = flags.get('--show') ?? 'none';
  if (!['none', 'rule', 'suppressed', 'curation', 'all'].includes(show)) {
    return { ok: false, error: `Unsupported show: ${show}` };
  }
  if (flags.has('--explain') && flags.has('--explain-all')) {
    return { ok: false, error: 'Use either --explain or --explain-all, not both' };
  }
  if (flags.has('--explain-only') && !flags.has('--explain') && !flags.has('--explain-all')) {
    return { ok: false, error: '--explain-only requires --explain or --explain-all' };
  }
  if (flags.has('--explain-only') && !['json', 'json-pretty', 'json-compact'].includes(format)) {
    return {
      ok: false,
      error: '--explain-only is only supported with json, json-pretty, or json-compact formats',
    };
  }

  return {
    ok: true,
    command: {
      url,
      token: flags.get('--token'),
      schemaVersion,
      allNodes,
      nodeId,
      compiledFile,
      manifestFile,
      rulesFiles,
      catalogFile: flags.get('--catalog-file'),
      format,
      includeValues,
      maxValues,
      includeControllerNodes: flags.has('--include-controller-nodes'),
      focus,
      top,
      show,
      explainCapabilityId: flags.get('--explain'),
      explainAll: flags.has('--explain-all'),
      explainOnly: flags.has('--explain-only'),
      homeyClass: flags.get('--homey-class'),
      driverTemplateId: flags.get('--driver-template'),
    },
  };
}

function productTripleKey(device) {
  if (
    device?.manufacturerId === undefined ||
    device?.productType === undefined ||
    device?.productId === undefined
  ) {
    return null;
  }
  return `${device.manufacturerId}:${device.productType}:${device.productId}`;
}

function buildCompiledArtifactIndex(artifact) {
  const byTriple = new Map();
  const byNodeId = new Map();
  for (const entry of artifact.entries) {
    const triple = productTripleKey(entry.device);
    if (triple && !byTriple.has(triple)) byTriple.set(triple, entry);
    if (typeof entry.device.nodeId === 'number' && !byNodeId.has(entry.device.nodeId)) {
      byNodeId.set(entry.device.nodeId, entry);
    }
  }
  return { byTriple, byNodeId };
}

function cloneCompiledForInspect(compiled, command) {
  return {
    ...compiled,
    __focus: command.focus,
    __top: command.top,
    __show: command.show,
    __explainCapabilityId: command.explainCapabilityId,
    __explainAll: command.explainAll === true,
    __explainOnly: command.explainOnly === true,
  };
}

function buildNoCompiledProfileResult(deviceFacts) {
  return {
    profile: {
      profileId: `unmatched:${deviceFacts.deviceKey}`,
      match: {},
      classification: {
        homeyClass: 'other',
        confidence: 'generic',
        uncurated: true,
      },
      capabilities: [],
      ignoredValues: [],
      provenance: {
        layer: 'project-generic',
        ruleId: 'no-compiled-profile-match',
        action: 'fill',
        reason: 'No compiled profile matched live device facts',
      },
    },
    report: {
      profileOutcome: 'empty',
      summary: {
        appliedActions: 0,
        unmatchedActions: 0,
        suppressedFillActions: 0,
        ignoredValues: 0,
      },
      byRule: [],
      bySuppressedSlot: [],
      curationCandidates: {
        likelyNeedsReview: true,
        reasons: ['no-compiled-profile-match'],
      },
      diagnosticDeviceKey: deviceFacts.deviceKey,
      unknownDeviceReport: {
        kind: 'no-catalog',
        diagnosticDeviceKey: deviceFacts.deviceKey,
        profileOutcome: 'empty',
        reasons: ['no-compiled-profile-match'],
      },
    },
    ruleSources: [],
  };
}

function selectCompiledEntryForDevice(deviceFacts, artifactIndex) {
  const triple = productTripleKey(deviceFacts);
  if (triple && artifactIndex.byTriple.has(triple)) {
    return artifactIndex.byTriple.get(triple);
  }
  if (typeof deviceFacts.nodeId === 'number' && artifactIndex.byNodeId.has(deviceFacts.nodeId)) {
    return artifactIndex.byNodeId.get(deviceFacts.nodeId);
  }
  return null;
}

function formatBool(value) {
  return value === true ? 'yes' : value === false ? 'no' : '';
}

function isTechnicalCurationReason(reason) {
  return (
    typeof reason === 'string' &&
    (reason.startsWith('suppressed-fill-actions:') || reason.startsWith('high-unmatched-ratio:'))
  );
}

function firstActionableReviewReason(reasons) {
  const list = Array.isArray(reasons) ? reasons : [];
  return list.find((reason) => !isTechnicalCurationReason(reason)) ?? '';
}

function humanizeReviewReasonForList(reason) {
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
  return reason;
}

export function formatListOutput(rows) {
  const headers = ['Node', 'Name', 'Class', 'Outcome', 'Conf', 'Uncur', 'Catalog', 'Review'];
  const body = rows.map((row) => [
    String(row.nodeId),
    row.name ?? '',
    row.homeyClass ?? '',
    row.profileOutcome ?? '',
    row.confidence ?? '',
    formatBool(row.uncurated),
    row.catalogRef ?? '',
    row.reviewReason ?? '',
  ]);
  const widths = headers.map((h, idx) =>
    Math.max(h.length, ...body.map((r) => (r[idx] ?? '').length)),
  );
  const render = (cols) =>
    cols
      .map((c, i) => String(c).padEnd(widths[i], ' '))
      .join('  ')
      .trimEnd();
  return [render(headers), render(widths.map((w) => '-'.repeat(w))), ...body.map(render)].join(
    '\n',
  );
}

function formatLiveOutput(results, format) {
  if (format === 'list') {
    const rows = results.map((row) => ({
      nodeId: row.node.nodeId,
      name: row.node.name ?? null,
      homeyClass: row.compiled.profile.classification.homeyClass,
      profileOutcome: row.compiled.report.profileOutcome,
      confidence: row.compiled.profile.classification.confidence,
      uncurated: row.compiled.profile.classification.uncurated,
      catalogRef: row.compiled.profile.catalogMatch?.catalogId ?? '',
      reviewReason: humanizeReviewReasonForList(
        firstActionableReviewReason(row.compiled.report.curationCandidates.reasons),
      ),
    }));
    return formatListOutput(rows);
  }
  if (format === 'ndjson') {
    const records = results.flatMap((row) => [
      { type: 'liveNode', node: row.node, deviceFacts: row.deviceFacts },
      { type: 'liveCompile', nodeId: row.node.nodeId, compile: row.compiled },
    ]);
    return formatNdjson(records);
  }
  if (format === 'json' || format === 'json-pretty') {
    return formatJsonPretty({ results });
  }
  if (format === 'json-compact') {
    return formatJsonCompact({ results });
  }
  if (results.length === 1) {
    return formatCompileOutput(results[0].compiled, format);
  }
  return results
    .map((row) => {
      const header = `# Node ${row.node.nodeId}${row.node.name ? ` (${row.node.name})` : ''}`;
      return `${header}\n${formatCompileOutput(row.compiled, format)}`;
    })
    .join('\n\n');
}

export async function runLiveInspectCommand(command, io = console, deps = {}) {
  const connect = deps.connectAndInitializeImpl ?? connectAndInitialize;
  const fetchList = deps.fetchNodesListImpl ?? fetchNodesList;
  const fetchDetail = deps.fetchNodeDetailsImpl ?? fetchNodeDetails;
  const compileFromManifestImpl =
    deps.compileProfilePlanFromRuleSetManifestImpl ?? compileProfilePlanFromRuleSetManifest;
  const compileFromLoadedImpl =
    deps.compileProfilePlanFromLoadedRuleSetManifestImpl ??
    compileProfilePlanFromLoadedRuleSetManifest;
  const loadRuleSetImpl = deps.loadJsonRuleSetManifestImpl ?? loadJsonRuleSetManifest;

  const manifestEntries = command.compiledFile
    ? null
    : command.manifestFile
      ? coerceManifestEntries(readJson(command.manifestFile), command.manifestFile)
      : command.rulesFiles.map((filePath) => ({ filePath }));
  const catalogArtifact = command.catalogFile ? readJson(command.catalogFile) : undefined;
  const compiledArtifact = command.compiledFile ? readJson(command.compiledFile) : null;
  if (compiledArtifact) {
    assertCompiledHomeyProfilesArtifactV1(compiledArtifact);
  }
  const compiledArtifactIndex = compiledArtifact
    ? buildCompiledArtifactIndex(compiledArtifact)
    : null;
  const canUseLoadedRuleSetPath =
    !compiledArtifactIndex &&
    manifestEntries &&
    deps.compileProfilePlanFromRuleSetManifestImpl === undefined;
  const loadedRuleSet = canUseLoadedRuleSetPath ? loadRuleSetImpl(manifestEntries) : null;

  const client = await connect({
    url: command.url,
    token: command.token,
    schemaVersion: command.schemaVersion,
  });

  try {
    const nodeSummaries = command.allNodes
      ? await fetchList(client)
      : [{ nodeId: command.nodeId, name: undefined }];
    const results = [];
    for (const node of nodeSummaries) {
      const detail = await fetchDetail(client, node.nodeId, {
        includeValues: command.includeValues,
        maxValues: command.maxValues,
      });
      if (!command.includeControllerNodes && isControllerLikeZwjsNodeDetail(detail)) {
        continue;
      }
      const deviceFacts = normalizeCompilerDeviceFactsFromZwjsDetail(detail);
      const compiledBase = compiledArtifactIndex
        ? (selectCompiledEntryForDevice(deviceFacts, compiledArtifactIndex)?.compiled ??
          buildNoCompiledProfileResult(deviceFacts))
        : loadedRuleSet
          ? compileFromLoadedImpl(deviceFacts, loadedRuleSet, {
              catalogArtifact,
              homeyClass: command.homeyClass,
              driverTemplateId: command.driverTemplateId,
            })
          : compileFromManifestImpl(deviceFacts, manifestEntries, {
              catalogArtifact,
              homeyClass: command.homeyClass,
              driverTemplateId: command.driverTemplateId,
            });
      results.push({
        node: { ...node, name: detail?.state?.name ?? node.name ?? null },
        detail,
        deviceFacts,
        compiled: cloneCompiledForInspect(compiledBase, command),
      });
    }

    io.log(formatLiveOutput(results, command.format));
  } finally {
    await client.stop();
  }
}

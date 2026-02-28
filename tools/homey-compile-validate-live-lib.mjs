import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCompiledProfilesArtifact } from './homey-compile-build-lib.mjs';
import { runLiveInspectCommand } from './homey-compile-inspect-live-lib.mjs';
import { formatJsonPretty } from './output-format-lib.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_RULE_MANIFEST_FILE = path.join(REPO_ROOT, 'rules', 'manifest.json');
const ARTIFACT_RETENTION_MODES = new Set(['keep', 'delete-on-pass']);
const ALLOWED_CLI_FLAGS = new Set([
  '--help',
  '-h',
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
  '--signature',
  '--artifact-file',
  '--artifact-retention',
  '--report-file',
  '--summary-json-file',
  '--redact-share',
  '--redacted-report-file',
  '--redacted-summary-json-file',
  '--save-baseline-summary-json-file',
  '--gate-profile-file',
  '--baseline-summary-json-file',
  '--max-review-nodes',
  '--max-generic-nodes',
  '--max-empty-nodes',
  '--fail-on-reason',
  '--max-review-delta',
  '--max-generic-delta',
  '--max-empty-delta',
  '--fail-on-reason-delta',
  '--print-effective-gates',
  '--top',
  '--input-summary-json-file',
]);

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

function findUnsupportedLongFlag(argv, allowedFlags) {
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key] = token.split('=', 2);
    if (!allowedFlags.has(key)) return key;
  }
  return undefined;
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

function parseArtifactRetention(rawValue, fieldName) {
  if (rawValue === undefined) return undefined;
  if (typeof rawValue !== 'string' || !ARTIFACT_RETENTION_MODES.has(rawValue)) {
    throw new Error(`Invalid ${fieldName}: ${rawValue} (expected keep|delete-on-pass)`);
  }
  return rawValue;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parsePathFlag(flags, flagName) {
  const rawValue = flags.get(flagName);
  if (rawValue === undefined) return undefined;
  if (!rawValue || rawValue === 'true') {
    throw new Error(`${flagName} requires a value`);
  }
  return resolveFilePath(rawValue);
}

function makeRedactedReportPath(reportFile) {
  if (!reportFile) return undefined;
  if (reportFile.endsWith('.md')) return reportFile.replace(/\.md$/, '.redacted.md');
  return `${reportFile}.redacted.md`;
}

function makeRedactedSummaryPath(baseFilePath) {
  if (!baseFilePath) return undefined;
  if (baseFilePath.endsWith('.json')) return baseFilePath.replace(/\.json$/, '.redacted.json');
  return `${baseFilePath}.redacted.json`;
}

function makeDefaultRedactedSummaryPath({ summaryJsonFile, inputSummaryJsonFile, reportFile }) {
  if (summaryJsonFile) return makeRedactedSummaryPath(summaryJsonFile);
  if (inputSummaryJsonFile) return makeRedactedSummaryPath(inputSummaryJsonFile);
  if (!reportFile) return undefined;
  if (reportFile.endsWith('.md')) return reportFile.replace(/\.md$/, '.summary.redacted.json');
  return `${reportFile}.summary.redacted.json`;
}

function redactSharePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  return path.basename(filePath);
}

function redactShareScope(scope) {
  if (!scope || typeof scope !== 'string') return scope;
  if (scope === 'all-nodes') return scope;
  if (scope.startsWith('node:')) return 'node:REDACTED_NODE_ID';
  return scope;
}

function buildRedactedMachineSummary(machineSummary) {
  const out = JSON.parse(JSON.stringify(machineSummary ?? {}));
  const source = out && typeof out === 'object' ? out.source : undefined;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    if (typeof source.url === 'string' && source.url.length > 0) {
      source.url = 'REDACTED_URL';
    }
    source.scope = redactShareScope(source.scope);
    const sourcePathKeys = [
      'inputSummaryJsonFile',
      'baselineSummaryJsonFile',
      'manifestFile',
      'compiledFile',
      'artifactFile',
      'reportFile',
      'gateProfileFile',
      'summaryJsonFile',
      'saveBaselineSummaryJsonFile',
      'catalogFile',
      'redactedReportFile',
      'redactedSummaryJsonFile',
    ];
    for (const key of sourcePathKeys) {
      if (typeof source[key] === 'string' && source[key].length > 0) {
        source[key] = redactSharePath(source[key]);
      }
    }
    if (Array.isArray(source.rulesFiles)) {
      source.rulesFiles = source.rulesFiles.map((entry) =>
        typeof entry === 'string' ? redactSharePath(entry) : entry,
      );
    }
  }

  const configured = out?.gates?.configured;
  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    const gatePathKeys = [
      'gateProfileFile',
      'baselineSummaryJsonFile',
      'redactedReportFile',
      'redactedSummaryJsonFile',
    ];
    for (const key of gatePathKeys) {
      if (typeof configured[key] === 'string' && configured[key].length > 0) {
        configured[key] = redactSharePath(configured[key]);
      }
    }
  }

  out.redaction = { mode: 'share', version: 1 };
  return out;
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

function parseReasonDeltaConfigMap(raw, fieldName) {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Field "${fieldName}" must be an object`);
  }
  const out = {};
  for (const [reason, rawValue] of Object.entries(raw)) {
    if (!reason) {
      throw new Error(`Field "${fieldName}" contains an empty reason key`);
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`Field "${fieldName}.${reason}" must be a non-negative integer`);
    }
    out[reason] = parsed;
  }
  return out;
}

function parseReasonDeltaFlags(rawValues, flagName) {
  const out = {};
  for (const token of rawValues) {
    const separator = token.lastIndexOf(':');
    if (separator <= 0 || separator === token.length - 1) {
      throw new Error(
        `Invalid ${flagName} entry "${token}" (expected <reason>:<non-negative-int>)`,
      );
    }
    const reason = token.slice(0, separator);
    const deltaRaw = token.slice(separator + 1);
    const parsed = Number(deltaRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`Invalid ${flagName} delta for "${reason}": ${deltaRaw}`);
    }
    if (out[reason] !== undefined) {
      throw new Error(`Duplicate ${flagName} reason "${reason}"`);
    }
    out[reason] = parsed;
  }
  return out;
}

function loadSummaryGateInput(summaryJsonFile, options = {}) {
  const { label = 'summary JSON file' } = options;
  const resolvedFilePath = resolveFilePath(summaryJsonFile);
  let raw;
  try {
    raw = readJson(resolvedFilePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${label} "${resolvedFilePath}": ${reason}`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label} "${resolvedFilePath}" must be a JSON object`);
  }
  const counts = raw.counts;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
    throw new Error(`${label} "${resolvedFilePath}" must include object field "counts"`);
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
    'maxReviewDelta',
    'maxGenericDelta',
    'maxEmptyDelta',
    'failOnReasons',
    'failOnReasonDeltas',
    'baselineSummaryJsonFile',
    'artifactRetention',
    'redactShare',
    'redactedReportFile',
    'redactedSummaryJsonFile',
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
  let maxReviewDelta;
  let maxGenericDelta;
  let maxEmptyDelta;
  let artifactRetention;
  let redactShare;
  try {
    maxReviewNodes = parseOptionalNonNegativeInt(raw.maxReviewNodes, 'gateProfile.maxReviewNodes');
    maxGenericNodes = parseOptionalNonNegativeInt(
      raw.maxGenericNodes,
      'gateProfile.maxGenericNodes',
    );
    maxEmptyNodes = parseOptionalNonNegativeInt(raw.maxEmptyNodes, 'gateProfile.maxEmptyNodes');
    maxReviewDelta = parseOptionalNonNegativeInt(raw.maxReviewDelta, 'gateProfile.maxReviewDelta');
    maxGenericDelta = parseOptionalNonNegativeInt(
      raw.maxGenericDelta,
      'gateProfile.maxGenericDelta',
    );
    maxEmptyDelta = parseOptionalNonNegativeInt(raw.maxEmptyDelta, 'gateProfile.maxEmptyDelta');
    artifactRetention = parseArtifactRetention(
      raw.artifactRetention,
      'gateProfile.artifactRetention',
    );
    if (raw.redactShare !== undefined && typeof raw.redactShare !== 'boolean') {
      throw new Error('gateProfile.redactShare must be a boolean');
    }
    redactShare = raw.redactShare;
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

  let failOnReasonDeltas;
  try {
    failOnReasonDeltas = parseReasonDeltaConfigMap(
      raw.failOnReasonDeltas,
      'gateProfile.failOnReasonDeltas',
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid gate profile "${resolvedFilePath}": ${reason}`);
  }

  return {
    filePath: resolvedFilePath,
    maxReviewNodes,
    maxGenericNodes,
    maxEmptyNodes,
    maxReviewDelta,
    maxGenericDelta,
    maxEmptyDelta,
    failOnReasons,
    failOnReasonDeltas,
    baselineSummaryJsonFile: resolveProfilePath(
      raw.baselineSummaryJsonFile,
      'baselineSummaryJsonFile',
    ),
    artifactRetention,
    redactShare,
    redactedReportFile: resolveProfilePath(raw.redactedReportFile, 'redactedReportFile'),
    redactedSummaryJsonFile: resolveProfilePath(
      raw.redactedSummaryJsonFile,
      'redactedSummaryJsonFile',
    ),
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

function formatDeltaSummary(deltas) {
  if (!deltas) return '';
  return `review=${deltas.reviewNodes}, generic=${deltas.genericNodes}, empty=${deltas.emptyNodes}`;
}

function formatSignedDelta(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return value > 0 ? `+${value}` : String(value);
}

function describeRuleSource(command, options = {}) {
  const { redacted = false } = options;
  const pathFormatter = redacted ? redactSharePath : (value) => value;
  if (command.ruleInputMode === 'compiled-file') {
    return `compiled-file (${pathFormatter(command.compiledFile)})`;
  }
  if (command.ruleInputMode === 'default-manifest') {
    return `default-manifest (${pathFormatter(command.manifestFile)})`;
  }
  if (command.manifestFile) {
    return `manifest-file (${pathFormatter(command.manifestFile)})`;
  }
  return `rules-files (${command.rulesFiles.map((filePath) => pathFormatter(filePath)).join(', ')})`;
}

function formatMarkdownReport(command, summary, generatedAtIso, gateResult, options = {}) {
  const { redacted = false } = options;
  const pathFormatter = redacted ? redactSharePath : (value) => value;
  const urlValue = redacted ? 'REDACTED_URL' : command.url;
  const scopeValue = redacted
    ? command.allNodes
      ? 'all-nodes'
      : 'node REDACTED_NODE_ID'
    : command.allNodes
      ? 'all-nodes'
      : `node ${command.nodeId}`;
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
      ? summary.rows.map((row, index) => [
          redacted ? `node-${index + 1}` : (row.nodeId ?? ''),
          redacted ? 'REDACTED_NODE_NAME' : (row.name ?? ''),
          row.homeyClass ?? '',
          row.outcome ?? '',
          row.confidence ?? '',
          row.review ?? '',
        ])
      : [['(none)', '', '', '', '', '']];

  const baselineRows = gateResult?.deltas
    ? [
        [
          'reviewNodes',
          gateResult?.baseline?.reviewNodes ?? '',
          summary.reviewNodes,
          formatSignedDelta(gateResult.deltas.reviewNodes),
        ],
        [
          'genericNodes',
          gateResult?.baseline?.genericNodes ?? '',
          gateResult.genericNodes,
          formatSignedDelta(gateResult.deltas.genericNodes),
        ],
        [
          'emptyNodes',
          gateResult?.baseline?.emptyNodes ?? '',
          gateResult.emptyNodes,
          formatSignedDelta(gateResult.deltas.emptyNodes),
        ],
      ]
    : [];
  const reasonDeltaRows =
    gateResult?.deltas && gateResult?.deltas.reasonDeltas
      ? Object.entries(gateResult.deltas.reasonDeltas)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([reason, delta]) => [reason, formatSignedDelta(delta)])
      : [];

  return [
    '# Live Compiler Validation',
    '',
    `- Generated at: ${generatedAtIso}`,
    `- ZWJS URL: ${urlValue}`,
    `- Scope: ${scopeValue}`,
    ...(command.signature ? [`- Signature filter: ${command.signature}`] : []),
    `- Rule source: ${describeRuleSource(command, { redacted })}`,
    `- Compiled artifact: ${pathFormatter(command.artifactFile)}`,
    ...(redacted ? ['- Redaction: share-safe (URL, paths, and node identifiers anonymized)'] : []),
    ...(command.baselineSummaryJsonFile
      ? [`- Baseline summary: ${pathFormatter(command.baselineSummaryJsonFile)}`]
      : []),
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
    ...(baselineRows.length > 0
      ? [
          '## Baseline Delta',
          '',
          renderTable(['Metric', 'Baseline', 'Current', 'Delta'], baselineRows),
          '',
        ]
      : []),
    ...(reasonDeltaRows.length > 0
      ? ['## Reason Deltas', '', renderTable(['Reason', 'Delta'], reasonDeltaRows), '']
      : []),
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

  let baseline;
  let deltas;
  if (command.baselineSummary) {
    const baselineGenericNodes = command.baselineSummary.outcomes.get('generic') ?? 0;
    const baselineEmptyNodes = command.baselineSummary.outcomes.get('empty') ?? 0;
    baseline = {
      reviewNodes: command.baselineSummary.reviewNodes,
      genericNodes: baselineGenericNodes,
      emptyNodes: baselineEmptyNodes,
      reasonCounts: mapToSortedObject(command.baselineSummary.reviewReasonCounts),
    };
    const reviewDelta = summary.reviewNodes - command.baselineSummary.reviewNodes;
    const genericDelta = genericNodes - baselineGenericNodes;
    const emptyDelta = emptyNodes - baselineEmptyNodes;
    const reasonDeltas = new Map();
    const configuredReasonDeltas = command.failOnReasonDeltas ?? {};
    for (const reason of Object.keys(configuredReasonDeltas)) {
      const current = summary.reviewReasonCounts.get(reason) ?? 0;
      const baselineCount = command.baselineSummary.reviewReasonCounts.get(reason) ?? 0;
      const delta = current - baselineCount;
      reasonDeltas.set(reason, delta);
      if (delta > configuredReasonDeltas[reason]) {
        violations.push(
          `reason "${reason}" delta ${delta} exceeded max ${configuredReasonDeltas[reason]} (--fail-on-reason-delta ${reason}:${configuredReasonDeltas[reason]})`,
        );
      }
    }

    deltas = {
      reviewNodes: reviewDelta,
      genericNodes: genericDelta,
      emptyNodes: emptyDelta,
      reasonDeltas: mapToSortedObject(reasonDeltas),
    };

    if (
      command.maxReviewDelta !== undefined &&
      Number.isInteger(command.maxReviewDelta) &&
      reviewDelta > command.maxReviewDelta
    ) {
      violations.push(
        `review nodes delta ${reviewDelta} exceeded max ${command.maxReviewDelta} (--max-review-delta)`,
      );
    }
    if (
      command.maxGenericDelta !== undefined &&
      Number.isInteger(command.maxGenericDelta) &&
      genericDelta > command.maxGenericDelta
    ) {
      violations.push(
        `generic outcome nodes delta ${genericDelta} exceeded max ${command.maxGenericDelta} (--max-generic-delta)`,
      );
    }
    if (
      command.maxEmptyDelta !== undefined &&
      Number.isInteger(command.maxEmptyDelta) &&
      emptyDelta > command.maxEmptyDelta
    ) {
      violations.push(
        `empty outcome nodes delta ${emptyDelta} exceeded max ${command.maxEmptyDelta} (--max-empty-delta)`,
      );
    }
  }

  return {
    genericNodes,
    emptyNodes,
    baseline,
    deltas,
    passed: violations.length === 0,
    violations,
  };
}

function buildConfiguredGateSection(command) {
  return {
    signature: command.signature,
    gateProfileFile: command.gateProfileFile,
    baselineSummaryJsonFile: command.baselineSummaryJsonFile,
    artifactRetention: command.artifactRetention,
    redactShare: command.redactShare,
    redactedReportFile: command.redactedReportFile,
    redactedSummaryJsonFile: command.redactedSummaryJsonFile,
    maxReviewNodes: command.maxReviewNodes,
    maxGenericNodes: command.maxGenericNodes,
    maxEmptyNodes: command.maxEmptyNodes,
    maxReviewDelta: command.maxReviewDelta,
    maxGenericDelta: command.maxGenericDelta,
    maxEmptyDelta: command.maxEmptyDelta,
    failOnReasons: command.failOnReasons,
    failOnReasonDeltas: command.failOnReasonDeltas,
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
    signature: command.signature ?? null,
    baselineSummaryJsonFile: command.baselineSummaryJsonFile ?? null,
    thresholds: {
      maxReviewNodes: command.maxReviewNodes ?? null,
      maxGenericNodes: command.maxGenericNodes ?? null,
      maxEmptyNodes: command.maxEmptyNodes ?? null,
    },
    deltas: {
      maxReviewDelta: command.maxReviewDelta ?? null,
      maxGenericDelta: command.maxGenericDelta ?? null,
      maxEmptyDelta: command.maxEmptyDelta ?? null,
      failOnReasonDeltas: command.failOnReasonDeltas ?? {},
    },
    failOnReasons: command.failOnReasons ?? [],
    outputs: {
      artifactRetention: command.artifactRetention ?? 'keep',
      redactShare: command.redactShare ?? false,
      artifactFile: command.artifactFile ?? null,
      reportFile: command.reportFile ?? null,
      summaryJsonFile: command.summaryJsonFile ?? null,
      redactedReportFile: command.redactedReportFile ?? null,
      redactedSummaryJsonFile: command.redactedSummaryJsonFile ?? null,
      saveBaselineSummaryJsonFile: command.saveBaselineSummaryJsonFile ?? null,
    },
  };
}

function buildMachineSummary(command, summary, gateResult, generatedAtIso) {
  return {
    generatedAt: generatedAtIso,
    source: {
      url: command.url,
      scope: command.allNodes ? 'all-nodes' : `node:${command.nodeId}`,
      signature: command.signature,
      ruleInputMode: command.ruleInputMode,
      inputSummaryJsonFile: command.inputSummaryJsonFile,
      baselineSummaryJsonFile: command.baselineSummaryJsonFile,
      manifestFile: command.manifestFile,
      rulesFiles: command.rulesFiles,
      compiledFile: command.compiledFile,
      artifactRetention: command.artifactRetention,
      artifactFile: command.artifactFile,
      reportFile: command.reportFile,
      gateProfileFile: command.gateProfileFile,
      redactedReportFile: command.redactedReportFile,
      redactedSummaryJsonFile: command.redactedSummaryJsonFile,
      redactShare: command.redactShare,
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
      configured: buildConfiguredGateSection(command),
      baseline: gateResult.baseline,
      deltas: gateResult.deltas,
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
  return {
    ...input,
    generatedAt: generatedAtIso,
    source: {
      ...source,
      signature: command.signature,
      inputSummaryJsonFile: command.inputSummaryJsonFile,
      baselineSummaryJsonFile: command.baselineSummaryJsonFile,
      gateProfileFile: command.gateProfileFile,
      redactedSummaryJsonFile: command.redactedSummaryJsonFile,
      redactedReportFile: command.redactedReportFile,
      redactShare: command.redactShare,
    },
    gates: {
      configured: buildConfiguredGateSection(command),
      baseline: gateResult.baseline,
      deltas: gateResult.deltas,
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
    '                            [--signature <manufacturerId:productType:productId>]',
    '                            [--artifact-file </tmp/compiled-live.json>]',
    '                            [--artifact-retention keep|delete-on-pass]',
    '                            [--report-file </tmp/compiled-live.validation.md>]',
    '                            [--summary-json-file </tmp/compiled-live.summary.json>]',
    '                            [--redact-share]',
    '                            [--redacted-report-file </tmp/compiled-live.validation.redacted.md>]',
    '                            [--redacted-summary-json-file </tmp/compiled-live.summary.redacted.json>]',
    '                            [--save-baseline-summary-json-file </tmp/compiled-live.baseline.summary.json>]',
    '                            [--gate-profile-file <validation-gates.json>]',
    '                            [--baseline-summary-json-file </tmp/compiled-live.baseline.summary.json>]',
    '                            [--max-review-nodes N] [--max-generic-nodes N] [--max-empty-nodes N]',
    '                            [--fail-on-reason <reason> ...]',
    '                            [--max-review-delta N] [--max-generic-delta N] [--max-empty-delta N]',
    '                            [--fail-on-reason-delta <reason>:<delta> ...]',
    '                            [--print-effective-gates]',
    '                            [--top N]',
    '',
    '  homey-compile-validate-live --input-summary-json-file </tmp/compiled-live.summary.json>',
    '                            [--gate-profile-file <validation-gates.json>]',
    '                            [--baseline-summary-json-file </tmp/compiled-live.baseline.summary.json>]',
    '                            [--max-review-nodes N] [--max-generic-nodes N] [--max-empty-nodes N]',
    '                            [--fail-on-reason <reason> ...]',
    '                            [--max-review-delta N] [--max-generic-delta N] [--max-empty-delta N]',
    '                            [--fail-on-reason-delta <reason>:<delta> ...]',
    '                            [--summary-json-file </tmp/compiled-live.summary.recheck.json>]',
    '                            [--redact-share]',
    '                            [--redacted-summary-json-file </tmp/compiled-live.summary.recheck.redacted.json>]',
    '                            [--save-baseline-summary-json-file </tmp/compiled-live.baseline.summary.json>]',
    '                            [--artifact-retention keep|delete-on-pass]',
    '                            [--print-effective-gates]',
  ].join('\n');
}

export function parseCliArgs(argv, options = {}) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };

  const removedBacklogFlags = [
    '--curation-backlog-json-file',
    '--redacted-curation-backlog-json-file',
  ];
  const usedRemovedBacklogFlag = removedBacklogFlags.find((flagName) =>
    hasFlagOccurrence(argv, flagName),
  );
  if (usedRemovedBacklogFlag) {
    return {
      ok: false,
      error: `${usedRemovedBacklogFlag} is no longer supported (backlog artifacts were removed from compiler:validate-live)`,
    };
  }
  const unsupportedFlag = findUnsupportedLongFlag(argv, ALLOWED_CLI_FLAGS);
  if (unsupportedFlag) {
    return { ok: false, error: `Unsupported flag: ${unsupportedFlag}` };
  }

  const flags = parseFlagMap(argv);
  const inputSummaryJsonFileFlag = flags.get('--input-summary-json-file');
  let inputSummaryJsonFile;
  if (inputSummaryJsonFileFlag !== undefined) {
    if (!inputSummaryJsonFileFlag || inputSummaryJsonFileFlag === 'true') {
      return { ok: false, error: '--input-summary-json-file requires a value' };
    }
    inputSummaryJsonFile = resolveFilePath(inputSummaryJsonFileFlag);
  }

  const baselineSummaryJsonFileFlag = flags.get('--baseline-summary-json-file');
  let cliBaselineSummaryJsonFile;
  if (baselineSummaryJsonFileFlag !== undefined) {
    if (!baselineSummaryJsonFileFlag || baselineSummaryJsonFileFlag === 'true') {
      return { ok: false, error: '--baseline-summary-json-file requires a value' };
    }
    cliBaselineSummaryJsonFile = resolveFilePath(baselineSummaryJsonFileFlag);
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
      '--signature',
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
  let signature;
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
    signature = flags.get('--signature');
    if (signature !== undefined && !/^\d+:\d+:\d+$/.test(signature)) {
      return {
        ok: false,
        error:
          '--signature must be a product triple in decimal format: <manufacturerId:productType:productId>',
      };
    }
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

  const cliRedactShare = flags.has('--redact-share');
  let cliRedactedReportFile;
  let cliRedactedSummaryJsonFile;
  try {
    cliRedactedReportFile = parsePathFlag(flags, '--redacted-report-file');
    cliRedactedSummaryJsonFile = parsePathFlag(flags, '--redacted-summary-json-file');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }

  let cliArtifactRetention;
  try {
    cliArtifactRetention = parseArtifactRetention(
      flags.get('--artifact-retention'),
      '--artifact-retention',
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }

  let cliMaxReviewNodes;
  let cliMaxGenericNodes;
  let cliMaxEmptyNodes;
  let cliMaxReviewDelta;
  let cliMaxGenericDelta;
  let cliMaxEmptyDelta;
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
    cliMaxReviewDelta = parseOptionalNonNegativeInt(
      flags.get('--max-review-delta'),
      '--max-review-delta',
    );
    cliMaxGenericDelta = parseOptionalNonNegativeInt(
      flags.get('--max-generic-delta'),
      '--max-generic-delta',
    );
    cliMaxEmptyDelta = parseOptionalNonNegativeInt(
      flags.get('--max-empty-delta'),
      '--max-empty-delta',
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }
  const maxReviewNodes = cliMaxReviewNodes ?? gateProfile?.maxReviewNodes;
  const maxGenericNodes = cliMaxGenericNodes ?? gateProfile?.maxGenericNodes;
  const maxEmptyNodes = cliMaxEmptyNodes ?? gateProfile?.maxEmptyNodes;
  const maxReviewDelta = cliMaxReviewDelta ?? gateProfile?.maxReviewDelta;
  const maxGenericDelta = cliMaxGenericDelta ?? gateProfile?.maxGenericDelta;
  const maxEmptyDelta = cliMaxEmptyDelta ?? gateProfile?.maxEmptyDelta;
  const cliFailOnReasons = collectRepeatedFlag(argv, '--fail-on-reason');
  const failOnReasons =
    cliFailOnReasons.length > 0 ? cliFailOnReasons : (gateProfile?.failOnReasons ?? []);
  const cliFailOnReasonDeltaSpecs = collectRepeatedFlag(argv, '--fail-on-reason-delta');
  let cliFailOnReasonDeltas;
  try {
    cliFailOnReasonDeltas = parseReasonDeltaFlags(
      cliFailOnReasonDeltaSpecs,
      '--fail-on-reason-delta',
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }
  const failOnReasonDeltas =
    cliFailOnReasonDeltaSpecs.length > 0
      ? cliFailOnReasonDeltas
      : (gateProfile?.failOnReasonDeltas ?? {});
  const baselineSummaryJsonFile =
    cliBaselineSummaryJsonFile ?? gateProfile?.baselineSummaryJsonFile;
  const artifactRetention = cliArtifactRetention ?? gateProfile?.artifactRetention ?? 'keep';

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
  const saveBaselineSummaryJsonFileFlag = flags.get('--save-baseline-summary-json-file');
  let saveBaselineSummaryJsonFile;
  if (saveBaselineSummaryJsonFileFlag !== undefined) {
    if (!saveBaselineSummaryJsonFileFlag || saveBaselineSummaryJsonFileFlag === 'true') {
      return { ok: false, error: '--save-baseline-summary-json-file requires a value' };
    }
    saveBaselineSummaryJsonFile = resolveFilePath(saveBaselineSummaryJsonFileFlag);
  }

  const redactShare = cliRedactShare || gateProfile?.redactShare === true;
  let redactedReportFile = cliRedactedReportFile ?? gateProfile?.redactedReportFile;
  let redactedSummaryJsonFile = cliRedactedSummaryJsonFile ?? gateProfile?.redactedSummaryJsonFile;

  if (summaryInputMode && redactedReportFile) {
    if (cliRedactedReportFile) {
      return {
        ok: false,
        error: '--redacted-report-file cannot be used with --input-summary-json-file',
      };
    }
    redactedReportFile = undefined;
  }
  if (redactShare) {
    if (!summaryInputMode && !redactedReportFile) {
      redactedReportFile = makeRedactedReportPath(reportFile);
    }
    if (!redactedSummaryJsonFile) {
      redactedSummaryJsonFile = makeDefaultRedactedSummaryPath({
        summaryJsonFile,
        inputSummaryJsonFile,
        reportFile,
      });
    }
  }

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
      signature,
      manifestFile,
      rulesFiles,
      ruleInputMode,
      compiledFile,
      inputSummaryJsonFile,
      baselineSummaryJsonFile,
      catalogFile,
      artifactFile,
      artifactRetention,
      reportFile,
      summaryJsonFile,
      redactShare,
      redactedReportFile,
      redactedSummaryJsonFile,
      saveBaselineSummaryJsonFile,
      gateProfileFile: gateProfile?.filePath,
      maxReviewNodes,
      maxGenericNodes,
      maxEmptyNodes,
      maxReviewDelta,
      maxGenericDelta,
      maxEmptyDelta,
      failOnReasons,
      failOnReasonDeltas,
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
  let baselineSummary;
  if (command.baselineSummaryJsonFile) {
    baselineSummary = loadSummaryGateInput(command.baselineSummaryJsonFile, {
      label: 'baseline summary JSON file',
    }).summary;
  }
  const commandWithBaseline = {
    ...command,
    baselineSummary,
  };

  if (commandWithBaseline.printEffectiveGates) {
    io.log(`Effective gates:\n${formatJsonPretty(buildEffectiveGateConfig(commandWithBaseline))}`);
  }

  if (commandWithBaseline.inputSummaryJsonFile) {
    const loaded = loadSummaryGateInput(commandWithBaseline.inputSummaryJsonFile, {
      label: 'input summary JSON file',
    });
    const summary = loaded.summary;
    const gateResult = evaluateValidationGates(commandWithBaseline, summary);
    const machineSummary = buildMachineSummaryFromInput(
      commandWithBaseline,
      loaded.machineSummary,
      gateResult,
      generatedAtIso,
    );
    if (commandWithBaseline.summaryJsonFile) {
      fs.writeFileSync(
        commandWithBaseline.summaryJsonFile,
        `${formatJsonPretty(machineSummary)}\n`,
        'utf8',
      );
    }
    if (commandWithBaseline.saveBaselineSummaryJsonFile) {
      fs.writeFileSync(
        commandWithBaseline.saveBaselineSummaryJsonFile,
        `${formatJsonPretty(machineSummary)}\n`,
        'utf8',
      );
    }
    if (commandWithBaseline.redactedSummaryJsonFile) {
      fs.writeFileSync(
        commandWithBaseline.redactedSummaryJsonFile,
        `${formatJsonPretty(buildRedactedMachineSummary(machineSummary))}\n`,
        'utf8',
      );
    }

    io.log(`Input summary JSON: ${loaded.filePath}`);
    if (commandWithBaseline.baselineSummaryJsonFile) {
      io.log(`Baseline summary JSON: ${commandWithBaseline.baselineSummaryJsonFile}`);
      io.log(`Delta: ${formatDeltaSummary(gateResult.deltas)}`);
    }
    if (commandWithBaseline.summaryJsonFile) {
      io.log(`Validation summary JSON: ${commandWithBaseline.summaryJsonFile}`);
    }
    if (commandWithBaseline.saveBaselineSummaryJsonFile) {
      io.log(`Saved baseline summary JSON: ${commandWithBaseline.saveBaselineSummaryJsonFile}`);
    }
    if (commandWithBaseline.redactedSummaryJsonFile) {
      io.log(`Redacted summary JSON: ${commandWithBaseline.redactedSummaryJsonFile}`);
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
  if (commandWithBaseline.compiledFile) {
    try {
      artifact = readJson(commandWithBaseline.compiledFile);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to read compiled file "${commandWithBaseline.compiledFile}": ${reason}`,
      );
    }
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
      throw new Error(
        `Compiled file "${commandWithBaseline.compiledFile}" must contain a JSON object`,
      );
    }
  } else {
    const buildCommand = {
      url: commandWithBaseline.url,
      token: commandWithBaseline.token,
      schemaVersion: commandWithBaseline.schemaVersion,
      allNodes: commandWithBaseline.allNodes,
      nodeId: commandWithBaseline.nodeId,
      includeValues: commandWithBaseline.includeValues,
      maxValues: commandWithBaseline.maxValues,
      includeControllerNodes: commandWithBaseline.includeControllerNodes,
      deviceFiles: [],
      manifestFile: commandWithBaseline.manifestFile,
      rulesFiles: commandWithBaseline.rulesFiles,
      catalogFile: commandWithBaseline.catalogFile,
      outputFile: undefined,
      format: 'summary',
      ruleInputMode: commandWithBaseline.ruleInputMode,
    };

    artifact = await buildImpl(buildCommand, deps);
    fs.writeFileSync(commandWithBaseline.artifactFile, `${formatJsonPretty(artifact)}\n`, 'utf8');
  }

  const inspectLogs = [];
  await inspectImpl(
    {
      url: commandWithBaseline.url,
      token: commandWithBaseline.token,
      schemaVersion: commandWithBaseline.schemaVersion,
      allNodes: commandWithBaseline.allNodes,
      nodeId: commandWithBaseline.nodeId,
      compiledFile: commandWithBaseline.artifactFile,
      manifestFile: undefined,
      rulesFiles: [],
      catalogFile: commandWithBaseline.catalogFile,
      format: 'json-compact',
      includeValues: commandWithBaseline.includeValues,
      maxValues: commandWithBaseline.maxValues,
      includeControllerNodes: commandWithBaseline.includeControllerNodes,
      signature: commandWithBaseline.signature,
      focus: 'all',
      top: commandWithBaseline.top,
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

  const summary = summarizeValidationResults(results, commandWithBaseline.top);
  const gateResult = evaluateValidationGates(commandWithBaseline, summary);
  const markdown = formatMarkdownReport(commandWithBaseline, summary, generatedAtIso, gateResult);
  fs.writeFileSync(commandWithBaseline.reportFile, markdown, 'utf8');
  if (commandWithBaseline.redactedReportFile) {
    const redactedMarkdown = formatMarkdownReport(
      commandWithBaseline,
      summary,
      generatedAtIso,
      gateResult,
      { redacted: true },
    );
    fs.writeFileSync(commandWithBaseline.redactedReportFile, redactedMarkdown, 'utf8');
  }
  const machineSummary = buildMachineSummary(
    commandWithBaseline,
    summary,
    gateResult,
    generatedAtIso,
  );
  if (commandWithBaseline.summaryJsonFile) {
    fs.writeFileSync(
      commandWithBaseline.summaryJsonFile,
      `${formatJsonPretty(machineSummary)}\n`,
      'utf8',
    );
  }
  if (commandWithBaseline.redactedSummaryJsonFile) {
    fs.writeFileSync(
      commandWithBaseline.redactedSummaryJsonFile,
      `${formatJsonPretty(buildRedactedMachineSummary(machineSummary))}\n`,
      'utf8',
    );
  }
  if (commandWithBaseline.saveBaselineSummaryJsonFile) {
    fs.writeFileSync(
      commandWithBaseline.saveBaselineSummaryJsonFile,
      `${formatJsonPretty(machineSummary)}\n`,
      'utf8',
    );
  }

  if (commandWithBaseline.compiledFile) {
    io.log(`Using compiled artifact: ${commandWithBaseline.artifactFile}`);
  } else {
    io.log(`Compiled artifact: ${commandWithBaseline.artifactFile}`);
  }
  if (commandWithBaseline.baselineSummaryJsonFile) {
    io.log(`Baseline summary JSON: ${commandWithBaseline.baselineSummaryJsonFile}`);
    io.log(`Delta: ${formatDeltaSummary(gateResult.deltas)}`);
  }
  io.log(`Validation report: ${commandWithBaseline.reportFile}`);
  if (commandWithBaseline.redactedReportFile) {
    io.log(`Redacted validation report: ${commandWithBaseline.redactedReportFile}`);
  }
  if (commandWithBaseline.summaryJsonFile) {
    io.log(`Validation summary JSON: ${commandWithBaseline.summaryJsonFile}`);
  }
  if (commandWithBaseline.redactedSummaryJsonFile) {
    io.log(`Redacted summary JSON: ${commandWithBaseline.redactedSummaryJsonFile}`);
  }
  if (commandWithBaseline.saveBaselineSummaryJsonFile) {
    io.log(`Saved baseline summary JSON: ${commandWithBaseline.saveBaselineSummaryJsonFile}`);
  }
  io.log(`Nodes validated: ${summary.totalNodes}`);
  io.log(`Outcomes: ${formatOutcomeSummary(summary.outcomes)}`);
  io.log(`Needs review: ${summary.reviewNodes}`);
  if (!gateResult.passed) {
    throw new Error(`Validation gates failed:\n- ${gateResult.violations.join('\n- ')}`);
  }

  if (
    commandWithBaseline.artifactRetention === 'delete-on-pass' &&
    !commandWithBaseline.compiledFile
  ) {
    try {
      if (fs.existsSync(commandWithBaseline.artifactFile)) {
        fs.unlinkSync(commandWithBaseline.artifactFile);
        io.log(`Deleted compiled artifact: ${commandWithBaseline.artifactFile}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      io.log(
        `Warning: failed to delete compiled artifact "${commandWithBaseline.artifactFile}": ${reason}`,
      );
    }
  }

  return { artifact, results, summary, markdown, gateResult, machineSummary };
}

import fs from 'node:fs';
import path from 'node:path';
import {
  parseCliArgs as parseValidateLiveCli,
  runValidateLiveCommand,
} from './homey-compile-validate-live-lib.mjs';

const ALLOWED_CLI_FLAGS = new Set([
  '--help',
  '-h',
  '--url',
  '--all-nodes',
  '--node',
  '--manifest-file',
  '--rules-file',
  '--catalog-file',
  '--token',
  '--schema-version',
  '--include-values',
  '--max-values',
  '--include-controller-nodes',
  '--output-dir',
  '--stamp',
  '--artifact-retention',
  '--redact-share',
  '--baseline-redacted-report-file',
  '--baseline-redacted-summary-json-file',
  '--recheck-redacted-report-file',
  '--recheck-redacted-summary-json-file',
  '--gate-profile-file',
  '--max-review-delta',
  '--max-generic-delta',
  '--max-empty-delta',
  '--fail-on-reason-delta',
  '--top',
  '--skip-recheck',
  '--print-effective-gates',
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

function makeRedactedSummaryPath(summaryJsonFile) {
  if (!summaryJsonFile) return undefined;
  if (summaryJsonFile.endsWith('.json')) {
    return summaryJsonFile.replace(/\.json$/, '.redacted.json');
  }
  return `${summaryJsonFile}.redacted.json`;
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-compile-baseline --url ws://host:port (--all-nodes | --node <id>)',
    '                        [--manifest-file <manifest.json> | --rules-file <rules.json> [--rules-file ...]]',
    '                        [--catalog-file <catalog.json>]',
    '                        [--token ...] [--schema-version 0]',
    '                        [--include-values none|summary|full] [--max-values N]',
    '                        [--include-controller-nodes]',
    '                        [--output-dir <plan/baselines>]',
    '                        [--stamp <YYYY-MM-DD>]',
    '                        [--artifact-retention keep|delete-on-pass]',
    '                        [--redact-share]',
    '                        [--baseline-redacted-report-file <baseline.validation.redacted.md>]',
    '                        [--baseline-redacted-summary-json-file <baseline.summary.redacted.json>]',
    '                        [--recheck-redacted-report-file <recheck.validation.redacted.md>]',
    '                        [--recheck-redacted-summary-json-file <recheck.summary.redacted.json>]',
    '                        [--gate-profile-file <validation-gates.json>]',
    '                        [--max-review-delta N] [--max-generic-delta N] [--max-empty-delta N]',
    '                        [--fail-on-reason-delta <reason>:<delta> ...]',
    '                        [--top N]',
    '                        [--skip-recheck]',
    '                        [--print-effective-gates]',
  ].join('\n');
}

export function parseCliArgs(argv, options = {}) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };

  const removedBacklogFlags = [
    '--emit-curation-backlog',
    '--baseline-curation-backlog-json-file',
    '--recheck-curation-backlog-json-file',
    '--baseline-redacted-curation-backlog-json-file',
    '--recheck-redacted-curation-backlog-json-file',
  ];
  const usedRemovedBacklogFlag = removedBacklogFlags.find((flagName) =>
    hasFlagOccurrence(argv, flagName),
  );
  if (usedRemovedBacklogFlag) {
    return {
      ok: false,
      error: `${usedRemovedBacklogFlag} is no longer supported (backlog artifacts were removed from compiler:baseline)`,
    };
  }
  const unsupportedFlag = findUnsupportedLongFlag(argv, ALLOWED_CLI_FLAGS);
  if (unsupportedFlag) {
    return { ok: false, error: `Unsupported flag: ${unsupportedFlag}` };
  }

  const flags = parseFlagMap(argv);
  const url = flags.get('--url');
  if (!url) return { ok: false, error: '--url is required' };

  const allNodes = flags.has('--all-nodes');
  const nodeRaw = flags.get('--node');
  if (!allNodes && nodeRaw === undefined) {
    return { ok: false, error: 'Provide --all-nodes or --node <id>' };
  }
  if (allNodes && nodeRaw !== undefined) {
    return { ok: false, error: 'Use either --all-nodes or --node, not both' };
  }
  const nodeId = nodeRaw === undefined ? undefined : Number.parseInt(nodeRaw, 10);
  if (nodeRaw !== undefined && !Number.isInteger(nodeId)) {
    return { ok: false, error: `Invalid --node: ${nodeRaw}` };
  }

  const manifestFile = flags.get('--manifest-file')
    ? resolveFilePath(flags.get('--manifest-file'))
    : undefined;
  const rulesFiles = collectRepeatedFlag(argv, '--rules-file').map((filePath) =>
    resolveFilePath(filePath),
  );
  if (manifestFile && rulesFiles.length > 0) {
    return { ok: false, error: 'Use either --manifest-file or --rules-file, not both' };
  }

  const nowDate = options.nowDate ?? new Date();
  const stamp = flags.get('--stamp') ?? nowDate.toISOString().slice(0, 10);
  if (!/^[A-Za-z0-9._-]+$/.test(stamp)) {
    return { ok: false, error: `Invalid --stamp: ${stamp}` };
  }

  let maxReviewDelta;
  let maxGenericDelta;
  let maxEmptyDelta;
  try {
    maxReviewDelta = parseOptionalNonNegativeInt(
      flags.get('--max-review-delta') ?? '0',
      '--max-review-delta',
    );
    maxGenericDelta = parseOptionalNonNegativeInt(
      flags.get('--max-generic-delta') ?? '0',
      '--max-generic-delta',
    );
    maxEmptyDelta = parseOptionalNonNegativeInt(
      flags.get('--max-empty-delta') ?? '0',
      '--max-empty-delta',
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }

  const failOnReasonDeltaSpecs = collectRepeatedFlag(argv, '--fail-on-reason-delta');
  for (const spec of failOnReasonDeltaSpecs) {
    const separator = spec.lastIndexOf(':');
    if (separator <= 0 || separator === spec.length - 1) {
      return {
        ok: false,
        error: `Invalid --fail-on-reason-delta entry "${spec}" (expected <reason>:<delta>)`,
      };
    }
    const deltaRaw = spec.slice(separator + 1);
    const parsed = Number(deltaRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return {
        ok: false,
        error: `Invalid --fail-on-reason-delta entry "${spec}" (delta must be non-negative integer)`,
      };
    }
  }

  const topRaw = flags.get('--top') ?? '5';
  const top = Number.parseInt(topRaw, 10);
  if (!Number.isInteger(top) || top < 1) {
    return { ok: false, error: `Invalid --top: ${topRaw}` };
  }

  const outputDir = resolveFilePath(flags.get('--output-dir') ?? path.join('plan', 'baselines'));
  const artifactRetention = flags.get('--artifact-retention') ?? 'delete-on-pass';
  if (!['keep', 'delete-on-pass'].includes(artifactRetention)) {
    return {
      ok: false,
      error: `Invalid --artifact-retention: ${artifactRetention} (expected keep|delete-on-pass)`,
    };
  }

  const redactShare = flags.has('--redact-share');
  let baselineRedactedReportFile;
  let baselineRedactedSummaryJsonFile;
  let recheckRedactedReportFile;
  let recheckRedactedSummaryJsonFile;
  try {
    baselineRedactedReportFile = parsePathFlag(flags, '--baseline-redacted-report-file');
    baselineRedactedSummaryJsonFile = parsePathFlag(flags, '--baseline-redacted-summary-json-file');
    recheckRedactedReportFile = parsePathFlag(flags, '--recheck-redacted-report-file');
    recheckRedactedSummaryJsonFile = parsePathFlag(flags, '--recheck-redacted-summary-json-file');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }

  if (
    !redactShare &&
    (baselineRedactedReportFile ||
      baselineRedactedSummaryJsonFile ||
      recheckRedactedReportFile ||
      recheckRedactedSummaryJsonFile)
  ) {
    return {
      ok: false,
      error:
        'Redacted path flags require --redact-share (--baseline-redacted-report-file / --baseline-redacted-summary-json-file / --recheck-redacted-report-file / --recheck-redacted-summary-json-file)',
    };
  }
  if (
    flags.has('--skip-recheck') &&
    (recheckRedactedReportFile !== undefined || recheckRedactedSummaryJsonFile !== undefined)
  ) {
    return {
      ok: false,
      error: '--recheck-* output flags cannot be used with --skip-recheck',
    };
  }

  return {
    ok: true,
    command: {
      url,
      token: flags.get('--token'),
      schemaVersion: Number(flags.get('--schema-version') ?? '0'),
      allNodes,
      nodeId,
      includeValues: flags.get('--include-values') ?? (allNodes ? 'summary' : 'full'),
      maxValues: Number(flags.get('--max-values') ?? (allNodes ? '100' : '200')),
      includeControllerNodes: flags.has('--include-controller-nodes'),
      manifestFile,
      rulesFiles,
      catalogFile: flags.get('--catalog-file')
        ? resolveFilePath(flags.get('--catalog-file'))
        : undefined,
      gateProfileFile: flags.get('--gate-profile-file')
        ? resolveFilePath(flags.get('--gate-profile-file'))
        : undefined,
      outputDir,
      stamp,
      artifactRetention,
      redactShare,
      baselineRedactedReportFile,
      baselineRedactedSummaryJsonFile,
      recheckRedactedReportFile,
      recheckRedactedSummaryJsonFile,
      maxReviewDelta,
      maxGenericDelta,
      maxEmptyDelta,
      failOnReasonDeltaSpecs,
      top,
      skipRecheck: flags.has('--skip-recheck'),
      printEffectiveGates: flags.has('--print-effective-gates'),
    },
  };
}

function buildCommonValidateArgs(command) {
  const args = ['--url', command.url];
  if (command.token) args.push('--token', command.token);
  if (command.schemaVersion !== undefined)
    args.push('--schema-version', String(command.schemaVersion));
  if (command.allNodes) args.push('--all-nodes');
  if (command.nodeId !== undefined) args.push('--node', String(command.nodeId));
  if (command.manifestFile) args.push('--manifest-file', command.manifestFile);
  if (command.rulesFiles.length > 0) {
    for (const filePath of command.rulesFiles) args.push('--rules-file', filePath);
  }
  if (command.catalogFile) args.push('--catalog-file', command.catalogFile);
  if (command.includeValues) args.push('--include-values', command.includeValues);
  if (command.maxValues !== undefined) args.push('--max-values', String(command.maxValues));
  if (command.includeControllerNodes) args.push('--include-controller-nodes');
  args.push('--top', String(command.top));
  if (command.printEffectiveGates) args.push('--print-effective-gates');
  return args;
}

function parseValidateOrThrow(argv, stage, parseImpl) {
  const parsed = parseImpl(argv);
  if (!parsed.ok) {
    throw new Error(`${stage} parse failed: ${parsed.error}`);
  }
  return parsed.command;
}

export async function runBaselineWorkflowCommand(command, io = console, deps = {}) {
  const parseValidateLiveCliImpl = deps.parseValidateLiveCliImpl ?? parseValidateLiveCli;
  const runValidateLiveCommandImpl = deps.runValidateLiveCommandImpl ?? runValidateLiveCommand;

  fs.mkdirSync(command.outputDir, { recursive: true });
  const prefix = path.join(command.outputDir, command.stamp);
  const paths = {
    baselineCompiled: `${prefix}.compiled.json`,
    baselineReport: `${prefix}.validation.md`,
    baselineSummary: `${prefix}.summary.json`,
    baselineSnapshot: `${prefix}.baseline.summary.json`,
    recheckCompiled: `${prefix}.recheck.compiled.json`,
    recheckReport: `${prefix}.recheck.validation.md`,
    recheckSummary: `${prefix}.recheck.summary.json`,
    baselineRedactedReport: command.redactShare
      ? (command.baselineRedactedReportFile ?? makeRedactedReportPath(`${prefix}.validation.md`))
      : undefined,
    baselineRedactedSummary: command.redactShare
      ? (command.baselineRedactedSummaryJsonFile ??
        makeRedactedSummaryPath(`${prefix}.summary.json`))
      : undefined,
    recheckRedactedReport: command.redactShare
      ? (command.recheckRedactedReportFile ??
        makeRedactedReportPath(`${prefix}.recheck.validation.md`))
      : undefined,
    recheckRedactedSummary: command.redactShare
      ? (command.recheckRedactedSummaryJsonFile ??
        makeRedactedSummaryPath(`${prefix}.recheck.summary.json`))
      : undefined,
  };

  const common = buildCommonValidateArgs(command);
  const baselineArgs = [
    ...common,
    '--artifact-file',
    paths.baselineCompiled,
    '--report-file',
    paths.baselineReport,
    '--summary-json-file',
    paths.baselineSummary,
    '--save-baseline-summary-json-file',
    paths.baselineSnapshot,
    '--artifact-retention',
    command.artifactRetention,
  ];
  if (command.redactShare) {
    baselineArgs.push('--redact-share');
    if (paths.baselineRedactedReport) {
      baselineArgs.push('--redacted-report-file', paths.baselineRedactedReport);
    }
    if (paths.baselineRedactedSummary) {
      baselineArgs.push('--redacted-summary-json-file', paths.baselineRedactedSummary);
    }
  }

  io.log(`Baseline workflow stamp: ${command.stamp}`);
  io.log(`Output dir: ${command.outputDir}`);
  io.log('Running baseline capture...');
  const baselineCommand = parseValidateOrThrow(
    baselineArgs,
    'baseline-capture',
    parseValidateLiveCliImpl,
  );
  const baselineResult = await runValidateLiveCommandImpl(baselineCommand, io, deps);

  let recheckResult;
  if (!command.skipRecheck) {
    const recheckArgs = [
      ...common,
      '--artifact-file',
      paths.recheckCompiled,
      '--report-file',
      paths.recheckReport,
      '--summary-json-file',
      paths.recheckSummary,
      '--baseline-summary-json-file',
      paths.baselineSnapshot,
      '--max-review-delta',
      String(command.maxReviewDelta),
      '--max-generic-delta',
      String(command.maxGenericDelta),
      '--max-empty-delta',
      String(command.maxEmptyDelta),
      '--artifact-retention',
      command.artifactRetention,
    ];
    if (command.redactShare) {
      recheckArgs.push('--redact-share');
      if (paths.recheckRedactedReport) {
        recheckArgs.push('--redacted-report-file', paths.recheckRedactedReport);
      }
      if (paths.recheckRedactedSummary) {
        recheckArgs.push('--redacted-summary-json-file', paths.recheckRedactedSummary);
      }
    }
    if (command.gateProfileFile) {
      recheckArgs.push('--gate-profile-file', command.gateProfileFile);
    }
    for (const spec of command.failOnReasonDeltaSpecs) {
      recheckArgs.push('--fail-on-reason-delta', spec);
    }

    io.log('Running baseline recheck...');
    const recheckCommand = parseValidateOrThrow(
      recheckArgs,
      'baseline-recheck',
      parseValidateLiveCliImpl,
    );
    recheckResult = await runValidateLiveCommandImpl(recheckCommand, io, deps);
  }

  io.log(`Baseline summary: ${paths.baselineSnapshot}`);
  if (command.redactShare && paths.baselineRedactedReport) {
    io.log(`Baseline redacted report: ${paths.baselineRedactedReport}`);
  }
  if (command.redactShare && paths.baselineRedactedSummary) {
    io.log(`Baseline redacted summary: ${paths.baselineRedactedSummary}`);
  }
  if (!command.skipRecheck) io.log(`Recheck summary: ${paths.recheckSummary}`);
  if (!command.skipRecheck && command.redactShare && paths.recheckRedactedReport) {
    io.log(`Recheck redacted report: ${paths.recheckRedactedReport}`);
  }
  if (!command.skipRecheck && command.redactShare && paths.recheckRedactedSummary) {
    io.log(`Recheck redacted summary: ${paths.recheckRedactedSummary}`);
  }
  return { paths, baselineResult, recheckResult };
}

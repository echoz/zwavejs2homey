import path from 'node:path';
import {
  formatJsonCompact,
  formatJsonPretty,
  isSupportedDiagnosticFormat,
} from './output-format-lib.mjs';
import { runBacklogCommand } from './homey-compile-backlog-lib.mjs';
import {
  parseCliArgs as parseInspectLiveCli,
  runLiveInspectCommand,
} from './homey-compile-inspect-live-lib.mjs';
import {
  parseCliArgs as parseValidateLiveCli,
  runValidateLiveCommand,
} from './homey-compile-validate-live-lib.mjs';

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
const LOOP_FORMATS = new Set([
  'summary',
  'list',
  'markdown',
  'json',
  'json-pretty',
  'json-compact',
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

function parsePositiveInt(rawValue, flagName, defaultValue) {
  const value = rawValue ?? String(defaultValue);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flagName} must be a positive integer (received: ${String(value)})`);
  }
  return parsed;
}

function hasFlagOccurrence(argv, flagName) {
  return argv.some((token) => token === flagName || token.startsWith(`${flagName}=`));
}

function stripFlags(argv, stripSet) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out.push(token);
      continue;
    }
    const [key] = token.split('=', 2);
    if (!stripSet.has(key)) {
      out.push(token);
      continue;
    }
    if (token === key && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      i += 1;
    }
  }
  return out;
}

function shellQuote(rawArg) {
  const arg = String(rawArg ?? '');
  if (/^[A-Za-z0-9_./:@=,+-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function renderCommand(args) {
  return args.map((arg) => shellQuote(arg)).join(' ');
}

function buildOutcomeSummary(outcomes) {
  const counters =
    outcomes && typeof outcomes === 'object' && !Array.isArray(outcomes) ? outcomes : {};
  const keys = Object.keys(counters).sort();
  if (keys.length === 0) return '';
  return keys.map((key) => `${key}=${String(counters[key])}`).join(', ');
}

function ensureRulesSourceArgs(argv) {
  if (
    hasFlagOccurrence(argv, '--manifest-file') ||
    hasFlagOccurrence(argv, '--rules-file') ||
    hasFlagOccurrence(argv, '--compiled-file')
  ) {
    return [...argv];
  }
  return [...argv, '--manifest-file', path.join('rules', 'manifest.json')];
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-compile-loop --url ws://host:port (--all-nodes | --node <id>)',
    '                     [--manifest-file <manifest.json> | --rules-file <rules.json> [--rules-file ...] | --compiled-file <compiled.json>]',
    '                     [--catalog-file <catalog.json>]',
    '                     [--token ...] [--schema-version 0]',
    '                     [--include-values none|summary|full] [--max-values N]',
    '                     [--include-controller-nodes]',
    '                     [--signature <manufacturerId:productType:productId> | --backlog-file <curation-backlog.json> | (--from-backlog-file <baseline.json> --to-backlog-file <current.json>)]',
    '                     [--only worsened|improved|neutral|added|removed|changed|unchanged|all]',
    '                     [--candidate-policy curation|pressure]',
    '                     [--fallback summary|none]',
    '                     [--pick N]',
    '                     [--skip-inspect] [--inspect-format list|summary|markdown|json|json-pretty|json-compact|ndjson]',
    '                     [--dry-run]',
    '                     [--format summary|list|markdown|json|json-pretty|json-compact]',
    '',
    'Notes:',
    '  - Any non-loop flags are forwarded to compiler:inspect-live / compiler:validate-live.',
    '  - If no rules source is provided, --manifest-file rules/manifest.json is applied automatically.',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };

  const flags = parseFlagMap(argv);
  let pick;
  try {
    pick = parsePositiveInt(flags.get('--pick'), '--pick', 1);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason };
  }

  const signature = flags.get('--signature');
  if (signature !== undefined && !/^\d+:\d+:\d+$/.test(signature)) {
    return {
      ok: false,
      error:
        '--signature must be a product triple in decimal format: <manufacturerId:productType:productId>',
    };
  }
  const backlogFile = flags.get('--backlog-file');
  const fromBacklogFile = flags.get('--from-backlog-file');
  const toBacklogFile = flags.get('--to-backlog-file');
  const hasDiffBacklogFlags = Boolean(fromBacklogFile || toBacklogFile);
  const signatureModeCount =
    (signature ? 1 : 0) + (backlogFile ? 1 : 0) + (hasDiffBacklogFlags ? 1 : 0);

  if (signatureModeCount === 0) {
    return {
      ok: false,
      error:
        'Provide one signature source: --signature, --backlog-file, or --from-backlog-file + --to-backlog-file',
    };
  }
  if (signatureModeCount > 1) {
    return {
      ok: false,
      error:
        'Use only one signature source: --signature, --backlog-file, or --from-backlog-file + --to-backlog-file',
    };
  }
  if (hasDiffBacklogFlags && (!fromBacklogFile || !toBacklogFile)) {
    return {
      ok: false,
      error: 'Diff backlog mode requires both --from-backlog-file and --to-backlog-file',
    };
  }
  if (!hasDiffBacklogFlags && flags.has('--only')) {
    return { ok: false, error: '--only is only supported with diff backlog mode' };
  }
  if (!hasDiffBacklogFlags && flags.has('--fallback')) {
    return { ok: false, error: '--fallback is only supported with diff backlog mode' };
  }

  const only = flags.get('--only') ?? 'worsened';
  if (!DIFF_ONLY_FILTERS.has(only)) {
    return { ok: false, error: `Unsupported --only: ${only}` };
  }
  const fallback = flags.get('--fallback') ?? 'summary';
  if (!NEXT_FALLBACK_MODES.has(fallback)) {
    return {
      ok: false,
      error: `Unsupported --fallback: ${fallback} (expected summary|none)`,
    };
  }
  const candidatePolicy = flags.get('--candidate-policy') ?? 'curation';
  if (!NEXT_CANDIDATE_POLICIES.has(candidatePolicy)) {
    return {
      ok: false,
      error: `Unsupported --candidate-policy: ${candidatePolicy} (expected curation|pressure)`,
    };
  }

  const inspectFormat = flags.get('--inspect-format') ?? 'list';
  if (inspectFormat !== 'list' && !isSupportedDiagnosticFormat(inspectFormat)) {
    return { ok: false, error: `Unsupported --inspect-format: ${inspectFormat}` };
  }

  const format = flags.get('--format') ?? 'summary';
  if (!LOOP_FORMATS.has(format)) {
    return { ok: false, error: `Unsupported --format: ${format}` };
  }

  const stripSet = new Set([
    '--help',
    '-h',
    '--signature',
    '--backlog-file',
    '--from-backlog-file',
    '--to-backlog-file',
    '--only',
    '--candidate-policy',
    '--fallback',
    '--pick',
    '--skip-inspect',
    '--inspect-format',
    '--dry-run',
    '--format',
  ]);
  const forwardedArgv = stripFlags(argv, stripSet);

  return {
    ok: true,
    command: {
      signature,
      backlogFile,
      fromBacklogFile,
      toBacklogFile,
      backlogMode: backlogFile ? 'summary' : hasDiffBacklogFlags ? 'diff' : null,
      only,
      candidatePolicy,
      fallback,
      pick,
      skipInspect: flags.has('--skip-inspect'),
      dryRun: flags.has('--dry-run'),
      inspectFormat,
      format,
      forwardedArgv,
    },
  };
}

function parseOrThrow(argv, parseImpl, stageName) {
  const parsed = parseImpl(argv);
  if (!parsed.ok) {
    throw new Error(`${stageName} parse failed: ${parsed.error}`);
  }
  return parsed.command;
}

export async function runLoopCommand(command, io = console, deps = {}) {
  const runBacklogCommandImpl = deps.runBacklogCommandImpl ?? runBacklogCommand;
  const parseInspectLiveCliImpl = deps.parseInspectLiveCliImpl ?? parseInspectLiveCli;
  const runLiveInspectCommandImpl = deps.runLiveInspectCommandImpl ?? runLiveInspectCommand;
  const parseValidateLiveCliImpl = deps.parseValidateLiveCliImpl ?? parseValidateLiveCli;
  const runValidateLiveCommandImpl = deps.runValidateLiveCommandImpl ?? runValidateLiveCommand;

  let selected;
  let signature = command.signature;
  if (!signature) {
    const nextCommand =
      command.backlogMode === 'summary'
        ? {
            subcommand: 'next',
            mode: 'summary',
            inputFile: command.backlogFile,
            candidatePolicy: command.candidatePolicy,
            pick: command.pick,
            format: 'summary',
          }
        : {
            subcommand: 'next',
            mode: 'diff',
            fromFile: command.fromBacklogFile,
            toFile: command.toBacklogFile,
            only: command.only,
            candidatePolicy: command.candidatePolicy,
            fallback: command.fallback,
            pick: command.pick,
            format: 'summary',
          };
    selected = runBacklogCommandImpl(nextCommand);
    signature = selected?.selected?.signature;
    if (!signature) {
      throw new Error('Failed to resolve signature from backlog selection');
    }
    io.log(`Selected signature: ${signature}`);
    io.log(`Selection mode: ${selected.selectionMode}`);
  }

  const withSignature = [...command.forwardedArgv, '--signature', signature];
  const loopArgs = ensureRulesSourceArgs(withSignature);
  const inspectCommandLine = command.skipInspect
    ? null
    : renderCommand([
        'npm',
        'run',
        'compiler:inspect-live',
        '--',
        ...loopArgs,
        '--format',
        command.inspectFormat,
      ]);
  const validateCommandLine = renderCommand([
    'npm',
    'run',
    'compiler:validate-live',
    '--',
    ...loopArgs,
  ]);

  let inspectCommand;
  if (!command.skipInspect) {
    inspectCommand = parseOrThrow(
      [...loopArgs, '--format', command.inspectFormat],
      parseInspectLiveCliImpl,
      'inspect',
    );
    if (!command.dryRun) {
      io.log(`Running inspect for signature ${signature}`);
      await runLiveInspectCommandImpl(inspectCommand, io, deps);
    }
  }

  const validateCommand = parseOrThrow(loopArgs, parseValidateLiveCliImpl, 'validate');
  if (command.dryRun) {
    io.log(`Dry run: resolved signature ${signature}`);
    return {
      kind: 'loop',
      signature,
      selection: selected ?? null,
      dryRun: true,
      inspect: {
        skipped: command.skipInspect,
        format: command.inspectFormat,
        commandLine: inspectCommandLine,
      },
      validate: {
        commandLine: validateCommandLine,
        reportFile: validateCommand.reportFile ?? null,
        summaryJsonFile: validateCommand.summaryJsonFile ?? null,
        curationBacklogJsonFile: validateCommand.curationBacklogJsonFile ?? null,
        gatePassed: null,
        outcomes: {},
        reviewNodes: 0,
        totalNodes: 0,
      },
    };
  }

  io.log(`Running validate-live for signature ${signature}`);
  const validateResult = await runValidateLiveCommandImpl(validateCommand, io, deps);

  return {
    kind: 'loop',
    signature,
    selection: selected ?? null,
    dryRun: false,
    inspect: {
      skipped: command.skipInspect,
      format: command.inspectFormat,
      commandLine: inspectCommandLine,
    },
    validate: {
      commandLine: validateCommandLine,
      reportFile: validateCommand.reportFile ?? null,
      summaryJsonFile: validateCommand.summaryJsonFile ?? null,
      curationBacklogJsonFile: validateCommand.curationBacklogJsonFile ?? null,
      gatePassed: validateResult?.gateResult?.passed === true,
      outcomes: validateResult?.summary?.outcomes ?? {},
      reviewNodes: validateResult?.summary?.reviewNodes ?? 0,
      totalNodes: validateResult?.summary?.totalNodes ?? 0,
    },
  };
}

export function formatLoopOutput(result, format) {
  if (format === 'json' || format === 'json-pretty') return formatJsonPretty(result);
  if (format === 'json-compact') return formatJsonCompact(result);

  const selectedFromBacklog = result.selection?.selected?.signature;
  const selectedTopReason = result.selection?.selected?.topReason ?? '';
  const outcomeSummary = buildOutcomeSummary(result.validate?.outcomes);

  if (format === 'markdown') {
    return [
      '# Compiler Loop',
      '',
      `- Signature: ${result.signature}`,
      selectedFromBacklog ? `- Backlog-selected signature: ${selectedFromBacklog}` : null,
      selectedTopReason ? `- Backlog top reason: ${selectedTopReason}` : null,
      result.selection?.candidatePolicy
        ? `- Backlog candidate policy: ${result.selection.candidatePolicy}`
        : null,
      `- Dry run: ${result.dryRun ? 'yes' : 'no'}`,
      `- Inspect skipped: ${result.inspect?.skipped ? 'yes' : 'no'}`,
      `- Validate gate passed: ${result.validate?.gatePassed === null ? 'n/a' : result.validate?.gatePassed ? 'yes' : 'no'}`,
      `- Nodes validated: ${result.validate?.totalNodes ?? 0}`,
      `- Needs review: ${result.validate?.reviewNodes ?? 0}`,
      outcomeSummary ? `- Outcomes: ${outcomeSummary}` : null,
      '',
      '## Commands',
      '',
      result.inspect?.commandLine ? `- Inspect: \`${result.inspect.commandLine}\`` : null,
      `- Validate: \`${result.validate?.commandLine ?? ''}\``,
      '',
      result.validate?.reportFile ? `- Validation report: ${result.validate.reportFile}` : null,
      result.validate?.summaryJsonFile
        ? `- Validation summary JSON: ${result.validate.summaryJsonFile}`
        : null,
      result.validate?.curationBacklogJsonFile
        ? `- Curation backlog JSON: ${result.validate.curationBacklogJsonFile}`
        : null,
      '',
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  return [
    `Signature: ${result.signature}`,
    selectedFromBacklog ? `Backlog-selected signature: ${selectedFromBacklog}` : null,
    selectedTopReason ? `Backlog top reason: ${selectedTopReason}` : null,
    result.selection?.candidatePolicy
      ? `Backlog candidate policy: ${result.selection.candidatePolicy}`
      : null,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Inspect skipped: ${result.inspect?.skipped ? 'yes' : 'no'}`,
    `Validate gate passed: ${result.validate?.gatePassed === null ? 'n/a' : result.validate?.gatePassed ? 'yes' : 'no'}`,
    `Nodes validated: ${result.validate?.totalNodes ?? 0}`,
    `Needs review: ${result.validate?.reviewNodes ?? 0}`,
    outcomeSummary ? `Outcomes: ${outcomeSummary}` : null,
    '',
    'Commands:',
    result.inspect?.commandLine ? `  Inspect: ${result.inspect.commandLine}` : null,
    `  Validate: ${result.validate?.commandLine ?? ''}`,
    '',
    result.validate?.reportFile ? `Validation report: ${result.validate.reportFile}` : null,
    result.validate?.summaryJsonFile
      ? `Validation summary JSON: ${result.validate.summaryJsonFile}`
      : null,
    result.validate?.curationBacklogJsonFile
      ? `Curation backlog JSON: ${result.validate.curationBacklogJsonFile}`
      : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

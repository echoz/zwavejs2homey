import path from 'node:path';
import {
  formatJsonCompact,
  formatJsonPretty,
  isSupportedDiagnosticFormat,
} from './output-format-lib.mjs';
import {
  parseCliArgs as parseInspectLiveCli,
  runLiveInspectCommand,
} from './homey-compile-inspect-live-lib.mjs';
import {
  parseCliArgs as parseValidateLiveCli,
  runValidateLiveCommand,
} from './homey-compile-validate-live-lib.mjs';

const SIMULATE_FORMATS = new Set([
  'summary',
  'list',
  'markdown',
  'json',
  'json-pretty',
  'json-compact',
]);
const ALLOWED_CLI_FLAGS = new Set([
  '--help',
  '-h',
  '--url',
  '--all-nodes',
  '--node',
  '--manifest-file',
  '--rules-file',
  '--vocabulary-file',
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
  '--skip-inspect',
  '--inspect-format',
  '--dry-run',
  '--format',
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
    '  homey-compile-simulate --url ws://host:port (--all-nodes | --node <id>)',
    '                     [--manifest-file <manifest.json> | --rules-file <rules.json> [--rules-file ...] | --compiled-file <compiled.json>]',
    '                     [--vocabulary-file <rules/homey-authoring-vocabulary.json>]',
    '                     [--catalog-file <catalog.json>]',
    '                     [--token ...] [--schema-version 0]',
    '                     [--include-values none|summary|full] [--max-values N]',
    '                     [--include-controller-nodes]',
    '                     --signature <manufacturerId:productType:productId>',
    '                     [--skip-inspect] [--inspect-format list|summary|markdown|json|json-pretty|json-compact|ndjson]',
    '                     [--dry-run]',
    '                     [--format summary|list|markdown|json|json-pretty|json-compact]',
    '',
    'Notes:',
    '  - Any non-simulate flags are forwarded to compiler:inspect-live / compiler:validate-live.',
    '  - If no rules source is provided, --manifest-file rules/manifest.json is applied automatically.',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };

  const removedBacklogFlags = [
    '--backlog-file',
    '--from-backlog-file',
    '--to-backlog-file',
    '--only',
    '--candidate-policy',
    '--fallback',
    '--pick',
  ];
  const usedRemovedBacklogFlag = removedBacklogFlags.find((flagName) =>
    hasFlagOccurrence(argv, flagName),
  );
  if (usedRemovedBacklogFlag) {
    return {
      ok: false,
      error: `${usedRemovedBacklogFlag} is no longer supported; provide --signature instead`,
    };
  }
  const unsupportedFlag = findUnsupportedLongFlag(argv, ALLOWED_CLI_FLAGS);
  if (unsupportedFlag) {
    return { ok: false, error: `Unsupported flag: ${unsupportedFlag}` };
  }

  const flags = parseFlagMap(argv);
  const signature = flags.get('--signature');
  if (!signature) {
    return {
      ok: false,
      error: 'Missing --signature <manufacturerId:productType:productId>',
    };
  }
  if (!/^\d+:\d+:\d+$/.test(signature)) {
    return {
      ok: false,
      error:
        '--signature must be a product triple in decimal format: <manufacturerId:productType:productId>',
    };
  }
  const inspectFormat = flags.get('--inspect-format') ?? 'list';
  if (inspectFormat !== 'list' && !isSupportedDiagnosticFormat(inspectFormat)) {
    return { ok: false, error: `Unsupported --inspect-format: ${inspectFormat}` };
  }

  const format = flags.get('--format') ?? 'summary';
  if (!SIMULATE_FORMATS.has(format)) {
    return { ok: false, error: `Unsupported --format: ${format}` };
  }

  const stripSet = new Set([
    '--help',
    '-h',
    '--signature',
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

export async function runSimulationCommand(command, io = console, deps = {}) {
  const parseInspectLiveCliImpl = deps.parseInspectLiveCliImpl ?? parseInspectLiveCli;
  const runLiveInspectCommandImpl = deps.runLiveInspectCommandImpl ?? runLiveInspectCommand;
  const parseValidateLiveCliImpl = deps.parseValidateLiveCliImpl ?? parseValidateLiveCli;
  const runValidateLiveCommandImpl = deps.runValidateLiveCommandImpl ?? runValidateLiveCommand;

  const signature = command.signature;

  const withSignature = [...command.forwardedArgv, '--signature', signature];
  const simulateArgs = ensureRulesSourceArgs(withSignature);
  const inspectCommandLine = command.skipInspect
    ? null
    : renderCommand([
        'npm',
        'run',
        'compiler:inspect-live',
        '--',
        ...simulateArgs,
        '--format',
        command.inspectFormat,
      ]);
  const validateCommandLine = renderCommand([
    'npm',
    'run',
    'compiler:validate-live',
    '--',
    ...simulateArgs,
  ]);

  let inspectCommand;
  if (!command.skipInspect) {
    inspectCommand = parseOrThrow(
      [...simulateArgs, '--format', command.inspectFormat],
      parseInspectLiveCliImpl,
      'inspect',
    );
    if (!command.dryRun) {
      io.log(`Running inspect for signature ${signature}`);
      await runLiveInspectCommandImpl(inspectCommand, io, deps);
    }
  }

  const validateCommand = parseOrThrow(simulateArgs, parseValidateLiveCliImpl, 'validate');
  if (command.dryRun) {
    io.log(`Dry run: resolved signature ${signature}`);
    return {
      kind: 'simulate',
      signature,
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
    kind: 'simulate',
    signature,
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
      gatePassed: validateResult?.gateResult?.passed === true,
      outcomes: validateResult?.summary?.outcomes ?? {},
      reviewNodes: validateResult?.summary?.reviewNodes ?? 0,
      totalNodes: validateResult?.summary?.totalNodes ?? 0,
    },
  };
}

export function formatSimulationOutput(result, format) {
  if (format === 'json' || format === 'json-pretty') return formatJsonPretty(result);
  if (format === 'json-compact') return formatJsonCompact(result);

  const outcomeSummary = buildOutcomeSummary(result.validate?.outcomes);

  if (format === 'markdown') {
    return [
      '# Compiler Simulation',
      '',
      `- Signature: ${result.signature}`,
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
      '',
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  return [
    `Signature: ${result.signature}`,
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
  ]
    .filter((line) => line !== null)
    .join('\n');
}

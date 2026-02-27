import { createInterface } from 'node:readline/promises';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';

import type { IncludeValuesMode, SessionConfig } from './model/types';
import { ExplorerPresenter } from './presenter/explorer-presenter';
import { ZwjsExplorerServiceImpl, type ZwjsExplorerService } from './service/zwjs-explorer-service';
import { parseShellCommand } from './view/command-parser';
import { renderNodeDetail, renderNodeList, renderShellHelp } from './view/formatting';

function parseFlagMap(argv: string[]): { flags: Map<string, string>; positionals: string[] } {
  const flags = new Map<string, string>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const [key, inlineValue] = token.split('=', 2);
    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
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

function parseIntegerFlag(
  value: string | undefined,
  flagName: string,
  options: { min?: number } = {},
): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || (options.min !== undefined && parsed < options.min)) {
    return {
      ok: false,
      error: `Invalid ${flagName}: ${value}`,
    };
  }
  return { ok: true, value: parsed };
}

export function getUsageText(): string {
  return [
    'Usage:',
    '  compiler-tui --url ws://host:port [--token <bearer>] [--schema-version 0]',
    '               [--include-values none|summary|full] [--max-values N] [--start-node <id>]',
    '',
    'Commands:',
    '  list | refresh | show <nodeId> | help | quit',
  ].join('\n');
}

export function parseCliArgs(
  argv: string[],
): { ok: true; command: SessionConfig } | { ok: false; error: string; isHelp?: boolean } {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { ok: false, error: getUsageText(), isHelp: true };
  }

  const { flags, positionals } = parseFlagMap(argv);
  if (positionals.length > 0) {
    return {
      ok: false,
      error: `Unexpected positional args: ${positionals.join(' ')}`,
    };
  }

  const url = flags.get('--url');
  if (!url) {
    return { ok: false, error: '--url is required' };
  }

  const schemaVersionResult = parseIntegerFlag(
    flags.get('--schema-version') ?? '0',
    '--schema-version',
    {
      min: 0,
    },
  );
  if (!schemaVersionResult.ok) return schemaVersionResult;

  const includeValues = (flags.get('--include-values') ?? 'summary') as IncludeValuesMode;
  if (!['none', 'summary', 'full'].includes(includeValues)) {
    return { ok: false, error: `Unsupported --include-values: ${includeValues}` };
  }

  const maxValuesResult = parseIntegerFlag(flags.get('--max-values') ?? '200', '--max-values', {
    min: 1,
  });
  if (!maxValuesResult.ok) return maxValuesResult;

  let startNode: number | undefined;
  if (flags.has('--start-node')) {
    const startNodeResult = parseIntegerFlag(flags.get('--start-node'), '--start-node', { min: 1 });
    if (!startNodeResult.ok) return startNodeResult;
    startNode = startNodeResult.value;
  }

  return {
    ok: true,
    command: {
      url,
      token: flags.get('--token'),
      schemaVersion: schemaVersionResult.value,
      includeValues,
      maxValues: maxValuesResult.value,
      startNode,
    },
  };
}

interface LoggerLike {
  log: (line: string) => void;
  error: (line: string) => void;
}

interface ReadlineLike {
  question: (prompt: string) => Promise<string>;
  close: () => void;
}

interface RunAppDeps {
  service?: ZwjsExplorerService;
  createInterfaceImpl?: (options: {
    input: NodeJS.ReadStream;
    output: NodeJS.WriteStream;
    terminal: boolean;
  }) => ReadlineLike;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
}

export async function runApp(
  config: SessionConfig,
  io: LoggerLike = console,
  deps: RunAppDeps = {},
): Promise<void> {
  const service = deps.service ?? new ZwjsExplorerServiceImpl();
  const presenter = new ExplorerPresenter(service);
  const createInterfaceImpl = deps.createInterfaceImpl ?? createInterface;
  const input = deps.stdin ?? defaultStdin;
  const output = deps.stdout ?? defaultStdout;

  const readline = createInterfaceImpl({
    input,
    output,
    terminal: true,
  });

  try {
    await presenter.connect(config);
    io.log(renderShellHelp());
    io.log(renderNodeList(presenter.getState().explorer.items));

    if (config.startNode !== undefined) {
      const detail = await presenter.showNodeDetail(config.startNode);
      io.log(renderNodeDetail(detail));
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const line = await readline.question('zwjs-explorer> ');
      const parsed = parseShellCommand(line);
      if (!parsed.ok) {
        io.error(parsed.error);
        continue;
      }

      const command = parsed.command;
      if (command.type === 'noop') continue;
      if (command.type === 'help') {
        io.log(renderShellHelp());
        continue;
      }
      if (command.type === 'list') {
        io.log(renderNodeList(presenter.getState().explorer.items));
        continue;
      }
      if (command.type === 'refresh') {
        const nodes = await presenter.refreshNodes();
        io.log(renderNodeList(nodes));
        continue;
      }
      if (command.type === 'show') {
        const detail = await presenter.showNodeDetail(command.nodeId);
        io.log(renderNodeDetail(detail));
        continue;
      }
      if (command.type === 'quit') {
        io.log('Bye.');
        break;
      }
    }
  } finally {
    readline.close();
    await presenter.disconnect();
  }
}

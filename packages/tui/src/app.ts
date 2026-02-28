import { createInterface } from 'node:readline/promises';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';

import type { IncludeValuesMode, SessionConfig } from './model/types';
import {
  CurationWorkflowPresenter,
  type CurationWorkflowChildPresenterLike,
} from './presenter/curation-workflow-presenter';
import { ExplorerPresenter } from './presenter/explorer-presenter';
import {
  ExplorerSessionPresenter,
  type ExplorerSessionChildPresenterLike,
} from './presenter/explorer-session-presenter';
import {
  CompilerCurationServiceImpl,
  type CompilerCurationService,
} from './service/compiler-curation-service';
import {
  WorkspaceFileServiceImpl,
  type WorkspaceFileService,
} from './service/workspace-file-service';
import { ZwjsExplorerServiceImpl, type ZwjsExplorerService } from './service/zwjs-explorer-service';
import { parseShellCommand } from './view/command-parser';
import {
  renderBacklogSummary,
  renderInspectSummary,
  renderNodeDetail,
  renderNodeList,
  renderRunLog,
  renderScaffoldDraft,
  renderShellHelp,
  renderSignatureSelected,
  renderStatusSnapshot,
  renderValidationSummary,
  renderManifestResult,
} from './view/formatting';

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
    'Interactive commands:',
    '  list | refresh | show <nodeId>',
    '  signature [<m:p:id>] [--from-node <id>] | inspect | validate',
    '  backlog load <file> [--top N] | backlog show | backlog pick [rank]',
    '  scaffold preview [--product-name "..."] | scaffold write [filePath] --force',
    '  manifest add [filePath] [--manifest <file>] --force | status',
    '  log [--limit N] | help | quit',
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
  presenter?: ExplorerPresenter;
  explorerService?: ZwjsExplorerService;
  curationService?: CompilerCurationService;
  fileService?: WorkspaceFileService;
  explorerChildPresenter?: ExplorerSessionChildPresenterLike;
  curationChildPresenter?: CurationWorkflowChildPresenterLike;
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
  const explorerService = deps.explorerService ?? new ZwjsExplorerServiceImpl();
  const curationService = deps.curationService ?? new CompilerCurationServiceImpl();
  const fileService = deps.fileService ?? new WorkspaceFileServiceImpl();
  const explorerChildPresenter =
    deps.explorerChildPresenter ?? new ExplorerSessionPresenter(explorerService);
  const curationChildPresenter =
    deps.curationChildPresenter ?? new CurationWorkflowPresenter(curationService, fileService);
  const presenter =
    deps.presenter ??
    new ExplorerPresenter({
      explorer: explorerChildPresenter,
      curation: curationChildPresenter,
    });
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
      if (command.type === 'noop') {
        continue;
      }
      try {
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
        if (command.type === 'signature') {
          if (command.signature) {
            presenter.selectSignature(command.signature);
            io.log(renderSignatureSelected(command.signature));
          } else {
            const signature = presenter.selectSignatureFromNode(command.fromNodeId);
            io.log(renderSignatureSelected(signature));
          }
          continue;
        }
        if (command.type === 'inspect') {
          const summary = await presenter.inspectSelectedSignature({
            manifestFile: command.manifestFile,
          });
          io.log(renderInspectSummary(summary));
          continue;
        }
        if (command.type === 'validate') {
          const summary = await presenter.validateSelectedSignature({
            manifestFile: command.manifestFile,
          });
          io.log(renderValidationSummary(summary));
          continue;
        }
        if (command.type === 'backlog-load') {
          const summary = presenter.loadBacklog(command.filePath, { top: command.top });
          io.log(renderBacklogSummary(summary));
          continue;
        }
        if (command.type === 'backlog-show') {
          const summary = presenter.getState().backlogSummary;
          io.log(summary ? renderBacklogSummary(summary) : 'Backlog is not loaded.');
          continue;
        }
        if (command.type === 'backlog-pick') {
          const summary = presenter.getState().backlogSummary;
          if (!summary || summary.entries.length === 0) {
            io.error('Backlog is not loaded or has no entries.');
            continue;
          }
          const rank = command.rank ?? 1;
          const entry = summary.entries.find((candidate) => candidate.rank === rank);
          if (!entry) {
            io.error(`Backlog rank ${rank} is not present.`);
            continue;
          }
          presenter.selectSignature(entry.signature);
          io.log(renderSignatureSelected(entry.signature));
          continue;
        }
        if (command.type === 'scaffold-preview') {
          const draft = presenter.createScaffoldFromBacklog({
            productName: command.productName,
          });
          io.log(renderScaffoldDraft(draft));
          continue;
        }
        if (command.type === 'scaffold-write') {
          const writtenPath = presenter.writeScaffoldDraft(command.filePath, {
            confirm: command.force,
          });
          io.log(`Scaffold written: ${writtenPath}`);
          continue;
        }
        if (command.type === 'manifest-add') {
          const result = presenter.addDraftToManifest({
            filePath: command.filePath,
            manifestFile: command.manifestFile,
            confirm: command.force,
          });
          io.log(renderManifestResult(result));
          continue;
        }
        if (command.type === 'status') {
          io.log(renderStatusSnapshot(presenter.getStatusSnapshot()));
          continue;
        }
        if (command.type === 'log') {
          io.log(renderRunLog(presenter.getRunLog(command.limit)));
          continue;
        }
        if (command.type === 'quit') {
          io.log('Bye.');
          break;
        }
      } catch (error) {
        io.error(error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    readline.close();
    await presenter.disconnect();
  }
}

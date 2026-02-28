import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';

import type { ConnectedSessionConfig, IncludeValuesMode, SessionConfig } from './model/types';
import {
  CurationWorkflowPresenter,
  type CurationWorkflowChildPresenterLike,
} from './presenter/curation-workflow-presenter';
import { ExplorerPresenter } from './presenter/explorer-presenter';
import {
  ExplorerSessionPresenter,
  type ExplorerSessionChildPresenterLike,
} from './presenter/explorer-session-presenter';
import { RulesPresenter } from './presenter/rules-presenter';
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
import { parsePanelDataChunk, parsePanelKeypress, type PanelIntent } from './view/panel-input';
import { renderPanelFrame } from './view/panel-layout';
import {
  renderInspectSummary,
  renderRuleDetail,
  renderRuleList,
  renderNodeDetail,
  renderNodeList,
  renderRunLog,
  renderRulesShellHelp,
  renderScaffoldDraft,
  renderSimulationSummary,
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
    '               [--manifest-file <rules/manifest.json>] [--ui panel|shell]',
    '  compiler-tui --rules-only [--manifest-file <rules/manifest.json>]',
    '               [--url ws://host:port] [--token <bearer>] [--schema-version 0] [--ui panel|shell]',
    '               [--include-values none|summary|full] [--max-values N]',
    '',
    'Panel Mode Keys (default):',
    '  arrows/j/k move | tab switch pane | enter open | r refresh',
    '  i inspect | v validate | m simulate | d simulate --dry-run',
    '  p scaffold preview | W scaffold write | A manifest add | s status | l log | h help | q quit',
    '',
    'Shell Mode Commands (--ui shell):',
    'Interactive commands:',
    '  list | refresh | show <id>',
    '  signature [<m:p:id>] [--from-node <id>] [--from-rule <index>] | inspect | validate',
    '  simulate [--manifest <file>] [--dry-run] [--skip-inspect] [--inspect-format <fmt>]',
    '  scaffold preview [--product-name "..."] [--homey-class <class>] | scaffold write [filePath] --force',
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

  const rulesOnly = flags.has('--rules-only');
  const url = flags.get('--url');
  if (!url && !rulesOnly) {
    return { ok: false, error: 'Provide either --url or --rules-only' };
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
  const uiMode = flags.get('--ui') ?? 'panel';
  if (uiMode !== 'panel' && uiMode !== 'shell') {
    return { ok: false, error: `Unsupported --ui: ${uiMode}` };
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

  if (rulesOnly && startNode !== undefined) {
    return { ok: false, error: '--start-node is only supported in nodes mode' };
  }

  return {
    ok: true,
    command: {
      mode: rulesOnly ? 'rules' : 'nodes',
      uiMode,
      manifestFile: flags.get('--manifest-file') ?? 'rules/manifest.json',
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
  rulesPresenter?: RulesPresenter;
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
  const nodesPresenter =
    deps.presenter ??
    new ExplorerPresenter({
      explorer: explorerChildPresenter,
      curation: curationChildPresenter,
    });
  const rulesPresenter =
    deps.rulesPresenter ?? new RulesPresenter(curationChildPresenter, fileService);
  const createInterfaceImpl = deps.createInterfaceImpl ?? createInterface;
  const input = deps.stdin ?? defaultStdin;
  const output = deps.stdout ?? defaultStdout;
  const isNodesMode = config.mode === 'nodes';

  const readline = createInterfaceImpl({
    input,
    output,
    terminal: true,
  });

  try {
    if (isNodesMode) {
      await nodesPresenter.connect(config as ConnectedSessionConfig);
      io.log(renderShellHelp());
      io.log(renderNodeList(nodesPresenter.getState().explorer.items));

      if (config.startNode !== undefined) {
        const detail = await nodesPresenter.showNodeDetail(config.startNode);
        io.log(renderNodeDetail(detail));
      }
    } else {
      const rules = rulesPresenter.initialize(config);
      io.log(renderRulesShellHelp());
      io.log(renderRuleList(rules));
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const line = await readline.question(isNodesMode ? 'zwjs-explorer> ' : 'zwjs-rules> ');
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
          io.log(isNodesMode ? renderShellHelp() : renderRulesShellHelp());
          continue;
        }
        if (command.type === 'list') {
          io.log(
            isNodesMode
              ? renderNodeList(nodesPresenter.getState().explorer.items)
              : renderRuleList(rulesPresenter.getRules()),
          );
          continue;
        }
        if (command.type === 'refresh') {
          if (isNodesMode) {
            const nodes = await nodesPresenter.refreshNodes();
            io.log(renderNodeList(nodes));
          } else {
            const rules = rulesPresenter.refreshRules();
            io.log(renderRuleList(rules));
          }
          continue;
        }
        if (command.type === 'show') {
          if (isNodesMode) {
            const detail = await nodesPresenter.showNodeDetail(command.nodeId);
            io.log(renderNodeDetail(detail));
          } else {
            const detail = rulesPresenter.showRuleDetail(command.nodeId);
            io.log(renderRuleDetail(detail));
          }
          continue;
        }
        if (command.type === 'signature') {
          if (isNodesMode) {
            if (command.fromRuleIndex !== undefined) {
              throw new Error('--from-rule is not supported in nodes mode');
            }
            if (command.signature) {
              nodesPresenter.selectSignature(command.signature);
              io.log(renderSignatureSelected(command.signature));
            } else {
              const signature = nodesPresenter.selectSignatureFromNode(command.fromNodeId);
              io.log(renderSignatureSelected(signature));
            }
          } else {
            if (command.fromNodeId !== undefined) {
              throw new Error('--from-node is not supported in rules mode');
            }
            if (command.signature) {
              rulesPresenter.selectSignature(command.signature);
              io.log(renderSignatureSelected(command.signature));
            } else {
              const signature = rulesPresenter.selectSignatureFromRule(command.fromRuleIndex);
              io.log(renderSignatureSelected(signature));
            }
          }
          continue;
        }
        if (command.type === 'inspect') {
          const summary = await (isNodesMode
            ? nodesPresenter.inspectSelectedSignature({
                manifestFile: command.manifestFile,
              })
            : rulesPresenter.inspectSelectedSignature({
                manifestFile: command.manifestFile,
              }));
          io.log(renderInspectSummary(summary));
          continue;
        }
        if (command.type === 'validate') {
          const summary = await (isNodesMode
            ? nodesPresenter.validateSelectedSignature({
                manifestFile: command.manifestFile,
              })
            : rulesPresenter.validateSelectedSignature({
                manifestFile: command.manifestFile,
              }));
          io.log(renderValidationSummary(summary));
          continue;
        }
        if (command.type === 'simulate') {
          const summary = await (isNodesMode
            ? nodesPresenter.simulateSelectedSignature({
                manifestFile: command.manifestFile,
                dryRun: command.dryRun,
                skipInspect: command.skipInspect,
                inspectFormat: command.inspectFormat,
              })
            : rulesPresenter.simulateSelectedSignature({
                manifestFile: command.manifestFile,
                dryRun: command.dryRun,
                skipInspect: command.skipInspect,
                inspectFormat: command.inspectFormat,
              }));
          io.log(renderSimulationSummary(summary));
          continue;
        }
        if (command.type === 'scaffold-preview') {
          const draft = isNodesMode
            ? nodesPresenter.createScaffoldFromSignature({
                productName: command.productName,
                homeyClass: command.homeyClass,
              })
            : rulesPresenter.createScaffoldFromSignature({
                productName: command.productName,
                homeyClass: command.homeyClass,
              });
          io.log(renderScaffoldDraft(draft));
          continue;
        }
        if (command.type === 'scaffold-write') {
          const writtenPath = isNodesMode
            ? nodesPresenter.writeScaffoldDraft(command.filePath, {
                confirm: command.force,
              })
            : rulesPresenter.writeScaffoldDraft(command.filePath, {
                confirm: command.force,
              });
          io.log(`Scaffold written: ${writtenPath}`);
          continue;
        }
        if (command.type === 'manifest-add') {
          const result = isNodesMode
            ? nodesPresenter.addDraftToManifest({
                filePath: command.filePath,
                manifestFile: command.manifestFile,
                confirm: command.force,
              })
            : rulesPresenter.addDraftToManifest({
                filePath: command.filePath,
                manifestFile: command.manifestFile,
                confirm: command.force,
              });
          io.log(renderManifestResult(result));
          continue;
        }
        if (command.type === 'status') {
          io.log(
            renderStatusSnapshot(
              isNodesMode ? nodesPresenter.getStatusSnapshot() : rulesPresenter.getStatusSnapshot(),
            ),
          );
          continue;
        }
        if (command.type === 'log') {
          io.log(
            renderRunLog(
              isNodesMode
                ? nodesPresenter.getRunLog(command.limit)
                : rulesPresenter.getRunLog(command.limit),
            ),
          );
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
    if (isNodesMode) {
      await nodesPresenter.disconnect();
    }
  }
}

function splitLines(value: string): string[] {
  return value.split('\n').slice(0, 400);
}

function renderPanelHelp(mode: SessionConfig['mode']): string {
  const sourceHint =
    mode === 'nodes'
      ? 'enter=open node, i/v/m use selected node signature'
      : 'enter=open rule, i/v/m use selected rule signature';
  return [
    'Keys: up/down move | pgup/pgdn page | home/end jump | / filter | tab switch pane',
    'enter open | r refresh',
    'i inspect | v validate | m simulate | d simulate(dry-run) | p scaffold-preview',
    'W scaffold-write (confirmed) | A manifest-add (confirmed)',
    's status | l log | h help | q quit',
    sourceHint,
  ].join('\n');
}

function formatListRow(index: number, label: string, selected: boolean): string {
  return `${selected ? '>' : ' '} ${String(index).padStart(3, ' ')} ${label}`;
}

function truncateLabel(value: string, max = 64): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}~`;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function getLeftPaneCapacity(rows: number | undefined): number {
  const height = Math.max(18, rows ?? 30);
  const bodyHeight = height - 6;
  const topHeight = Math.max(8, Math.floor(bodyHeight * 0.65));
  return Math.max(1, topHeight - 2);
}

function getVisibleWindow<T>(
  items: T[],
  selected: number,
  capacity: number,
): { start: number; visible: T[] } {
  if (items.length <= capacity) {
    return { start: 0, visible: items };
  }
  let start = Math.max(0, selected - Math.floor(capacity / 2));
  if (start + capacity > items.length) {
    start = items.length - capacity;
  }
  return {
    start,
    visible: items.slice(start, start + capacity),
  };
}

interface NodeListEntry {
  kind: 'node';
  key: string;
  rowId: number;
  label: string;
  nodeId: number;
}

interface RuleListEntry {
  kind: 'rule';
  key: string;
  rowId: number;
  label: string;
  ruleIndex: number;
}

type PanelListEntry = NodeListEntry | RuleListEntry;

type PanelFocus = 'left' | 'right' | 'bottom';

export async function runPanelApp(
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
  const nodesPresenter =
    deps.presenter ??
    new ExplorerPresenter({
      explorer: explorerChildPresenter,
      curation: curationChildPresenter,
    });
  const rulesPresenter =
    deps.rulesPresenter ?? new RulesPresenter(curationChildPresenter, fileService);
  const input = deps.stdin ?? defaultStdin;
  const output = deps.stdout ?? defaultStdout;
  const isNodesMode = config.mode === 'nodes';
  const paneOrder: PanelFocus[] = ['left', 'right', 'bottom'];

  let selectedIndex = 0;
  let selectedItemKey: string | undefined;
  let focusedPane: PanelFocus = 'left';
  let filterMode = false;
  let filterQuery = '';
  let rightText = '';
  let bottomText = renderPanelHelp(config.mode);
  let isClosing = false;

  function getListEntries(): PanelListEntry[] {
    if (isNodesMode) {
      const items = nodesPresenter.getState().explorer.items;
      const filtered = items.filter((node) => {
        if (!filterQuery) return true;
        const haystack = [
          String(node.nodeId),
          normalizeText(node.name),
          normalizeText(node.product),
          normalizeText(node.manufacturer),
          normalizeText(node.location),
        ].join(' ');
        return haystack.includes(filterQuery.toLowerCase());
      });
      return filtered.map((node) => ({
        kind: 'node',
        key: `node:${node.nodeId}`,
        rowId: node.nodeId,
        label: truncateLabel(`${node.name ?? '(unnamed)'} ${node.product ?? ''}`.trim()),
        nodeId: node.nodeId,
      }));
    }

    const items = rulesPresenter.getRules();
    const filtered = items.filter((rule) => {
      if (!filterQuery) return true;
      const haystack = [
        String(rule.index),
        normalizeText(rule.filePath),
        normalizeText(rule.signature),
        normalizeText(rule.name),
        normalizeText(rule.layer),
      ].join(' ');
      return haystack.includes(filterQuery.toLowerCase());
    });
    return filtered.map((rule) => ({
      kind: 'rule',
      key: `rule:${rule.index}`,
      rowId: rule.index,
      label: truncateLabel(
        `${rule.filePath} ${rule.signature ? `(${rule.signature})` : ''}`.trim(),
      ),
      ruleIndex: rule.index,
    }));
  }

  function clampSelection(): void {
    const entries = getListEntries();
    if (entries.length <= 0) {
      selectedIndex = 0;
      selectedItemKey = undefined;
      return;
    }

    if (selectedItemKey) {
      const persistedIndex = entries.findIndex((entry) => entry.key === selectedItemKey);
      if (persistedIndex >= 0) {
        selectedIndex = persistedIndex;
      }
    }
    if (selectedIndex < 0) selectedIndex = 0;
    if (selectedIndex >= entries.length) selectedIndex = entries.length - 1;
    selectedItemKey = entries[selectedIndex]?.key;
  }

  function moveSelection(delta: number): void {
    const entries = getListEntries();
    if (entries.length === 0) {
      selectedIndex = 0;
      selectedItemKey = undefined;
      return;
    }
    selectedIndex += delta;
    if (selectedIndex < 0) selectedIndex = 0;
    if (selectedIndex >= entries.length) selectedIndex = entries.length - 1;
    selectedItemKey = entries[selectedIndex]?.key;
  }

  function moveSelectionByPage(multiplier: number): void {
    const pageSize = getLeftPaneCapacity(output.rows);
    moveSelection(pageSize * multiplier);
  }

  function moveSelectionToBoundary(kind: 'first' | 'last'): void {
    const entries = getListEntries();
    if (entries.length === 0) {
      selectedIndex = 0;
      selectedItemKey = undefined;
      return;
    }
    selectedIndex = kind === 'first' ? 0 : entries.length - 1;
    selectedItemKey = entries[selectedIndex]?.key;
  }

  function getSelectedEntry(): PanelListEntry | undefined {
    clampSelection();
    const entries = getListEntries();
    return entries[selectedIndex];
  }

  function getSelectedNodeId(): number | undefined {
    const entry = getSelectedEntry();
    if (entry?.kind !== 'node') return undefined;
    return entry.nodeId;
  }

  function getSelectedRuleIndex(): number | undefined {
    const entry = getSelectedEntry();
    if (entry?.kind !== 'rule') return undefined;
    return entry.ruleIndex;
  }

  async function ensureSelectedSignature(): Promise<string> {
    if (isNodesMode) {
      const nodeId = getSelectedNodeId();
      if (!nodeId) {
        throw new Error('No node selected');
      }
      const detail = await nodesPresenter.showNodeDetail(nodeId);
      rightText = renderNodeDetail(detail);
      return nodesPresenter.selectSignatureFromNode(nodeId);
    }
    const ruleIndex = getSelectedRuleIndex();
    if (!ruleIndex) {
      throw new Error('No rule selected');
    }
    return rulesPresenter.selectSignatureFromRule(ruleIndex);
  }

  function renderFrame(): void {
    clampSelection();
    const width = output.columns ?? 120;
    const height = output.rows ?? 36;
    const entries = getListEntries();
    const totalItems = entries.length;
    const listCapacity = getLeftPaneCapacity(output.rows);
    const windowed = getVisibleWindow(entries, selectedIndex, listCapacity);
    const listLines = windowed.visible.map((entry, visibleIndex) =>
      formatListRow(entry.rowId, entry.label, windowed.start + visibleIndex === selectedIndex),
    );
    const rangeSuffix =
      totalItems > listCapacity
        ? ` [${windowed.start + 1}-${windowed.start + windowed.visible.length}/${totalItems}]`
        : totalItems > 0
          ? ` [1-${totalItems}/${totalItems}]`
          : ' [0/0]';
    const filterSuffix = filterQuery ? ` | filter="${filterQuery}"` : '';
    const leftTitle = `${isNodesMode ? 'Nodes' : 'Rules'}${rangeSuffix}${filterSuffix}`;

    const status = isNodesMode
      ? nodesPresenter.getStatusSnapshot()
      : rulesPresenter.getStatusSnapshot();
    const selectedSignature = status.selectedSignature
      ? `sig=${status.selectedSignature}`
      : 'sig=-';
    const header = `ZWJS ${config.mode} (${config.uiMode}) ${selectedSignature}`;
    const footer = filterMode
      ? 'Filter mode: type to search | backspace delete | enter apply | esc cancel'
      : 'q quit | arrows move | pgup/pgdn page | / filter | enter open | i/v/m loop';

    const frame = renderPanelFrame({
      width,
      height,
      header,
      footer,
      leftTitle,
      leftLines: listLines,
      rightTitle: isNodesMode ? 'Node Detail' : 'Rule Detail',
      rightLines: splitLines(rightText),
      bottomTitle: 'Output / Run',
      bottomLines: splitLines(bottomText),
      focusedPane,
    });

    output.write('\x1b[2J\x1b[H');
    output.write(frame);
  }

  async function runIntent(intent: PanelIntent): Promise<void> {
    if (intent.type === 'noop') return;
    if (intent.type === 'quit') {
      isClosing = true;
      return;
    }
    if (intent.type === 'start-filter') {
      filterMode = true;
      bottomText = `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`;
      return;
    }
    if (intent.type === 'move-up') {
      moveSelection(-1);
      return;
    }
    if (intent.type === 'move-down') {
      moveSelection(1);
      return;
    }
    if (intent.type === 'move-page-up') {
      moveSelectionByPage(-1);
      return;
    }
    if (intent.type === 'move-page-down') {
      moveSelectionByPage(1);
      return;
    }
    if (intent.type === 'move-first') {
      moveSelectionToBoundary('first');
      return;
    }
    if (intent.type === 'move-last') {
      moveSelectionToBoundary('last');
      return;
    }
    if (intent.type === 'switch-pane') {
      focusedPane = paneOrder[(paneOrder.indexOf(focusedPane) + 1) % paneOrder.length];
      return;
    }
    if (intent.type === 'help') {
      bottomText = renderPanelHelp(config.mode);
      return;
    }
    if (intent.type === 'open') {
      if (isNodesMode) {
        const nodeId = getSelectedNodeId();
        if (!nodeId) throw new Error('No node selected');
        rightText = renderNodeDetail(await nodesPresenter.showNodeDetail(nodeId));
      } else {
        const ruleIndex = getSelectedRuleIndex();
        if (!ruleIndex) throw new Error('No rule selected');
        rightText = renderRuleDetail(rulesPresenter.showRuleDetail(ruleIndex));
      }
      return;
    }
    if (intent.type === 'refresh') {
      if (isNodesMode) {
        await nodesPresenter.refreshNodes();
      } else {
        rulesPresenter.refreshRules();
      }
      bottomText = `Refreshed ${getListEntries().length} item(s).`;
      return;
    }
    if (intent.type === 'inspect') {
      const selectedNodeId = isNodesMode ? getSelectedNodeId() : undefined;
      bottomText = `Running inspect${selectedNodeId ? ` for node ${selectedNodeId}` : ''}...`;
      renderFrame();
      const signature = await ensureSelectedSignature();
      bottomText = renderInspectSummary(
        await (isNodesMode
          ? nodesPresenter.inspectSelectedSignature({ nodeId: selectedNodeId })
          : rulesPresenter.inspectSelectedSignature()),
      );
      io.log(`inspected ${signature}`);
      return;
    }
    if (intent.type === 'validate') {
      const selectedNodeId = isNodesMode ? getSelectedNodeId() : undefined;
      bottomText = `Running validate${selectedNodeId ? ` for node ${selectedNodeId}` : ''}...`;
      renderFrame();
      const signature = await ensureSelectedSignature();
      bottomText = renderValidationSummary(
        await (isNodesMode
          ? nodesPresenter.validateSelectedSignature({ nodeId: selectedNodeId })
          : rulesPresenter.validateSelectedSignature()),
      );
      io.log(`validated ${signature}`);
      return;
    }
    if (intent.type === 'simulate') {
      const selectedNodeId = isNodesMode ? getSelectedNodeId() : undefined;
      bottomText = `Running simulate${selectedNodeId ? ` for node ${selectedNodeId}` : ''}${
        intent.dryRun ? ' (dry-run)' : ''
      }...`;
      renderFrame();
      const signature = await ensureSelectedSignature();
      bottomText = renderSimulationSummary(
        await (isNodesMode
          ? nodesPresenter.simulateSelectedSignature({
              nodeId: selectedNodeId,
              dryRun: intent.dryRun,
            })
          : rulesPresenter.simulateSelectedSignature({ dryRun: intent.dryRun })),
      );
      io.log(`simulated ${signature}${intent.dryRun ? ' (dry-run)' : ''}`);
      return;
    }
    if (intent.type === 'scaffold-preview') {
      await ensureSelectedSignature();
      bottomText = renderScaffoldDraft(
        isNodesMode
          ? nodesPresenter.createScaffoldFromSignature({})
          : rulesPresenter.createScaffoldFromSignature({}),
      );
      return;
    }
    if (intent.type === 'scaffold-write') {
      const written = isNodesMode
        ? nodesPresenter.writeScaffoldDraft(undefined, { confirm: true })
        : rulesPresenter.writeScaffoldDraft(undefined, { confirm: true });
      bottomText = `Scaffold written: ${written}`;
      return;
    }
    if (intent.type === 'manifest-add') {
      const result = isNodesMode
        ? nodesPresenter.addDraftToManifest({ confirm: true })
        : rulesPresenter.addDraftToManifest({ confirm: true });
      bottomText = renderManifestResult(result);
      return;
    }
    if (intent.type === 'status') {
      bottomText = renderStatusSnapshot(
        isNodesMode ? nodesPresenter.getStatusSnapshot() : rulesPresenter.getStatusSnapshot(),
      );
      return;
    }
    if (intent.type === 'log') {
      bottomText = renderRunLog(
        isNodesMode ? nodesPresenter.getRunLog(30) : rulesPresenter.getRunLog(30),
      );
    }
  }

  try {
    if (isNodesMode) {
      await nodesPresenter.connect(config as ConnectedSessionConfig);
      if (config.startNode !== undefined) {
        rightText = renderNodeDetail(await nodesPresenter.showNodeDetail(config.startNode));
      }
    } else {
      rulesPresenter.initialize(config);
    }
    clampSelection();

    emitKeypressEvents(input);
    if (input.isTTY && typeof input.setRawMode === 'function') {
      input.setRawMode(true);
    }
    if (typeof input.resume === 'function') {
      input.resume();
    }
    output.write('\x1b[?25l');
    renderFrame();

    await new Promise<void>((resolve) => {
      let inFlight = Promise.resolve();

      const queueIntent = (intent: PanelIntent) => {
        inFlight = inFlight
          .then(async () => {
            await runIntent(intent);
          })
          .catch((error) => {
            bottomText = `Error: ${error instanceof Error ? error.message : String(error)}`;
          })
          .finally(() => {
            renderFrame();
            if (isClosing) {
              cleanup();
              resolve();
            }
          });
      };

      const onResize = () => {
        renderFrame();
      };
      const onKeypress = (
        char: string,
        key: { name?: string; ctrl?: boolean; sequence?: string },
      ) => {
        const parsedIntent = parsePanelKeypress(char, key);
        if (!filterMode && parsedIntent.type === 'start-filter') {
          filterMode = true;
          bottomText = `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`;
          renderFrame();
          return;
        }
        if (filterMode) {
          const name = (key.name ?? '').toLowerCase();
          if (name === 'escape') {
            filterMode = false;
            bottomText = `Filter applied: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`;
            renderFrame();
            return;
          }
          if (name === 'return' || name === 'enter') {
            filterMode = false;
            bottomText = `Filter applied: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`;
            renderFrame();
            return;
          }
          if (name === 'backspace') {
            filterQuery = filterQuery.slice(0, -1);
            selectedIndex = 0;
            selectedItemKey = undefined;
            bottomText = `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`;
            renderFrame();
            return;
          }
          if (!key.ctrl && char && char >= ' ') {
            filterQuery += char;
            selectedIndex = 0;
            selectedItemKey = undefined;
            bottomText = `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`;
            renderFrame();
            return;
          }
          return;
        }
        queueIntent(parsedIntent);
      };
      const onData = (chunk: Buffer | string) => {
        const value = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        const fallbackIntent = parsePanelDataChunk(value);
        if (fallbackIntent) {
          if (filterMode && (value === 'q' || value === 'Q')) {
            return;
          }
          queueIntent(fallbackIntent);
        }
      };

      const cleanup = () => {
        if (typeof (output as any).off === 'function') {
          (output as any).off('resize', onResize);
        }
        input.off('keypress', onKeypress);
        input.off('data', onData);
        if (input.isTTY && typeof input.setRawMode === 'function') {
          input.setRawMode(false);
        }
        if (typeof input.pause === 'function') {
          input.pause();
        }
        output.write('\x1b[?25h');
        output.write('\n');
      };

      input.on('keypress', onKeypress);
      input.on('data', onData);
      if (typeof (output as any).on === 'function') {
        (output as any).on('resize', onResize);
      }
    });
  } finally {
    if (isNodesMode) {
      await nodesPresenter.disconnect();
    }
  }
}

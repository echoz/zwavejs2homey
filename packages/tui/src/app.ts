import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';

import type {
  ConnectedSessionConfig,
  IncludeValuesMode,
  NodeDetail,
  NodeValueDetail,
  RuleDetail,
  SessionConfig,
  SimulationSummary,
  ValidationSummary,
} from './model/types';
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
  annotateNodeValue,
  formatValueSemanticTag,
  semanticCapabilityScore,
} from './view/value-semantics';
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
    '  arrows/j/k move/scroll focused pane | pgup/pgdn page | home/end jump | / filter | tab switch pane',
    '  enter open | r refresh',
    '  i inspect | v validate | m simulate | d simulate --dry-run',
    '  n toggle neighbors in node detail',
    '  z toggle values in node detail',
    '  b toggle bottom pane full/status-bar',
    '  p scaffold preview | W scaffold write (confirm x2) | A manifest add (confirm x2)',
    '  s status | l log | c cancel op | h help | q quit',
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
  panelOperationTimeoutMs?: number;
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
    'Keys: up/down move/scroll focused pane | pgup/pgdn page | home/end jump | / filter | tab switch pane',
    'enter open | r refresh',
    'i inspect | v validate | m simulate | d simulate(dry-run) | p scaffold-preview',
    'n toggle neighbors in node detail',
    'z toggle values in node detail',
    'b toggle bottom pane full/status-bar',
    'W scaffold-write (confirmed) | A manifest-add (confirmed)',
    's status | l log | c cancel operation | h help | q quit',
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

function getPanelContentHeightsWithMode(
  rows: number | undefined,
  bottomCompact: boolean,
): {
  topContentHeight: number;
  bottomContentHeight: number;
} {
  const height = Math.max(18, rows ?? 30);
  const bodyHeight = height - 6;
  const bottomHeight = bottomCompact ? 3 : bodyHeight - Math.max(8, Math.floor(bodyHeight * 0.65));
  const topHeight = bodyHeight - bottomHeight;
  return {
    topContentHeight: Math.max(1, topHeight - 2),
    bottomContentHeight: Math.max(1, bottomHeight - 2),
  };
}

function getLeftPaneCapacity(rows: number | undefined, bottomCompact: boolean): number {
  return getPanelContentHeightsWithMode(rows, bottomCompact).topContentHeight;
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

function getOffsetWindow<T>(
  items: T[],
  start: number,
  capacity: number,
): { start: number; visible: T[]; maxStart: number } {
  const maxStart = Math.max(0, items.length - capacity);
  const clampedStart = Math.min(maxStart, Math.max(0, start));
  return {
    start: clampedStart,
    visible: items.slice(clampedStart, clampedStart + capacity),
    maxStart,
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

interface NeighborIdentity {
  name: string | null;
  manufacturer: string | null;
  product: string | null;
}

interface LifelineRouteSummary {
  repeaters: number[];
  routeSpeed?: number;
  error?: string;
}

function stringifyCompact(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateValueText(value: string, maxLength = 44): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}~`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asReadableId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return asNonEmptyString(value);
}

function formatManufacturerLabel(state: Record<string, unknown>): string {
  const deviceConfig = asRecord(state.deviceConfig);
  const name = asNonEmptyString(state.manufacturer) ?? asNonEmptyString(deviceConfig?.manufacturer);
  const manufacturerId = asReadableId(state.manufacturerId);
  if (name && manufacturerId) {
    return name.includes(manufacturerId) ? name : `${name} (id ${manufacturerId})`;
  }
  return name ?? manufacturerId ?? '';
}

function formatProductLabel(state: Record<string, unknown>): string {
  const deviceConfig = asRecord(state.deviceConfig);
  const name =
    asNonEmptyString(state.product) ??
    asNonEmptyString(state.productLabel) ??
    asNonEmptyString(deviceConfig?.label);
  const productType = asReadableId(state.productType);
  const productId = asReadableId(state.productId);
  let idLabel = '';
  if (productType && productId) {
    idLabel = `type ${productType}, id ${productId}`;
  } else if (productType) {
    idLabel = `type ${productType}`;
  } else if (productId) {
    idLabel = `id ${productId}`;
  }
  if (name && idLabel) return `${name} (${idLabel})`;
  return name ?? idLabel;
}

function formatNeighborValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  return stringifyCompact(value);
}

function parseNodeId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function parseLifelineRouteSummary(value: unknown): LifelineRouteSummary | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record._error !== undefined) {
    return { repeaters: [], error: truncateValueText(stringifyCompact(record._error), 60) };
  }
  const repeaters = Array.isArray(record.repeaters)
    ? record.repeaters
        .map((item) => parseNodeId(item))
        .filter((item): item is number => item !== undefined)
    : [];
  const routeSpeed =
    typeof record.routeSpeed === 'number' && Number.isFinite(record.routeSpeed)
      ? record.routeSpeed
      : undefined;
  return { repeaters, routeSpeed };
}

function formatRouteSpeed(value: number | undefined): string | null {
  if (value === undefined) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbps`;
  if (value >= 1000) return `${Math.round(value / 1000)} kbps`;
  return `${value} bps`;
}

function formatLifelineRouteSummary(route: LifelineRouteSummary | null): string {
  if (!route) return 'Lifeline route: unknown';
  if (route.error) return `Lifeline route: unavailable (${route.error})`;
  const speed = formatRouteSpeed(route.routeSpeed);
  if (route.repeaters.length === 0) {
    return `Lifeline route: direct${speed ? ` @ ${speed}` : ''}`;
  }
  return `Lifeline route: ${route.repeaters.join(' -> ')}${speed ? ` @ ${speed}` : ''}`;
}

function formatNeighborLinkQuality(
  neighborId: number | undefined,
  route: LifelineRouteSummary | null,
): string {
  if (!route) return 'link unknown';
  if (route.error) return 'link unavailable';
  const speed = formatRouteSpeed(route.routeSpeed);
  if (neighborId === undefined) return 'link unknown';
  if (route.repeaters.length === 0) return 'not-on-lifeline';
  const hopIndex = route.repeaters.indexOf(neighborId);
  if (hopIndex < 0) return 'not-on-lifeline';
  return `lifeline hop ${hopIndex + 1}/${route.repeaters.length}${speed ? ` @ ${speed}` : ''}`;
}

function renderNeighborLines(
  neighbors: unknown,
  options: {
    expanded: boolean;
    neighborLookup?: Map<number, NeighborIdentity>;
    lifelineRoute?: unknown;
  },
): string[] {
  const route = parseLifelineRouteSummary(options.lifelineRoute);
  if (Array.isArray(neighbors)) {
    const values = neighbors.map((value) => formatNeighborValue(value));
    if (!options.expanded) {
      return [`Neighbors: ${values.length}${values.length > 0 ? ' (press n to expand)' : ''}`];
    }
    const maxNeighborLines = 24;
    const rows = values.slice(0, maxNeighborLines).map((value, index) => {
      const neighborId = parseNodeId(neighbors[index]);
      if (neighborId === undefined) {
        return `- Node ${value}`;
      }
      const summary = options.neighborLookup?.get(neighborId);
      if (!summary) {
        return `- Node ${value}`;
      }
      const name = summary.name ?? '(unnamed)';
      const manufacturer = summary.manufacturer ?? 'unknown';
      const product = summary.product ?? 'unknown';
      const linkQuality = formatNeighborLinkQuality(neighborId, route);
      return `- Node ${value} | ${name} | ${manufacturer} | ${product} | ${linkQuality}`;
    });
    return [
      `Neighbors: ${values.length}${values.length > 0 ? ' (press n to collapse)' : ''}`,
      formatLifelineRouteSummary(route),
      values.length > 0 ? 'Neighbor Nodes:' : 'Neighbor Nodes: (none)',
      ...rows,
      values.length > maxNeighborLines
        ? `... ${values.length - maxNeighborLines} more neighbors`
        : null,
    ].filter((line): line is string => line !== null);
  }
  const record = asRecord(neighbors);
  if (record && record._error !== undefined) {
    return [`Neighbors: error ${truncateValueText(stringifyCompact(record._error), 96)}`];
  }
  return [`Neighbors: ${truncateValueText(stringifyCompact(neighbors), 96)}`];
}

function formatReadableValue(value: unknown): string {
  if (value === undefined) return '<no value>';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return stringifyCompact(value);
}

function formatNodeValueLine(entry: NodeValueDetail): string {
  if (entry._error !== undefined) {
    return `- value-error: ${truncateValueText(stringifyCompact(entry._error))}`;
  }

  const valueId = entry.valueId;
  if (!valueId) return '- value: <missing valueId>';

  const metadata = asRecord(entry.metadata);
  const states = asRecord(metadata?.states);
  const rawValueText = formatReadableValue(entry.value);
  const mappedValue =
    states && entry.value !== undefined
      ? (states[String(entry.value)] ?? states[String(Number(entry.value))])
      : undefined;
  const mappedValueText =
    typeof mappedValue === 'string' && mappedValue.trim().length > 0
      ? `${mappedValue} (${rawValueText})`
      : rawValueText;
  const unit =
    metadata && typeof metadata.unit === 'string' && metadata.unit.trim().length > 0
      ? ` ${metadata.unit}`
      : '';
  const label =
    metadata && typeof metadata.label === 'string' && metadata.label.trim().length > 0
      ? metadata.label.trim()
      : String(valueId.property);
  const type =
    metadata && typeof metadata.type === 'string' && metadata.type.trim().length > 0
      ? metadata.type.trim()
      : undefined;
  const permissions = [
    metadata?.readable === true ? 'r' : '',
    metadata?.writeable === true ? 'w' : '',
  ]
    .join('')
    .trim();
  const metaBits = [type, permissions].filter((item) => item && item.length > 0).join(',');
  const identifier = `CC ${valueId.commandClass} ep ${valueId.endpoint ?? 0} ${String(valueId.property)}${
    valueId.propertyKey != null ? `/${String(valueId.propertyKey)}` : ''
  }`;

  const errors = [
    entry.metadataError
      ? `meta-err=${truncateValueText(stringifyCompact(entry.metadataError), 28)}`
      : null,
    entry.valueError
      ? `val-err=${truncateValueText(stringifyCompact(entry.valueError), 28)}`
      : null,
    entry.timestampError
      ? `ts-err=${truncateValueText(stringifyCompact(entry.timestampError), 28)}`
      : null,
  ]
    .filter((value) => value !== null)
    .join(' ');
  const semanticTag = formatValueSemanticTag(annotateNodeValue(entry));

  return [
    `- ${identifier}`,
    `  ${truncateValueText(label, 32)} = ${truncateValueText(mappedValueText + unit)}${
      metaBits ? ` [${metaBits}]` : ''
    } ${semanticTag}${errors ? ` ${errors}` : ''}`,
  ].join('\n');
}

function valueIdKey(entry: NodeValueDetail): string {
  if (!entry.valueId) return 'missing';
  const valueId = entry.valueId;
  return [
    String(valueId.commandClass),
    String(valueId.endpoint ?? 0),
    String(valueId.property),
    valueId.propertyKey == null ? '' : String(valueId.propertyKey),
  ].join(':');
}

function toCommandClassNumber(commandClass: unknown): number | undefined {
  if (typeof commandClass === 'number' && Number.isInteger(commandClass)) return commandClass;
  if (typeof commandClass === 'string') {
    const trimmed = commandClass.trim();
    if (trimmed.length > 0) {
      const parsed = Number(trimmed);
      if (Number.isInteger(parsed)) return parsed;
    }
  }
  return undefined;
}

function scoreCommandClass(commandClass: number | undefined): number {
  switch (commandClass) {
    case 37:
    case 38:
      return 30; // primary actuator values
    case 48:
    case 49:
    case 50:
      return 24; // primary sensor/meter values
    case 113:
      return 16; // notifications
    case 91:
      return 14; // central scene
    case 128:
      return 12; // battery
    case 114:
    case 115:
      return -8; // manufacturer/powerlevel diagnostics
    case 112:
      return -4; // configuration often secondary
    default:
      return 0;
  }
}

function scoreNodeValue(entry: NodeValueDetail): number {
  if (entry._error !== undefined) return -1000;
  const metadata = asRecord(entry.metadata);
  const states = asRecord(metadata?.states);
  const semantic = annotateNodeValue(entry);
  const propertyText = `${entry.valueId?.property ?? ''} ${entry.valueId?.propertyKey ?? ''}`
    .trim()
    .toLowerCase();

  let score = 0;
  if (entry.value !== undefined) score += 8;
  if (asNonEmptyString(metadata?.label)) score += 14;
  if (asNonEmptyString(metadata?.description)) score += 3;
  if (states && Object.keys(states).length > 0) score += 20;
  if (metadata?.writeable === true) score += 20;
  if (metadata?.readable === true) score += 6;
  if (asNonEmptyString(metadata?.unit)) score += 6;
  score += scoreCommandClass(toCommandClassNumber(entry.valueId?.commandClass));
  score += semanticCapabilityScore(semantic.capabilityId);
  if (semantic.confidence === 'high') score += 8;
  if (semantic.confidence === 'medium') score += 4;

  if (
    propertyText.includes('interview') ||
    propertyText.includes('status') ||
    propertyText.includes('health') ||
    propertyText.includes('last')
  ) {
    score -= 10;
  }
  return score;
}

function sortValuesByRelevance(values: NodeValueDetail[]): NodeValueDetail[] {
  return [...values].sort((a, b) => {
    const scoreDelta = scoreNodeValue(b) - scoreNodeValue(a);
    if (scoreDelta !== 0) return scoreDelta;
    return valueIdKey(a).localeCompare(valueIdKey(b));
  });
}

function renderPanelNodeDetail(
  detail: NodeDetail,
  options: {
    neighborsExpanded?: boolean;
    valuesExpanded?: boolean;
    neighborLookup?: Map<number, NeighborIdentity>;
  } = {},
): string {
  const state = detail.state ?? {};
  const ready = String(state.ready ?? '');
  const status = String(state.status ?? '');
  const manufacturer = formatManufacturerLabel(state);
  const product = formatProductLabel(state);
  const name = String(state.name ?? '');
  const neighborLines = renderNeighborLines(detail.neighbors, {
    expanded: options.neighborsExpanded === true,
    neighborLookup: options.neighborLookup,
    lifelineRoute: detail.lifelineRoute,
  });
  const values = detail.values ?? [];
  const sortedValues = sortValuesByRelevance(values);
  const valuesExpanded = options.valuesExpanded === true;
  const previewLimit = valuesExpanded ? 12 : 3;
  const previewRows = sortedValues
    .slice(0, previewLimit)
    .map((entry) => formatNodeValueLine(entry));

  return [
    `Node ${detail.nodeId}`,
    `Name: ${name}`,
    `Ready: ${ready}  Status: ${status}`,
    `Manufacturer: ${manufacturer}`,
    `Product: ${product}`,
    ...neighborLines,
    `Notifications: ${stringifyCompact(detail.notificationEvents)}`,
    `Values: ${values.length}${
      values.length > 0 ? (valuesExpanded ? ' (press z to collapse)' : ' (press z to expand)') : ''
    }`,
    values.length > 0
      ? valuesExpanded
        ? 'Value Preview (top relevant first):'
        : 'Top Values (top relevant first):'
      : null,
    ...previewRows,
    sortedValues.length > previewRows.length
      ? valuesExpanded
        ? `... ${sortedValues.length - previewRows.length} more values`
        : `... ${sortedValues.length - previewRows.length} more values (press z to expand)`
      : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function renderPanelRuleDetail(detail: RuleDetail): string {
  const rulesArray = Array.isArray(detail.content?.rules)
    ? (detail.content?.rules as Array<Record<string, unknown>>)
    : [];
  const sampleRules = rulesArray.slice(0, 12).map((rule, index) => {
    const id = typeof rule.ruleId === 'string' ? rule.ruleId : `rule-${index + 1}`;
    const actions = Array.isArray(rule.actions) ? rule.actions.length : 0;
    return `- ${id} (${actions} action${actions === 1 ? '' : 's'})`;
  });
  return [
    `Rule #${detail.index}`,
    `File: ${detail.filePath}`,
    `Layer: ${detail.layer}`,
    `Name: ${detail.name ?? ''}`,
    `Signature: ${detail.signature ?? ''}`,
    `Rules: ${detail.ruleCount}`,
    detail.loadError ? `Load error: ${detail.loadError}` : null,
    sampleRules.length > 0 ? 'Rule IDs:' : null,
    ...sampleRules,
    rulesArray.length > sampleRules.length
      ? `... ${rulesArray.length - sampleRules.length} more rules`
      : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function renderPanelValidationSummary(summary: ValidationSummary): string {
  return [
    `Validation signature: ${summary.signature}`,
    `Nodes: ${summary.totalNodes}`,
    `Needs review: ${summary.reviewNodes}`,
    `Outcomes: ${
      Object.entries(summary.outcomes)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ') || 'none'
    }`,
    summary.reportFile ? `Report: ${summary.reportFile}` : null,
    summary.artifactFile ? `Artifact: ${summary.artifactFile}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function renderPanelSimulationSummary(summary: SimulationSummary): string {
  return [
    `Simulation signature: ${summary.signature}`,
    `Dry run: ${summary.dryRun ? 'yes' : 'no'}`,
    `Inspect: ${summary.inspectSkipped ? 'skipped' : summary.inspectFormat}`,
    `Gate passed: ${summary.gatePassed === null ? 'n/a' : summary.gatePassed ? 'yes' : 'no'}`,
    `Nodes validated: ${summary.totalNodes}`,
    `Needs review: ${summary.reviewNodes}`,
    `Outcomes: ${
      Object.entries(summary.outcomes)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ') || 'none'
    }`,
    `Inspect cmd: ${summary.inspectCommandLine ?? '(skipped)'}`,
    `Validate cmd: ${summary.validateCommandLine}`,
    summary.reportFile ? `Report: ${summary.reportFile}` : null,
    summary.summaryJsonFile ? `Summary JSON: ${summary.summaryJsonFile}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

type PanelFocus = 'left' | 'right' | 'bottom';
type ConfirmAction = 'scaffold-write' | 'manifest-add';

interface PendingConfirm {
  action: ConfirmAction;
  expiresAt: number;
}

interface ActiveOperation {
  id: number;
  label: string;
  startedAt: number;
  cancel: () => void;
}

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
  let rightScroll = 0;
  let currentNodeDetail: NodeDetail | null = null;
  let neighborsExpanded = false;
  let valuesExpanded = false;
  let bottomText = renderPanelHelp(config.mode);
  let bottomScroll = 0;
  let bottomCompact = false;
  let isClosing = false;
  let pendingConfirm: PendingConfirm | null = null;
  let activeOperation: ActiveOperation | null = null;
  let nextOperationId = 1;

  const OPERATION_TIMEOUT_MS = Math.max(1, deps.panelOperationTimeoutMs ?? 45_000);
  const WRITE_CONFIRM_WINDOW_MS = 6_000;

  function setRightPaneText(value: string): void {
    rightText = value;
    rightScroll = 0;
  }

  function setBottomPaneText(value: string): void {
    bottomText = value;
    bottomScroll = 0;
  }

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
        label: truncateLabel(
          [
            node.name ?? '(unnamed)',
            `(${node.manufacturer ?? 'unknown'} / ${node.product ?? 'unknown'})`,
          ].join(' '),
          96,
        ),
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
    const pageSize = getLeftPaneCapacity(output.rows, bottomCompact);
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

  function toNeighborIdentityFromDetail(detail: NodeDetail): NeighborIdentity {
    const state = detail.state ?? {};
    const name = asNonEmptyString(state.name) ?? null;
    const manufacturer = formatManufacturerLabel(state) || null;
    const product = formatProductLabel(state) || null;
    return { name, manufacturer, product };
  }

  function buildNeighborLookup(): Map<number, NeighborIdentity> {
    const snapshot = nodesPresenter.getState();
    const map = new Map<number, NeighborIdentity>();

    const explorerItems = snapshot.explorer?.items ?? [];
    for (const item of explorerItems) {
      map.set(item.nodeId, {
        name: item.name,
        manufacturer: item.manufacturer,
        product: item.product,
      });
    }

    const detailCache = snapshot.nodeDetailCache ?? {};
    for (const [key, detail] of Object.entries(detailCache)) {
      const nodeId = Number(key);
      if (!Number.isInteger(nodeId) || nodeId <= 0 || !detail) continue;
      const identity = toNeighborIdentityFromDetail(detail);
      const existing = map.get(nodeId) ?? { name: null, manufacturer: null, product: null };
      map.set(nodeId, {
        name: identity.name ?? existing.name,
        manufacturer: identity.manufacturer ?? existing.manufacturer,
        product: identity.product ?? existing.product,
      });
    }

    return map;
  }

  async function hydrateNeighborIdentity(): Promise<void> {
    if (!currentNodeDetail || !Array.isArray(currentNodeDetail.neighbors)) return;
    const neighborIds = currentNodeDetail.neighbors
      .map((neighbor) => parseNodeId(neighbor))
      .filter((value): value is number => value !== undefined);
    if (neighborIds.length === 0) return;

    const neighborLookup = buildNeighborLookup();
    const missing = neighborIds.filter((id) => {
      const identity = neighborLookup.get(id);
      return !identity || !identity.manufacturer || !identity.product;
    });
    if (missing.length === 0) return;

    for (const nodeId of missing.slice(0, 16)) {
      try {
        await nodesPresenter.showNodeDetail(nodeId, {
          selectNode: false,
          includeValues: 'none',
          maxValues: 1,
          includeLinkQuality: false,
        });
      } catch {
        // Best effort hydration only; keep rendering available info.
      }
    }
  }

  function updateNodeDetail(detail: NodeDetail): void {
    const selectedNodeChanged = currentNodeDetail?.nodeId !== detail.nodeId;
    currentNodeDetail = detail;
    if (selectedNodeChanged) {
      neighborsExpanded = false;
      valuesExpanded = false;
    }
    const neighborLookup = isNodesMode ? buildNeighborLookup() : undefined;
    setRightPaneText(
      renderPanelNodeDetail(detail, {
        neighborsExpanded,
        valuesExpanded,
        neighborLookup,
      }),
    );
  }

  function rerenderCurrentNodeDetail(): void {
    if (!currentNodeDetail || !isNodesMode) return;
    const neighborLookup = buildNeighborLookup();
    rightText = renderPanelNodeDetail(currentNodeDetail, {
      neighborsExpanded,
      valuesExpanded,
      neighborLookup,
    });
  }

  function clearExpiredPendingConfirm(): void {
    if (!pendingConfirm) return;
    if (pendingConfirm.expiresAt <= Date.now()) {
      pendingConfirm = null;
    }
  }

  function requestConfirmation(action: ConfirmAction): boolean {
    clearExpiredPendingConfirm();
    if (pendingConfirm?.action === action) {
      pendingConfirm = null;
      return true;
    }
    pendingConfirm = {
      action,
      expiresAt: Date.now() + WRITE_CONFIRM_WINDOW_MS,
    };
    const key = action === 'scaffold-write' ? 'W' : 'A';
    const actionLabel = action === 'scaffold-write' ? 'scaffold write' : 'manifest add';
    setBottomPaneText(
      `Confirm ${actionLabel}: press ${key} again within ${WRITE_CONFIRM_WINDOW_MS / 1000}s`,
    );
    return false;
  }

  async function runTimedOperation<T>(label: string, run: () => Promise<T>): Promise<T> {
    const operationId = nextOperationId;
    nextOperationId += 1;
    let cancelResolve: (() => void) | null = null;
    const cancelPromise = new Promise<{ kind: 'cancel' }>((resolve) => {
      cancelResolve = () => resolve({ kind: 'cancel' });
    });
    activeOperation = {
      id: operationId,
      label,
      startedAt: Date.now(),
      cancel: () => {
        if (cancelResolve) cancelResolve();
      },
    };

    const taskPromise = run()
      .then((value) => ({ kind: 'task' as const, ok: true as const, value }))
      .catch((error) => ({ kind: 'task' as const, ok: false as const, error }));
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<{ kind: 'timeout' }>((resolve) => {
      timeoutHandle = setTimeout(() => resolve({ kind: 'timeout' }), OPERATION_TIMEOUT_MS);
    });

    const winner = await Promise.race([taskPromise, timeoutPromise, cancelPromise]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (activeOperation?.id === operationId) {
      activeOperation = null;
    }

    if (winner.kind === 'cancel') {
      throw new Error(`${label} cancelled`);
    }
    if (winner.kind === 'timeout') {
      throw new Error(`${label} timed out after ${Math.round(OPERATION_TIMEOUT_MS / 1000)}s`);
    }
    if (!winner.ok) {
      throw winner.error;
    }
    return winner.value;
  }

  async function ensureSelectedSignature(): Promise<string> {
    if (isNodesMode) {
      const nodeId = getSelectedNodeId();
      if (!nodeId) {
        throw new Error('No node selected');
      }
      const detail = await nodesPresenter.showNodeDetail(nodeId);
      updateNodeDetail(detail);
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
    const paneHeights = getPanelContentHeightsWithMode(output.rows, bottomCompact);
    const entries = getListEntries();
    const totalItems = entries.length;
    const listCapacity = getLeftPaneCapacity(output.rows, bottomCompact);
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

    const rightAllLines = splitLines(rightText);
    const rightWindow = getOffsetWindow(rightAllLines, rightScroll, paneHeights.topContentHeight);
    rightScroll = rightWindow.start;
    const rightRange =
      rightAllLines.length > paneHeights.topContentHeight
        ? ` [${rightWindow.start + 1}-${rightWindow.start + rightWindow.visible.length}/${rightAllLines.length}]`
        : '';
    const rightTitle = `${isNodesMode ? 'Node Detail' : 'Rule Detail'}${rightRange}`;

    const bottomAllLines = splitLines(bottomText);
    const bottomWindow = getOffsetWindow(
      bottomAllLines,
      bottomScroll,
      paneHeights.bottomContentHeight,
    );
    bottomScroll = bottomWindow.start;
    const bottomRange =
      bottomAllLines.length > paneHeights.bottomContentHeight
        ? ` [${bottomWindow.start + 1}-${bottomWindow.start + bottomWindow.visible.length}/${bottomAllLines.length}]`
        : '';
    const bottomTitle = `${bottomCompact ? 'Status Bar' : 'Output / Run'}${bottomRange}`;

    const status = isNodesMode
      ? nodesPresenter.getStatusSnapshot()
      : rulesPresenter.getStatusSnapshot();
    const selectedSignature = status.selectedSignature
      ? `sig=${status.selectedSignature}`
      : 'sig=-';
    const header = `ZWJS ${config.mode} (${config.uiMode}) ${selectedSignature}`;
    clearExpiredPendingConfirm();
    const statusSuffix = activeOperation
      ? ` | running: ${activeOperation.label} (press c to cancel)`
      : pendingConfirm
        ? ` | confirm pending: ${pendingConfirm.action}`
        : '';
    const footer = filterMode
      ? `Filter mode: type to search | backspace delete | enter apply | esc apply${statusSuffix}`
      : `q quit | arrows move | pgup/pgdn page | / filter | enter open | i/v/m loop | n neighbors | z values | b bottom-size | c cancel${statusSuffix}`;

    const frame = renderPanelFrame({
      width,
      height,
      header,
      footer,
      leftTitle,
      leftLines: listLines,
      rightTitle,
      rightLines: rightWindow.visible,
      bottomTitle,
      bottomLines: bottomWindow.visible,
      focusedPane,
      bottomCompact,
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
      setBottomPaneText(
        `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`,
      );
      return;
    }
    if (intent.type === 'move-up') {
      if (focusedPane === 'left') {
        moveSelection(-1);
      } else if (focusedPane === 'right') {
        rightScroll = Math.max(0, rightScroll - 1);
      } else {
        bottomScroll = Math.max(0, bottomScroll - 1);
      }
      return;
    }
    if (intent.type === 'move-down') {
      if (focusedPane === 'left') {
        moveSelection(1);
      } else if (focusedPane === 'right') {
        rightScroll += 1;
      } else {
        bottomScroll += 1;
      }
      return;
    }
    if (intent.type === 'move-page-up') {
      if (focusedPane === 'left') {
        moveSelectionByPage(-1);
      } else {
        const paneHeights = getPanelContentHeightsWithMode(output.rows, bottomCompact);
        const delta =
          focusedPane === 'right' ? paneHeights.topContentHeight : paneHeights.bottomContentHeight;
        if (focusedPane === 'right') {
          rightScroll = Math.max(0, rightScroll - delta);
        } else {
          bottomScroll = Math.max(0, bottomScroll - delta);
        }
      }
      return;
    }
    if (intent.type === 'move-page-down') {
      if (focusedPane === 'left') {
        moveSelectionByPage(1);
      } else {
        const paneHeights = getPanelContentHeightsWithMode(output.rows, bottomCompact);
        const delta =
          focusedPane === 'right' ? paneHeights.topContentHeight : paneHeights.bottomContentHeight;
        if (focusedPane === 'right') {
          rightScroll += delta;
        } else {
          bottomScroll += delta;
        }
      }
      return;
    }
    if (intent.type === 'move-first') {
      if (focusedPane === 'left') {
        moveSelectionToBoundary('first');
      } else if (focusedPane === 'right') {
        rightScroll = 0;
      } else {
        bottomScroll = 0;
      }
      return;
    }
    if (intent.type === 'move-last') {
      if (focusedPane === 'left') {
        moveSelectionToBoundary('last');
      } else if (focusedPane === 'right') {
        rightScroll = Number.MAX_SAFE_INTEGER;
      } else {
        bottomScroll = Number.MAX_SAFE_INTEGER;
      }
      return;
    }
    if (intent.type === 'switch-pane') {
      focusedPane = paneOrder[(paneOrder.indexOf(focusedPane) + 1) % paneOrder.length];
      return;
    }
    if (intent.type === 'toggle-bottom-pane-size') {
      bottomCompact = !bottomCompact;
      setBottomPaneText(
        bottomCompact
          ? 'Bottom pane set to status-bar mode (single line). Press b to expand.'
          : 'Bottom pane expanded. Press b for status-bar mode.',
      );
      return;
    }
    if (intent.type === 'help') {
      setBottomPaneText(renderPanelHelp(config.mode));
      return;
    }
    if (intent.type === 'open') {
      if (isNodesMode) {
        const nodeId = getSelectedNodeId();
        if (!nodeId) throw new Error('No node selected');
        const detail = await nodesPresenter.showNodeDetail(nodeId);
        updateNodeDetail(detail);
      } else {
        const ruleIndex = getSelectedRuleIndex();
        if (!ruleIndex) throw new Error('No rule selected');
        currentNodeDetail = null;
        neighborsExpanded = false;
        valuesExpanded = false;
        setRightPaneText(renderPanelRuleDetail(rulesPresenter.showRuleDetail(ruleIndex)));
      }
      return;
    }
    if (intent.type === 'refresh') {
      if (isNodesMode) {
        await nodesPresenter.refreshNodes();
        if (currentNodeDetail) {
          const stillExists = nodesPresenter
            .getState()
            .explorer.items.some((node) => node.nodeId === currentNodeDetail?.nodeId);
          if (!stillExists) {
            currentNodeDetail = null;
            neighborsExpanded = false;
            valuesExpanded = false;
            setRightPaneText('');
          } else {
            rerenderCurrentNodeDetail();
          }
        }
      } else {
        rulesPresenter.refreshRules();
      }
      pendingConfirm = null;
      setBottomPaneText(`Refreshed ${getListEntries().length} item(s).`);
      return;
    }
    if (intent.type === 'toggle-neighbors') {
      if (!isNodesMode) {
        setBottomPaneText('Neighbors view is only available in nodes mode.');
        return;
      }
      if (!currentNodeDetail) {
        const nodeId = getSelectedNodeId();
        if (!nodeId) {
          setBottomPaneText('Open a node first.');
          return;
        }
        const detail = await nodesPresenter.showNodeDetail(nodeId);
        updateNodeDetail(detail);
      }
      neighborsExpanded = !neighborsExpanded;
      if (neighborsExpanded) {
        await hydrateNeighborIdentity();
      }
      rerenderCurrentNodeDetail();
      setBottomPaneText(neighborsExpanded ? 'Expanded neighbors.' : 'Collapsed neighbors.');
      return;
    }
    if (intent.type === 'toggle-values') {
      if (!isNodesMode) {
        setBottomPaneText('Values view is only available in nodes mode.');
        return;
      }
      if (!currentNodeDetail) {
        const nodeId = getSelectedNodeId();
        if (!nodeId) {
          setBottomPaneText('Open a node first.');
          return;
        }
        const detail = await nodesPresenter.showNodeDetail(nodeId);
        updateNodeDetail(detail);
      }
      valuesExpanded = !valuesExpanded;
      rerenderCurrentNodeDetail();
      setBottomPaneText(valuesExpanded ? 'Expanded values.' : 'Collapsed values.');
      return;
    }
    if (intent.type === 'inspect') {
      const selectedNodeId = isNodesMode ? getSelectedNodeId() : undefined;
      setBottomPaneText(`Running inspect${selectedNodeId ? ` for node ${selectedNodeId}` : ''}...`);
      renderFrame();
      const signature = await ensureSelectedSignature();
      const summary = await runTimedOperation(`inspect ${signature}`, () =>
        isNodesMode
          ? nodesPresenter.inspectSelectedSignature({ nodeId: selectedNodeId })
          : rulesPresenter.inspectSelectedSignature(),
      );
      setBottomPaneText(renderInspectSummary(summary));
      io.log(`inspected ${signature}`);
      return;
    }
    if (intent.type === 'validate') {
      const selectedNodeId = isNodesMode ? getSelectedNodeId() : undefined;
      setBottomPaneText(
        `Running validate${selectedNodeId ? ` for node ${selectedNodeId}` : ''}...`,
      );
      renderFrame();
      const signature = await ensureSelectedSignature();
      const summary = await runTimedOperation(`validate ${signature}`, () =>
        isNodesMode
          ? nodesPresenter.validateSelectedSignature({ nodeId: selectedNodeId })
          : rulesPresenter.validateSelectedSignature(),
      );
      setBottomPaneText(renderPanelValidationSummary(summary));
      io.log(`validated ${signature}`);
      return;
    }
    if (intent.type === 'simulate') {
      const selectedNodeId = isNodesMode ? getSelectedNodeId() : undefined;
      setBottomPaneText(
        `Running simulate${selectedNodeId ? ` for node ${selectedNodeId}` : ''}${
          intent.dryRun ? ' (dry-run)' : ''
        }...`,
      );
      renderFrame();
      const signature = await ensureSelectedSignature();
      const summary = await runTimedOperation(
        `simulate ${signature}${intent.dryRun ? ' (dry-run)' : ''}`,
        () =>
          isNodesMode
            ? nodesPresenter.simulateSelectedSignature({
                nodeId: selectedNodeId,
                dryRun: intent.dryRun,
              })
            : rulesPresenter.simulateSelectedSignature({ dryRun: intent.dryRun }),
      );
      setBottomPaneText(renderPanelSimulationSummary(summary));
      io.log(`simulated ${signature}${intent.dryRun ? ' (dry-run)' : ''}`);
      return;
    }
    if (intent.type === 'scaffold-preview') {
      await ensureSelectedSignature();
      setBottomPaneText(
        renderScaffoldDraft(
          isNodesMode
            ? nodesPresenter.createScaffoldFromSignature({})
            : rulesPresenter.createScaffoldFromSignature({}),
        ),
      );
      return;
    }
    if (intent.type === 'scaffold-write') {
      if (!requestConfirmation('scaffold-write')) {
        return;
      }
      const written = isNodesMode
        ? nodesPresenter.writeScaffoldDraft(undefined, { confirm: true })
        : rulesPresenter.writeScaffoldDraft(undefined, { confirm: true });
      setBottomPaneText(`Scaffold written: ${written}`);
      return;
    }
    if (intent.type === 'manifest-add') {
      if (!requestConfirmation('manifest-add')) {
        return;
      }
      const result = isNodesMode
        ? nodesPresenter.addDraftToManifest({ confirm: true })
        : rulesPresenter.addDraftToManifest({ confirm: true });
      setBottomPaneText(renderManifestResult(result));
      return;
    }
    if (intent.type === 'status') {
      setBottomPaneText(
        renderStatusSnapshot(
          isNodesMode ? nodesPresenter.getStatusSnapshot() : rulesPresenter.getStatusSnapshot(),
        ),
      );
      return;
    }
    if (intent.type === 'log') {
      setBottomPaneText(
        renderRunLog(isNodesMode ? nodesPresenter.getRunLog(30) : rulesPresenter.getRunLog(30)),
      );
      return;
    }
    if (intent.type === 'cancel-operation') {
      if (!activeOperation) {
        setBottomPaneText('No active operation.');
        return;
      }
      activeOperation.cancel();
      setBottomPaneText(`Cancel requested for ${activeOperation.label}...`);
    }
  }

  try {
    if (isNodesMode) {
      await nodesPresenter.connect(config as ConnectedSessionConfig);
      if (config.startNode !== undefined) {
        updateNodeDetail(await nodesPresenter.showNodeDetail(config.startNode));
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
            setBottomPaneText(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
          setBottomPaneText(
            `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`,
          );
          renderFrame();
          return;
        }
        if (filterMode) {
          const name = (key.name ?? '').toLowerCase();
          if (name === 'escape') {
            filterMode = false;
            setBottomPaneText(
              `Filter applied: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`,
            );
            renderFrame();
            return;
          }
          if (name === 'return' || name === 'enter') {
            filterMode = false;
            setBottomPaneText(
              `Filter applied: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`,
            );
            renderFrame();
            return;
          }
          if (name === 'backspace') {
            filterQuery = filterQuery.slice(0, -1);
            selectedIndex = 0;
            selectedItemKey = undefined;
            setBottomPaneText(
              `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`,
            );
            renderFrame();
            return;
          }
          if (!key.ctrl && char && char >= ' ') {
            filterQuery += char;
            selectedIndex = 0;
            selectedItemKey = undefined;
            setBottomPaneText(
              `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`,
            );
            renderFrame();
            return;
          }
          return;
        }
        if (parsedIntent.type === 'cancel-operation') {
          if (!activeOperation) {
            setBottomPaneText('No active operation.');
          } else {
            const label = activeOperation.label;
            activeOperation.cancel();
            setBottomPaneText(`Cancel requested for ${label}...`);
          }
          renderFrame();
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

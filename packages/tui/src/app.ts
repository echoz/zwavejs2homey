import { createInterface } from 'node:readline/promises';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';
import blessed from 'neo-blessed';

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
import {
  annotateNodeValue,
  classifyNodeValueGroup,
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
  onPanelRender?: (snapshot: PanelRenderSnapshot) => void;
}

export interface PanelRenderSnapshot {
  header: string;
  footer: string;
  leftTitle: string;
  leftLines: string[];
  rightTitle: string;
  rightLines: string[];
  bottomTitle: string;
  bottomLines: string[];
  focusedPane: PanelFocus;
  bottomCompact: boolean;
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

function splitLines(value: string, options?: { maxLines?: number }): string[] {
  const lines = value.split('\n');
  const maxLines = options?.maxLines;
  if (!maxLines || lines.length <= maxLines) {
    return lines;
  }
  const hiddenCount = lines.length - maxLines;
  return [...lines.slice(0, maxLines), `... ${hiddenCount} more line(s) truncated`];
}

function padOrTruncateText(value: string, width: number): string {
  if (width <= 0) return '';
  if (value.length === width) return value;
  if (value.length < width) return value.padEnd(width, ' ');
  if (width === 1) return value.slice(0, 1);
  return `${value.slice(0, width - 1)}~`;
}

function formatDetailLinesForDisplay(lines: string[], sectionWidth: number): string {
  const headingPattern = /^(?:[▶▼]\s+)?(Identity|Telemetry|Neighbors|Values)\b/;
  const labelValuePattern = /^([A-Za-z][A-Za-z0-9 _/()\-]*):(.*)$/;
  const rendered: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      rendered.push('');
      continue;
    }
    if (headingPattern.test(trimmed)) {
      const headingText = padOrTruncateText(` ${trimmed} `, sectionWidth);
      rendered.push(`{bold}{inverse}${headingText}{/inverse}{/bold}`);
      continue;
    }
    if (trimmed.startsWith('Static/Diagnostic values:')) {
      rendered.push(`{yellow-fg}${line}{/yellow-fg}`);
      continue;
    }
    if (!trimmed.startsWith('-')) {
      const labelMatch = line.match(labelValuePattern);
      if (labelMatch) {
        const label = labelMatch[1];
        const value = labelMatch[2];
        rendered.push(`{bold}${label}:{/bold}${value}`);
        continue;
      }
    }
    if (trimmed.startsWith('- [static]')) {
      rendered.push(`{gray-fg}${line}{/gray-fg}`);
      continue;
    }
    rendered.push(line);
  }
  return rendered.join('\n');
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

function formatListRow(index: number, label: string): string {
  return `${String(index).padStart(3, ' ')} ${label}`;
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
  const bodyHeight = Math.max(6, height - 2); // header + footer rows
  const expandedBottomHeight = Math.max(5, Math.floor(bodyHeight * 0.32));
  const bottomHeight = bottomCompact
    ? 1
    : Math.min(Math.max(5, expandedBottomHeight), Math.max(5, bodyHeight - 4));
  const topHeight = Math.max(4, bodyHeight - bottomHeight);
  return {
    topContentHeight: Math.max(1, topHeight - 2), // pane border rows
    bottomContentHeight: bottomCompact ? 1 : Math.max(1, bottomHeight - 2), // bottom border rows
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

function parseNodeStatusCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function describeNodeStatus(status: unknown): string {
  const code = parseNodeStatusCode(status);
  const statusByCode: Record<number, string> = {
    0: 'unknown',
    1: 'asleep',
    2: 'awake',
    3: 'dead',
    4: 'alive',
  };
  if (code !== null) {
    return statusByCode[code] ? `${code} (${statusByCode[code]})` : String(code);
  }
  if (typeof status === 'string' && status.trim().length > 0) return status.trim();
  if (status === null || status === undefined) return 'unknown';
  return truncateValueText(stringifyCompact(status), 48);
}

function renderNotificationLines(notificationEvents: unknown): string[] {
  const maxLines = 16;
  if (notificationEvents === null || notificationEvents === undefined) {
    return ['Notifications: none'];
  }
  if (Array.isArray(notificationEvents)) {
    if (notificationEvents.length === 0) return ['Notifications: none'];
    const rows = notificationEvents.slice(0, maxLines).map((event) => {
      if (typeof event === 'string') return `- ${event}`;
      if (typeof event === 'number' || typeof event === 'boolean') return `- ${String(event)}`;
      return `- ${truncateValueText(stringifyCompact(event), 120)}`;
    });
    if (notificationEvents.length > maxLines) {
      rows.push(`... ${notificationEvents.length - maxLines} more`);
    }
    return [`Notifications: ${notificationEvents.length}`, ...rows];
  }
  const record = asRecord(notificationEvents);
  if (record) {
    if (record._error !== undefined) {
      return [
        `Notifications: unavailable (${truncateValueText(stringifyCompact(record._error), 96)})`,
      ];
    }
    const entries = Object.entries(record);
    if (entries.length === 0) return ['Notifications: none'];
    const rows = entries.slice(0, maxLines).map(([key, value]) => {
      if (Array.isArray(value)) {
        return `- ${key}: ${value.length > 0 ? value.map((item) => stringifyCompact(item)).join(', ') : '(none)'}`;
      }
      if (asRecord(value)) {
        const nested = Object.entries(value as Record<string, unknown>)
          .slice(0, 5)
          .map(([nestedKey, nestedValue]) => `${nestedKey}=${stringifyCompact(nestedValue)}`)
          .join(', ');
        return `- ${key}: ${nested || '(object)'}`;
      }
      return `- ${key}: ${truncateValueText(stringifyCompact(value), 96)}`;
    });
    if (entries.length > maxLines) {
      rows.push(`... ${entries.length - maxLines} more`);
    }
    return [`Notifications: ${entries.length} type(s)`, ...rows];
  }
  return [`Notifications: ${truncateValueText(stringifyCompact(notificationEvents), 120)}`];
}

function extractListIdentityFromDetail(detail: NodeDetail | undefined): {
  manufacturer: string | null;
  product: string | null;
} {
  if (!detail?.state) {
    return { manufacturer: null, product: null };
  }
  const state = detail.state;
  const deviceConfig = asRecord(state.deviceConfig);
  const manufacturer =
    asNonEmptyString(state.manufacturer) ?? asNonEmptyString(deviceConfig?.manufacturer) ?? null;
  const product =
    asNonEmptyString(state.product) ??
    asNonEmptyString(state.productLabel) ??
    asNonEmptyString(deviceConfig?.label) ??
    null;
  return { manufacturer, product };
}

function formatNodeListLabel(options: {
  name: string | null;
  manufacturer: string | null;
  product: string | null;
}): string {
  const name = options.name ?? '(unnamed)';
  const identityParts = [options.manufacturer, options.product].filter(
    (part): part is string => part !== null && part.length > 0,
  );
  if (identityParts.length === 0) return name;
  return `${name} (${identityParts.join(' / ')})`;
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
      return [`Neighbors: ${values.length}${values.length > 0 ? ' (n)' : ''}`];
    }
    const rows = values.map((value, index) => {
      const neighborId = parseNodeId(neighbors[index]);
      if (neighborId === undefined) {
        return `- Node ${value}`;
      }
      const summary = options.neighborLookup?.get(neighborId);
      if (!summary) {
        return `- Node ${value}`;
      }
      const name = truncateValueText(summary.name ?? '(unnamed)', 28);
      const manufacturer = truncateValueText(summary.manufacturer ?? 'unknown', 24);
      const product = truncateValueText(summary.product ?? 'unknown', 24);
      const linkQuality = formatNeighborLinkQuality(neighborId, route);
      return `- Node ${value} | ${name} | ${manufacturer} | ${product} | ${linkQuality}`;
    });
    return [
      `Neighbors: ${values.length}${values.length > 0 ? ' (n)' : ''}`,
      formatLifelineRouteSummary(route),
      values.length > 0 ? 'Neighbor Nodes:' : 'Neighbor Nodes: (none)',
      ...rows,
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
  const semantic = annotateNodeValue(entry);
  const detailBits = [
    `id ${identifier}`,
    metaBits ? `meta ${metaBits}` : null,
    semantic.capabilityId
      ? `maps ${semantic.capabilityId}${semantic.confidence ? ` (${semantic.confidence})` : ''}`
      : null,
    errors ? `errors ${errors}` : null,
  ].filter((bit): bit is string => bit !== null);

  return [
    `- ${truncateValueText(label, 34)}: ${truncateValueText(mappedValueText + unit, 56)}`,
    `  ${detailBits.join(' | ')}`,
  ].join('\n');
}

function formatNodeValueCompactLine(entry: NodeValueDetail): string {
  if (entry._error !== undefined) {
    return `- [static] value-error: ${truncateValueText(stringifyCompact(entry._error))}`;
  }

  const valueId = entry.valueId;
  if (!valueId) return '- [static] value: <missing valueId>';

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
  return `- [static] ${truncateValueText(label, 28)}: ${truncateValueText(mappedValueText + unit, 48)}`;
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
  const status = describeNodeStatus(state.status);
  const manufacturer = formatManufacturerLabel(state);
  const product = formatProductLabel(state);
  const name = String(state.name ?? '');
  const neighborLines = renderNeighborLines(detail.neighbors, {
    expanded: options.neighborsExpanded === true,
    neighborLookup: options.neighborLookup,
    lifelineRoute: detail.lifelineRoute,
  });
  const neighborsExpanded = options.neighborsExpanded === true;
  const neighborsDisclosure = neighborsExpanded ? '▼' : '▶';
  const neighborHeaderLine =
    neighborLines[0]?.startsWith('Neighbors:') === true ? neighborLines[0] : null;
  const neighborSectionTitle =
    neighborHeaderLine === null
      ? `${neighborsDisclosure} Neighbors`
      : `${neighborsDisclosure} ${neighborHeaderLine.replace(/^Neighbors:\s*/, 'Neighbors ')}`;
  const neighborBodyLines = neighborHeaderLine ? neighborLines.slice(1) : neighborLines;
  const notificationLines = renderNotificationLines(detail.notificationEvents);
  const values = detail.values ?? [];
  const sortedValues = sortValuesByRelevance(values);
  const valuesExpanded = options.valuesExpanded === true;
  const valuesDisclosure = valuesExpanded ? '▼' : '▶';
  const interactiveValues = sortedValues.filter(
    (entry) => classifyNodeValueGroup(entry) === 'interactive',
  );
  const staticValues = sortedValues.filter((entry) => classifyNodeValueGroup(entry) === 'static');
  const previewRows = (valuesExpanded ? interactiveValues : interactiveValues.slice(0, 3)).map(
    (entry) => formatNodeValueLine(entry),
  );
  const staticRows = (valuesExpanded ? staticValues : staticValues.slice(0, 2)).map((entry) =>
    formatNodeValueCompactLine(entry),
  );
  const valuesSectionTitle = `${valuesDisclosure} Values ${values.length}${values.length > 0 ? ' (z)' : ''}`;

  return [
    'Identity',
    `Name: ${name || '(unnamed)'}`,
    `Ready: ${ready}  Status: ${status}`,
    `Manufacturer: ${manufacturer}`,
    `Product: ${product}`,
    '',
    'Telemetry',
    ...notificationLines,
    '',
    neighborSectionTitle,
    ...neighborBodyLines,
    '',
    valuesSectionTitle,
    interactiveValues.length > 0
      ? valuesExpanded
        ? `Live/Control values: ${interactiveValues.length}`
        : 'Top Values (top relevant first):'
      : null,
    ...previewRows,
    !valuesExpanded && interactiveValues.length > previewRows.length
      ? valuesExpanded
        ? null
        : `... ${interactiveValues.length - previewRows.length} more live/control values (z)`
      : null,
    staticValues.length > 0 ? `Static/Diagnostic values: ${staticValues.length}` : null,
    ...staticRows,
    !valuesExpanded && staticValues.length > staticRows.length
      ? `... ${staticValues.length - staticRows.length} more static values (z)`
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

type PanelIntent =
  | { type: 'noop' }
  | { type: 'quit' }
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'move-page-up' }
  | { type: 'move-page-down' }
  | { type: 'move-first' }
  | { type: 'move-last' }
  | { type: 'switch-pane' }
  | { type: 'start-filter' }
  | { type: 'open' }
  | { type: 'refresh' }
  | { type: 'inspect' }
  | { type: 'validate' }
  | { type: 'simulate'; dryRun: boolean }
  | { type: 'scaffold-preview' }
  | { type: 'scaffold-write' }
  | { type: 'manifest-add' }
  | { type: 'status' }
  | { type: 'log' }
  | { type: 'cancel-operation' }
  | { type: 'toggle-neighbors' }
  | { type: 'toggle-values' }
  | { type: 'toggle-bottom-pane-size' }
  | { type: 'help' };

function keypressToPanelIntent(
  char: string,
  key: { name?: string; ctrl?: boolean; sequence?: string },
): PanelIntent {
  const name = (key.name ?? '').toLowerCase();
  const sequence = (key.sequence ?? '').toLowerCase();
  const charLower = (char ?? '').toLowerCase();
  const token = charLower || sequence || name;

  if (key.ctrl && (name === 'c' || charLower === 'c')) return { type: 'quit' };
  if (name === 'q' || token === 'q' || name === 'escape') return { type: 'quit' };
  if (name === 'up' || token === 'k') return { type: 'move-up' };
  if (name === 'down' || token === 'j') return { type: 'move-down' };
  if (name === 'pageup') return { type: 'move-page-up' };
  if (name === 'pagedown') return { type: 'move-page-down' };
  if (name === 'home') return { type: 'move-first' };
  if (name === 'end') return { type: 'move-last' };
  if (name === 'tab') return { type: 'switch-pane' };
  if (token === '/' || name === 'slash') return { type: 'start-filter' };
  if (name === 'return' || name === 'enter') return { type: 'open' };
  if (name === 'r' || token === 'r') return { type: 'refresh' };
  if (name === 'i' || token === 'i') return { type: 'inspect' };
  if (name === 'v' || token === 'v') return { type: 'validate' };
  if (name === 'm' || token === 'm') return { type: 'simulate', dryRun: false };
  if (name === 'd' || token === 'd') return { type: 'simulate', dryRun: true };
  if (name === 'p' || token === 'p') return { type: 'scaffold-preview' };
  if (char === 'W') return { type: 'scaffold-write' };
  if (char === 'A') return { type: 'manifest-add' };
  if (name === 's' || token === 's') return { type: 'status' };
  if (name === 'l' || token === 'l') return { type: 'log' };
  if (name === 'c' || token === 'c') return { type: 'cancel-operation' };
  if (name === 'n' || token === 'n') return { type: 'toggle-neighbors' };
  if (name === 'z' || token === 'z') return { type: 'toggle-values' };
  if (name === 'b' || token === 'b') return { type: 'toggle-bottom-pane-size' };
  if (name === 'h' || name === '?' || char === '?') return { type: 'help' };
  return { type: 'noop' };
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
  const canHydrateListIdentity =
    typeof (nodesPresenter as { showNodeDetail?: unknown }).showNodeDetail === 'function';
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
  let bottomCompact = true;
  let isClosing = false;
  let pendingConfirm: PendingConfirm | null = null;
  let activeOperation: ActiveOperation | null = null;
  let nextOperationId = 1;
  let listIdentityHydrationInFlight: Promise<void> | null = null;
  const listIdentityHydrationPendingNodeIds = new Set<number>();
  const listIdentityHydrationAttemptedNodeIds = new Set<number>();

  const OPERATION_TIMEOUT_MS = Math.max(1, deps.panelOperationTimeoutMs ?? 45_000);
  const WRITE_CONFIRM_WINDOW_MS = 6_000;

  const screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    autoPadding: false,
    fullUnicode: true,
    terminal: 'xterm-256color',
    input: input as any,
    output: output as any,
  });
  screen.title = `ZWJS ${config.mode}`;

  const headerPane = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: false,
  });
  const leftPane = blessed.list({
    parent: screen,
    top: 1,
    left: 0,
    width: '35%',
    height: '60%',
    border: 'line',
    tags: false,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: false,
    vi: false,
    style: {
      selected: {
        inverse: true,
      },
    },
  });
  const rightPane = blessed.box({
    parent: screen,
    top: 1,
    left: '35%',
    width: '65%',
    height: '60%',
    border: 'line',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    wrap: false,
  });
  const bottomPane = blessed.box({
    parent: screen,
    top: '60%',
    left: 0,
    width: '100%',
    height: '40%',
    tags: false,
    border: 'line',
    scrollable: true,
    alwaysScroll: true,
  });
  const footerPane = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: false,
  });

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
      const snapshot = nodesPresenter.getState();
      const items = snapshot.explorer.items;
      const detailCache = snapshot.nodeDetailCache ?? {};
      const filtered = items.filter((node) => {
        if (!filterQuery) return true;
        const detailIdentity = extractListIdentityFromDetail(detailCache[node.nodeId]);
        const manufacturer = node.manufacturer ?? detailIdentity.manufacturer;
        const product = node.product ?? detailIdentity.product;
        const haystack = [
          String(node.nodeId),
          normalizeText(node.name),
          normalizeText(product),
          normalizeText(manufacturer),
          normalizeText(node.location),
        ].join(' ');
        return haystack.includes(filterQuery.toLowerCase());
      });
      return filtered.map((node) => {
        const detailIdentity = extractListIdentityFromDetail(detailCache[node.nodeId]);
        const manufacturer = node.manufacturer ?? detailIdentity.manufacturer;
        const product = node.product ?? detailIdentity.product;
        return {
          kind: 'node' as const,
          key: `node:${node.nodeId}`,
          rowId: node.nodeId,
          label: truncateLabel(
            formatNodeListLabel({
              name: node.name,
              manufacturer,
              product,
            }),
            96,
          ),
          nodeId: node.nodeId,
        };
      });
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

  function getPanelRows(): number {
    const rows =
      typeof (screen as { rows?: unknown }).rows === 'number'
        ? (screen as { rows: number }).rows
        : output.rows;
    return Math.max(18, rows ?? 30);
  }

  function getPanelCols(): number {
    const cols =
      typeof (screen as { cols?: unknown }).cols === 'number'
        ? (screen as { cols: number }).cols
        : output.columns;
    return Math.max(80, cols ?? 120);
  }

  function moveSelectionByPage(multiplier: number): void {
    const pageSize = getLeftPaneCapacity(getPanelRows(), bottomCompact);
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

  function nodeNeedsListIdentity(nodeId: number): boolean {
    const snapshot = nodesPresenter.getState();
    const item = snapshot.explorer.items.find((entry) => entry.nodeId === nodeId);
    const detailIdentity = extractListIdentityFromDetail(snapshot.nodeDetailCache?.[nodeId]);
    const manufacturer = item?.manufacturer ?? detailIdentity.manufacturer;
    const product = item?.product ?? detailIdentity.product;
    return !(manufacturer && product);
  }

  function requestVisibleListIdentityHydration(): void {
    if (!isNodesMode || !canHydrateListIdentity || isClosing) return;
    clampSelection();
    const entries = getListEntries().filter(
      (entry): entry is NodeListEntry => entry.kind === 'node',
    );
    if (entries.length === 0) return;
    const capacity = getLeftPaneCapacity(getPanelRows(), bottomCompact);
    const windowed = getVisibleWindow(entries, selectedIndex, capacity);
    for (const entry of windowed.visible) {
      if (entry.nodeId === currentNodeDetail?.nodeId) continue;
      if (listIdentityHydrationAttemptedNodeIds.has(entry.nodeId)) continue;
      if (!nodeNeedsListIdentity(entry.nodeId)) {
        listIdentityHydrationAttemptedNodeIds.add(entry.nodeId);
        continue;
      }
      listIdentityHydrationPendingNodeIds.add(entry.nodeId);
    }
    ensureListIdentityHydrationRunner();
  }

  function ensureListIdentityHydrationRunner(): void {
    if (!isNodesMode || !canHydrateListIdentity || isClosing) return;
    if (listIdentityHydrationInFlight || listIdentityHydrationPendingNodeIds.size === 0) return;

    listIdentityHydrationInFlight = (async () => {
      while (!isClosing && listIdentityHydrationPendingNodeIds.size > 0) {
        const iterator = listIdentityHydrationPendingNodeIds.values().next();
        if (iterator.done) break;
        const nodeId = iterator.value;
        listIdentityHydrationPendingNodeIds.delete(nodeId);
        if (listIdentityHydrationAttemptedNodeIds.has(nodeId)) continue;
        listIdentityHydrationAttemptedNodeIds.add(nodeId);
        if (!nodeNeedsListIdentity(nodeId)) continue;
        try {
          await nodesPresenter.showNodeDetail(nodeId, {
            selectNode: false,
            includeValues: 'none',
            maxValues: 1,
            includeLinkQuality: false,
          });
          if (!isClosing) {
            renderFrame();
          }
        } catch {
          // Best effort enrichment for list display.
        }
      }
    })().finally(() => {
      listIdentityHydrationInFlight = null;
      if (!isClosing && listIdentityHydrationPendingNodeIds.size > 0) {
        ensureListIdentityHydrationRunner();
      }
    });
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
    const width = getPanelCols();
    const height = getPanelRows();
    const paneHeights = getPanelContentHeightsWithMode(height, bottomCompact);
    const topPaneOuterHeight = paneHeights.topContentHeight + 2;
    const bottomPaneOuterHeight = bottomCompact ? 1 : paneHeights.bottomContentHeight + 2;
    const leftWidth = Math.max(28, Math.floor(width * 0.35));
    const rightWidth = Math.max(24, width - leftWidth);
    const rightContentWidth = Math.max(1, rightWidth - 2);

    headerPane.top = 0;
    headerPane.left = 0;
    headerPane.width = width;
    headerPane.height = 1;

    leftPane.top = 1;
    leftPane.left = 0;
    leftPane.width = leftWidth;
    leftPane.height = topPaneOuterHeight;

    rightPane.top = 1;
    rightPane.left = leftWidth;
    rightPane.width = rightWidth;
    rightPane.height = topPaneOuterHeight;

    bottomPane.top = 1 + topPaneOuterHeight;
    bottomPane.left = 0;
    bottomPane.width = width;
    bottomPane.height = bottomPaneOuterHeight;
    (bottomPane as unknown as { border: unknown }).border = bottomCompact ? null : 'line';
    bottomPane.style = {
      ...(bottomPane.style ?? {}),
      border: { fg: focusedPane === 'bottom' ? 'cyan' : 'gray' },
    };
    bottomPane.setLabel(bottomCompact ? '' : ' Output / Run ');

    footerPane.top = height - 1;
    footerPane.left = 0;
    footerPane.width = width;
    footerPane.height = 1;

    leftPane.style = {
      ...(leftPane.style ?? {}),
      border: { fg: focusedPane === 'left' ? 'cyan' : 'gray' },
    };
    rightPane.style = {
      ...(rightPane.style ?? {}),
      border: { fg: focusedPane === 'right' ? 'cyan' : 'gray' },
    };

    const entries = getListEntries();
    const totalItems = entries.length;
    const listCapacity = getLeftPaneCapacity(height, bottomCompact);
    const windowed = getVisibleWindow(entries, selectedIndex, listCapacity);
    const listItems = entries.map((entry) => formatListRow(entry.rowId, entry.label));
    const listLines = windowed.visible.map((entry) => formatListRow(entry.rowId, entry.label));
    const rangeSuffix =
      totalItems > listCapacity
        ? ` [${windowed.start + 1}-${windowed.start + windowed.visible.length}/${totalItems}]`
        : totalItems > 0
          ? ` [1-${totalItems}/${totalItems}]`
          : ' [0/0]';
    const filterSuffix = filterQuery ? ` | filter="${filterQuery}"` : '';
    const leftTitle = `${isNodesMode ? 'Nodes' : 'Rules'}${rangeSuffix}${filterSuffix}`;

    const rightAllLines = splitLines(rightText);
    const rightVisibleCapacity = Math.max(1, paneHeights.topContentHeight);
    const rightMaxScroll = Math.max(0, rightAllLines.length - rightVisibleCapacity);
    rightScroll = Math.min(rightMaxScroll, Math.max(0, rightScroll));
    const rightWindowStart = rightAllLines.length > 0 ? rightScroll + 1 : 0;
    const rightWindowEnd = Math.min(rightAllLines.length, rightScroll + rightVisibleCapacity);
    const rightRange =
      rightAllLines.length > rightVisibleCapacity
        ? ` [${rightWindowStart}-${rightWindowEnd}/${rightAllLines.length}]`
        : '';
    const rightTitle =
      isNodesMode && currentNodeDetail
        ? `Node ${currentNodeDetail.nodeId} Detail${rightRange}`
        : `Detail${rightRange}`;

    const bottomAllLines = splitLines(bottomText);
    const bottomVisibleCapacity = Math.max(1, paneHeights.bottomContentHeight);
    const bottomMaxScroll = Math.max(0, bottomAllLines.length - bottomVisibleCapacity);
    bottomScroll = Math.min(bottomMaxScroll, Math.max(0, bottomScroll));
    const bottomWindowStart = bottomAllLines.length > 0 ? bottomScroll + 1 : 0;
    const bottomWindowEnd = Math.min(bottomAllLines.length, bottomScroll + bottomVisibleCapacity);
    const bottomRange =
      bottomAllLines.length > bottomVisibleCapacity
        ? ` [${bottomWindowStart}-${bottomWindowEnd}/${bottomAllLines.length}]`
        : '';
    const bottomTitle = bottomCompact ? '' : `Output / Run${bottomRange}`;

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

    requestVisibleListIdentityHydration();

    headerPane.setContent(header);
    footerPane.setContent(footer);
    leftPane.setLabel(` ${leftTitle} `);
    leftPane.setItems(listItems);
    if (entries.length > 0) {
      leftPane.select(selectedIndex);
    }
    rightPane.setLabel(` ${rightTitle} `);
    rightPane.setContent(formatDetailLinesForDisplay(rightAllLines, rightContentWidth));
    rightPane.setScroll(rightScroll);
    if (!bottomCompact && bottomTitle) {
      bottomPane.setLabel(` ${bottomTitle} `);
    }
    if (bottomCompact) {
      const compactLine = bottomAllLines[bottomScroll] ?? '';
      bottomPane.setContent(compactLine);
      bottomPane.setScroll(0);
    } else {
      bottomPane.setContent(bottomAllLines.join('\n'));
      bottomPane.setScroll(bottomScroll);
    }

    deps.onPanelRender?.({
      header,
      footer,
      leftTitle,
      leftLines: listLines,
      rightTitle,
      rightLines: rightAllLines.slice(rightScroll, rightScroll + rightVisibleCapacity),
      bottomTitle,
      bottomLines: bottomCompact
        ? [bottomAllLines[bottomScroll] ?? '']
        : bottomAllLines.slice(bottomScroll, bottomScroll + bottomVisibleCapacity),
      focusedPane,
      bottomCompact,
    });

    screen.render();
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
        const paneHeights = getPanelContentHeightsWithMode(getPanelRows(), bottomCompact);
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
        const paneHeights = getPanelContentHeightsWithMode(getPanelRows(), bottomCompact);
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

    if (input.isTTY && typeof input.setRawMode === 'function') {
      input.setRawMode(true);
    }
    if (typeof input.resume === 'function') {
      input.resume();
    }
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
        const parsedIntent = keypressToPanelIntent(char, key);
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
          if (key.ctrl && name === 'c') {
            queueIntent({ type: 'quit' });
            return;
          }
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

      const cleanup = () => {
        screen.off('resize', onResize);
        screen.off('keypress', onKeypress);
        if (input.isTTY && typeof input.setRawMode === 'function') {
          input.setRawMode(false);
        }
        if (typeof input.pause === 'function') {
          input.pause();
        }
        screen.destroy();
        output.write('\n');
      };

      screen.on('keypress', onKeypress);
      screen.on('resize', onResize);
    });
  } finally {
    if (isNodesMode) {
      await nodesPresenter.disconnect();
    }
  }
}

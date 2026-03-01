import { createInterface } from 'node:readline/promises';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';
import blessed from 'neo-blessed';

import type {
  ConnectedSessionConfig,
  DraftEditorState,
  IncludeValuesMode,
  NodeDetail,
  NodeValueProfileAttribution,
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
import { ExplorerPresenter, type DraftValidationVocabulary } from './presenter/explorer-presenter';
import {
  ExplorerSessionPresenter,
  type ExplorerSessionChildPresenterLike,
} from './presenter/explorer-session-presenter';
import {
  PanelChromePresenter,
  type PanelChromeConfirmAction,
  type PanelChromeFocus,
  type PanelChromeMode,
} from './presenter/panel-chrome-presenter';
import { PanelLayoutPresenter } from './presenter/panel-layout-presenter';
import { PanelOutputPresenter } from './presenter/panel-output-presenter';
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
import {
  FALLBACK_HOMEY_CLASS_OPTIONS,
  loadHomeyAuthoringVocabulary,
} from './service/homey-authoring-vocabulary';
import { parseShellCommand } from './view/command-parser';
import {
  annotateNodeValue,
  classifyNodeValueSection,
  type ValueSemanticSection,
  semanticCapabilityScore,
} from './view/value-semantics';
import { COMMAND_CLASS_RELEVANCE_SCORES } from './view/value-semantics-policy';
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
    '               [--manifest-file <rules/manifest.json>] [--vocabulary-file <rules/homey-authoring-vocabulary.json>] [--ui panel|shell]',
    '  compiler-tui --rules-only [--manifest-file <rules/manifest.json>]',
    '               [--url ws://host:port] [--token <bearer>] [--schema-version 0] [--vocabulary-file <rules/homey-authoring-vocabulary.json>] [--ui panel|shell]',
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
      vocabularyFile: flags.get('--vocabulary-file') ?? 'rules/homey-authoring-vocabulary.json',
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
  panelChromePresenter?: PanelChromePresenter;
  panelLayoutPresenter?: PanelLayoutPresenter;
  panelOutputPresenter?: PanelOutputPresenter;
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

interface ShellModeAdapter {
  readonly mode: SessionConfig['mode'];
  readonly prompt: string;
  helpText(): string;
  initialize(config: SessionConfig): Promise<void>;
  listText(): string;
  refreshText(): Promise<string>;
  showText(id: number): Promise<string>;
  selectSignatureText(options: {
    signature?: string;
    fromNodeId?: number;
    fromRuleIndex?: number;
  }): string;
  inspectText(options?: { manifestFile?: string }): Promise<string>;
  validateText(options?: { manifestFile?: string }): Promise<string>;
  simulateText(options?: {
    manifestFile?: string;
    dryRun?: boolean;
    skipInspect?: boolean;
    inspectFormat?: string;
  }): Promise<string>;
  scaffoldPreviewText(options?: { productName?: string; homeyClass?: string }): string;
  writeScaffold(filePath: string | undefined, confirm: boolean): string;
  addManifest(options?: { filePath?: string; manifestFile?: string; confirm?: boolean }): {
    manifestFile: string;
    entryFilePath: string;
    updated: boolean;
  };
  statusText(): string;
  logText(limit?: number): string;
  teardown(): Promise<void>;
}

function createShellModeAdapter(
  config: SessionConfig,
  nodesPresenter: ExplorerPresenter,
  rulesPresenter: RulesPresenter,
): ShellModeAdapter {
  if (config.mode === 'nodes') {
    return {
      mode: 'nodes',
      prompt: 'zwjs-explorer> ',
      helpText: () => renderShellHelp(),
      initialize: async (sessionConfig) => {
        await nodesPresenter.connect(sessionConfig as ConnectedSessionConfig);
      },
      listText: () => renderNodeList(nodesPresenter.getState().explorer.items),
      refreshText: async () => renderNodeList(await nodesPresenter.refreshNodes()),
      showText: async (id) => renderNodeDetail(await nodesPresenter.showNodeDetail(id)),
      selectSignatureText: (options) => {
        if (options.fromRuleIndex !== undefined) {
          throw new Error('--from-rule is not supported in nodes mode');
        }
        if (options.signature) {
          nodesPresenter.selectSignature(options.signature);
          return renderSignatureSelected(options.signature);
        }
        return renderSignatureSelected(nodesPresenter.selectSignatureFromNode(options.fromNodeId));
      },
      inspectText: async (options = {}) =>
        renderInspectSummary(await nodesPresenter.inspectSelectedSignature(options)),
      validateText: async (options = {}) =>
        renderValidationSummary(await nodesPresenter.validateSelectedSignature(options)),
      simulateText: async (options = {}) =>
        renderSimulationSummary(await nodesPresenter.simulateSelectedSignature(options)),
      scaffoldPreviewText: (options = {}) =>
        renderScaffoldDraft(nodesPresenter.createScaffoldFromSignature(options)),
      writeScaffold: (filePath, confirm) =>
        nodesPresenter.writeScaffoldDraft(filePath, { confirm }),
      addManifest: (options = {}) => nodesPresenter.addDraftToManifest(options),
      statusText: () => renderStatusSnapshot(nodesPresenter.getStatusSnapshot()),
      logText: (limit) => renderRunLog(nodesPresenter.getRunLog(limit)),
      teardown: async () => {
        await nodesPresenter.disconnect();
      },
    };
  }

  return {
    mode: 'rules',
    prompt: 'zwjs-rules> ',
    helpText: () => renderRulesShellHelp(),
    initialize: async (sessionConfig) => {
      rulesPresenter.initialize(sessionConfig);
    },
    listText: () => renderRuleList(rulesPresenter.getRules()),
    refreshText: async () => renderRuleList(rulesPresenter.refreshRules()),
    showText: async (id) => renderRuleDetail(rulesPresenter.showRuleDetail(id)),
    selectSignatureText: (options) => {
      if (options.fromNodeId !== undefined) {
        throw new Error('--from-node is not supported in rules mode');
      }
      if (options.signature) {
        rulesPresenter.selectSignature(options.signature);
        return renderSignatureSelected(options.signature);
      }
      return renderSignatureSelected(rulesPresenter.selectSignatureFromRule(options.fromRuleIndex));
    },
    inspectText: async (options = {}) =>
      renderInspectSummary(await rulesPresenter.inspectSelectedSignature(options)),
    validateText: async (options = {}) =>
      renderValidationSummary(await rulesPresenter.validateSelectedSignature(options)),
    simulateText: async (options = {}) =>
      renderSimulationSummary(await rulesPresenter.simulateSelectedSignature(options)),
    scaffoldPreviewText: (options = {}) =>
      renderScaffoldDraft(rulesPresenter.createScaffoldFromSignature(options)),
    writeScaffold: (filePath, confirm) => rulesPresenter.writeScaffoldDraft(filePath, { confirm }),
    addManifest: (options = {}) => rulesPresenter.addDraftToManifest(options),
    statusText: () => renderStatusSnapshot(rulesPresenter.getStatusSnapshot()),
    logText: (limit) => renderRunLog(rulesPresenter.getRunLog(limit)),
    teardown: async () => {},
  };
}

interface DraftEditorSurface {
  getDraftEditorState?: () => DraftEditorState | undefined;
  startDraftEdit?: () => DraftEditorState;
  setDraftEditorSelectedField?: (path: string) => DraftEditorState;
  setDraftEditorField?: (path: string, value: unknown) => DraftEditorState;
  setDraftEditorCapabilityField?: (
    index: number,
    field: 'capabilityId' | 'directionality',
    value: unknown,
  ) => DraftEditorState;
  setDraftEditorCapabilityMappingField?: (
    index: number,
    path: string,
    value: unknown,
  ) => DraftEditorState;
  commitDraftEditorState?: () => void;
  addDraftEditorCapability?: () => DraftEditorState;
  cloneDraftEditorCapability?: (index?: number) => DraftEditorState;
  removeDraftEditorCapability?: (index?: number) => DraftEditorState;
  moveDraftEditorCapability?: (index: number, delta: -1 | 1) => DraftEditorState;
  validateDraftEditorState?: () => DraftEditorState;
}

interface PanelModeAdapter {
  readonly mode: SessionConfig['mode'];
  readonly draftSurface: DraftEditorSurface;
  initialize(config: SessionConfig): Promise<void>;
  teardown(): Promise<void>;
  ensureSelectedSignature(options: {
    selectedNodeId?: number;
    selectedRuleIndex?: number;
    updateNodeDetail: (detail: NodeDetail) => void;
  }): Promise<string>;
  inspectText(options: { manifestFile?: string; nodeId?: number }): Promise<string>;
  validateText(options: { manifestFile?: string; nodeId?: number }): Promise<string>;
  simulateText(options: {
    manifestFile?: string;
    nodeId?: number;
    dryRun?: boolean;
    skipInspect?: boolean;
    inspectFormat?: string;
  }): Promise<string>;
  scaffoldPreviewText(options?: { productName?: string; homeyClass?: string }): string;
  writeScaffold(confirm: boolean, filePath?: string): string;
  addManifest(options?: { filePath?: string; manifestFile?: string; confirm?: boolean }): {
    manifestFile: string;
    entryFilePath: string;
    updated: boolean;
  };
  statusText(): string;
  logText(limit?: number): string;
}

function createPanelModeAdapter(
  config: SessionConfig,
  nodesPresenter: ExplorerPresenter,
  rulesPresenter: RulesPresenter,
): PanelModeAdapter {
  if (config.mode === 'nodes') {
    return {
      mode: 'nodes',
      draftSurface: nodesPresenter as DraftEditorSurface,
      initialize: async (sessionConfig) => {
        await nodesPresenter.connect(sessionConfig as ConnectedSessionConfig);
      },
      teardown: async () => {
        await nodesPresenter.disconnect();
      },
      ensureSelectedSignature: async (options) => {
        const nodeId = options.selectedNodeId;
        if (!nodeId) {
          throw new Error('No node selected');
        }
        const detail = await nodesPresenter.showNodeDetail(nodeId);
        options.updateNodeDetail(detail);
        return nodesPresenter.selectSignatureFromNode(nodeId);
      },
      inspectText: async (options) =>
        renderInspectSummary(
          await nodesPresenter.inspectSelectedSignature({
            manifestFile: options.manifestFile,
            nodeId: options.nodeId,
          }),
        ),
      validateText: async (options) =>
        renderPanelValidationSummary(
          await nodesPresenter.validateSelectedSignature({
            manifestFile: options.manifestFile,
            nodeId: options.nodeId,
          }),
        ),
      simulateText: async (options) =>
        renderPanelSimulationSummary(
          await nodesPresenter.simulateSelectedSignature({
            manifestFile: options.manifestFile,
            nodeId: options.nodeId,
            dryRun: options.dryRun,
            skipInspect: options.skipInspect,
            inspectFormat: options.inspectFormat,
          }),
        ),
      scaffoldPreviewText: (options = {}) =>
        renderScaffoldDraft(nodesPresenter.createScaffoldFromSignature(options)),
      writeScaffold: (confirm, filePath) =>
        nodesPresenter.writeScaffoldDraft(filePath, { confirm }),
      addManifest: (options = {}) => nodesPresenter.addDraftToManifest(options),
      statusText: () => renderStatusSnapshot(nodesPresenter.getStatusSnapshot()),
      logText: (limit) => renderRunLog(nodesPresenter.getRunLog(limit)),
    };
  }

  return {
    mode: 'rules',
    draftSurface: rulesPresenter as DraftEditorSurface,
    initialize: async (sessionConfig) => {
      rulesPresenter.initialize(sessionConfig);
    },
    teardown: async () => {},
    ensureSelectedSignature: async (options) => {
      const ruleIndex = options.selectedRuleIndex;
      if (!ruleIndex) {
        throw new Error('No rule selected');
      }
      return rulesPresenter.selectSignatureFromRule(ruleIndex);
    },
    inspectText: async (options) =>
      renderInspectSummary(
        await rulesPresenter.inspectSelectedSignature({
          manifestFile: options.manifestFile,
          nodeId: options.nodeId,
        }),
      ),
    validateText: async (options) =>
      renderPanelValidationSummary(
        await rulesPresenter.validateSelectedSignature({
          manifestFile: options.manifestFile,
          nodeId: options.nodeId,
        }),
      ),
    simulateText: async (options) =>
      renderPanelSimulationSummary(
        await rulesPresenter.simulateSelectedSignature({
          manifestFile: options.manifestFile,
          nodeId: options.nodeId,
          dryRun: options.dryRun,
          skipInspect: options.skipInspect,
          inspectFormat: options.inspectFormat,
        }),
      ),
    scaffoldPreviewText: (options = {}) =>
      renderScaffoldDraft(rulesPresenter.createScaffoldFromSignature(options)),
    writeScaffold: (confirm, filePath) => rulesPresenter.writeScaffoldDraft(filePath, { confirm }),
    addManifest: (options = {}) => rulesPresenter.addDraftToManifest(options),
    statusText: () => renderStatusSnapshot(rulesPresenter.getStatusSnapshot()),
    logText: (limit) => renderRunLog(rulesPresenter.getRunLog(limit)),
  };
}

export async function runApp(
  config: SessionConfig,
  io: LoggerLike = console,
  deps: RunAppDeps = {},
): Promise<void> {
  const authoringVocabulary = loadHomeyAuthoringVocabulary(
    config.vocabularyFile ?? 'rules/homey-authoring-vocabulary.json',
  );
  configureDraftEditorVocabulary(authoringVocabulary);
  const draftValidationVocabulary = buildDraftValidationVocabulary(authoringVocabulary);
  if (authoringVocabulary.warning) {
    io.log(`Vocabulary: ${authoringVocabulary.warning}`);
  } else {
    io.log(
      `Vocabulary: loaded ${authoringVocabulary.homeyClasses.length} classes, ${authoringVocabulary.capabilityIds.length} capabilities from ${authoringVocabulary.filePath}`,
    );
  }

  const explorerService = deps.explorerService ?? new ZwjsExplorerServiceImpl();
  const curationService = deps.curationService ?? new CompilerCurationServiceImpl();
  const fileService = deps.fileService ?? new WorkspaceFileServiceImpl();
  const explorerChildPresenter =
    deps.explorerChildPresenter ?? new ExplorerSessionPresenter(explorerService);
  const curationChildPresenter =
    deps.curationChildPresenter ?? new CurationWorkflowPresenter(curationService, fileService);
  const nodesPresenter =
    deps.presenter ??
    new ExplorerPresenter(
      {
        explorer: explorerChildPresenter,
        curation: curationChildPresenter,
      },
      {
        draftVocabulary: draftValidationVocabulary,
      },
    );
  const rulesPresenter =
    deps.rulesPresenter ??
    new RulesPresenter(curationChildPresenter, fileService, {
      draftVocabulary: draftValidationVocabulary,
    });
  const createInterfaceImpl = deps.createInterfaceImpl ?? createInterface;
  const input = deps.stdin ?? defaultStdin;
  const output = deps.stdout ?? defaultStdout;
  const modeAdapter = createShellModeAdapter(config, nodesPresenter, rulesPresenter);

  const readline = createInterfaceImpl({
    input,
    output,
    terminal: true,
  });

  try {
    await modeAdapter.initialize(config);
    io.log(modeAdapter.helpText());
    io.log(modeAdapter.listText());

    if (modeAdapter.mode === 'nodes' && config.startNode !== undefined) {
      io.log(await modeAdapter.showText(config.startNode));
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const line = await readline.question(modeAdapter.prompt);
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
          io.log(modeAdapter.helpText());
          continue;
        }
        if (command.type === 'list') {
          io.log(modeAdapter.listText());
          continue;
        }
        if (command.type === 'refresh') {
          io.log(await modeAdapter.refreshText());
          continue;
        }
        if (command.type === 'show') {
          io.log(await modeAdapter.showText(command.nodeId));
          continue;
        }
        if (command.type === 'signature') {
          io.log(
            modeAdapter.selectSignatureText({
              signature: command.signature,
              fromNodeId: command.fromNodeId,
              fromRuleIndex: command.fromRuleIndex,
            }),
          );
          continue;
        }
        if (command.type === 'inspect') {
          io.log(
            await modeAdapter.inspectText({
              manifestFile: command.manifestFile,
            }),
          );
          continue;
        }
        if (command.type === 'validate') {
          io.log(
            await modeAdapter.validateText({
              manifestFile: command.manifestFile,
            }),
          );
          continue;
        }
        if (command.type === 'simulate') {
          io.log(
            await modeAdapter.simulateText({
              manifestFile: command.manifestFile,
              dryRun: command.dryRun,
              skipInspect: command.skipInspect,
              inspectFormat: command.inspectFormat,
            }),
          );
          continue;
        }
        if (command.type === 'scaffold-preview') {
          io.log(
            modeAdapter.scaffoldPreviewText({
              productName: command.productName,
              homeyClass: command.homeyClass,
            }),
          );
          continue;
        }
        if (command.type === 'scaffold-write') {
          const writtenPath = modeAdapter.writeScaffold(command.filePath, command.force);
          io.log(`Scaffold written: ${writtenPath}`);
          continue;
        }
        if (command.type === 'manifest-add') {
          const result = modeAdapter.addManifest({
            filePath: command.filePath,
            manifestFile: command.manifestFile,
            confirm: command.force,
          });
          io.log(renderManifestResult(result));
          continue;
        }
        if (command.type === 'status') {
          io.log(modeAdapter.statusText());
          continue;
        }
        if (command.type === 'log') {
          io.log(modeAdapter.logText(command.limit));
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
    await modeAdapter.teardown();
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

function wrapLineToWidth(
  line: string,
  width: number,
  options?: { continuationPrefix?: string },
): string[] {
  if (width <= 0) return [''];
  if (line.length <= width) return [line];
  const continuationPrefix = options?.continuationPrefix ?? '  ';
  const continuationBase =
    continuationPrefix.length >= width ? ' '.repeat(Math.max(0, width - 1)) : continuationPrefix;
  const wrapped: string[] = [];
  let remainder = line;
  let first = true;

  while (remainder.length > 0) {
    const prefix = first ? '' : continuationBase;
    const available = Math.max(1, width - prefix.length);
    if (remainder.length <= available) {
      wrapped.push(`${prefix}${remainder}`);
      break;
    }
    let breakIndex = remainder.lastIndexOf(' ', available);
    const pipeBreakIndex = remainder.lastIndexOf('|', available);
    if (pipeBreakIndex > breakIndex) breakIndex = pipeBreakIndex;
    if (breakIndex <= 0) breakIndex = available;

    const chunk = remainder.slice(0, breakIndex).trimEnd();
    const output = chunk.length > 0 ? chunk : remainder.slice(0, available);
    wrapped.push(`${prefix}${output}`);
    remainder = remainder.slice(output.length).trimStart();
    first = false;
  }

  return wrapped.length > 0 ? wrapped : [''];
}

function wrapDetailLinesForDisplay(lines: string[], sectionWidth: number): string[] {
  const headingPattern =
    /^(?:[▶▼]\s+)?(Identity|Device|Telemetry|Neighbors|Values|Controls|Sensors|Events|Config|Diagnostic|Other|Draft|Source|Editable Fields|Capabilities|Validation|Errors|Warnings)\b/;
  const wrapped: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      wrapped.push('');
      continue;
    }
    if (headingPattern.test(trimmed)) {
      wrapped.push(line);
      continue;
    }

    const bulletMatch = line.match(/^(\s*[-*]\s+)/);
    const labelMatch = line.match(/^(\s*[A-Za-z][A-Za-z0-9 _/()\-]*:\s+)/);
    const continuationPrefix = bulletMatch?.[1]
      ? ' '.repeat(bulletMatch[1].length)
      : labelMatch?.[1]
        ? ' '.repeat(labelMatch[1].length)
        : '  ';

    wrapped.push(
      ...wrapLineToWidth(line, sectionWidth, {
        continuationPrefix,
      }),
    );
  }
  return wrapped;
}

function formatDetailLinesForDisplay(lines: string[], sectionWidth: number): string {
  const headingPattern =
    /^(?:[▶▼]\s+)?(Identity|Device|Telemetry|Neighbors|Values|Controls|Sensors|Events|Config|Diagnostic|Other|Draft|Source|Editable Fields|Capabilities|Validation|Errors|Warnings)\b/;
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
    if (line.startsWith('> ')) {
      const isDetailLine = line.startsWith('>   ');
      const visibleLine = isDetailLine ? `  ${line.slice(4)}` : `- ${line.slice(2)}`;
      const highlighted = padOrTruncateText(visibleLine, sectionWidth);
      rendered.push(`{black-fg}{green-bg}{bold}${highlighted}{/bold}{/green-bg}{/black-fg}`);
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
    if (line.startsWith('- ')) {
      const bulletLabelMatch = line.slice(2).match(/^([^:]+):(.*)$/);
      if (bulletLabelMatch) {
        rendered.push(`- {bold}${bulletLabelMatch[1]}:{/bold}${bulletLabelMatch[2]}`);
        continue;
      }
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
    'enter open/fetch selected value (right pane) | up/down selects values (right+values) | F fetch full values | r refresh',
    'i inspect | v validate | m simulate | d simulate(dry-run) | p scaffold-preview',
    'e edit scaffold draft (requires scaffold preview) | esc exit edit mode',
    'edit mode capability rows: + add | * clone | - remove | < > reorder',
    'n toggle neighbors in node detail',
    'z toggle values in node detail',
    '1-6 toggle value subsections (controls/sensors/events/config/diagnostic/other)',
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

function normalizeIdentityText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const canonical = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (
    canonical === 'unknown' ||
    canonical === 'n/a' ||
    canonical === 'na' ||
    canonical === 'none' ||
    canonical === 'null' ||
    canonical === 'undefined' ||
    canonical === 'unavailable' ||
    canonical === 'not available' ||
    canonical === 'not known'
  ) {
    return null;
  }
  if (
    canonical.startsWith('unknown ') ||
    canonical.endsWith(' unknown') ||
    canonical.includes('unknown manufacturer') ||
    canonical.includes('manufacturer unknown') ||
    canonical.includes('unknown product') ||
    canonical.includes('product unknown')
  ) {
    return null;
  }
  return trimmed;
}

function asReadableId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return asNonEmptyString(value);
}

function formatManufacturerLabel(state: Record<string, unknown>): string {
  const deviceConfig = asRecord(state.deviceConfig);
  const name = normalizeIdentityText(
    asNonEmptyString(state.manufacturer) ?? asNonEmptyString(deviceConfig?.manufacturer),
  );
  const manufacturerId = normalizeIdentityText(asReadableId(state.manufacturerId));
  if (name && manufacturerId) {
    return name.includes(manufacturerId) ? name : `${name} (id ${manufacturerId})`;
  }
  if (name) return name;
  if (manufacturerId) return `id ${manufacturerId}`;
  return '';
}

function formatProductLabel(state: Record<string, unknown>): string {
  const deviceConfig = asRecord(state.deviceConfig);
  const name = normalizeIdentityText(
    asNonEmptyString(state.product) ??
      asNonEmptyString(state.productLabel) ??
      asNonEmptyString(deviceConfig?.label),
  );
  const productType = normalizeIdentityText(asReadableId(state.productType));
  const productId = normalizeIdentityText(asReadableId(state.productId));
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
  signature: string | null;
  manufacturerId: string | null;
  productType: string | null;
  productId: string | null;
} {
  if (!detail?.state) {
    return {
      manufacturer: null,
      product: null,
      signature: null,
      manufacturerId: null,
      productType: null,
      productId: null,
    };
  }
  const state = detail.state;
  const deviceConfig = asRecord(state.deviceConfig);
  const manufacturer = normalizeIdentityText(
    asNonEmptyString(state.manufacturer) ?? asNonEmptyString(deviceConfig?.manufacturer),
  );
  const product = normalizeIdentityText(
    asNonEmptyString(state.product) ??
      asNonEmptyString(state.productLabel) ??
      asNonEmptyString(deviceConfig?.label),
  );
  const manufacturerId = normalizeIdentityText(asReadableId(state.manufacturerId));
  const productType = normalizeIdentityText(asReadableId(state.productType));
  const productId = normalizeIdentityText(asReadableId(state.productId));
  const signature =
    manufacturerId && productType && productId
      ? `${manufacturerId}:${productType}:${productId}`
      : null;
  return { manufacturer, product, signature, manufacturerId, productType, productId };
}

function formatNodeListLabel(options: {
  name: string | null;
  manufacturer: string | null;
  product: string | null;
  signature?: string | null;
}): string {
  const name = options.name ?? '(unnamed)';
  const identityParts = [options.manufacturer, options.product]
    .map((part) => normalizeIdentityText(part))
    .filter((part): part is string => part !== null && part.length > 0);
  const signature = normalizeIdentityText(options.signature ?? null);
  const base = identityParts.length === 0 ? name : `${name} (${identityParts.join(' / ')})`;
  if (!signature) return base;
  return `${base} [${signature}]`;
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
  if (!route) return 'Lifeline route: not reported';
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
): string | null {
  if (!route) return null;
  if (route.error) return 'link unavailable';
  const speed = formatRouteSpeed(route.routeSpeed);
  if (neighborId === undefined) return null;
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
      const name = normalizeIdentityText(summary.name) ?? '(unnamed)';
      const manufacturerText = normalizeIdentityText(summary.manufacturer);
      const manufacturer = manufacturerText ?? null;
      const productText = normalizeIdentityText(summary.product);
      const product = productText ?? null;
      const identity =
        manufacturer && product
          ? `${manufacturer} / ${product}`
          : (manufacturer ?? product ?? 'identity pending');
      const linkQuality = formatNeighborLinkQuality(neighborId, route);
      if (!linkQuality) {
        return `- Node ${value} | ${name} | ${identity}`;
      }
      return `- Node ${value} | ${name} | ${identity} | ${linkQuality}`;
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

function valueIdShapeKey(valueId: {
  commandClass: string | number;
  endpoint?: string | number;
  property: string | number;
  propertyKey?: string | number;
}): string {
  const endpoint =
    typeof valueId.endpoint === 'number'
      ? String(valueId.endpoint)
      : typeof valueId.endpoint === 'string' && valueId.endpoint.trim().length > 0
        ? valueId.endpoint.trim()
        : '0';
  const propertyKey =
    valueId.propertyKey === null || valueId.propertyKey === undefined
      ? ''
      : String(valueId.propertyKey);
  return [String(valueId.commandClass), endpoint, String(valueId.property), propertyKey].join(':');
}

function profileMappingRolePriority(role: NodeValueProfileAttribution['mappingRole']): number {
  switch (role) {
    case 'inbound':
      return 3;
    case 'outbound':
      return 2;
    case 'watcher':
      return 1;
    default:
      return 0;
  }
}

function selectBestProfileAttribution(
  valueId: NodeValueDetail['valueId'],
  profileByValueKey?: Map<string, NodeValueProfileAttribution[]>,
): NodeValueProfileAttribution | null {
  if (!valueId || !profileByValueKey) return null;
  const entries = profileByValueKey.get(valueIdShapeKey(valueId));
  if (!entries || entries.length === 0) return null;
  return [...entries].sort((a, b) => {
    const roleDelta =
      profileMappingRolePriority(b.mappingRole) - profileMappingRolePriority(a.mappingRole);
    if (roleDelta !== 0) return roleDelta;
    return a.capabilityId.localeCompare(b.capabilityId);
  })[0];
}

function formatProfileSourceLabel(attribution: NodeValueProfileAttribution): string {
  const layer = attribution.provenanceLayer?.trim() || 'profile';
  const ruleId = attribution.provenanceRuleId?.trim();
  return ruleId ? `${layer}:${ruleId}` : layer;
}

function describeMissingValueReason(
  entry: NodeValueDetail,
  metadata: Record<string, unknown> | null,
  valueFetchMode: IncludeValuesMode,
): string {
  if (entry.valueError !== undefined) return 'unavailable: read error';
  if (valueFetchMode === 'summary') return 'not fetched: summary mode';
  if (valueFetchMode === 'none') return 'not fetched';
  if (metadata?.readable === false) return 'not readable';
  return 'no reported value';
}

function formatValueEntryBase(
  entry: NodeValueDetail,
  valueFetchMode: IncludeValuesMode,
): {
  label: string;
  renderedValue: string;
  identifier: string;
  type: string | null;
  semantic: ReturnType<typeof annotateNodeValue>;
  errors: string[];
} | null {
  if (entry._error !== undefined || !entry.valueId) return null;

  const valueId = entry.valueId;
  const metadata = asRecord(entry.metadata);
  const states = asRecord(metadata?.states);
  const rawValueText =
    entry.value === undefined
      ? `<${describeMissingValueReason(entry, metadata, valueFetchMode)}>`
      : formatReadableValue(entry.value);
  const mappedValue =
    states && entry.value !== undefined
      ? (states[String(entry.value)] ?? states[String(Number(entry.value))])
      : undefined;
  const renderedValue =
    entry.value !== undefined && typeof mappedValue === 'string' && mappedValue.trim().length > 0
      ? `${mappedValue} (${rawValueText})`
      : rawValueText;
  const unit =
    entry.value !== undefined &&
    metadata &&
    typeof metadata.unit === 'string' &&
    metadata.unit.trim().length > 0
      ? ` ${metadata.unit}`
      : '';
  const label =
    metadata && typeof metadata.label === 'string' && metadata.label.trim().length > 0
      ? metadata.label.trim()
      : String(valueId.property);
  const type =
    metadata && typeof metadata.type === 'string' && metadata.type.trim().length > 0
      ? metadata.type.trim()
      : null;
  const identifier = `cc${valueId.commandClass}/ep${valueId.endpoint ?? 0}/${String(valueId.property)}${
    valueId.propertyKey != null ? `/${String(valueId.propertyKey)}` : ''
  }`;
  const errors = [
    entry.metadataError
      ? `meta=${truncateValueText(stringifyCompact(entry.metadataError), 40)}`
      : null,
    entry.valueError ? `value=${truncateValueText(stringifyCompact(entry.valueError), 40)}` : null,
    entry.timestampError
      ? `timestamp=${truncateValueText(stringifyCompact(entry.timestampError), 40)}`
      : null,
  ].filter((value): value is string => value !== null);

  return {
    label,
    renderedValue: `${renderedValue}${unit}`,
    identifier,
    type,
    semantic: annotateNodeValue(entry),
    errors,
  };
}

function formatNodeValueLine(
  entry: NodeValueDetail,
  valueFetchMode: IncludeValuesMode,
  profileByValueKey?: Map<string, NodeValueProfileAttribution[]>,
  selected = false,
): string {
  if (entry._error !== undefined) {
    return `- value-error: ${truncateValueText(stringifyCompact(entry._error))}`;
  }

  const valueBase = formatValueEntryBase(entry, valueFetchMode);
  if (!valueBase) return '- value: <missing valueId>';
  const profileAttribution = selectBestProfileAttribution(entry.valueId, profileByValueKey);
  const sourceLabel = profileAttribution ? 'profile' : 'heuristic-fallback';
  const mapLabel = profileAttribution
    ? `${profileAttribution.capabilityId} (${profileAttribution.mappingRole})`
    : (valueBase.semantic.capabilityId ?? 'unmapped');
  const confidenceLabel = profileAttribution ? 'high' : valueBase.semantic.confidence;

  const detailBits = [
    `id ${valueBase.identifier}`,
    `dir ${valueBase.semantic.direction}`,
    valueBase.type ? `type ${valueBase.type}` : null,
    `map ${mapLabel}`,
    `conf ${confidenceLabel}`,
    `src ${sourceLabel}`,
    profileAttribution ? `rule ${formatProfileSourceLabel(profileAttribution)}` : null,
  ].filter((bit): bit is string => bit !== null);
  const lead = selected ? '> ' : '- ';
  const detailLead = selected ? '>   ' : '  ';

  return [
    `${lead}${valueBase.label}: ${valueBase.renderedValue}`,
    `${detailLead}${detailBits.join(' | ')}`,
    valueBase.errors.length > 0 ? `${detailLead}errors: ${valueBase.errors.join(' | ')}` : null,
  ].join('\n');
}

function formatNodeValueCompactLine(
  entry: NodeValueDetail,
  valueFetchMode: IncludeValuesMode,
  profileByValueKey?: Map<string, NodeValueProfileAttribution[]>,
  selected = false,
): string {
  if (entry._error !== undefined) {
    return `- value-error: ${truncateValueText(stringifyCompact(entry._error))}`;
  }

  const valueBase = formatValueEntryBase(entry, valueFetchMode);
  if (!valueBase) return '- value: <missing valueId>';
  const profileAttribution = selectBestProfileAttribution(entry.valueId, profileByValueKey);
  const mapLabel = profileAttribution
    ? `${profileAttribution.capabilityId}/${profileAttribution.mappingRole}`
    : (valueBase.semantic.capabilityId ?? 'unmapped');
  const confidenceLabel = profileAttribution ? 'high' : valueBase.semantic.confidence;
  const sourceLabel = profileAttribution ? 'profile' : 'heuristic';
  return `${selected ? '>' : '-'} ${valueBase.label}: ${valueBase.renderedValue} [${mapLabel} | conf:${confidenceLabel} | src:${sourceLabel}]`;
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
  if (commandClass === undefined) return 0;
  return COMMAND_CLASS_RELEVANCE_SCORES[commandClass] ?? 0;
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

interface ValueSectionDescriptor {
  id: ValueSemanticSection;
  title: string;
  compact: boolean;
  toggleKey: string;
}

const VALUE_SECTION_ORDER: ValueSectionDescriptor[] = [
  { id: 'controls', title: 'Controls', compact: false, toggleKey: '1' },
  { id: 'sensors', title: 'Sensors', compact: false, toggleKey: '2' },
  { id: 'events', title: 'Events', compact: false, toggleKey: '3' },
  { id: 'config', title: 'Config', compact: true, toggleKey: '4' },
  { id: 'diagnostic', title: 'Diagnostic', compact: true, toggleKey: '5' },
  { id: 'other', title: 'Other', compact: false, toggleKey: '6' },
];

const VALUE_SECTION_BY_TOGGLE_KEY = new Map<string, ValueSectionDescriptor>(
  VALUE_SECTION_ORDER.map((section) => [section.toggleKey, section]),
);

function groupValuesBySection(
  values: NodeValueDetail[],
): Map<ValueSemanticSection, NodeValueDetail[]> {
  const grouped = new Map<ValueSemanticSection, NodeValueDetail[]>();
  for (const section of VALUE_SECTION_ORDER) {
    grouped.set(section.id, []);
  }
  for (const entry of values) {
    const section = classifyNodeValueSection(entry);
    const existing = grouped.get(section);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(section, [entry]);
    }
  }
  return grouped;
}

function renderCollapsedValuePreview(
  values: NodeValueDetail[],
  limit: number,
  valueFetchMode: IncludeValuesMode,
  profileByValueKey?: Map<string, NodeValueProfileAttribution[]>,
): string[] {
  const top = values.slice(0, limit);
  return top.map((entry) => {
    const section = classifyNodeValueSection(entry);
    return section === 'config' || section === 'diagnostic'
      ? formatNodeValueCompactLine(entry, valueFetchMode, profileByValueKey)
      : formatNodeValueLine(entry, valueFetchMode, profileByValueKey);
  });
}

function flattenVisibleValuesBySection(
  valuesBySection: Map<ValueSemanticSection, NodeValueDetail[]>,
  collapsedSections: Set<ValueSemanticSection>,
): NodeValueDetail[] {
  const visible: NodeValueDetail[] = [];
  for (const section of VALUE_SECTION_ORDER) {
    if (collapsedSections.has(section.id)) continue;
    const sectionValues = valuesBySection.get(section.id) ?? [];
    for (const entry of sectionValues) {
      if (!entry.valueId) continue;
      visible.push(entry);
    }
  }
  return visible;
}

function renderCollapsedSectionPreview(
  valuesBySection: Map<ValueSemanticSection, NodeValueDetail[]>,
  collapsedSections: Set<ValueSemanticSection>,
  valueFetchMode: IncludeValuesMode,
  profileByValueKey?: Map<string, NodeValueProfileAttribution[]>,
): string[] {
  const sections = VALUE_SECTION_ORDER.flatMap((section) => {
    const sectionValues = valuesBySection.get(section.id) ?? [];
    if (sectionValues.length <= 0) return [];
    const collapsed = collapsedSections.has(section.id);
    const sectionTitle = `${collapsed ? '▶' : '▼'} ${section.title} (${sectionValues.length}) (${section.toggleKey})`;
    if (collapsed) return [sectionTitle];
    const previewLimit = section.compact ? 1 : 2;
    const previewRows = sectionValues
      .slice(0, previewLimit)
      .map((entry) => formatNodeValueCompactLine(entry, valueFetchMode, profileByValueKey));
    return [
      sectionTitle,
      ...previewRows,
      sectionValues.length > previewRows.length
        ? `... ${sectionValues.length - previewRows.length} more ${section.title.toLowerCase()} values (z)`
        : null,
    ];
  });
  return sections.filter((line): line is string => line !== null);
}

function renderPanelNodeDetail(
  detail: NodeDetail,
  options: {
    neighborsExpanded?: boolean;
    valuesExpanded?: boolean;
    collapsedValueSections?: Set<ValueSemanticSection>;
    valueFetchMode?: IncludeValuesMode;
    profileByValueKey?: Map<string, NodeValueProfileAttribution[]>;
    selectedValueKey?: string;
    neighborLookup?: Map<number, NeighborIdentity>;
  } = {},
): string {
  const state = detail.state ?? {};
  const location = normalizeIdentityText(asNonEmptyString(state.location));
  const interviewStage = normalizeIdentityText(asNonEmptyString(state.interviewStage));
  const isFailed =
    typeof state.isFailed === 'boolean' ? (state.isFailed ? 'yes' : 'no') : undefined;
  const ready = String(state.ready ?? '');
  const status = describeNodeStatus(state.status);
  const manufacturer = formatManufacturerLabel(state);
  const product = formatProductLabel(state);
  const manufacturerId = normalizeIdentityText(asReadableId(state.manufacturerId));
  const productType = normalizeIdentityText(asReadableId(state.productType));
  const productId = normalizeIdentityText(asReadableId(state.productId));
  const signature =
    manufacturerId && productType && productId
      ? `${manufacturerId}:${productType}:${productId}`
      : null;
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
  const collapsedValueSections = options.collapsedValueSections ?? new Set<ValueSemanticSection>();
  const valueFetchMode = options.valueFetchMode ?? 'summary';
  const profileByValueKey = options.profileByValueKey;
  const selectedValueKey = options.selectedValueKey;
  const valuesBySection = groupValuesBySection(sortedValues);
  const collapsedPreviewRows = renderCollapsedValuePreview(
    sortedValues,
    5,
    valueFetchMode,
    profileByValueKey,
  );
  const collapsedSectionRows = renderCollapsedSectionPreview(
    valuesBySection,
    collapsedValueSections,
    valueFetchMode,
    profileByValueKey,
  );
  const expandedSectionLines = VALUE_SECTION_ORDER.flatMap((section) => {
    const sectionValues = valuesBySection.get(section.id) ?? [];
    if (sectionValues.length <= 0) return [];
    const collapsed = collapsedValueSections.has(section.id);
    const sectionTitle = `${collapsed ? '▶' : '▼'} ${section.title}: ${sectionValues.length} (${section.toggleKey})`;
    if (collapsed) return [sectionTitle];
    const rows = section.compact
      ? sectionValues.map((entry) => {
          const selected =
            selectedValueKey !== undefined &&
            entry.valueId !== undefined &&
            valueIdShapeKey(entry.valueId) === selectedValueKey;
          return formatNodeValueCompactLine(entry, valueFetchMode, profileByValueKey, selected);
        })
      : sectionValues.map((entry) => {
          const selected =
            selectedValueKey !== undefined &&
            entry.valueId !== undefined &&
            valueIdShapeKey(entry.valueId) === selectedValueKey;
          return formatNodeValueLine(entry, valueFetchMode, profileByValueKey, selected);
        });
    return [sectionTitle, ...rows];
  });
  const valuesSectionTitle = `${valuesDisclosure} Values ${values.length}${values.length > 0 ? ' (z)' : ''}`;
  const valuesBodyLines = valuesExpanded
    ? expandedSectionLines.length > 0
      ? expandedSectionLines
      : ['No values available.']
    : values.length > 0
      ? collapsedSectionRows.length > 0
        ? collapsedSectionRows
        : [
            'Top values (relevance first):',
            ...collapsedPreviewRows,
            values.length > collapsedPreviewRows.length
              ? `... ${values.length - collapsedPreviewRows.length} more values (z)`
              : null,
          ]
      : ['No values available.'];

  return [
    'Identity',
    `Name: ${name || '(unnamed)'}`,
    location ? `Location: ${location}` : null,
    `Ready: ${ready}  Status: ${status}`,
    interviewStage ? `Interview stage: ${interviewStage}` : null,
    isFailed ? `Failed: ${isFailed}` : null,
    '',
    'Device',
    `Manufacturer: ${manufacturer || '(unavailable)'}`,
    `Product: ${product || '(unavailable)'}`,
    `Signature: ${signature ?? '(unavailable)'}`,
    manufacturerId ? `Manufacturer ID: ${manufacturerId}` : null,
    productType ? `Product Type: ${productType}` : null,
    productId ? `Product ID: ${productId}` : null,
    '',
    'Telemetry',
    ...notificationLines,
    '',
    neighborSectionTitle,
    ...neighborBodyLines,
    '',
    valuesSectionTitle,
    ...valuesBodyLines,
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

interface DraftEditFieldDescriptor {
  path: string;
  label: string;
  type: 'text' | 'select';
  options?: string[];
  section?: 'metadata' | 'capability';
  capabilityIndex?: number;
}

let homeyClassOptions = [...FALLBACK_HOMEY_CLASS_OPTIONS];
let capabilityIdOptions: string[] = [];

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function configureDraftEditorVocabulary(vocabulary: {
  homeyClasses: string[];
  capabilityIds: string[];
}): void {
  const nextHomeyClasses =
    vocabulary.homeyClasses.length > 0
      ? uniqueSorted(vocabulary.homeyClasses)
      : [...FALLBACK_HOMEY_CLASS_OPTIONS];
  homeyClassOptions.splice(0, homeyClassOptions.length, ...nextHomeyClasses);

  const nextCapabilityIds = uniqueSorted(vocabulary.capabilityIds);
  capabilityIdOptions.splice(0, capabilityIdOptions.length, ...nextCapabilityIds);
}

function buildDraftValidationVocabulary(vocabulary: {
  homeyClasses: string[];
  capabilityIds: string[];
}): DraftValidationVocabulary {
  return {
    homeyClasses: vocabulary.homeyClasses.length > 0 ? new Set(vocabulary.homeyClasses) : undefined,
    capabilityIds:
      vocabulary.capabilityIds.length > 0 ? new Set(vocabulary.capabilityIds) : undefined,
  };
}

const CAPABILITY_DIRECTION_OPTIONS = ['bidirectional', 'inbound-only', 'outbound-only'];
const INBOUND_MAPPING_KIND_OPTIONS = ['value', 'event'];
const OUTBOUND_MAPPING_KIND_OPTIONS = ['set_value', 'invoke_cc_api', 'zwjs_command'];

const DRAFT_METADATA_FIELDS: DraftEditFieldDescriptor[] = [
  {
    path: 'bundle.metadata.productName',
    label: 'Product Name',
    type: 'text',
    section: 'metadata',
  },
  {
    path: 'bundle.metadata.homeyClass',
    label: 'Homey Class',
    type: 'select',
    options: homeyClassOptions,
    section: 'metadata',
  },
  {
    path: 'bundle.metadata.ruleIdPrefix',
    label: 'Rule ID Prefix',
    type: 'text',
    section: 'metadata',
  },
  {
    path: 'fileHint',
    label: 'Output File',
    type: 'text',
    section: 'metadata',
  },
];

function getDraftCapabilitiesForEditor(state: DraftEditorState): Array<Record<string, unknown>> {
  const bundle = asRecord(state.workingDraft.bundle);
  const raw = Array.isArray(bundle?.capabilities) ? bundle.capabilities : [];
  return raw.map((entry) => asRecord(entry) ?? {});
}

function asMappingObject(value: unknown): Record<string, unknown> {
  return asRecord(value) ?? {};
}

function getInboundMappingKind(entry: Record<string, unknown>): 'value' | 'event' {
  const inbound = asMappingObject(entry.inboundMapping);
  return inbound.kind === 'event' ? 'event' : 'value';
}

function getOutboundMappingKind(
  entry: Record<string, unknown>,
): 'set_value' | 'invoke_cc_api' | 'zwjs_command' {
  const outbound = asMappingObject(entry.outboundMapping);
  if (outbound.kind === 'invoke_cc_api') return 'invoke_cc_api';
  if (outbound.kind === 'zwjs_command') return 'zwjs_command';
  return 'set_value';
}

function getDraftEditFields(state: DraftEditorState): DraftEditFieldDescriptor[] {
  const capabilityFields = getDraftCapabilitiesForEditor(state).flatMap((entry, index) => {
    const capabilityId =
      typeof entry.capabilityId === 'string' && entry.capabilityId.trim().length > 0
        ? entry.capabilityId.trim()
        : `Capability ${index + 1}`;
    const inboundKind = getInboundMappingKind(entry);
    const outboundKind = getOutboundMappingKind(entry);
    const inboundFields: DraftEditFieldDescriptor[] =
      inboundKind === 'event'
        ? [
            {
              path: `bundle.capabilities.${index}.inboundMapping.selector.eventType`,
              label: `${capabilityId} Inbound Event`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
          ]
        : [
            {
              path: `bundle.capabilities.${index}.inboundMapping.selector.commandClass`,
              label: `${capabilityId} Inbound CC`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
            {
              path: `bundle.capabilities.${index}.inboundMapping.selector.endpoint`,
              label: `${capabilityId} Inbound Endpoint`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
            {
              path: `bundle.capabilities.${index}.inboundMapping.selector.property`,
              label: `${capabilityId} Inbound Property`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
            {
              path: `bundle.capabilities.${index}.inboundMapping.selector.propertyKey`,
              label: `${capabilityId} Inbound PropertyKey`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
          ];
    const outboundFields: DraftEditFieldDescriptor[] =
      outboundKind === 'set_value'
        ? [
            {
              path: `bundle.capabilities.${index}.outboundMapping.target.commandClass`,
              label: `${capabilityId} Outbound CC`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
            {
              path: `bundle.capabilities.${index}.outboundMapping.target.endpoint`,
              label: `${capabilityId} Outbound Endpoint`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
            {
              path: `bundle.capabilities.${index}.outboundMapping.target.property`,
              label: `${capabilityId} Outbound Property`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
            {
              path: `bundle.capabilities.${index}.outboundMapping.target.propertyKey`,
              label: `${capabilityId} Outbound PropertyKey`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
          ]
        : [
            {
              path: `bundle.capabilities.${index}.outboundMapping.target.command`,
              label: `${capabilityId} Outbound Command`,
              type: 'text',
              section: 'capability',
              capabilityIndex: index,
            },
          ];
    return [
      {
        path: `bundle.capabilities.${index}.capabilityId`,
        label: `${capabilityId} ID`,
        type: capabilityIdOptions.length > 0 ? ('select' as const) : ('text' as const),
        ...(capabilityIdOptions.length > 0 ? { options: capabilityIdOptions } : {}),
        section: 'capability' as const,
        capabilityIndex: index,
      },
      {
        path: `bundle.capabilities.${index}.directionality`,
        label: `${capabilityId} Direction`,
        type: 'select' as const,
        options: CAPABILITY_DIRECTION_OPTIONS,
        section: 'capability' as const,
        capabilityIndex: index,
      },
      {
        path: `bundle.capabilities.${index}.inboundMapping.kind`,
        label: `${capabilityId} Inbound Kind`,
        type: 'select' as const,
        options: INBOUND_MAPPING_KIND_OPTIONS,
        section: 'capability' as const,
        capabilityIndex: index,
      },
      ...inboundFields,
      {
        path: `bundle.capabilities.${index}.outboundMapping.kind`,
        label: `${capabilityId} Outbound Kind`,
        type: 'select' as const,
        options: OUTBOUND_MAPPING_KIND_OPTIONS,
        section: 'capability' as const,
        capabilityIndex: index,
      },
      ...outboundFields,
    ];
  });
  return [...DRAFT_METADATA_FIELDS, ...capabilityFields];
}

function getDraftEditFieldByPath(
  state: DraftEditorState,
  path: string,
): DraftEditFieldDescriptor | undefined {
  return getDraftEditFields(state).find((entry) => entry.path === path);
}

function getDraftEditorFieldValue(state: DraftEditorState, path: string): string {
  if (path === 'fileHint') {
    return state.workingDraft.fileHint;
  }
  if (path === 'bundle.metadata.productName') {
    const metadata = asRecord(state.workingDraft.bundle?.metadata);
    return asNonEmptyString(metadata?.productName) ?? '';
  }
  if (path === 'bundle.metadata.homeyClass') {
    const metadata = asRecord(state.workingDraft.bundle?.metadata);
    return asNonEmptyString(metadata?.homeyClass) ?? '';
  }
  if (path === 'bundle.metadata.ruleIdPrefix') {
    const metadata = asRecord(state.workingDraft.bundle?.metadata);
    return asNonEmptyString(metadata?.ruleIdPrefix) ?? '';
  }
  const capabilityFieldMatch = path.match(
    /^bundle\.capabilities\.(\d+)\.(capabilityId|directionality)$/,
  );
  if (capabilityFieldMatch) {
    const index = Number(capabilityFieldMatch[1]);
    const field = capabilityFieldMatch[2];
    const capabilities = getDraftCapabilitiesForEditor(state);
    const capability = capabilities[index];
    if (!capability) return '';
    if (field === 'capabilityId') {
      return asNonEmptyString(capability.capabilityId) ?? '';
    }
    if (field === 'directionality') {
      return asNonEmptyString(capability.directionality) ?? '';
    }
  }
  const inboundFieldMatch = path.match(
    /^bundle\.capabilities\.(\d+)\.inboundMapping\.(kind|selector\.(commandClass|endpoint|property|propertyKey|eventType))$/,
  );
  if (inboundFieldMatch) {
    const index = Number(inboundFieldMatch[1]);
    const field = inboundFieldMatch[2];
    const capabilities = getDraftCapabilitiesForEditor(state);
    const capability = capabilities[index];
    if (!capability) return '';
    const inbound = asMappingObject(capability.inboundMapping);
    if (field === 'kind') {
      return asNonEmptyString(inbound.kind) ?? '';
    }
    const selector = asMappingObject(inbound.selector);
    const selectorKey = inboundFieldMatch[3];
    if (selectorKey === undefined) return '';
    const value = selector[selectorKey];
    if (value === null || value === undefined) return '';
    return String(value);
  }
  const outboundFieldMatch = path.match(
    /^bundle\.capabilities\.(\d+)\.outboundMapping\.(kind|target\.(commandClass|endpoint|property|propertyKey|command))$/,
  );
  if (outboundFieldMatch) {
    const index = Number(outboundFieldMatch[1]);
    const field = outboundFieldMatch[2];
    const capabilities = getDraftCapabilitiesForEditor(state);
    const capability = capabilities[index];
    if (!capability) return '';
    const outbound = asMappingObject(capability.outboundMapping);
    if (field === 'kind') {
      return asNonEmptyString(outbound.kind) ?? '';
    }
    const target = asMappingObject(outbound.target);
    const targetKey = outboundFieldMatch[3];
    if (targetKey === undefined) return '';
    const value = target[targetKey];
    if (value === null || value === undefined) return '';
    return String(value);
  }
  return '';
}

function renderPanelDraftEditor(
  state: DraftEditorState,
  options: {
    editingFieldPath?: string;
    editingBuffer?: string;
    sourceNode?: {
      nodeId?: number;
      name?: string | null;
      manufacturer?: string | null;
      product?: string | null;
      signature?: string | null;
      manufacturerId?: string | null;
      productType?: string | null;
      productId?: string | null;
    };
  } = {},
): string {
  const workingBundle = state.workingDraft.bundle ?? {};
  const capabilities = getDraftCapabilitiesForEditor(state);
  const draftFields = getDraftEditFields(state);
  const fieldLines = draftFields.map((field) => {
    const value = getDraftEditorFieldValue(state, field.path);
    const isSelected = state.selectedFieldPath === field.path;
    const prefix = isSelected ? '> ' : '- ';
    const suffix =
      field.type === 'select' && Array.isArray(field.options)
        ? isSelected
          ? ` [options:${field.options.join(', ')}]`
          : ' [select]'
        : '';
    return `${prefix}${field.label}: ${value || '(unset)'}${suffix}`;
  });
  const capabilityLines = capabilities.flatMap((entry, index) => {
    const capabilityId =
      typeof entry.capabilityId === 'string' && entry.capabilityId.trim().length > 0
        ? entry.capabilityId.trim()
        : '(unset)';
    const directionality =
      typeof entry.directionality === 'string' && entry.directionality.trim().length > 0
        ? entry.directionality.trim()
        : '(unset)';
    const selectedCapability = state.selectedFieldPath.startsWith(`bundle.capabilities.${index}.`);
    const prefix = selectedCapability ? '>' : '-';
    const inbound = asMappingObject(entry.inboundMapping);
    const inboundKind = getInboundMappingKind(entry);
    const inboundSelector = asMappingObject(inbound.selector);
    const inboundSummary =
      inboundKind === 'event'
        ? `event:${asNonEmptyString(inboundSelector.eventType) ?? '(unset)'}`
        : `cc:${inboundSelector.commandClass ?? '-'} ep:${inboundSelector.endpoint ?? 0} prop:${inboundSelector.property ?? '(unset)'} key:${inboundSelector.propertyKey ?? '-'}`;
    const outbound = asMappingObject(entry.outboundMapping);
    const outboundKind = getOutboundMappingKind(entry);
    const outboundTarget = asMappingObject(outbound.target);
    const outboundSummary =
      outboundKind === 'set_value'
        ? `cc:${outboundTarget.commandClass ?? '-'} ep:${outboundTarget.endpoint ?? 0} prop:${outboundTarget.property ?? '(unset)'} key:${outboundTarget.propertyKey ?? '-'}`
        : `command:${asNonEmptyString(outboundTarget.command) ?? '(unset)'}`;
    return [
      `${prefix} Capability ${index + 1}: ${capabilityId}`,
      `  Directionality: ${directionality}`,
      `  Inbound (${inboundKind}): ${inboundSummary}`,
      `  Outbound (${outboundKind}): ${outboundSummary}`,
    ];
  });
  const editingField =
    options.editingFieldPath && options.editingBuffer !== undefined
      ? getDraftEditFieldByPath(state, options.editingFieldPath)
      : undefined;
  const editStatus =
    options.editingFieldPath && options.editingBuffer !== undefined
      ? `Editing ${editingField?.label ?? options.editingFieldPath}: ${options.editingBuffer}`
      : null;
  const sourceName = normalizeIdentityText(options.sourceNode?.name ?? null) ?? '(unnamed)';
  const sourceNodeId = options.sourceNode?.nodeId;
  const sourceManufacturer =
    normalizeIdentityText(options.sourceNode?.manufacturer ?? null) ?? '(unavailable)';
  const sourceProduct =
    normalizeIdentityText(options.sourceNode?.product ?? null) ?? '(unavailable)';
  const sourceManufacturerId = normalizeIdentityText(options.sourceNode?.manufacturerId ?? null);
  const sourceProductType = normalizeIdentityText(options.sourceNode?.productType ?? null);
  const sourceProductId = normalizeIdentityText(options.sourceNode?.productId ?? null);
  const sourceSignature =
    normalizeIdentityText(options.sourceNode?.signature ?? null) ??
    (sourceManufacturerId && sourceProductType && sourceProductId
      ? `${sourceManufacturerId}:${sourceProductType}:${sourceProductId}`
      : null);
  const sourceSection =
    sourceNodeId !== undefined ||
    sourceSignature ||
    options.sourceNode?.manufacturer ||
    options.sourceNode?.product
      ? [
          'Source',
          `Node: ${sourceNodeId ?? '-'}`,
          `Name: ${sourceName}`,
          `Manufacturer: ${sourceManufacturer}`,
          `Product: ${sourceProduct}`,
          `Signature: ${sourceSignature ?? '(unavailable)'}`,
          sourceManufacturerId ? `Manufacturer ID: ${sourceManufacturerId}` : null,
          sourceProductType ? `Product Type: ${sourceProductType}` : null,
          sourceProductId ? `Product ID: ${sourceProductId}` : null,
          '',
        ]
      : [];

  return [
    'Draft Editor (Scaffold)',
    '',
    'Draft',
    `Signature: ${state.workingDraft.signature}`,
    `File hint: ${state.workingDraft.fileHint}`,
    `Dirty: ${state.dirty ? 'yes' : 'no'}`,
    `Validated: ${state.lastValidatedAt ?? '-'}`,
    '',
    ...sourceSection,
    'Editable Fields',
    ...fieldLines,
    ...(editStatus ? ['', editStatus] : []),
    '',
    'Capabilities',
    `Count: ${capabilities.length}`,
    ...(capabilityLines.length > 0 ? capabilityLines : ['(none)']),
    '',
    'Validation',
    state.errors.length > 0 ? `Errors (${state.errors.length}):` : 'Errors: none',
    ...(state.errors.length > 0 ? state.errors.map((entry) => `- ${entry}`) : []),
    '',
    state.warnings.length > 0 ? `Warnings (${state.warnings.length}):` : 'Warnings: none',
    ...(state.warnings.length > 0 ? state.warnings.map((entry) => `- ${entry}`) : []),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

type PanelIntent =
  | { type: 'noop' }
  | { type: 'quit' }
  | { type: 'escape' }
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'move-left' }
  | { type: 'move-right' }
  | { type: 'move-page-up' }
  | { type: 'move-page-down' }
  | { type: 'move-first' }
  | { type: 'move-last' }
  | { type: 'switch-pane' }
  | { type: 'start-filter' }
  | { type: 'open' }
  | { type: 'fetch-full-values' }
  | { type: 'refresh' }
  | { type: 'inspect' }
  | { type: 'validate' }
  | { type: 'simulate'; dryRun: boolean }
  | { type: 'scaffold-preview' }
  | { type: 'edit-draft' }
  | { type: 'scaffold-write' }
  | { type: 'manifest-add' }
  | { type: 'status' }
  | { type: 'log' }
  | { type: 'cancel-operation' }
  | { type: 'toggle-neighbors' }
  | { type: 'toggle-values' }
  | { type: 'toggle-value-section'; key: string }
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
  if (name === 'q' || token === 'q') return { type: 'quit' };
  if (name === 'escape') return { type: 'escape' };
  if (name === 'up' || token === 'k') return { type: 'move-up' };
  if (name === 'down' || token === 'j') return { type: 'move-down' };
  if (name === 'left') return { type: 'move-left' };
  if (name === 'right') return { type: 'move-right' };
  if (name === 'pageup') return { type: 'move-page-up' };
  if (name === 'pagedown') return { type: 'move-page-down' };
  if (name === 'home') return { type: 'move-first' };
  if (name === 'end') return { type: 'move-last' };
  if (name === 'tab') return { type: 'switch-pane' };
  if (token === '/' || name === 'slash') return { type: 'start-filter' };
  if (name === 'return' || name === 'enter') return { type: 'open' };
  if (char === 'F') return { type: 'fetch-full-values' };
  if (name === 'r' || token === 'r') return { type: 'refresh' };
  if (name === 'i' || token === 'i') return { type: 'inspect' };
  if (name === 'v' || token === 'v') return { type: 'validate' };
  if (name === 'm' || token === 'm') return { type: 'simulate', dryRun: false };
  if (name === 'd' || token === 'd') return { type: 'simulate', dryRun: true };
  if (name === 'p' || token === 'p') return { type: 'scaffold-preview' };
  if (name === 'e' || token === 'e') return { type: 'edit-draft' };
  if (char === 'W') return { type: 'scaffold-write' };
  if (char === 'A') return { type: 'manifest-add' };
  if (name === 's' || token === 's') return { type: 'status' };
  if (name === 'l' || token === 'l') return { type: 'log' };
  if (name === 'c' || token === 'c') return { type: 'cancel-operation' };
  if (name === 'n' || token === 'n') return { type: 'toggle-neighbors' };
  if (name === 'z' || token === 'z') return { type: 'toggle-values' };
  if (VALUE_SECTION_BY_TOGGLE_KEY.has(token)) return { type: 'toggle-value-section', key: token };
  if (name === 'b' || token === 'b') return { type: 'toggle-bottom-pane-size' };
  if (name === 'h' || name === '?' || char === '?') return { type: 'help' };
  return { type: 'noop' };
}

function resolvePrintableKeypress(
  char: string,
  key: { sequence?: string; ctrl?: boolean },
): string {
  if (key.ctrl) return '';
  if (char && char >= ' ') return char;
  const sequence = typeof key.sequence === 'string' ? key.sequence : '';
  return sequence.length === 1 && sequence >= ' ' ? sequence : '';
}

type PanelFocus = PanelChromeFocus;
type PanelMode = PanelChromeMode;
interface DraftFieldEditSession {
  path: string;
  value: string;
}
type ConfirmAction = PanelChromeConfirmAction;

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

interface DraftDiffSummary {
  totalChanges: number;
  additions: number;
  updates: number;
  removals: number;
  lines: string[];
}

function flattenDraftDiffValue(value: unknown, path: string, out: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    if (value.length <= 0) {
      out.set(path, []);
      return;
    }
    for (let index = 0; index < value.length; index += 1) {
      flattenDraftDiffValue(value[index], `${path}[${index}]`, out);
    }
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length <= 0) {
      out.set(path, {});
      return;
    }
    for (const key of keys) {
      const childPath = path.length > 0 ? `${path}.${key}` : key;
      flattenDraftDiffValue(record[key], childPath, out);
    }
    return;
  }
  out.set(path, value);
}

function valuesEqualForDraftDiff(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return String(left) === String(right);
  }
}

function formatDraftDiffValue(value: unknown): string {
  if (value === undefined) return '(unset)';
  if (typeof value === 'string') return `"${truncateLabel(value, 52)}"`;
  try {
    return truncateLabel(JSON.stringify(value), 52);
  } catch {
    return truncateLabel(String(value), 52);
  }
}

function buildDraftDiffSummary(editor: DraftEditorState | undefined): DraftDiffSummary | null {
  if (!editor) return null;
  const baseDraft = editor.baseDraft as
    | {
        fileHint?: unknown;
        bundle?: unknown;
      }
    | undefined;
  const workingDraft = editor.workingDraft as
    | {
        fileHint?: unknown;
        bundle?: unknown;
      }
    | undefined;
  if (!baseDraft || !workingDraft) return null;

  const baseMap = new Map<string, unknown>();
  const nextMap = new Map<string, unknown>();

  baseMap.set('fileHint', baseDraft.fileHint);
  nextMap.set('fileHint', workingDraft.fileHint);

  flattenDraftDiffValue(baseDraft.bundle ?? {}, 'bundle', baseMap);
  flattenDraftDiffValue(workingDraft.bundle ?? {}, 'bundle', nextMap);

  const allPaths = new Set<string>([...baseMap.keys(), ...nextMap.keys()]);
  const sortedPaths = [...allPaths].sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  let additions = 0;
  let updates = 0;
  let removals = 0;

  for (const path of sortedPaths) {
    const hasBase = baseMap.has(path);
    const hasNext = nextMap.has(path);
    if (!hasBase && hasNext) {
      additions += 1;
      lines.push(`+ ${path} = ${formatDraftDiffValue(nextMap.get(path))}`);
      continue;
    }
    if (hasBase && !hasNext) {
      removals += 1;
      lines.push(`- ${path} (was ${formatDraftDiffValue(baseMap.get(path))})`);
      continue;
    }
    const baseValue = baseMap.get(path);
    const nextValue = nextMap.get(path);
    if (!valuesEqualForDraftDiff(baseValue, nextValue)) {
      updates += 1;
      lines.push(
        `~ ${path}: ${formatDraftDiffValue(baseValue)} -> ${formatDraftDiffValue(nextValue)}`,
      );
    }
  }

  const totalChanges = additions + updates + removals;
  return {
    totalChanges,
    additions,
    updates,
    removals,
    lines,
  };
}

export async function runPanelApp(
  config: SessionConfig,
  io: LoggerLike = console,
  deps: RunAppDeps = {},
): Promise<void> {
  const authoringVocabulary = loadHomeyAuthoringVocabulary(
    config.vocabularyFile ?? 'rules/homey-authoring-vocabulary.json',
  );
  configureDraftEditorVocabulary(authoringVocabulary);
  const draftValidationVocabulary = buildDraftValidationVocabulary(authoringVocabulary);
  if (authoringVocabulary.warning) {
    io.log(`Vocabulary: ${authoringVocabulary.warning}`);
  } else {
    io.log(
      `Vocabulary: loaded ${authoringVocabulary.homeyClasses.length} classes, ${authoringVocabulary.capabilityIds.length} capabilities from ${authoringVocabulary.filePath}`,
    );
  }

  const explorerService = deps.explorerService ?? new ZwjsExplorerServiceImpl();
  const curationService = deps.curationService ?? new CompilerCurationServiceImpl();
  const fileService = deps.fileService ?? new WorkspaceFileServiceImpl();
  const explorerChildPresenter =
    deps.explorerChildPresenter ?? new ExplorerSessionPresenter(explorerService);
  const curationChildPresenter =
    deps.curationChildPresenter ?? new CurationWorkflowPresenter(curationService, fileService);
  const nodesPresenter =
    deps.presenter ??
    new ExplorerPresenter(
      {
        explorer: explorerChildPresenter,
        curation: curationChildPresenter,
      },
      {
        draftVocabulary: draftValidationVocabulary,
      },
    );
  const rulesPresenter =
    deps.rulesPresenter ??
    new RulesPresenter(curationChildPresenter, fileService, {
      draftVocabulary: draftValidationVocabulary,
    });
  const panelChromePresenter = deps.panelChromePresenter ?? new PanelChromePresenter();
  const panelLayoutPresenter = deps.panelLayoutPresenter ?? new PanelLayoutPresenter();
  const panelOutputPresenter = deps.panelOutputPresenter ?? new PanelOutputPresenter();
  const canHydrateListIdentity =
    typeof (nodesPresenter as { showNodeDetail?: unknown }).showNodeDetail === 'function';
  const input = deps.stdin ?? defaultStdin;
  const output = deps.stdout ?? defaultStdout;
  const panelModeAdapter = createPanelModeAdapter(config, nodesPresenter, rulesPresenter);
  const draftSurface = panelModeAdapter.draftSurface;
  const isNodesMode = panelModeAdapter.mode === 'nodes';
  const modeLabel = panelModeAdapter.mode;
  const paneOrder: PanelFocus[] = ['left', 'right', 'bottom'];

  let selectedIndex = 0;
  let selectedItemKey: string | undefined;
  let focusedPane: PanelFocus = 'left';
  let filterMode = false;
  let filterQuery = '';
  let rightText = '';
  let rightScroll = 0;
  let panelMode: PanelMode = 'detail';
  let draftFieldEdit: DraftFieldEditSession | null = null;
  let currentNodeDetail: NodeDetail | null = null;
  let neighborsExpanded = false;
  let valuesExpanded = false;
  const collapsedValueSections = new Set<ValueSemanticSection>();
  const nodeValueFetchModeOverride = new Map<number, IncludeValuesMode>();
  const nodeSelectedValueKeyByNode = new Map<number, string>();
  const nodeValueProfileAttributionCache = new Map<
    number,
    Map<string, NodeValueProfileAttribution[]>
  >();
  const nodeValueProfileAttributionInFlight = new Set<number>();
  let bottomText = renderPanelHelp(modeLabel);
  let bottomScroll = 0;
  let bottomCompact = true;
  let isClosing = false;
  let pendingConfirm: PendingConfirm | null = null;
  let activeOperation: ActiveOperation | null = null;
  let nextOperationId = 1;
  let listIdentityHydrationInFlight: Promise<void> | null = null;
  const listIdentityHydrationPendingNodeIds = new Set<number>();
  const listIdentityHydrationAttemptedNodeIds = new Set<number>();
  let pendingReturnLikeCounterpart: 'enter' | 'return' | null = null;
  let pendingReturnLikeExpiresAt = 0;

  const OPERATION_TIMEOUT_MS = Math.max(1, deps.panelOperationTimeoutMs ?? 45_000);
  const WRITE_CONFIRM_WINDOW_MS = 6_000;
  const RETURN_KEYPRESS_DEDUP_MS = 24;

  const screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    autoPadding: false,
    fullUnicode: true,
    terminal: 'xterm-256color',
    input: input as any,
    output: output as any,
  });
  screen.title = `ZWJS ${modeLabel}`;

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
  const statusPane = blessed.box({
    parent: screen,
    top: '60%',
    left: 0,
    width: '100%',
    height: 1,
    tags: false,
    wrap: false,
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

  function formatDraftValidationHint(editor: DraftEditorState): string {
    const errorCount = editor.errors.length;
    const warningCount = editor.warnings.length;
    if (errorCount > 0 && warningCount > 0) {
      return `Validation: ${errorCount} error(s), ${warningCount} warning(s).`;
    }
    if (errorCount > 0) {
      return `Validation: ${errorCount} error(s).`;
    }
    if (warningCount > 0) {
      return `Validation: ${warningCount} warning(s).`;
    }
    return 'Validation: ok.';
  }

  function formatDraftUpdateMessage(label: string, editor: DraftEditorState): string {
    return `Updated ${label}. ${formatDraftValidationHint(editor)}`;
  }

  function getListEntries(): PanelListEntry[] {
    if (isNodesMode) {
      const snapshot = nodesPresenter.getState();
      const items = snapshot.explorer.items;
      const detailCache = snapshot.nodeDetailCache ?? {};
      const filtered = items.filter((node) => {
        if (!filterQuery) return true;
        const detailIdentity = extractListIdentityFromDetail(detailCache[node.nodeId]);
        const manufacturer =
          normalizeIdentityText(node.manufacturer) ?? detailIdentity.manufacturer;
        const product = normalizeIdentityText(node.product) ?? detailIdentity.product;
        const signature = detailIdentity.signature;
        const haystack = [
          String(node.nodeId),
          normalizeText(node.name),
          normalizeText(product),
          normalizeText(manufacturer),
          normalizeText(signature),
          normalizeText(detailIdentity.manufacturerId),
          normalizeText(detailIdentity.productType),
          normalizeText(detailIdentity.productId),
          normalizeText(node.location),
        ].join(' ');
        return haystack.includes(filterQuery.toLowerCase());
      });
      return filtered.map((node) => {
        const detailIdentity = extractListIdentityFromDetail(detailCache[node.nodeId]);
        const manufacturer =
          normalizeIdentityText(node.manufacturer) ?? detailIdentity.manufacturer;
        const product = normalizeIdentityText(node.product) ?? detailIdentity.product;
        return {
          kind: 'node' as const,
          key: `node:${node.nodeId}`,
          rowId: node.nodeId,
          label: truncateLabel(
            formatNodeListLabel({
              name: node.name,
              manufacturer,
              product,
              signature: detailIdentity.signature,
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

  function requireDraftMethod<T>(
    method: T | undefined,
    unavailableMessage: string,
  ): NonNullable<T> {
    if (typeof method !== 'function') {
      throw new Error(unavailableMessage);
    }
    return method as NonNullable<T>;
  }

  function getActiveDraftEditorState(): DraftEditorState | undefined {
    return typeof draftSurface.getDraftEditorState === 'function'
      ? draftSurface.getDraftEditorState()
      : undefined;
  }

  function startDraftEditMode(): DraftEditorState {
    return requireDraftMethod(
      draftSurface.startDraftEdit,
      `Draft editor is unavailable in the current ${modeLabel} presenter.`,
    )();
  }

  function setSelectedDraftField(path: string): DraftEditorState {
    return requireDraftMethod(
      draftSurface.setDraftEditorSelectedField,
      `Draft field selection is unavailable in the current ${modeLabel} presenter.`,
    )(path);
  }

  function setDraftFieldValue(path: string, value: string): DraftEditorState {
    const capabilityFieldMatch = path.match(
      /^bundle\.capabilities\.(\d+)\.(capabilityId|directionality)$/,
    );
    if (capabilityFieldMatch) {
      const index = Number(capabilityFieldMatch[1]);
      const field = capabilityFieldMatch[2] as 'capabilityId' | 'directionality';
      return requireDraftMethod(
        draftSurface.setDraftEditorCapabilityField,
        `Capability field edits are unavailable in the current ${modeLabel} presenter.`,
      )(index, field, value);
    }
    const capabilityMappingFieldMatch = path.match(
      /^bundle\.capabilities\.(\d+)\.(inboundMapping|outboundMapping)\./,
    );
    if (capabilityMappingFieldMatch) {
      const index = Number(capabilityMappingFieldMatch[1]);
      return requireDraftMethod(
        draftSurface.setDraftEditorCapabilityMappingField,
        `Capability mapping edits are unavailable in the current ${modeLabel} presenter.`,
      )(index, path, value);
    }
    return requireDraftMethod(
      draftSurface.setDraftEditorField,
      `Draft field edits are unavailable in the current ${modeLabel} presenter.`,
    )(path, value);
  }

  function commitDraftEdits(): void {
    requireDraftMethod(
      draftSurface.commitDraftEditorState,
      `Draft commit is unavailable in the current ${modeLabel} presenter.`,
    )();
  }

  function addDraftCapabilityRow(): DraftEditorState | undefined {
    return typeof draftSurface.addDraftEditorCapability === 'function'
      ? draftSurface.addDraftEditorCapability()
      : undefined;
  }

  function cloneDraftCapabilityRow(index: number): DraftEditorState | undefined {
    return typeof draftSurface.cloneDraftEditorCapability === 'function'
      ? draftSurface.cloneDraftEditorCapability(index)
      : undefined;
  }

  function removeDraftCapabilityRow(index: number): DraftEditorState | undefined {
    return typeof draftSurface.removeDraftEditorCapability === 'function'
      ? draftSurface.removeDraftEditorCapability(index)
      : undefined;
  }

  function moveDraftCapabilityRow(index: number, delta: -1 | 1): DraftEditorState | undefined {
    return typeof draftSurface.moveDraftEditorCapability === 'function'
      ? draftSurface.moveDraftEditorCapability(index, delta)
      : undefined;
  }

  function moveDraftFieldSelection(delta: -1 | 1): DraftEditorState | undefined {
    const editor = getActiveDraftEditorState();
    if (!editor) return undefined;
    const fields = getDraftEditFields(editor);
    const currentIndex = fields.findIndex((entry) => entry.path === editor.selectedFieldPath);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.max(0, Math.min(fields.length - 1, baseIndex + delta));
    return setSelectedDraftField(fields[nextIndex].path);
  }

  function cycleDraftSelectField(delta: -1 | 1): DraftEditorState | undefined {
    const editor = getActiveDraftEditorState();
    if (!editor) return undefined;
    const field = getDraftEditFieldByPath(editor, editor.selectedFieldPath);
    if (!field || field.type !== 'select' || !field.options || field.options.length <= 0) {
      return undefined;
    }
    const currentValue = getDraftEditorFieldValue(editor, field.path);
    const currentIndex = field.options.findIndex((entry) => entry === currentValue);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + delta + field.options.length) % field.options.length;
    return setDraftFieldValue(field.path, field.options[nextIndex]);
  }

  function getSelectedDraftCapabilityIndex(editor?: DraftEditorState): number | undefined {
    const current = editor ?? getActiveDraftEditorState();
    if (!current) return undefined;
    const match = current.selectedFieldPath.match(/^bundle\.capabilities\.(\d+)\./);
    if (match) return Number(match[1]);
    const caps = getDraftCapabilitiesForEditor(current);
    if (caps.length <= 0) return undefined;
    const index = Math.max(0, Math.min(caps.length - 1, current.selectedCapabilityIndex ?? 0));
    return index;
  }

  function nodeNeedsListIdentity(nodeId: number): boolean {
    const snapshot = nodesPresenter.getState();
    const item = snapshot.explorer.items.find((entry) => entry.nodeId === nodeId);
    const detailIdentity = extractListIdentityFromDetail(snapshot.nodeDetailCache?.[nodeId]);
    const manufacturer = normalizeIdentityText(item?.manufacturer) ?? detailIdentity.manufacturer;
    const product = normalizeIdentityText(item?.product) ?? detailIdentity.product;
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
    const name = normalizeIdentityText(asNonEmptyString(state.name));
    const manufacturer = normalizeIdentityText(formatManufacturerLabel(state));
    const product = normalizeIdentityText(formatProductLabel(state));
    return { name, manufacturer, product };
  }

  function buildNeighborLookup(): Map<number, NeighborIdentity> {
    const snapshot = nodesPresenter.getState();
    const map = new Map<number, NeighborIdentity>();

    const explorerItems = snapshot.explorer?.items ?? [];
    for (const item of explorerItems) {
      map.set(item.nodeId, {
        name: normalizeIdentityText(item.name),
        manufacturer: normalizeIdentityText(item.manufacturer),
        product: normalizeIdentityText(item.product),
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

  function resolveNodeValueProfileAttribution(
    nodeId: number | undefined,
  ): Map<string, NodeValueProfileAttribution[]> | undefined {
    if (!nodeId) return undefined;
    return nodeValueProfileAttributionCache.get(nodeId);
  }

  function resolveValueFetchMode(nodeId: number | undefined): IncludeValuesMode {
    if (!nodeId) return config.includeValues;
    return nodeValueFetchModeOverride.get(nodeId) ?? config.includeValues;
  }

  function getVisibleNodeValues(detail: NodeDetail): NodeValueDetail[] {
    const values = Array.isArray(detail.values) ? detail.values : [];
    const sortedValues = sortValuesByRelevance(values);
    const grouped = groupValuesBySection(sortedValues);
    return flattenVisibleValuesBySection(grouped, collapsedValueSections);
  }

  function getSelectedNodeValueKey(nodeId: number | undefined): string | undefined {
    if (!nodeId) return undefined;
    return nodeSelectedValueKeyByNode.get(nodeId);
  }

  function ensureSelectedNodeValueKey(detail: NodeDetail): void {
    const nodeId = detail.nodeId;
    const visible = getVisibleNodeValues(detail);
    if (visible.length === 0) {
      nodeSelectedValueKeyByNode.delete(nodeId);
      return;
    }
    const selectedKey = nodeSelectedValueKeyByNode.get(nodeId);
    if (selectedKey && visible.some((entry) => valueIdKey(entry) === selectedKey)) {
      return;
    }
    nodeSelectedValueKeyByNode.set(nodeId, valueIdKey(visible[0]));
  }

  function moveSelectedNodeValue(delta: -1 | 1): string | null {
    if (!currentNodeDetail) return null;
    const visible = getVisibleNodeValues(currentNodeDetail);
    if (visible.length === 0) return null;
    const nodeId = currentNodeDetail.nodeId;
    const currentKey = nodeSelectedValueKeyByNode.get(nodeId);
    const currentIndex = currentKey
      ? visible.findIndex((entry) => valueIdKey(entry) === currentKey)
      : -1;
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.max(0, Math.min(visible.length - 1, baseIndex + delta));
    const nextEntry = visible[nextIndex];
    const nextKey = valueIdKey(nextEntry);
    nodeSelectedValueKeyByNode.set(nodeId, nextKey);
    return nextKey;
  }

  function resolveSelectedNodeValue(detail: NodeDetail): NodeValueDetail | null {
    const values = getVisibleNodeValues(detail);
    if (values.length === 0) return null;
    const selectedKey = nodeSelectedValueKeyByNode.get(detail.nodeId);
    if (!selectedKey) return values[0];
    return values.find((entry) => valueIdKey(entry) === selectedKey) ?? values[0];
  }

  function getRightPaneContentWidth(): number {
    const width = getPanelCols();
    const leftWidth = Math.max(28, Math.floor(width * 0.35));
    const rightWidth = Math.max(24, width - leftWidth);
    return Math.max(1, rightWidth - 2);
  }

  function ensureSelectedValueVisible(): void {
    if (!isNodesMode || !currentNodeDetail || !valuesExpanded) return;
    const selectedKey = getSelectedNodeValueKey(currentNodeDetail.nodeId);
    if (!selectedKey) return;
    const rightAllLines = wrapDetailLinesForDisplay(
      splitLines(rightText),
      getRightPaneContentWidth(),
    );
    const selectedLineIndex = rightAllLines.findIndex((line) => /^> [^\s]/.test(line));
    if (selectedLineIndex < 0) return;
    const paneHeights = getPanelContentHeightsWithMode(getPanelRows(), bottomCompact);
    const visible = Math.max(1, paneHeights.topContentHeight);
    if (selectedLineIndex < rightScroll) {
      rightScroll = selectedLineIndex;
      return;
    }
    if (selectedLineIndex >= rightScroll + visible) {
      rightScroll = selectedLineIndex - visible + 1;
    }
  }

  async function hydrateNodeValueProfileAttribution(nodeId: number): Promise<void> {
    if (!isNodesMode) return;
    if (nodeValueProfileAttributionCache.has(nodeId)) return;
    if (nodeValueProfileAttributionInFlight.has(nodeId)) return;
    const sessionState = nodesPresenter.getState().sessionConfig;
    if (!sessionState || typeof sessionState.url !== 'string' || sessionState.url.length === 0) {
      return;
    }
    if (
      typeof (curationService as { inspectNodeCompiledValueAttribution?: unknown })
        .inspectNodeCompiledValueAttribution !== 'function'
    ) {
      return;
    }

    nodeValueProfileAttributionInFlight.add(nodeId);
    try {
      const attribution = await curationService.inspectNodeCompiledValueAttribution(
        sessionState as ConnectedSessionConfig,
        nodeId,
      );
      const byValueKey = new Map<string, NodeValueProfileAttribution[]>();
      for (const [key, rows] of Object.entries(attribution.valueAttributions ?? {})) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        byValueKey.set(key, rows);
      }
      nodeValueProfileAttributionCache.set(nodeId, byValueKey);
    } catch {
      // best-effort attribution; fall back to heuristic semantics.
      nodeValueProfileAttributionCache.set(nodeId, new Map());
    } finally {
      nodeValueProfileAttributionInFlight.delete(nodeId);
      if (currentNodeDetail?.nodeId === nodeId) {
        rerenderCurrentNodeDetail();
        renderFrame();
      }
    }
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

    for (const nodeId of missing.slice(0, 64)) {
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
      collapsedValueSections.clear();
    }
    ensureSelectedNodeValueKey(detail);
    const neighborLookup = isNodesMode ? buildNeighborLookup() : undefined;
    const profileByValueKey = resolveNodeValueProfileAttribution(detail.nodeId);
    const selectedValueKey = getSelectedNodeValueKey(detail.nodeId);
    setRightPaneText(
      renderPanelNodeDetail(detail, {
        neighborsExpanded,
        valuesExpanded,
        collapsedValueSections,
        valueFetchMode: resolveValueFetchMode(detail.nodeId),
        profileByValueKey,
        selectedValueKey,
        neighborLookup,
      }),
    );
    void hydrateNodeValueProfileAttribution(detail.nodeId);
  }

  function rerenderCurrentNodeDetail(): void {
    if (!currentNodeDetail || !isNodesMode) return;
    ensureSelectedNodeValueKey(currentNodeDetail);
    const neighborLookup = buildNeighborLookup();
    const profileByValueKey = resolveNodeValueProfileAttribution(currentNodeDetail.nodeId);
    const selectedValueKey = getSelectedNodeValueKey(currentNodeDetail.nodeId);
    rightText = renderPanelNodeDetail(currentNodeDetail, {
      neighborsExpanded,
      valuesExpanded,
      collapsedValueSections,
      valueFetchMode: resolveValueFetchMode(currentNodeDetail.nodeId),
      profileByValueKey,
      selectedValueKey,
      neighborLookup,
    });
  }

  function clearExpiredPendingConfirm(): void {
    if (!pendingConfirm) return;
    if (pendingConfirm.expiresAt <= Date.now()) {
      pendingConfirm = null;
    }
  }

  function requestConfirmation(action: ConfirmAction, note?: string): boolean {
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
    const confirmLine = `Confirm ${actionLabel}: press ${key} again within ${
      WRITE_CONFIRM_WINDOW_MS / 1000
    }s`;
    if (!note) {
      setBottomPaneText(confirmLine);
      return false;
    }
    const noteLines = note.split('\n');
    const firstNoteLine = noteLines[0];
    const remainingNote = noteLines.slice(1).join('\n');
    setBottomPaneText(
      remainingNote.length > 0
        ? `${confirmLine} | ${firstNoteLine}\n${remainingNote}`
        : `${confirmLine} | ${firstNoteLine}`,
    );
    return false;
  }

  function validateDraftBeforeWrite(
    actionLabel: 'scaffold write' | 'manifest add',
  ): { ok: true; note?: string } | { ok: false } {
    const editor =
      typeof draftSurface.validateDraftEditorState === 'function'
        ? draftSurface.validateDraftEditorState()
        : getActiveDraftEditorState();
    if (!editor) return { ok: true };
    const errors = Array.isArray(editor.errors) ? editor.errors : [];
    const warnings = Array.isArray(editor.warnings) ? editor.warnings : [];
    if (errors.length > 0) {
      const firstError = errors[0];
      setBottomPaneText(
        `Cannot ${actionLabel}: draft has ${errors.length} error(s).\nFirst error: ${firstError}`,
      );
      return { ok: false };
    }
    const noteLines: string[] = [];
    if (warnings.length > 0) {
      const firstWarning = warnings[0];
      noteLines.push(`Draft warnings: ${warnings.length}. First warning: ${firstWarning}`);
    }
    const diff = buildDraftDiffSummary(editor);
    if (diff) {
      if (diff.totalChanges <= 0) {
        noteLines.push('Diff: no changes from draft baseline.');
      } else {
        noteLines.push(
          `Diff: ${diff.totalChanges} change(s) (+${diff.additions} ~${diff.updates} -${diff.removals}).`,
        );
        const maxDetailLines = 6;
        const detailLines = diff.lines.slice(0, maxDetailLines);
        noteLines.push(...detailLines);
        if (diff.lines.length > maxDetailLines) {
          noteLines.push(`... ${diff.lines.length - maxDetailLines} more change(s)`);
        }
      }
    }
    return noteLines.length > 0 ? { ok: true, note: noteLines.join('\n') } : { ok: true };
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
    return panelModeAdapter.ensureSelectedSignature({
      selectedNodeId: getSelectedNodeId(),
      selectedRuleIndex: getSelectedRuleIndex(),
      updateNodeDetail,
    });
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
    bottomPane.height = Math.max(5, bottomPaneOuterHeight);
    bottomPane.style = {
      ...(bottomPane.style ?? {}),
      border: { fg: focusedPane === 'bottom' ? 'cyan' : 'gray' },
    };
    bottomPane.setLabel(' Output / Run ');

    statusPane.top = 1 + topPaneOuterHeight;
    statusPane.left = 0;
    statusPane.width = width;
    statusPane.height = 1;
    statusPane.style = {
      ...(statusPane.style ?? {}),
      inverse: focusedPane === 'bottom',
    };

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
    const leftTitle = panelLayoutPresenter.buildListTitle({
      sessionMode: modeLabel,
      totalItems,
      visibleCapacity: listCapacity,
      windowStart: windowed.start,
      windowCount: windowed.visible.length,
      filterQuery,
    });

    const draftEditorState = panelMode === 'edit-draft' ? getActiveDraftEditorState() : undefined;
    const draftSourceNode =
      panelMode === 'edit-draft' && isNodesMode
        ? (() => {
            const nodeId = getSelectedNodeId();
            if (!nodeId) return undefined;
            const snapshot = nodesPresenter.getState();
            const item = snapshot.explorer.items.find((entry) => entry.nodeId === nodeId);
            const detailFromCache = snapshot.nodeDetailCache?.[nodeId];
            const state = (
              currentNodeDetail?.nodeId === nodeId ? currentNodeDetail : detailFromCache
            )?.state as Record<string, unknown> | null | undefined;
            const manufacturerId = normalizeIdentityText(asReadableId(state?.manufacturerId));
            const productType = normalizeIdentityText(asReadableId(state?.productType));
            const productId = normalizeIdentityText(asReadableId(state?.productId));
            const detailSignature =
              manufacturerId && productType && productId
                ? `${manufacturerId}:${productType}:${productId}`
                : null;
            return {
              nodeId,
              name: state ? (asNonEmptyString(state.name) ?? item?.name) : item?.name,
              manufacturer:
                (state ? normalizeIdentityText(formatManufacturerLabel(state)) : null) ??
                normalizeIdentityText(item?.manufacturer) ??
                null,
              product:
                (state ? normalizeIdentityText(formatProductLabel(state)) : null) ??
                normalizeIdentityText(item?.product) ??
                null,
              signature:
                detailSignature ??
                (draftEditorState
                  ? normalizeIdentityText(draftEditorState.workingDraft.signature)
                  : null),
              manufacturerId,
              productType,
              productId,
            };
          })()
        : undefined;
    const rightSourceText =
      panelMode === 'edit-draft'
        ? draftEditorState
          ? renderPanelDraftEditor(draftEditorState, {
              editingFieldPath: draftFieldEdit?.path,
              editingBuffer: draftFieldEdit?.value,
              sourceNode: draftSourceNode,
            })
          : 'Draft editor unavailable.\nPress esc to exit edit mode.'
        : rightText;
    const rightAllLines = wrapDetailLinesForDisplay(splitLines(rightSourceText), rightContentWidth);
    const rightVisibleCapacity = Math.max(1, paneHeights.topContentHeight);
    const rightMaxScroll = Math.max(0, rightAllLines.length - rightVisibleCapacity);
    rightScroll = Math.min(rightMaxScroll, Math.max(0, rightScroll));
    const rightTitle = panelLayoutPresenter.buildDetailTitle({
      panelMode,
      sessionMode: modeLabel,
      currentNodeId: isNodesMode ? currentNodeDetail?.nodeId : undefined,
      totalLines: rightAllLines.length,
      visibleCapacity: rightVisibleCapacity,
      scroll: rightScroll,
    });

    const bottomVisibleCapacity = Math.max(1, paneHeights.bottomContentHeight);
    const outputViewModel = panelOutputPresenter.build({
      text: bottomText,
      scroll: bottomScroll,
      compact: bottomCompact,
      visibleCapacity: bottomVisibleCapacity,
    });
    bottomScroll = outputViewModel.clampedScroll;
    const bottomTitle = panelLayoutPresenter.buildOutputTitle({
      compact: bottomCompact,
      totalLines: outputViewModel.lines.length,
      visibleCapacity: bottomVisibleCapacity,
      scroll: bottomScroll,
    });

    const status = isNodesMode
      ? nodesPresenter.getStatusSnapshot()
      : rulesPresenter.getStatusSnapshot();
    clearExpiredPendingConfirm();
    const chrome = panelChromePresenter.build({
      sessionMode: modeLabel,
      uiMode: config.uiMode,
      selectedSignature: status.selectedSignature,
      filterMode,
      draftFieldEditActive: draftFieldEdit !== null,
      panelMode,
      focusedPane,
      hasNodeDetail: currentNodeDetail !== null,
      valuesExpanded,
      pendingConfirmAction: pendingConfirm?.action,
      activeOperationLabel: activeOperation?.label,
    });
    const header = chrome.header;
    const footer = chrome.footer;

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
      bottomPane.hide();
      statusPane.show();
      statusPane.setContent(outputViewModel.compactLine);
    } else {
      statusPane.hide();
      bottomPane.show();
      bottomPane.setContent(outputViewModel.lines.join('\n'));
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
      bottomLines: outputViewModel.visibleLines,
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
    if (intent.type === 'escape') {
      if (draftFieldEdit) {
        draftFieldEdit = null;
        setBottomPaneText('Field edit cancelled.');
        return;
      }
      if (panelMode === 'edit-draft') {
        commitDraftEdits();
        panelMode = 'detail';
        setBottomPaneText('Saved draft edits and exited edit mode.');
      }
      return;
    }
    if (intent.type === 'start-filter') {
      filterMode = true;
      setBottomPaneText(
        `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`,
      );
      return;
    }
    if (intent.type === 'edit-draft') {
      startDraftEditMode();
      panelMode = 'edit-draft';
      focusedPane = 'right';
      rightScroll = 0;
      setBottomPaneText('Entered scaffold edit mode. Press esc to exit.');
      return;
    }
    if (intent.type === 'move-up') {
      if (focusedPane === 'left') {
        moveSelection(-1);
      } else if (focusedPane === 'right') {
        if (panelMode === 'edit-draft') {
          if (draftFieldEdit) {
            rightScroll = Math.max(0, rightScroll - 1);
          } else {
            const editor = moveDraftFieldSelection(-1);
            if (editor) {
              const selectedField = getDraftEditFieldByPath(editor, editor.selectedFieldPath);
              setBottomPaneText(
                `Selected field: ${selectedField?.label ?? editor.selectedFieldPath}`,
              );
            }
          }
        } else if (isNodesMode && valuesExpanded && currentNodeDetail) {
          moveSelectedNodeValue(-1);
          rerenderCurrentNodeDetail();
          ensureSelectedValueVisible();
        } else {
          rightScroll = Math.max(0, rightScroll - 1);
        }
      } else {
        bottomScroll = Math.max(0, bottomScroll - 1);
      }
      return;
    }
    if (intent.type === 'move-down') {
      if (focusedPane === 'left') {
        moveSelection(1);
      } else if (focusedPane === 'right') {
        if (panelMode === 'edit-draft') {
          if (draftFieldEdit) {
            rightScroll += 1;
          } else {
            const editor = moveDraftFieldSelection(1);
            if (editor) {
              const selectedField = getDraftEditFieldByPath(editor, editor.selectedFieldPath);
              setBottomPaneText(
                `Selected field: ${selectedField?.label ?? editor.selectedFieldPath}`,
              );
            }
          }
        } else if (isNodesMode && valuesExpanded && currentNodeDetail) {
          moveSelectedNodeValue(1);
          rerenderCurrentNodeDetail();
          ensureSelectedValueVisible();
        } else {
          rightScroll += 1;
        }
      } else {
        bottomScroll += 1;
      }
      return;
    }
    if (intent.type === 'move-left' || intent.type === 'move-right') {
      if (panelMode === 'edit-draft' && focusedPane === 'right' && !draftFieldEdit) {
        const editor = cycleDraftSelectField(intent.type === 'move-left' ? -1 : 1);
        if (editor) {
          const selectedField = getDraftEditFieldByPath(editor, editor.selectedFieldPath);
          setBottomPaneText(
            formatDraftUpdateMessage(selectedField?.label ?? editor.selectedFieldPath, editor),
          );
          return;
        }
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
      setBottomPaneText(renderPanelHelp(modeLabel));
      return;
    }
    if (intent.type === 'open') {
      if (panelMode === 'edit-draft') {
        if (focusedPane !== 'right') {
          setBottomPaneText('Switch to the right pane to edit scaffold fields.');
          return;
        }
        const editor = getActiveDraftEditorState();
        if (!editor) {
          setBottomPaneText('Draft editor is unavailable.');
          return;
        }
        const selectedField = getDraftEditFieldByPath(editor, editor.selectedFieldPath);
        if (!selectedField) {
          setBottomPaneText(`Unknown selected field: ${editor.selectedFieldPath}`);
          return;
        }
        if (draftFieldEdit) {
          const updatedEditor = setDraftFieldValue(draftFieldEdit.path, draftFieldEdit.value);
          draftFieldEdit = null;
          setBottomPaneText(formatDraftUpdateMessage(selectedField.label, updatedEditor));
          return;
        }
        if (selectedField.type === 'select') {
          const next = cycleDraftSelectField(1);
          if (next) {
            setBottomPaneText(formatDraftUpdateMessage(selectedField.label, next));
          }
          return;
        }
        draftFieldEdit = {
          path: selectedField.path,
          value: getDraftEditorFieldValue(editor, selectedField.path),
        };
        setBottomPaneText(`Editing ${selectedField.label}. Type value and press enter to apply.`);
        return;
      }
      if (isNodesMode) {
        const nodeId = getSelectedNodeId();
        if (!nodeId) throw new Error('No node selected');
        const isRightDetailOpen =
          focusedPane === 'right' && currentNodeDetail?.nodeId === nodeId && valuesExpanded;
        if (isRightDetailOpen) {
          const selectedValue = currentNodeDetail
            ? resolveSelectedNodeValue(currentNodeDetail)
            : null;
          if (selectedValue?.valueId) {
            if (
              typeof (nodesPresenter as { fetchNodeValue?: unknown }).fetchNodeValue === 'function'
            ) {
              const detail = await nodesPresenter.fetchNodeValue(nodeId, selectedValue.valueId);
              const metadata = asRecord(selectedValue.metadata);
              const label =
                asNonEmptyString(metadata?.label) ??
                asNonEmptyString(metadata?.description) ??
                valueIdKey(selectedValue);
              updateNodeDetail(detail);
              setBottomPaneText(`Fetched value ${label} for node ${nodeId}.`);
              return;
            }
            setBottomPaneText('Value-level fetch is unavailable in this presenter.');
            return;
          }
          setBottomPaneText('No selectable value. Expand a values subsection first.');
          return;
        }
        const detail = await nodesPresenter.showNodeDetail(nodeId, {
          includeValues: resolveValueFetchMode(nodeId),
          maxValues: config.maxValues,
        });
        updateNodeDetail(detail);
      } else {
        const ruleIndex = getSelectedRuleIndex();
        if (!ruleIndex) throw new Error('No rule selected');
        currentNodeDetail = null;
        neighborsExpanded = false;
        valuesExpanded = false;
        collapsedValueSections.clear();
        setRightPaneText(renderPanelRuleDetail(rulesPresenter.showRuleDetail(ruleIndex)));
      }
      return;
    }
    if (intent.type === 'fetch-full-values') {
      if (!isNodesMode) {
        setBottomPaneText('Full value fetch is only available in nodes mode.');
        return;
      }
      const nodeId = getSelectedNodeId();
      if (!nodeId) {
        setBottomPaneText('No node selected.');
        return;
      }
      const detail = await nodesPresenter.showNodeDetail(nodeId, {
        includeValues: 'full',
        maxValues: config.maxValues,
      });
      nodeValueFetchModeOverride.set(nodeId, 'full');
      updateNodeDetail(detail);
      setBottomPaneText(`Fetched full values for node ${nodeId}.`);
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
            collapsedValueSections.clear();
            nodeValueFetchModeOverride.clear();
            nodeSelectedValueKeyByNode.clear();
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
        const detail = await nodesPresenter.showNodeDetail(nodeId, {
          includeValues: resolveValueFetchMode(nodeId),
          maxValues: config.maxValues,
        });
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
        const detail = await nodesPresenter.showNodeDetail(nodeId, {
          includeValues: resolveValueFetchMode(nodeId),
          maxValues: config.maxValues,
        });
        updateNodeDetail(detail);
      }
      valuesExpanded = !valuesExpanded;
      rerenderCurrentNodeDetail();
      setBottomPaneText(valuesExpanded ? 'Expanded values.' : 'Collapsed values.');
      return;
    }
    if (intent.type === 'toggle-value-section') {
      if (!isNodesMode) {
        setBottomPaneText('Values subsections are only available in nodes mode.');
        return;
      }
      if (!currentNodeDetail) {
        const nodeId = getSelectedNodeId();
        if (!nodeId) {
          setBottomPaneText('Open a node first.');
          return;
        }
        const detail = await nodesPresenter.showNodeDetail(nodeId, {
          includeValues: resolveValueFetchMode(nodeId),
          maxValues: config.maxValues,
        });
        updateNodeDetail(detail);
      }
      const section = VALUE_SECTION_BY_TOGGLE_KEY.get(intent.key);
      if (!section) {
        setBottomPaneText(`Unknown value subsection key: ${intent.key}`);
        return;
      }
      const isCollapsed = collapsedValueSections.has(section.id);
      if (isCollapsed) {
        collapsedValueSections.delete(section.id);
      } else {
        collapsedValueSections.add(section.id);
      }
      rerenderCurrentNodeDetail();
      setBottomPaneText(
        `${isCollapsed ? 'Expanded' : 'Collapsed'} value subsection: ${section.title} (${section.toggleKey}).`,
      );
      return;
    }
    if (intent.type === 'inspect') {
      const selectedNodeId = isNodesMode ? getSelectedNodeId() : undefined;
      setBottomPaneText(`Running inspect${selectedNodeId ? ` for node ${selectedNodeId}` : ''}...`);
      renderFrame();
      const signature = await ensureSelectedSignature();
      const summaryText = await runTimedOperation(`inspect ${signature}`, () =>
        panelModeAdapter.inspectText({ nodeId: selectedNodeId }),
      );
      setBottomPaneText(summaryText);
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
      const summaryText = await runTimedOperation(`validate ${signature}`, () =>
        panelModeAdapter.validateText({ nodeId: selectedNodeId }),
      );
      setBottomPaneText(summaryText);
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
      const summaryText = await runTimedOperation(
        `simulate ${signature}${intent.dryRun ? ' (dry-run)' : ''}`,
        () => panelModeAdapter.simulateText({ nodeId: selectedNodeId, dryRun: intent.dryRun }),
      );
      setBottomPaneText(summaryText);
      io.log(`simulated ${signature}${intent.dryRun ? ' (dry-run)' : ''}`);
      return;
    }
    if (intent.type === 'scaffold-preview') {
      await ensureSelectedSignature();
      setBottomPaneText(panelModeAdapter.scaffoldPreviewText({}));
      return;
    }
    if (intent.type === 'scaffold-write') {
      const draftValidation = validateDraftBeforeWrite('scaffold write');
      if (!draftValidation.ok) {
        return;
      }
      if (panelMode === 'edit-draft') {
        commitDraftEdits();
      }
      if (!requestConfirmation('scaffold-write', draftValidation.note)) {
        return;
      }
      const written = panelModeAdapter.writeScaffold(true);
      setBottomPaneText(`Scaffold written: ${written}`);
      return;
    }
    if (intent.type === 'manifest-add') {
      const draftValidation = validateDraftBeforeWrite('manifest add');
      if (!draftValidation.ok) {
        return;
      }
      if (panelMode === 'edit-draft') {
        commitDraftEdits();
      }
      if (!requestConfirmation('manifest-add', draftValidation.note)) {
        return;
      }
      const result = panelModeAdapter.addManifest({ confirm: true });
      setBottomPaneText(renderManifestResult(result));
      return;
    }
    if (intent.type === 'status') {
      setBottomPaneText(panelModeAdapter.statusText());
      return;
    }
    if (intent.type === 'log') {
      setBottomPaneText(panelModeAdapter.logText(30));
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
    await panelModeAdapter.initialize(config);
    if (panelModeAdapter.mode === 'nodes' && config.startNode !== undefined) {
      updateNodeDetail(await nodesPresenter.showNodeDetail(config.startNode));
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
        const keyName = (key.name ?? '').toLowerCase();
        const isReturnLike = key.sequence === '\r' && (keyName === 'enter' || keyName === 'return');
        if (isReturnLike) {
          const now = Date.now();
          if (
            pendingReturnLikeCounterpart !== null &&
            now <= pendingReturnLikeExpiresAt &&
            keyName === pendingReturnLikeCounterpart
          ) {
            pendingReturnLikeCounterpart = null;
            pendingReturnLikeExpiresAt = 0;
            return;
          }
          pendingReturnLikeCounterpart = keyName === 'enter' ? 'return' : 'enter';
          pendingReturnLikeExpiresAt = now + RETURN_KEYPRESS_DEDUP_MS;
        } else {
          pendingReturnLikeCounterpart = null;
          pendingReturnLikeExpiresAt = 0;
        }
        if (
          panelMode === 'edit-draft' &&
          focusedPane === 'right' &&
          !filterMode &&
          !draftFieldEdit
        ) {
          try {
            if (char === '+') {
              const editor = addDraftCapabilityRow();
              if (editor) {
                setBottomPaneText(`Added capability row ${editor.selectedCapabilityIndex + 1}.`);
                renderFrame();
                return;
              }
            }
            if (char === '*') {
              const selectedIndex = getSelectedDraftCapabilityIndex();
              if (selectedIndex === undefined) {
                setBottomPaneText('No capability row selected to clone.');
              } else {
                const editor = cloneDraftCapabilityRow(selectedIndex);
                if (editor) {
                  setBottomPaneText(
                    `Cloned capability row ${selectedIndex + 1} -> ${editor.selectedCapabilityIndex + 1}.`,
                  );
                }
              }
              renderFrame();
              return;
            }
            if (char === '-') {
              const selectedIndex = getSelectedDraftCapabilityIndex();
              if (selectedIndex === undefined) {
                setBottomPaneText('No capability row selected to remove.');
              } else {
                const editor = removeDraftCapabilityRow(selectedIndex);
                if (editor) {
                  setBottomPaneText(`Removed capability row ${selectedIndex + 1}.`);
                }
              }
              renderFrame();
              return;
            }
            if (char === '<' || char === '>') {
              const selectedIndex = getSelectedDraftCapabilityIndex();
              if (selectedIndex === undefined) {
                setBottomPaneText('No capability row selected to reorder.');
              } else {
                const direction = char === '<' ? -1 : 1;
                const editor = moveDraftCapabilityRow(selectedIndex, direction);
                if (editor) {
                  setBottomPaneText(
                    `Moved capability row ${selectedIndex + 1} to ${editor.selectedCapabilityIndex + 1}.`,
                  );
                }
              }
              renderFrame();
              return;
            }
          } catch (error) {
            setBottomPaneText(`Error: ${error instanceof Error ? error.message : String(error)}`);
            renderFrame();
            return;
          }
        }
        const parsedIntent = keypressToPanelIntent(char, key);
        if (!filterMode && parsedIntent.type === 'start-filter') {
          filterMode = true;
          setBottomPaneText(
            `Filter: ${filterQuery || '<empty>'} (${getListEntries().length} match(es))`,
          );
          renderFrame();
          return;
        }
        if (draftFieldEdit) {
          const name = (key.name ?? '').toLowerCase();
          if (key.ctrl && name === 'c') {
            queueIntent({ type: 'quit' });
            return;
          }
          if (name === 'escape') {
            draftFieldEdit = null;
            setBottomPaneText('Field edit cancelled.');
            renderFrame();
            return;
          }
          if (name === 'return' || name === 'enter') {
            try {
              const updatedEditor = setDraftFieldValue(draftFieldEdit.path, draftFieldEdit.value);
              const editor = getActiveDraftEditorState();
              const label =
                (editor
                  ? getDraftEditFieldByPath(editor, draftFieldEdit.path)?.label
                  : undefined) ?? draftFieldEdit.path;
              draftFieldEdit = null;
              setBottomPaneText(formatDraftUpdateMessage(label, updatedEditor));
            } catch (error) {
              setBottomPaneText(`Error: ${error instanceof Error ? error.message : String(error)}`);
            }
            renderFrame();
            return;
          }
          if (name === 'backspace') {
            draftFieldEdit = {
              ...draftFieldEdit,
              value: draftFieldEdit.value.slice(0, -1),
            };
            setBottomPaneText(`Editing ${draftFieldEdit.path}: ${draftFieldEdit.value}`);
            renderFrame();
            return;
          }
          const printable = resolvePrintableKeypress(char, key);
          if (printable) {
            draftFieldEdit = {
              ...draftFieldEdit,
              value: `${draftFieldEdit.value}${printable}`,
            };
            setBottomPaneText(`Editing ${draftFieldEdit.path}: ${draftFieldEdit.value}`);
            renderFrame();
            return;
          }
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
          const printable = resolvePrintableKeypress(char, key);
          if (printable) {
            filterQuery += printable;
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
    await panelModeAdapter.teardown();
  }
}

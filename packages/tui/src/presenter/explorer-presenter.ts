import type {
  AppState,
  ConnectedSessionConfig,
  DraftEditorState,
  IncludeValuesMode,
  NodeDetail,
  NodeValueDetail,
  NodeSummary,
  ScaffoldDraft,
  SimulationSummary,
  SignatureInspectSummary,
  StatusSnapshot,
  ValidationSummary,
  ValueIdShape,
} from '../model/types';
import type { CurationWorkflowChildPresenterLike } from './curation-workflow-presenter';
import type { ExplorerSessionChildPresenterLike } from './explorer-session-presenter';
import {
  cloneScaffoldDraft,
  DraftEditorCore,
  type DraftValidationVocabulary,
} from './draft-editor-core';
import { SignatureWorkflowCore } from './signature-workflow-core';

export type { DraftValidationVocabulary } from './draft-editor-core';

export interface ExplorerPresenterChildren {
  explorer: ExplorerSessionChildPresenterLike;
  curation: CurationWorkflowChildPresenterLike;
}

export interface ExplorerPresenterOptions {
  draftVocabulary?: DraftValidationVocabulary;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function stableValueIdKey(valueId: ValueIdShape): string {
  return [
    String(valueId.commandClass),
    String(valueId.endpoint ?? 0),
    String(valueId.property),
    valueId.propertyKey == null ? '' : String(valueId.propertyKey),
  ].join(':');
}

function stableNodeValueKey(value: NodeValueDetail): string {
  if (!value.valueId) return 'missing';
  return stableValueIdKey(value.valueId);
}

function mergeNodeValues(
  existing: NodeValueDetail[],
  incoming: NodeValueDetail,
): NodeValueDetail[] {
  const incomingKey = stableNodeValueKey(incoming);
  let replaced = false;
  const merged = existing.map((entry) => {
    if (stableNodeValueKey(entry) !== incomingKey) return entry;
    replaced = true;
    return incoming;
  });
  if (!replaced) {
    merged.push(incoming);
  }
  return merged;
}

export class ExplorerPresenter {
  private state: AppState = {
    connectionState: 'disconnected',
    explorer: {
      items: [],
    },
    nodeDetailCache: {},
    runLog: [],
  };

  private readonly draftEditor: DraftEditorCore;
  private readonly signatureWorkflow: SignatureWorkflowCore;

  constructor(
    private readonly children: ExplorerPresenterChildren,
    options: ExplorerPresenterOptions = {},
  ) {
    this.draftEditor = new DraftEditorCore({
      draftVocabulary: options.draftVocabulary,
    });
    this.signatureWorkflow = new SignatureWorkflowCore({
      curation: this.children.curation,
      resolveSession: () => {
        this.requireReady();
        return this.requireSessionConfig();
      },
      logInfo: (message) => this.logInfo(message),
      logError: (message) => this.logError(message),
    });
  }

  getState(): AppState {
    return {
      ...this.state,
      explorer: { ...this.state.explorer, items: [...this.state.explorer.items] },
      nodeDetailCache: { ...this.state.nodeDetailCache },
      inspectSummary: this.state.inspectSummary
        ? { ...this.state.inspectSummary, nodes: [...this.state.inspectSummary.nodes] }
        : undefined,
      validationSummary: this.state.validationSummary
        ? {
            ...this.state.validationSummary,
            outcomes: { ...this.state.validationSummary.outcomes },
          }
        : undefined,
      simulationSummary: this.state.simulationSummary
        ? {
            ...this.state.simulationSummary,
            outcomes: { ...this.state.simulationSummary.outcomes },
          }
        : undefined,
      scaffoldDraft: this.state.scaffoldDraft
        ? {
            ...this.state.scaffoldDraft,
            bundle: JSON.parse(JSON.stringify(this.state.scaffoldDraft.bundle)),
          }
        : undefined,
      runLog: [...this.state.runLog],
    };
  }

  async connect(config: ConnectedSessionConfig): Promise<NodeSummary[]> {
    this.state.sessionConfig = config;
    this.state.connectionState = 'connecting';
    this.state.lastError = undefined;
    this.logInfo(`Connecting to ${config.url}`);

    try {
      await this.children.explorer.connect(config);
      this.state.connectionState = 'ready';
      this.logInfo('Connected');
      return await this.refreshNodes();
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.connectionState = 'error';
      this.state.lastError = message;
      this.logError(`Connect failed: ${message}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.children.explorer.disconnect();
    this.state.connectionState = 'disconnected';
    this.logInfo('Disconnected');
  }

  async refreshNodes(): Promise<NodeSummary[]> {
    this.requireReady();
    try {
      const nodes = await this.children.explorer.listNodes();
      this.state.explorer.items = nodes;
      this.state.explorer.lastRefreshedAt = nowIso();
      this.logInfo(`Loaded ${nodes.length} node(s)`);
      return nodes;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Node refresh failed: ${message}`);
      throw error;
    }
  }

  async showNodeDetail(
    nodeId: number,
    options: {
      selectNode?: boolean;
      includeValues?: IncludeValuesMode;
      maxValues?: number;
      includeLinkQuality?: boolean;
    } = {},
  ): Promise<NodeDetail> {
    this.requireReady();
    const config = this.requireSessionConfig();
    if (options.selectNode !== false) {
      this.state.explorer.selectedNodeId = nodeId;
    }

    try {
      const detail = await this.children.explorer.getNodeDetail(nodeId, {
        includeValues: options.includeValues ?? config.includeValues,
        maxValues: options.maxValues ?? config.maxValues,
        includeLinkQuality: options.includeLinkQuality,
      });
      this.state.nodeDetailCache[nodeId] = detail;
      this.logInfo(`Loaded node ${nodeId} detail`);
      return detail;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Node detail failed for ${nodeId}: ${message}`);
      throw error;
    }
  }

  async fetchNodeValue(nodeId: number, valueId: ValueIdShape): Promise<NodeDetail> {
    this.requireReady();
    this.requireSessionConfig();

    try {
      const valueDetail = await this.children.explorer.getNodeValueDetail(nodeId, valueId);
      const cachedDetail = this.state.nodeDetailCache[nodeId];
      let baseDetail: NodeDetail;
      if (cachedDetail) {
        baseDetail = cachedDetail;
      } else {
        baseDetail = await this.showNodeDetail(nodeId, {
          selectNode: false,
          includeValues: 'none',
          maxValues: 1,
          includeLinkQuality: false,
        });
      }
      const existingValues = Array.isArray(baseDetail.values) ? baseDetail.values : [];
      const mergedDetail: NodeDetail = {
        ...baseDetail,
        values: mergeNodeValues(existingValues, valueDetail),
      };
      this.state.nodeDetailCache[nodeId] = mergedDetail;
      this.logInfo(`Loaded node ${nodeId} value ${stableValueIdKey(valueId)}`);
      return mergedDetail;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(
        `Node value fetch failed for ${nodeId} (${stableValueIdKey(valueId)}): ${message}`,
      );
      throw error;
    }
  }

  selectSignature(signature: string): void {
    this.signatureWorkflow.selectSignature(this.state, signature);
  }

  selectSignatureFromNode(nodeId?: number): string {
    this.requireReady();
    const targetNodeId = nodeId ?? this.state.explorer.selectedNodeId;
    if (!targetNodeId) {
      throw new Error('No node selected. Run "show <nodeId>" first.');
    }
    const detail = this.state.nodeDetailCache[targetNodeId];
    if (!detail) {
      throw new Error(`Node ${targetNodeId} detail not loaded. Run "show ${targetNodeId}" first.`);
    }
    const signature = this.children.curation.deriveSignatureFromNodeDetail(detail);
    if (!signature) {
      throw new Error(`Node ${targetNodeId} does not have a complete product signature.`);
    }
    this.state.selectedSignature = signature;
    this.logInfo(`Derived signature ${signature} from node ${targetNodeId}`);
    return signature;
  }

  async inspectSelectedSignature(
    options: {
      manifestFile?: string;
      includeControllerNodes?: boolean;
      nodeId?: number;
    } = {},
  ): Promise<SignatureInspectSummary> {
    return this.signatureWorkflow.inspectSelectedSignature(this.state, options);
  }

  async validateSelectedSignature(
    options: {
      manifestFile?: string;
      includeControllerNodes?: boolean;
      nodeId?: number;
    } = {},
  ): Promise<ValidationSummary> {
    return this.signatureWorkflow.validateSelectedSignature(this.state, options);
  }

  async simulateSelectedSignature(
    options: {
      manifestFile?: string;
      includeControllerNodes?: boolean;
      nodeId?: number;
      skipInspect?: boolean;
      dryRun?: boolean;
      inspectFormat?: string;
    } = {},
  ): Promise<SimulationSummary> {
    return this.signatureWorkflow.simulateSelectedSignature(this.state, options);
  }

  createScaffoldFromSignature(options: {
    signature?: string;
    productName?: string;
    ruleIdPrefix?: string;
    homeyClass?: string;
  }): ScaffoldDraft {
    const draft = this.signatureWorkflow.createScaffoldFromSignature(this.state, options);
    this.draftEditor.clear();
    return draft;
  }

  startDraftEdit(): DraftEditorState {
    const draft = this.state.scaffoldDraft;
    if (!draft) {
      throw new Error('No scaffold draft prepared. Run scaffold preview first.');
    }
    this.draftEditor.start(draft);
    this.logInfo(`Draft edit started for ${draft.signature}`);
    return this.draftEditor.getOrThrow();
  }

  getDraftEditorState(): DraftEditorState | undefined {
    return this.draftEditor.get();
  }

  setDraftEditorField(path: string, value: unknown): DraftEditorState {
    return this.draftEditor.setField(path, value);
  }

  setDraftEditorCapabilityField(
    index: number,
    field: 'capabilityId' | 'directionality',
    value: unknown,
  ): DraftEditorState {
    return this.draftEditor.setCapabilityField(index, field, value);
  }

  setDraftEditorCapabilityMappingField(
    index: number,
    path: string,
    value: unknown,
  ): DraftEditorState {
    return this.draftEditor.setCapabilityMappingField(index, path, value);
  }

  setDraftEditorSelectedField(path: string): DraftEditorState {
    return this.draftEditor.setSelectedField(path);
  }

  addDraftEditorCapability(): DraftEditorState {
    return this.draftEditor.addCapability();
  }

  cloneDraftEditorCapability(index?: number): DraftEditorState {
    return this.draftEditor.cloneCapability(index);
  }

  removeDraftEditorCapability(index?: number): DraftEditorState {
    return this.draftEditor.removeCapability(index);
  }

  moveDraftEditorCapability(index: number, delta: -1 | 1): DraftEditorState {
    return this.draftEditor.moveCapability(index, delta);
  }

  validateDraftEditorState(): DraftEditorState {
    return this.draftEditor.validate();
  }

  resetDraftEditorState(): DraftEditorState {
    return this.draftEditor.reset();
  }

  commitDraftEditorState(): ScaffoldDraft {
    const committedDraft = this.draftEditor.commit();
    this.state.scaffoldDraft = cloneScaffoldDraft(committedDraft);
    this.logInfo(`Draft edit committed for ${committedDraft.signature}`);
    return committedDraft;
  }

  clearDraftEditorState(): void {
    if (this.draftEditor.get()) {
      this.logInfo('Draft edit cleared');
    }
    this.draftEditor.clear();
  }

  writeScaffoldDraft(filePath?: string, options: { confirm?: boolean } = {}): string {
    const draft = this.state.scaffoldDraft;
    if (!draft) {
      throw new Error('No scaffold draft prepared. Run "scaffold preview" first.');
    }
    const targetPath = filePath ?? draft.fileHint;
    try {
      const written = this.children.curation.writeScaffoldDraft(targetPath, draft, options);
      this.logInfo(`Wrote scaffold file ${written}`);
      return written;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Scaffold write failed: ${message}`);
      throw error;
    }
  }

  addDraftToManifest(
    options: { manifestFile?: string; filePath?: string; confirm?: boolean } = {},
  ): { manifestFile: string; entryFilePath: string; updated: boolean } {
    const draft = this.state.scaffoldDraft;
    if (!draft) {
      throw new Error('No scaffold draft prepared. Run "scaffold preview" first.');
    }
    const manifestFile = options.manifestFile ?? 'rules/manifest.json';
    const filePath = options.filePath ?? draft.fileHint;
    try {
      const result = this.children.curation.addProductRuleToManifest(manifestFile, filePath, {
        confirm: options.confirm,
      });
      if (result.updated) {
        this.logInfo(`Added ${result.entryFilePath} to manifest`);
      } else {
        this.logInfo(`Manifest already contains ${result.entryFilePath}`);
      }
      return result;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Manifest update failed: ${message}`);
      throw error;
    }
  }

  getStatusSnapshot(): StatusSnapshot {
    return {
      mode: 'nodes',
      connectionState: this.state.connectionState,
      selectedNodeId: this.state.explorer.selectedNodeId,
      selectedSignature: this.state.selectedSignature,
      cachedNodeCount: this.state.explorer.items.length,
      scaffoldFileHint: this.state.scaffoldDraft?.fileHint,
    };
  }

  getRunLog(limit = 30): AppState['runLog'] {
    return this.state.runLog.slice(-limit);
  }

  private requireReady(): void {
    if (this.state.connectionState !== 'ready') {
      throw new Error(`Presenter is not ready (state=${this.state.connectionState})`);
    }
  }

  private requireSessionConfig(): ConnectedSessionConfig {
    if (!this.state.sessionConfig) {
      throw new Error('Session config is not set');
    }
    if (
      typeof this.state.sessionConfig.url !== 'string' ||
      this.state.sessionConfig.url.length === 0
    ) {
      throw new Error('Session config does not include a ZWJS URL');
    }
    return this.state.sessionConfig as ConnectedSessionConfig;
  }

  private logInfo(message: string): void {
    this.state.runLog.push({
      timestamp: nowIso(),
      level: 'info',
      message,
    });
  }

  private logError(message: string): void {
    this.state.runLog.push({
      timestamp: nowIso(),
      level: 'error',
      message,
    });
  }
}

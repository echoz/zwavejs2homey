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

export interface ExplorerPresenterChildren {
  explorer: ExplorerSessionChildPresenterLike;
  curation: CurationWorkflowChildPresenterLike;
}

type DraftCapabilityDirectionality = 'bidirectional' | 'inbound-only' | 'outbound-only';

interface DraftCapabilityShape {
  capabilityId: string;
  directionality: DraftCapabilityDirectionality;
  inboundMapping?: Record<string, unknown>;
  outboundMapping?: Record<string, unknown>;
  flags?: Record<string, unknown>;
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

function cloneScaffoldDraft(draft: ScaffoldDraft): ScaffoldDraft {
  return {
    ...draft,
    bundle: JSON.parse(JSON.stringify(draft.bundle)),
  };
}

function createDraftEditorState(draft: ScaffoldDraft): DraftEditorState {
  const baseDraft = cloneScaffoldDraft(draft);
  return {
    baseDraft,
    workingDraft: cloneScaffoldDraft(draft),
    dirty: false,
    errors: [],
    warnings: [],
    selectedCapabilityIndex: 0,
    selectedFieldPath: 'bundle.metadata.productName',
    lastValidatedAt: nowIso(),
  };
}

function setByPath(
  target: Record<string, unknown>,
  pathSegments: string[],
  value: unknown,
): Record<string, unknown> {
  if (pathSegments.length <= 0) return target;
  const [head, ...tail] = pathSegments;
  if (tail.length === 0) {
    return { ...target, [head]: value };
  }
  const nested =
    target[head] && typeof target[head] === 'object' && !Array.isArray(target[head])
      ? (target[head] as Record<string, unknown>)
      : {};
  return {
    ...target,
    [head]: setByPath(nested, tail, value),
  };
}

function isDirectionality(value: unknown): value is DraftCapabilityDirectionality {
  return value === 'bidirectional' || value === 'inbound-only' || value === 'outbound-only';
}

function normalizeDraftCapability(entry: unknown): DraftCapabilityShape {
  const record = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
  const capabilityId =
    typeof record.capabilityId === 'string' && record.capabilityId.trim().length > 0
      ? record.capabilityId.trim()
      : '';
  const directionality = isDirectionality(record.directionality)
    ? record.directionality
    : 'bidirectional';
  return {
    capabilityId,
    directionality,
    inboundMapping:
      record.inboundMapping && typeof record.inboundMapping === 'object'
        ? (record.inboundMapping as Record<string, unknown>)
        : undefined,
    outboundMapping:
      record.outboundMapping && typeof record.outboundMapping === 'object'
        ? (record.outboundMapping as Record<string, unknown>)
        : undefined,
    flags:
      record.flags && typeof record.flags === 'object'
        ? (record.flags as Record<string, unknown>)
        : undefined,
  };
}

function getDraftCapabilities(bundle: Record<string, unknown>): DraftCapabilityShape[] {
  const raw = Array.isArray(bundle.capabilities) ? bundle.capabilities : [];
  return raw.map((entry) => normalizeDraftCapability(entry));
}

function setDraftCapabilities(
  bundle: Record<string, unknown>,
  capabilities: DraftCapabilityShape[],
): Record<string, unknown> {
  return { ...bundle, capabilities: capabilities.map((entry) => ({ ...entry })) };
}

function selectedCapabilityPath(index: number, field: 'capabilityId' | 'directionality'): string {
  return `bundle.capabilities.${index}.${field}`;
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

  private draftEditorState?: DraftEditorState;

  constructor(private readonly children: ExplorerPresenterChildren) {}

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
    if (!/^\d+:\d+:\d+$/.test(signature)) {
      throw new Error('Signature must be <manufacturerId:productType:productId> in decimal format');
    }
    this.state.selectedSignature = signature;
    this.logInfo(`Selected signature ${signature}`);
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
    this.requireReady();
    const session = this.requireSessionConfig();
    const signature = this.requireSelectedSignature();

    try {
      const summary = await this.children.curation.inspectSignature(session, signature, options);
      this.state.inspectSummary = summary;
      this.logInfo(`Inspected signature ${signature} (${summary.totalNodes} node(s))`);
      return summary;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Inspect failed for ${signature}: ${message}`);
      throw error;
    }
  }

  async validateSelectedSignature(
    options: {
      manifestFile?: string;
      includeControllerNodes?: boolean;
      nodeId?: number;
    } = {},
  ): Promise<ValidationSummary> {
    this.requireReady();
    const session = this.requireSessionConfig();
    const signature = this.requireSelectedSignature();

    try {
      const summary = await this.children.curation.validateSignature(session, signature, options);
      this.state.validationSummary = summary;
      this.logInfo(`Validated signature ${signature} (${summary.totalNodes} node(s))`);
      return summary;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Validate failed for ${signature}: ${message}`);
      throw error;
    }
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
    this.requireReady();
    const session = this.requireSessionConfig();
    const signature = this.requireSelectedSignature();

    try {
      const summary = await this.children.curation.simulateSignature(session, signature, options);
      this.state.simulationSummary = summary;
      this.logInfo(`Simulated signature ${signature} (${summary.totalNodes} node(s))`);
      return summary;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Simulate failed for ${signature}: ${message}`);
      throw error;
    }
  }

  createScaffoldFromSignature(options: {
    signature?: string;
    productName?: string;
    ruleIdPrefix?: string;
    homeyClass?: string;
  }): ScaffoldDraft {
    const signature = options.signature ?? this.state.selectedSignature;
    if (!signature) {
      throw new Error('No signature selected. Use "signature ..." first.');
    }
    const inferredHomeyClass = options.homeyClass ?? this.inferHomeyClassForSignature(signature);

    try {
      const draft = this.children.curation.scaffoldFromSignature(signature, {
        productName: options.productName,
        ruleIdPrefix: options.ruleIdPrefix,
        homeyClass: inferredHomeyClass,
      });
      this.state.scaffoldDraft = draft;
      this.draftEditorState = undefined;
      this.logInfo(`Prepared scaffold draft for ${signature}`);
      return draft;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Scaffold failed: ${message}`);
      throw error;
    }
  }

  startDraftEdit(): DraftEditorState {
    const draft = this.state.scaffoldDraft;
    if (!draft) {
      throw new Error('No scaffold draft prepared. Run scaffold preview first.');
    }
    this.draftEditorState = createDraftEditorState(draft);
    this.logInfo(`Draft edit started for ${draft.signature}`);
    return this.getDraftEditorStateOrThrow();
  }

  getDraftEditorState(): DraftEditorState | undefined {
    if (!this.draftEditorState) return undefined;
    return {
      ...this.draftEditorState,
      baseDraft: cloneScaffoldDraft(this.draftEditorState.baseDraft),
      workingDraft: cloneScaffoldDraft(this.draftEditorState.workingDraft),
      errors: [...this.draftEditorState.errors],
      warnings: [...this.draftEditorState.warnings],
    };
  }

  setDraftEditorField(path: string, value: unknown): DraftEditorState {
    const editor = this.getDraftEditorStateOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);

    if (path === 'fileHint') {
      workingDraft.fileHint = String(value);
    } else if (path.startsWith('bundle.')) {
      const pathSegments = path
        .slice('bundle.'.length)
        .split('.')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
      workingDraft.bundle = setByPath(workingDraft.bundle, pathSegments, value);
    } else {
      throw new Error(`Unsupported draft editor field path: ${path}`);
    }

    this.draftEditorState = {
      ...editor,
      workingDraft,
      dirty: JSON.stringify(editor.baseDraft) !== JSON.stringify(workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validateDraftEditorState();
  }

  setDraftEditorCapabilityField(
    index: number,
    field: 'capabilityId' | 'directionality',
    value: unknown,
  ): DraftEditorState {
    const editor = this.getDraftEditorStateOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    if (index < 0 || index >= capabilities.length) {
      throw new Error(`Capability index out of range: ${index}`);
    }
    const next = capabilities[index];
    if (field === 'capabilityId') {
      next.capabilityId = String(value ?? '').trim();
    } else {
      const directionality = String(value ?? '').trim();
      if (!isDirectionality(directionality)) {
        throw new Error(`Unsupported directionality: ${directionality}`);
      }
      next.directionality = directionality;
    }
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: index,
      selectedFieldPath: selectedCapabilityPath(index, field),
      dirty: JSON.stringify(editor.baseDraft) !== JSON.stringify(workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validateDraftEditorState();
  }

  setDraftEditorSelectedField(path: string): DraftEditorState {
    const editor = this.getDraftEditorStateOrThrow();
    this.draftEditorState = {
      ...editor,
      selectedFieldPath: path,
      lastValidatedAt: nowIso(),
    };
    return this.getDraftEditorStateOrThrow();
  }

  addDraftEditorCapability(): DraftEditorState {
    const editor = this.getDraftEditorStateOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    capabilities.push({
      capabilityId: '',
      directionality: 'bidirectional',
    });
    const index = capabilities.length - 1;
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: index,
      selectedFieldPath: selectedCapabilityPath(index, 'capabilityId'),
      dirty: JSON.stringify(editor.baseDraft) !== JSON.stringify(workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validateDraftEditorState();
  }

  cloneDraftEditorCapability(index?: number): DraftEditorState {
    const editor = this.getDraftEditorStateOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    if (capabilities.length === 0) {
      throw new Error('No capability rows available to clone.');
    }
    const selectedIndex = Math.max(
      0,
      Math.min(capabilities.length - 1, index ?? editor.selectedCapabilityIndex ?? 0),
    );
    const source = capabilities[selectedIndex];
    capabilities.splice(selectedIndex + 1, 0, { ...source });
    const nextIndex = selectedIndex + 1;
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: nextIndex,
      selectedFieldPath: selectedCapabilityPath(nextIndex, 'capabilityId'),
      dirty: JSON.stringify(editor.baseDraft) !== JSON.stringify(workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validateDraftEditorState();
  }

  removeDraftEditorCapability(index?: number): DraftEditorState {
    const editor = this.getDraftEditorStateOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    if (capabilities.length === 0) {
      throw new Error('No capability rows available to remove.');
    }
    const selectedIndex = Math.max(
      0,
      Math.min(capabilities.length - 1, index ?? editor.selectedCapabilityIndex ?? 0),
    );
    capabilities.splice(selectedIndex, 1);
    const nextIndex = Math.max(0, Math.min(capabilities.length - 1, selectedIndex));
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: nextIndex,
      selectedFieldPath:
        capabilities.length > 0
          ? selectedCapabilityPath(nextIndex, 'capabilityId')
          : 'bundle.metadata.productName',
      dirty: JSON.stringify(editor.baseDraft) !== JSON.stringify(workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validateDraftEditorState();
  }

  moveDraftEditorCapability(index: number, delta: -1 | 1): DraftEditorState {
    const editor = this.getDraftEditorStateOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    if (capabilities.length === 0) {
      throw new Error('No capability rows available to move.');
    }
    if (index < 0 || index >= capabilities.length) {
      throw new Error(`Capability index out of range: ${index}`);
    }
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= capabilities.length) {
      return this.getDraftEditorStateOrThrow();
    }
    const [moved] = capabilities.splice(index, 1);
    capabilities.splice(targetIndex, 0, moved);
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: targetIndex,
      selectedFieldPath: selectedCapabilityPath(targetIndex, 'capabilityId'),
      dirty: JSON.stringify(editor.baseDraft) !== JSON.stringify(workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validateDraftEditorState();
  }

  validateDraftEditorState(): DraftEditorState {
    const editor = this.getDraftEditorStateOrThrow();
    const errors: string[] = [];
    const warnings: string[] = [];
    if (editor.workingDraft.fileHint.trim().length <= 0) {
      errors.push('fileHint is required');
    }
    const capabilities = getDraftCapabilities(editor.workingDraft.bundle);
    const seenCapabilityIds = new Set<string>();
    for (let index = 0; index < capabilities.length; index += 1) {
      const entry = capabilities[index];
      const rowId = `capabilities[${index}]`;
      if (!entry.capabilityId) {
        errors.push(`${rowId}.capabilityId is required`);
      } else {
        const key = entry.capabilityId.toLowerCase();
        if (seenCapabilityIds.has(key)) {
          warnings.push(`duplicate capabilityId: ${entry.capabilityId}`);
        } else {
          seenCapabilityIds.add(key);
        }
      }
      if (!isDirectionality(entry.directionality)) {
        errors.push(`${rowId}.directionality is invalid`);
      }
    }

    this.draftEditorState = {
      ...editor,
      errors,
      warnings,
      lastValidatedAt: nowIso(),
    };
    return this.getDraftEditorStateOrThrow();
  }

  resetDraftEditorState(): DraftEditorState {
    const editor = this.getDraftEditorStateOrThrow();
    this.draftEditorState = {
      ...editor,
      workingDraft: cloneScaffoldDraft(editor.baseDraft),
      dirty: false,
      errors: [],
      warnings: [],
      lastValidatedAt: nowIso(),
    };
    return this.getDraftEditorStateOrThrow();
  }

  commitDraftEditorState(): ScaffoldDraft {
    const editor = this.validateDraftEditorState();
    if (editor.errors.length > 0) {
      throw new Error(`Draft editor has validation errors: ${editor.errors.join(', ')}`);
    }
    this.state.scaffoldDraft = cloneScaffoldDraft(editor.workingDraft);
    this.logInfo(`Draft edit committed for ${editor.workingDraft.signature}`);
    return cloneScaffoldDraft(editor.workingDraft);
  }

  clearDraftEditorState(): void {
    if (this.draftEditorState) {
      this.logInfo('Draft edit cleared');
    }
    this.draftEditorState = undefined;
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

  private requireSelectedSignature(): string {
    if (!this.state.selectedSignature) {
      throw new Error('No signature selected. Use "signature ..." first.');
    }
    return this.state.selectedSignature;
  }

  private inferHomeyClassForSignature(signature: string): string | undefined {
    const summary = this.state.inspectSummary;
    if (!summary || summary.signature !== signature) return undefined;
    const counts = new Map<string, number>();
    for (const node of summary.nodes) {
      const homeyClass = typeof node.homeyClass === 'string' ? node.homeyClass.trim() : '';
      if (!homeyClass) continue;
      counts.set(homeyClass, (counts.get(homeyClass) ?? 0) + 1);
    }
    if (counts.size === 0) return undefined;
    const ranked = [...counts.entries()].sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    return ranked.find(([homeyClass]) => homeyClass !== 'other')?.[0] ?? ranked[0][0];
  }

  private getDraftEditorStateOrThrow(): DraftEditorState {
    if (!this.draftEditorState) {
      throw new Error('Draft editor is not active. Start edit mode first.');
    }
    return this.draftEditorState;
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

import type {
  AppState,
  BacklogSummary,
  NodeDetail,
  NodeSummary,
  ScaffoldDraft,
  SessionConfig,
  SignatureInspectSummary,
  StatusSnapshot,
  ValidationSummary,
} from '../model/types';
import type { CurationWorkflowChildPresenterLike } from './curation-workflow-presenter';
import type { ExplorerSessionChildPresenterLike } from './explorer-session-presenter';

export interface ExplorerPresenterChildren {
  explorer: ExplorerSessionChildPresenterLike;
  curation: CurationWorkflowChildPresenterLike;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
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
      backlogSummary: this.state.backlogSummary
        ? { ...this.state.backlogSummary, entries: [...this.state.backlogSummary.entries] }
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

  async connect(config: SessionConfig): Promise<NodeSummary[]> {
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

  async showNodeDetail(nodeId: number): Promise<NodeDetail> {
    this.requireReady();
    const config = this.requireSessionConfig();
    this.state.explorer.selectedNodeId = nodeId;

    try {
      const detail = await this.children.explorer.getNodeDetail(nodeId, {
        includeValues: config.includeValues,
        maxValues: config.maxValues,
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

  loadBacklog(backlogFile: string, options: { top?: number } = {}): BacklogSummary {
    try {
      const summary = this.children.curation.loadBacklogSummary(backlogFile, options);
      this.state.backlogSummary = summary;
      this.logInfo(
        `Loaded backlog (${summary.entries.length}/${summary.totalSignatures} signatures shown)`,
      );
      return summary;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Backlog load failed: ${message}`);
      throw error;
    }
  }

  createScaffoldFromBacklog(options: {
    backlogFile?: string;
    signature?: string;
    productName?: string;
    ruleIdPrefix?: string;
  }): ScaffoldDraft {
    const backlogFile = options.backlogFile ?? this.state.backlogSummary?.filePath;
    if (!backlogFile) {
      throw new Error('Backlog file is not set. Run "backlog load <file>" first.');
    }
    const signature = options.signature ?? this.state.selectedSignature;
    if (!signature) {
      throw new Error('No signature selected. Use "signature ..." first.');
    }

    try {
      const draft = this.children.curation.scaffoldFromBacklog(backlogFile, signature, {
        productName: options.productName,
        ruleIdPrefix: options.ruleIdPrefix,
      });
      this.state.scaffoldDraft = draft;
      this.logInfo(`Prepared scaffold draft for ${signature}`);
      return draft;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Scaffold failed: ${message}`);
      throw error;
    }
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
      connectionState: this.state.connectionState,
      selectedNodeId: this.state.explorer.selectedNodeId,
      selectedSignature: this.state.selectedSignature,
      cachedNodeCount: this.state.explorer.items.length,
      backlogFile: this.state.backlogSummary?.filePath,
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

  private requireSessionConfig(): SessionConfig {
    if (!this.state.sessionConfig) {
      throw new Error('Session config is not set');
    }
    return this.state.sessionConfig;
  }

  private requireSelectedSignature(): string {
    if (!this.state.selectedSignature) {
      throw new Error('No signature selected. Use "signature ..." first.');
    }
    return this.state.selectedSignature;
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

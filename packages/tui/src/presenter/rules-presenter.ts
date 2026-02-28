import type {
  AppState,
  ConnectedSessionConfig,
  RuleDetail,
  RuleSummary,
  ScaffoldDraft,
  SessionConfig,
  SignatureInspectSummary,
  SimulationSummary,
  StatusSnapshot,
  ValidationSummary,
} from '../model/types';
import type { CurationWorkflowChildPresenterLike } from './curation-workflow-presenter';
import type { WorkspaceFileService } from '../service/workspace-file-service';

function nowIso(): string {
  return new Date().toISOString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class RulesPresenter {
  private state: AppState & {
    selectedRuleIndex?: number;
    ruleItems: RuleSummary[];
    ruleDetailCache: Record<number, RuleDetail>;
  } = {
    connectionState: 'disconnected',
    explorer: {
      items: [],
    },
    nodeDetailCache: {},
    runLog: [],
    ruleItems: [],
    ruleDetailCache: {},
  };

  constructor(
    private readonly curation: CurationWorkflowChildPresenterLike,
    private readonly fileService: WorkspaceFileService,
  ) {}

  initialize(config: SessionConfig): RuleSummary[] {
    this.state.sessionConfig = config;
    this.state.connectionState = typeof config.url === 'string' ? 'ready' : 'disconnected';
    this.state.lastError = undefined;
    this.logInfo(
      `Rules mode initialized (${config.manifestFile})${config.url ? ` with ${config.url}` : ''}`,
    );
    return this.refreshRules();
  }

  refreshRules(): RuleSummary[] {
    const config = this.requireSessionConfig();
    try {
      const rules = this.fileService.listManifestRules(config.manifestFile);
      this.state.ruleItems = rules;
      this.logInfo(`Loaded ${rules.length} manifest rule(s)`);
      return rules;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Rule list failed: ${message}`);
      throw error;
    }
  }

  getRules(): RuleSummary[] {
    return [...this.state.ruleItems];
  }

  showRuleDetail(ruleIndex: number): RuleDetail {
    const config = this.requireSessionConfig();
    try {
      const detail = this.fileService.readManifestRule(config.manifestFile, ruleIndex);
      this.state.selectedRuleIndex = ruleIndex;
      this.state.ruleDetailCache[ruleIndex] = detail;
      this.logInfo(`Loaded rule #${ruleIndex} detail`);
      return detail;
    } catch (error) {
      const message = toErrorMessage(error);
      this.state.lastError = message;
      this.logError(`Rule detail failed for #${ruleIndex}: ${message}`);
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

  selectSignatureFromRule(ruleIndex?: number): string {
    const targetIndex = ruleIndex ?? this.state.selectedRuleIndex;
    if (!targetIndex) {
      throw new Error('No rule selected. Run "show <index>" first.');
    }

    const detail = this.state.ruleDetailCache[targetIndex] ?? this.showRuleDetail(targetIndex);
    if (!detail.signature) {
      throw new Error(`Rule #${targetIndex} does not include a complete target signature.`);
    }
    this.state.selectedSignature = detail.signature;
    this.logInfo(`Derived signature ${detail.signature} from rule #${targetIndex}`);
    return detail.signature;
  }

  async inspectSelectedSignature(
    options: {
      manifestFile?: string;
      includeControllerNodes?: boolean;
      nodeId?: number;
    } = {},
  ): Promise<SignatureInspectSummary> {
    const session = this.requireSessionWithUrl();
    const signature = this.requireSelectedSignature();

    try {
      const summary = await this.curation.inspectSignature(session, signature, {
        ...options,
        manifestFile: options.manifestFile ?? this.requireSessionConfig().manifestFile,
      });
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
    const session = this.requireSessionWithUrl();
    const signature = this.requireSelectedSignature();

    try {
      const summary = await this.curation.validateSignature(session, signature, {
        ...options,
        manifestFile: options.manifestFile ?? this.requireSessionConfig().manifestFile,
      });
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
    const session = this.requireSessionWithUrl();
    const signature = this.requireSelectedSignature();

    try {
      const summary = await this.curation.simulateSignature(session, signature, {
        ...options,
        manifestFile: options.manifestFile ?? this.requireSessionConfig().manifestFile,
      });
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
      const draft = this.curation.scaffoldFromSignature(signature, {
        productName: options.productName,
        ruleIdPrefix: options.ruleIdPrefix,
        homeyClass: inferredHomeyClass,
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
    if (options.confirm !== true) {
      throw new Error('Write not confirmed. Re-run with explicit confirmation.');
    }
    const targetPath = filePath ?? draft.fileHint;
    try {
      this.fileService.writeJsonFile(targetPath, draft.bundle);
      const written = this.fileService.resolveAllowedProductRulePath(targetPath);
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
    if (options.confirm !== true) {
      throw new Error('Manifest update not confirmed. Re-run with explicit confirmation.');
    }
    const config = this.requireSessionConfig();
    const manifestFile = options.manifestFile ?? config.manifestFile;
    const filePath = options.filePath ?? draft.fileHint;
    try {
      const result = this.fileService.addProductRuleToManifest(manifestFile, filePath);
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
      mode: 'rules',
      connectionState: this.state.connectionState,
      selectedRuleIndex: this.state.selectedRuleIndex,
      selectedSignature: this.state.selectedSignature,
      cachedNodeCount: this.state.ruleItems.length,
      scaffoldFileHint: this.state.scaffoldDraft?.fileHint,
    };
  }

  getRunLog(limit = 30): AppState['runLog'] {
    return this.state.runLog.slice(-limit);
  }

  private requireSessionConfig(): SessionConfig {
    if (!this.state.sessionConfig) {
      throw new Error('Session config is not set');
    }
    return this.state.sessionConfig;
  }

  private requireSessionWithUrl(): ConnectedSessionConfig {
    const config = this.requireSessionConfig();
    if (typeof config.url !== 'string' || config.url.length === 0) {
      throw new Error('Rules mode needs --url to run inspect/validate/simulate.');
    }
    return config as ConnectedSessionConfig;
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

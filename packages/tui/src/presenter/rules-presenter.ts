import type {
  AppState,
  ConnectedSessionConfig,
  DraftEditorState,
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
import {
  cloneScaffoldDraft,
  DraftEditorCore,
  type DraftValidationVocabulary,
} from './draft-editor-core';
import { SignatureWorkflowCore } from './signature-workflow-core';

export interface RulesPresenterOptions {
  draftVocabulary?: DraftValidationVocabulary;
}

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

  private readonly draftEditor: DraftEditorCore;
  private readonly signatureWorkflow: SignatureWorkflowCore;

  constructor(
    private readonly curation: CurationWorkflowChildPresenterLike,
    private readonly fileService: WorkspaceFileService,
    options: RulesPresenterOptions = {},
  ) {
    this.draftEditor = new DraftEditorCore({
      draftVocabulary: options.draftVocabulary,
    });
    this.signatureWorkflow = new SignatureWorkflowCore({
      curation: this.curation,
      resolveSession: () => this.requireSessionWithUrl(),
      resolveDefaultManifestFile: () => this.requireSessionConfig().manifestFile,
      logInfo: (message) => this.logInfo(message),
      logError: (message) => this.logError(message),
    });
  }

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
    this.signatureWorkflow.selectSignature(this.state, signature);
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

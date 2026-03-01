import type {
  ConnectedSessionConfig,
  ScaffoldDraft,
  SignatureInspectSummary,
  SimulationSummary,
  ValidationSummary,
} from '../model/types';
import type { CurationWorkflowChildPresenterLike } from './curation-workflow-presenter';

type SignatureValidationPattern = `${number}:${number}:${number}`;

interface SignatureOperationOptions {
  manifestFile?: string;
  includeControllerNodes?: boolean;
  nodeId?: number;
}

interface SignatureSimulationOptions extends SignatureOperationOptions {
  skipInspect?: boolean;
  dryRun?: boolean;
  inspectFormat?: string;
}

export interface SignatureScaffoldOptions {
  signature?: string;
  productName?: string;
  ruleIdPrefix?: string;
  homeyClass?: string;
}

export interface SignatureWorkflowState {
  selectedSignature?: string;
  inspectSummary?: SignatureInspectSummary;
  validationSummary?: ValidationSummary;
  simulationSummary?: SimulationSummary;
  scaffoldDraft?: ScaffoldDraft;
  lastError?: string;
}

interface SignatureWorkflowCoreOptions {
  curation: Pick<
    CurationWorkflowChildPresenterLike,
    'inspectSignature' | 'validateSignature' | 'simulateSignature' | 'scaffoldFromSignature'
  >;
  resolveSession: () => ConnectedSessionConfig;
  resolveDefaultManifestFile?: () => string | undefined;
  logInfo: (message: string) => void;
  logError: (message: string) => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function validateSignatureText(signature: string): asserts signature is SignatureValidationPattern {
  if (!/^\d+:\d+:\d+$/.test(signature)) {
    throw new Error('Signature must be <manufacturerId:productType:productId> in decimal format');
  }
}

function withDefaultManifest<T extends SignatureOperationOptions>(
  options: T,
  defaultManifestFile?: string,
): T {
  if (!defaultManifestFile || options.manifestFile) return options;
  return { ...options, manifestFile: defaultManifestFile };
}

function inferHomeyClassFromInspectSummary(
  state: SignatureWorkflowState,
  signature: string,
): string | undefined {
  const summary = state.inspectSummary;
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

export class SignatureWorkflowCore {
  constructor(private readonly options: SignatureWorkflowCoreOptions) {}

  selectSignature(state: SignatureWorkflowState, signature: string): string {
    validateSignatureText(signature);
    state.selectedSignature = signature;
    this.options.logInfo(`Selected signature ${signature}`);
    return signature;
  }

  requireSelectedSignature(state: SignatureWorkflowState): string {
    if (!state.selectedSignature) {
      throw new Error('No signature selected. Use "signature ..." first.');
    }
    return state.selectedSignature;
  }

  async inspectSelectedSignature(
    state: SignatureWorkflowState,
    options: SignatureOperationOptions = {},
  ): Promise<SignatureInspectSummary> {
    const session = this.options.resolveSession();
    const signature = this.requireSelectedSignature(state);
    const manifestFile = this.options.resolveDefaultManifestFile?.();

    try {
      const summary = await this.options.curation.inspectSignature(
        session,
        signature,
        withDefaultManifest(options, manifestFile),
      );
      state.inspectSummary = summary;
      this.options.logInfo(`Inspected signature ${signature} (${summary.totalNodes} node(s))`);
      return summary;
    } catch (error) {
      const message = toErrorMessage(error);
      state.lastError = message;
      this.options.logError(`Inspect failed for ${signature}: ${message}`);
      throw error;
    }
  }

  async validateSelectedSignature(
    state: SignatureWorkflowState,
    options: SignatureOperationOptions = {},
  ): Promise<ValidationSummary> {
    const session = this.options.resolveSession();
    const signature = this.requireSelectedSignature(state);
    const manifestFile = this.options.resolveDefaultManifestFile?.();

    try {
      const summary = await this.options.curation.validateSignature(
        session,
        signature,
        withDefaultManifest(options, manifestFile),
      );
      state.validationSummary = summary;
      this.options.logInfo(`Validated signature ${signature} (${summary.totalNodes} node(s))`);
      return summary;
    } catch (error) {
      const message = toErrorMessage(error);
      state.lastError = message;
      this.options.logError(`Validate failed for ${signature}: ${message}`);
      throw error;
    }
  }

  async simulateSelectedSignature(
    state: SignatureWorkflowState,
    options: SignatureSimulationOptions = {},
  ): Promise<SimulationSummary> {
    const session = this.options.resolveSession();
    const signature = this.requireSelectedSignature(state);
    const manifestFile = this.options.resolveDefaultManifestFile?.();

    try {
      const summary = await this.options.curation.simulateSignature(
        session,
        signature,
        withDefaultManifest(options, manifestFile),
      );
      state.simulationSummary = summary;
      this.options.logInfo(`Simulated signature ${signature} (${summary.totalNodes} node(s))`);
      return summary;
    } catch (error) {
      const message = toErrorMessage(error);
      state.lastError = message;
      this.options.logError(`Simulate failed for ${signature}: ${message}`);
      throw error;
    }
  }

  createScaffoldFromSignature(
    state: SignatureWorkflowState,
    options: SignatureScaffoldOptions,
  ): ScaffoldDraft {
    const signature = options.signature ?? state.selectedSignature;
    if (!signature) {
      throw new Error('No signature selected. Use "signature ..." first.');
    }
    const inferredHomeyClass =
      options.homeyClass ?? inferHomeyClassFromInspectSummary(state, signature);

    try {
      const draft = this.options.curation.scaffoldFromSignature(signature, {
        productName: options.productName,
        ruleIdPrefix: options.ruleIdPrefix,
        homeyClass: inferredHomeyClass,
      });
      state.scaffoldDraft = draft;
      this.options.logInfo(`Prepared scaffold draft for ${signature}`);
      return draft;
    } catch (error) {
      const message = toErrorMessage(error);
      state.lastError = message;
      this.options.logError(`Scaffold failed: ${message}`);
      throw error;
    }
  }
}

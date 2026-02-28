import type {
  ConnectedSessionConfig,
  NodeDetail,
  ScaffoldDraft,
  SimulationSummary,
  SignatureInspectSummary,
  ValidationSummary,
} from '../model/types';
import type { CompilerCurationService } from '../service/compiler-curation-service';
import type { WorkspaceFileService } from '../service/workspace-file-service';

export interface CurationWorkflowChildPresenterLike {
  deriveSignatureFromNodeDetail(detail: NodeDetail): string | null;
  inspectSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options?: { manifestFile?: string; includeControllerNodes?: boolean },
  ): Promise<SignatureInspectSummary>;
  validateSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options?: { manifestFile?: string; includeControllerNodes?: boolean },
  ): Promise<ValidationSummary>;
  simulateSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options?: {
      manifestFile?: string;
      includeControllerNodes?: boolean;
      skipInspect?: boolean;
      dryRun?: boolean;
      inspectFormat?: string;
    },
  ): Promise<SimulationSummary>;
  scaffoldFromSignature(
    signature: string,
    options?: { productName?: string; ruleIdPrefix?: string; homeyClass?: string },
  ): ScaffoldDraft;
  writeScaffoldDraft(
    filePath: string,
    draft: ScaffoldDraft,
    options?: { confirm?: boolean },
  ): string;
  addProductRuleToManifest(
    manifestFile: string,
    filePath: string,
    options?: { confirm?: boolean },
  ): { manifestFile: string; entryFilePath: string; updated: boolean };
}

export class CurationWorkflowPresenter implements CurationWorkflowChildPresenterLike {
  constructor(
    private readonly curationService: CompilerCurationService,
    private readonly fileService: WorkspaceFileService,
  ) {}

  deriveSignatureFromNodeDetail(detail: NodeDetail): string | null {
    return this.curationService.deriveSignatureFromNodeDetail(detail);
  }

  async inspectSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options: { manifestFile?: string; includeControllerNodes?: boolean } = {},
  ): Promise<SignatureInspectSummary> {
    return this.curationService.inspectSignature(session, signature, options);
  }

  async validateSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options: { manifestFile?: string; includeControllerNodes?: boolean } = {},
  ): Promise<ValidationSummary> {
    return this.curationService.validateSignature(session, signature, options);
  }

  async simulateSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options: {
      manifestFile?: string;
      includeControllerNodes?: boolean;
      skipInspect?: boolean;
      dryRun?: boolean;
      inspectFormat?: string;
    } = {},
  ): Promise<SimulationSummary> {
    return this.curationService.simulateSignature(session, signature, options);
  }

  scaffoldFromSignature(
    signature: string,
    options: { productName?: string; ruleIdPrefix?: string; homeyClass?: string } = {},
  ): ScaffoldDraft {
    return this.curationService.scaffoldFromSignature(signature, options);
  }

  writeScaffoldDraft(
    filePath: string,
    draft: ScaffoldDraft,
    options: { confirm?: boolean } = {},
  ): string {
    if (options.confirm !== true) {
      throw new Error('Write not confirmed. Re-run with explicit confirmation.');
    }
    this.fileService.writeJsonFile(filePath, draft.bundle);
    return this.fileService.resolveAllowedProductRulePath(filePath);
  }

  addProductRuleToManifest(
    manifestFile: string,
    filePath: string,
    options: { confirm?: boolean } = {},
  ): { manifestFile: string; entryFilePath: string; updated: boolean } {
    if (options.confirm !== true) {
      throw new Error('Manifest update not confirmed. Re-run with explicit confirmation.');
    }
    return this.fileService.addProductRuleToManifest(manifestFile, filePath);
  }
}

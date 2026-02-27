import type {
  BacklogSummary,
  NodeDetail,
  NodeSummary,
  ScaffoldDraft,
  SessionConfig,
  SignatureInspectSummary,
  ValidationSummary,
} from '../model/types';
import type { CompilerCurationService } from '../service/compiler-curation-service';
import { CompilerCurationServiceImpl } from '../service/compiler-curation-service';
import type { WorkspaceFileService } from '../service/workspace-file-service';
import { WorkspaceFileServiceImpl } from '../service/workspace-file-service';
import type { ZwjsExplorerService } from '../service/zwjs-explorer-service';
import { ZwjsExplorerServiceImpl } from '../service/zwjs-explorer-service';

export interface TuiCoordinator {
  connect(config: SessionConfig): Promise<void>;
  disconnect(): Promise<void>;
  listNodes(): Promise<NodeSummary[]>;
  getNodeDetail(
    nodeId: number,
    options?: { includeValues?: SessionConfig['includeValues']; maxValues?: number },
  ): Promise<NodeDetail>;
  deriveSignatureFromNodeDetail(detail: NodeDetail): string | null;
  inspectSignature(
    session: SessionConfig,
    signature: string,
    options?: { manifestFile?: string; includeControllerNodes?: boolean },
  ): Promise<SignatureInspectSummary>;
  validateSignature(
    session: SessionConfig,
    signature: string,
    options?: { manifestFile?: string; includeControllerNodes?: boolean },
  ): Promise<ValidationSummary>;
  loadBacklogSummary(backlogFile: string, options?: { top?: number }): BacklogSummary;
  scaffoldFromBacklog(
    backlogFile: string,
    signature: string,
    options?: { productName?: string; ruleIdPrefix?: string },
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
  ): {
    manifestFile: string;
    entryFilePath: string;
    updated: boolean;
  };
}

interface CoordinatorDeps {
  explorerService?: ZwjsExplorerService;
  curationService?: CompilerCurationService;
  fileService?: WorkspaceFileService;
}

export class TuiCoordinatorImpl implements TuiCoordinator {
  private readonly explorerService: ZwjsExplorerService;

  private readonly curationService: CompilerCurationService;

  private readonly fileService: WorkspaceFileService;

  constructor(deps: CoordinatorDeps = {}) {
    this.explorerService = deps.explorerService ?? new ZwjsExplorerServiceImpl();
    this.curationService = deps.curationService ?? new CompilerCurationServiceImpl();
    this.fileService = deps.fileService ?? new WorkspaceFileServiceImpl();
  }

  async connect(config: SessionConfig): Promise<void> {
    await this.explorerService.connect(config);
  }

  async disconnect(): Promise<void> {
    await this.explorerService.disconnect();
  }

  async listNodes(): Promise<NodeSummary[]> {
    return this.explorerService.listNodes();
  }

  async getNodeDetail(
    nodeId: number,
    options: { includeValues?: SessionConfig['includeValues']; maxValues?: number } = {},
  ): Promise<NodeDetail> {
    return this.explorerService.getNodeDetail(nodeId, options);
  }

  deriveSignatureFromNodeDetail(detail: NodeDetail): string | null {
    return this.curationService.deriveSignatureFromNodeDetail(detail);
  }

  async inspectSignature(
    session: SessionConfig,
    signature: string,
    options: { manifestFile?: string; includeControllerNodes?: boolean } = {},
  ): Promise<SignatureInspectSummary> {
    return this.curationService.inspectSignature(session, signature, options);
  }

  async validateSignature(
    session: SessionConfig,
    signature: string,
    options: { manifestFile?: string; includeControllerNodes?: boolean } = {},
  ): Promise<ValidationSummary> {
    return this.curationService.validateSignature(session, signature, options);
  }

  loadBacklogSummary(backlogFile: string, options: { top?: number } = {}): BacklogSummary {
    return this.curationService.loadBacklogSummary(backlogFile, options);
  }

  scaffoldFromBacklog(
    backlogFile: string,
    signature: string,
    options: { productName?: string; ruleIdPrefix?: string } = {},
  ): ScaffoldDraft {
    return this.curationService.scaffoldFromBacklog(backlogFile, signature, options);
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
  ): {
    manifestFile: string;
    entryFilePath: string;
    updated: boolean;
  } {
    if (options.confirm !== true) {
      throw new Error('Manifest update not confirmed. Re-run with explicit confirmation.');
    }
    return this.fileService.addProductRuleToManifest(manifestFile, filePath);
  }
}

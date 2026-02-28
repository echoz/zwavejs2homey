import type { IncludeValuesMode, NodeDetail, NodeSummary, SessionConfig } from '../model/types';
import type { ZwjsExplorerService } from '../service/zwjs-explorer-service';

export interface ExplorerSessionChildPresenterLike {
  connect(config: SessionConfig): Promise<void>;
  disconnect(): Promise<void>;
  listNodes(): Promise<NodeSummary[]>;
  getNodeDetail(
    nodeId: number,
    options?: { includeValues?: IncludeValuesMode; maxValues?: number },
  ): Promise<NodeDetail>;
}

export class ExplorerSessionPresenter implements ExplorerSessionChildPresenterLike {
  constructor(private readonly service: ZwjsExplorerService) {}

  async connect(config: SessionConfig): Promise<void> {
    await this.service.connect(config);
  }

  async disconnect(): Promise<void> {
    await this.service.disconnect();
  }

  async listNodes(): Promise<NodeSummary[]> {
    return this.service.listNodes();
  }

  async getNodeDetail(
    nodeId: number,
    options: { includeValues?: IncludeValuesMode; maxValues?: number } = {},
  ): Promise<NodeDetail> {
    return this.service.getNodeDetail(nodeId, options);
  }
}

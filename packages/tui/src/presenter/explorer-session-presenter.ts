import type {
  ConnectedSessionConfig,
  IncludeValuesMode,
  NodeDetail,
  NodeSummary,
  NodeValueDetail,
  ValueIdShape,
} from '../model/types';
import type { ZwjsExplorerService } from '../service/zwjs-explorer-service';

export interface ExplorerSessionChildPresenterLike {
  connect(config: ConnectedSessionConfig): Promise<void>;
  disconnect(): Promise<void>;
  listNodes(): Promise<NodeSummary[]>;
  getNodeValueDetail(nodeId: number, valueId: ValueIdShape): Promise<NodeValueDetail>;
  getNodeDetail(
    nodeId: number,
    options?: {
      includeValues?: IncludeValuesMode;
      maxValues?: number;
      includeLinkQuality?: boolean;
    },
  ): Promise<NodeDetail>;
}

export class ExplorerSessionPresenter implements ExplorerSessionChildPresenterLike {
  constructor(private readonly service: ZwjsExplorerService) {}

  async connect(config: ConnectedSessionConfig): Promise<void> {
    await this.service.connect(config);
  }

  async disconnect(): Promise<void> {
    await this.service.disconnect();
  }

  async listNodes(): Promise<NodeSummary[]> {
    return this.service.listNodes();
  }

  async getNodeValueDetail(nodeId: number, valueId: ValueIdShape): Promise<NodeValueDetail> {
    return this.service.getNodeValueDetail(nodeId, valueId);
  }

  async getNodeDetail(
    nodeId: number,
    options: {
      includeValues?: IncludeValuesMode;
      maxValues?: number;
      includeLinkQuality?: boolean;
    } = {},
  ): Promise<NodeDetail> {
    return this.service.getNodeDetail(nodeId, options);
  }
}

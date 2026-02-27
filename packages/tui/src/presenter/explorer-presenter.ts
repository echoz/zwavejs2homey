import type { AppState, NodeDetail, NodeSummary, SessionConfig } from '../model/types';
import type { ZwjsExplorerService } from '../service/zwjs-explorer-service';

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

  constructor(private readonly service: ZwjsExplorerService) {}

  getState(): AppState {
    return {
      ...this.state,
      explorer: { ...this.state.explorer, items: [...this.state.explorer.items] },
      nodeDetailCache: { ...this.state.nodeDetailCache },
      runLog: [...this.state.runLog],
    };
  }

  async connect(config: SessionConfig): Promise<NodeSummary[]> {
    this.state.sessionConfig = config;
    this.state.connectionState = 'connecting';
    this.state.lastError = undefined;
    this.logInfo(`Connecting to ${config.url}`);

    try {
      await this.service.connect(config);
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
    await this.service.disconnect();
    this.state.connectionState = 'disconnected';
    this.logInfo('Disconnected');
  }

  async refreshNodes(): Promise<NodeSummary[]> {
    this.requireReady();
    try {
      const nodes = await this.service.listNodes();
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
    const config = this.state.sessionConfig;
    if (!config) {
      throw new Error('Session config is not set');
    }

    this.state.explorer.selectedNodeId = nodeId;
    try {
      const detail = await this.service.getNodeDetail(nodeId, {
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

  private requireReady(): void {
    if (this.state.connectionState !== 'ready') {
      throw new Error(`Presenter is not ready (state=${this.state.connectionState})`);
    }
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

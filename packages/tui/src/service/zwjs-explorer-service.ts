import {
  createZwjsClient,
  extractZwjsDefinedValueIds,
  extractZwjsNodeValue,
  type ZwjsClient,
  type ZwjsClientConfig,
} from '@zwavejs2homey/core';

import type {
  ConnectedSessionConfig,
  IncludeValuesMode,
  NodeDetail,
  NodeSummary,
  NodeValueDetail,
  ValueIdShape,
} from '../model/types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function unwrapNodeStateResult(result: unknown): Record<string, unknown> | null {
  if (!isObject(result)) return null;
  if (isObject(result.state)) return result.state;
  return result;
}

function unwrapNeighborsResult(result: unknown): unknown {
  if (Array.isArray(result)) return result;
  if (isObject(result) && Array.isArray(result.neighbors)) return result.neighbors;
  return result;
}

function toNodeSummary(rawNode: Record<string, unknown>): NodeSummary {
  return {
    nodeId: Number(rawNode.nodeId),
    name: typeof rawNode.name === 'string' ? rawNode.name : null,
    location: typeof rawNode.location === 'string' ? rawNode.location : null,
    ready: typeof rawNode.ready === 'boolean' ? rawNode.ready : null,
    status: typeof rawNode.status === 'string' ? rawNode.status : null,
    manufacturer: typeof rawNode.manufacturer === 'string' ? rawNode.manufacturer : null,
    product: typeof rawNode.product === 'string' ? rawNode.product : null,
    interviewStage: typeof rawNode.interviewStage === 'string' ? rawNode.interviewStage : null,
    isFailed: typeof rawNode.isFailed === 'boolean' ? rawNode.isFailed : null,
  };
}

function compareValueId(a: ValueIdShape, b: ValueIdShape): number {
  return stableValueIdKey(a).localeCompare(stableValueIdKey(b));
}

function stableValueIdKey(valueId: ValueIdShape): string {
  return [
    valueId.commandClass,
    valueId.endpoint ?? 0,
    String(valueId.property),
    valueId.propertyKey == null ? '' : String(valueId.propertyKey),
  ].join(':');
}

export interface ZwjsExplorerService {
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

interface CreateClientFn {
  (config: ZwjsClientConfig): ZwjsClient;
}

interface ServiceDeps {
  createClient?: CreateClientFn;
}

function toIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => Number.isInteger(item) && item > 0);
}

function normalizeLifelineRouteValue(value: unknown): unknown {
  if (!isObject(value)) return value;
  const repeaters = toIntegerArray(value.repeaters);
  const routeSpeed =
    typeof value.routeSpeed === 'number' && Number.isFinite(value.routeSpeed)
      ? value.routeSpeed
      : undefined;
  const normalized: Record<string, unknown> = {};
  if (repeaters.length > 0) normalized.repeaters = repeaters;
  if (routeSpeed !== undefined) normalized.routeSpeed = routeSpeed;
  if (Object.keys(normalized).length > 0) {
    return normalized;
  }
  return value;
}

function extractNodeLifelineRoute(result: unknown, nodeId: number): unknown {
  if (!isObject(result)) return null;
  const routes = isObject(result.routes)
    ? (result.routes as Record<string, unknown>)
    : (result as Record<string, unknown>);
  const routeValue = routes[String(nodeId)];
  if (routeValue === undefined) return null;
  return normalizeLifelineRouteValue(routeValue);
}

export class ZwjsExplorerServiceImpl implements ZwjsExplorerService {
  private client: ZwjsClient | null = null;

  private readonly createClient: CreateClientFn;

  constructor(deps: ServiceDeps = {}) {
    this.createClient = deps.createClient ?? createZwjsClient;
  }

  async connect(config: ConnectedSessionConfig): Promise<void> {
    await this.disconnect();

    const client = this.createClient({
      url: config.url,
      auth: config.token ? { type: 'bearer', token: config.token } : { type: 'none' },
    });

    try {
      await client.start();
      const initResult = await client.initialize({ schemaVersion: config.schemaVersion });
      if (!initResult.success) {
        throw new Error(`initialize failed: ${JSON.stringify(initResult.error)}`);
      }
      const listenResult = await client.startListening();
      if (!listenResult.success) {
        throw new Error(`start_listening failed: ${JSON.stringify(listenResult.error)}`);
      }
      this.client = client;
    } catch (error) {
      try {
        await client.stop();
      } catch {
        // no-op: preserve original initialization error.
      }
      throw new Error(normalizeError(error));
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    await this.client.stop();
    this.client = null;
  }

  async listNodes(): Promise<NodeSummary[]> {
    const client = this.requireClient();
    const result = await client.getNodeList();
    const nodeList = this.unwrapNodeListResult(result);
    return nodeList.map(toNodeSummary).sort((a, b) => a.nodeId - b.nodeId);
  }

  async getNodeDetail(
    nodeId: number,
    options: {
      includeValues?: IncludeValuesMode;
      maxValues?: number;
      includeLinkQuality?: boolean;
    } = {},
  ): Promise<NodeDetail> {
    const client = this.requireClient();
    const includeValues = options.includeValues ?? 'summary';
    const maxValues = options.maxValues ?? 200;
    const includeLinkQuality = options.includeLinkQuality ?? true;

    const [stateRes, neighborsRes, notifRes, lifelineRes, definedRes] = await Promise.all([
      client.getNodeState(nodeId),
      client.getControllerNodeNeighbors(nodeId),
      client.getNodeSupportedNotificationEvents(nodeId),
      includeLinkQuality ? client.getControllerKnownLifelineRoutes() : Promise.resolve(null),
      includeValues === 'none' ? Promise.resolve(null) : client.getNodeDefinedValueIds(nodeId),
    ]);

    if (!stateRes.success) {
      throw new Error(`node.get_state failed: ${JSON.stringify(stateRes.error)}`);
    }

    const detail: NodeDetail = {
      nodeId,
      state: unwrapNodeStateResult(stateRes.result),
      neighbors: neighborsRes.success
        ? unwrapNeighborsResult(neighborsRes.result)
        : { _error: neighborsRes.error },
      lifelineRoute:
        lifelineRes === null
          ? undefined
          : lifelineRes.success
            ? extractNodeLifelineRoute(lifelineRes.result, nodeId)
            : { _error: lifelineRes.error },
      notificationEvents: notifRes.success ? notifRes.result : { _error: notifRes.error },
    };

    if (includeValues === 'none') {
      detail.values = [];
      return detail;
    }

    if (!definedRes?.success) {
      detail.values = [{ _error: definedRes?.error ?? 'node.get_defined_value_ids skipped' }];
      return detail;
    }

    const valueIds = extractZwjsDefinedValueIds(definedRes.result)
      .slice(0, maxValues)
      .sort(compareValueId);
    detail.values = [];

    for (const valueId of valueIds) {
      detail.values.push(
        await this.loadNodeValueDetail(client, nodeId, valueId, {
          includeRuntimeData: includeValues === 'full',
        }),
      );
    }

    return detail;
  }

  async getNodeValueDetail(nodeId: number, valueId: ValueIdShape): Promise<NodeValueDetail> {
    const client = this.requireClient();
    return this.loadNodeValueDetail(client, nodeId, valueId, { includeRuntimeData: true });
  }

  private requireClient(): ZwjsClient {
    if (!this.client) {
      throw new Error('ZWJS explorer service is not connected');
    }
    return this.client;
  }

  private unwrapNodeListResult(result: unknown): Record<string, unknown>[] {
    if (isObject(result) && Array.isArray(result.nodes)) {
      return result.nodes.filter(isObject);
    }
    if (
      isObject(result) &&
      result.success === true &&
      isObject(result.result) &&
      Array.isArray(result.result.nodes)
    ) {
      return result.result.nodes.filter(isObject);
    }
    const maybeError = isObject(result) && 'error' in result ? result.error : result;
    throw new Error(`getNodeList failed: ${JSON.stringify(maybeError)}`);
  }

  private async loadNodeValueDetail(
    client: ZwjsClient,
    nodeId: number,
    valueId: ValueIdShape,
    options: { includeRuntimeData: boolean },
  ): Promise<NodeValueDetail> {
    const [metadataRes, valueRes, tsRes] = options.includeRuntimeData
      ? await Promise.all([
          client.getNodeValueMetadata(nodeId, valueId),
          client.getNodeValue(nodeId, valueId),
          client.getNodeValueTimestamp(nodeId, valueId),
        ])
      : await Promise.all([client.getNodeValueMetadata(nodeId, valueId), null, null]);

    return {
      valueId,
      metadata: metadataRes && metadataRes.success ? metadataRes.result : undefined,
      metadataError: metadataRes && !metadataRes.success ? metadataRes.error : undefined,
      value: valueRes && valueRes.success ? extractZwjsNodeValue(valueRes.result) : undefined,
      valueEnvelope: valueRes && valueRes.success ? valueRes.result : undefined,
      valueError: valueRes && !valueRes.success ? valueRes.error : undefined,
      timestamp: tsRes && tsRes.success ? tsRes.result : undefined,
      timestampError: tsRes && !tsRes.success ? tsRes.error : undefined,
    };
  }
}

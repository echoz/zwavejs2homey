import type { ClientErrorSummary } from '../errors';

export type ZwjsLifecycleState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'stopping'
  | 'stopped'
  | 'error';

export interface ReconnectPolicy {
  enabled: boolean;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterRatio: number;
}

export interface TimeoutPolicy {
  connectTimeoutMs: number;
  requestTimeoutMs: number;
}

export interface VersionPolicy {
  mode: 'adaptive';
  preferredFamilies?: string[];
  strictFamilyMatch?: boolean;
}

export interface ZwjsInitializeOptions {
  schemaVersion: number;
  additionalUserAgentComponents?: Record<string, string>;
}

export interface ZwjsCommandRequest<TArgs = Record<string, unknown>> {
  command: string;
  args?: TArgs;
}

export interface ZwjsValueId {
  commandClass: number | string;
  endpoint?: number;
  property: number | string;
  propertyKey?: number | string;
}

export interface ZwjsProtocolErrorPayload {
  errorCode?: string;
  zwaveErrorCode?: number;
  zwaveErrorMessage?: string;
  error?: unknown;
  raw: unknown;
}

export type ZwjsCommandResult<TResult = unknown> =
  | {
      messageId: string;
      success: true;
      result?: TResult;
      error?: undefined;
      raw?: unknown;
    }
  | {
      messageId: string;
      success: false;
      result?: undefined;
      error: ZwjsProtocolErrorPayload;
      raw?: unknown;
    };

export interface ZwjsDriverConfig {
  config?: {
    logConfig?: {
      enabled?: boolean;
      level?: string | number;
      logToFile?: boolean;
      filename?: string;
      forceConsole?: boolean;
    };
    statisticsEnabled?: boolean;
  };
  [key: string]: unknown;
}

export interface ZwjsControllerStateResult {
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ZwjsNodeStateResult {
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ZwjsControllerNodeNeighborsResult = number[] | { neighbors?: number[]; [key: string]: unknown };

export type ZwjsDefinedValueIdsResult = Array<Record<string, unknown>> | { values?: Array<Record<string, unknown>>; [key: string]: unknown };

export type ZwjsNodeValueResult = unknown;
export type ZwjsNodeValueMetadataResult = Record<string, unknown>;
export type ZwjsNodeValueTimestampResult = number | string | null;

export interface ClientLogger {
  debug?(msg: string, meta?: unknown): void;
  info?(msg: string, meta?: unknown): void;
  warn?(msg: string, meta?: unknown): void;
  error?(msg: string, meta?: unknown): void;
}

export type ZwjsAuthConfig = { type: 'none' } | { type: 'bearer'; token: string };

export interface ZwjsClientConfig {
  url: string;
  auth?: ZwjsAuthConfig;
  reconnect?: Partial<ReconnectPolicy>;
  timeouts?: Partial<TimeoutPolicy>;
  versionPolicy?: VersionPolicy;
  logger?: ClientLogger;
}

export interface ZwjsClientStatus {
  lifecycle: ZwjsLifecycleState;
  transportConnected: boolean;
  versionReceived?: boolean;
  initialized?: boolean;
  listening?: boolean;
  authenticated?: boolean;
  serverVersion?: string;
  adapterFamily?: string;
  reconnectAttempt?: number;
  connectedAt?: string;
  lastMessageAt?: string;
  lastError?: ClientErrorSummary;
}

export interface ServerInfoResult {
  serverVersion?: string;
  zwaveJsVersion?: string;
  schemaHints?: string[];
  raw?: unknown;
}

export interface CanonicalNodeSummary {
  nodeId: number;
  name?: string;
  location?: string;
  ready?: boolean;
  status?: string;
  manufacturer?: string;
  product?: string;
  interviewStage?: string;
  isFailed?: boolean;
  capabilities?: string[];
}

export interface NodeListResult {
  nodes: CanonicalNodeSummary[];
  snapshotVersion?: string;
}

export interface ZwjsProtocolEventPayload {
  source: 'driver' | 'controller' | 'node' | 'zniffer' | string;
  event: string;
  [key: string]: unknown;
}

export interface ZwjsEventBase {
  type:
    | 'client.lifecycle'
    | 'client.reconnect.scheduled'
    | 'transport.connected'
    | 'transport.disconnected'
    | 'auth.succeeded'
    | 'auth.failed'
    | 'compat.warning'
    | 'protocol.error'
    | 'server.info'
    | 'nodes.snapshot'
    | 'zwjs.event.driver'
    | 'zwjs.event.controller'
    | 'zwjs.event.node'
    | 'zwjs.event.zniffer'
    | 'node.event.raw-normalized';
  ts: string;
  source: 'zwjs-client';
}

export type ZwjsClientEvent =
  | (ZwjsEventBase & { type: 'client.lifecycle'; from: ZwjsLifecycleState; to: ZwjsLifecycleState })
  | (ZwjsEventBase & { type: 'client.reconnect.scheduled'; attempt: number; delayMs: number; reason?: ClientErrorSummary })
  | (ZwjsEventBase & { type: 'transport.connected' })
  | (ZwjsEventBase & { type: 'transport.disconnected'; code?: number; reason?: string; wasClean?: boolean })
  | (ZwjsEventBase & { type: 'auth.succeeded' })
  | (ZwjsEventBase & { type: 'auth.failed'; error: ClientErrorSummary })
  | (ZwjsEventBase & { type: 'compat.warning'; message: string; version?: string; adapterFamily?: string })
  | (ZwjsEventBase & { type: 'protocol.error'; error: ClientErrorSummary; context?: unknown })
  | (ZwjsEventBase & { type: 'server.info'; info: ServerInfoResult })
  | (ZwjsEventBase & { type: 'nodes.snapshot'; nodes: NodeListResult })
  | (ZwjsEventBase & { type: 'zwjs.event.driver'; event: ZwjsProtocolEventPayload })
  | (ZwjsEventBase & { type: 'zwjs.event.controller'; event: ZwjsProtocolEventPayload })
  | (ZwjsEventBase & { type: 'zwjs.event.node'; event: ZwjsProtocolEventPayload })
  | (ZwjsEventBase & { type: 'zwjs.event.zniffer'; event: ZwjsProtocolEventPayload })
  | (ZwjsEventBase & { type: 'node.event.raw-normalized'; event: Record<string, unknown> });

export type ZwjsClientEventInput = ZwjsClientEvent extends infer T
  ? T extends { ts: string; source: 'zwjs-client' }
    ? Omit<T, 'ts' | 'source'>
    : never
  : never;

export interface ZwjsClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): ZwjsClientStatus;
  onEvent(handler: (event: ZwjsClientEvent) => void): () => void;
  initialize(options: ZwjsInitializeOptions): Promise<ZwjsCommandResult>;
  startListening(): Promise<ZwjsCommandResult<{ state?: unknown }>>;
  sendCommand<TResult = unknown, TArgs = Record<string, unknown>>(request: ZwjsCommandRequest<TArgs>): Promise<ZwjsCommandResult<TResult>>;
  getDriverConfig(): Promise<ZwjsCommandResult<ZwjsDriverConfig>>;
  getControllerState(): Promise<ZwjsCommandResult<ZwjsControllerStateResult>>;
  getControllerNodeNeighbors(nodeId: number): Promise<ZwjsCommandResult<ZwjsControllerNodeNeighborsResult>>;
  getNodeState(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeStateResult>>;
  getNodeDefinedValueIds(nodeId: number): Promise<ZwjsCommandResult<ZwjsDefinedValueIdsResult>>;
  getNodeValueMetadata(nodeId: number, valueId: ZwjsValueId): Promise<ZwjsCommandResult<ZwjsNodeValueMetadataResult>>;
  getNodeValue(nodeId: number, valueId: ZwjsValueId): Promise<ZwjsCommandResult<ZwjsNodeValueResult>>;
  getNodeValueTimestamp(nodeId: number, valueId: ZwjsValueId): Promise<ZwjsCommandResult<ZwjsNodeValueTimestampResult>>;
  getServerInfo(): Promise<ServerInfoResult>;
  getNodeList(): Promise<NodeListResult>;
}

export interface NormalizerContext {
  emit: (event: ZwjsClientEvent) => void;
}

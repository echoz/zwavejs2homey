export type IncludeValuesMode = 'none' | 'summary' | 'full';

export type ConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error';

export interface SessionConfig {
  url: string;
  token?: string;
  schemaVersion: number;
  includeValues: IncludeValuesMode;
  maxValues: number;
  startNode?: number;
}

export interface ValueIdShape {
  commandClass: string | number;
  endpoint?: number;
  property: string | number;
  propertyKey?: string | number;
}

export interface NodeSummary {
  nodeId: number;
  name: string | null;
  location: string | null;
  ready: boolean | null;
  status: string | null;
  manufacturer: string | null;
  product: string | null;
  interviewStage: string | null;
  isFailed: boolean | null;
}

export interface NodeValueDetail {
  valueId?: ValueIdShape;
  metadata?: unknown;
  metadataError?: unknown;
  value?: unknown;
  valueEnvelope?: unknown;
  valueError?: unknown;
  timestamp?: unknown;
  timestampError?: unknown;
  _error?: unknown;
}

export interface NodeDetail {
  nodeId: number;
  state: Record<string, unknown> | null;
  neighbors: unknown;
  notificationEvents: unknown;
  values?: NodeValueDetail[];
}

export interface RunLogEntry {
  timestamp: string;
  level: 'info' | 'error';
  message: string;
}

export interface ExplorerState {
  items: NodeSummary[];
  selectedNodeId?: number;
  lastRefreshedAt?: string;
}

export interface AppState {
  sessionConfig?: SessionConfig;
  connectionState: ConnectionState;
  explorer: ExplorerState;
  nodeDetailCache: Record<number, NodeDetail>;
  lastError?: string;
  runLog: RunLogEntry[];
}

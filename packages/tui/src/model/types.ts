export type IncludeValuesMode = 'none' | 'summary' | 'full';
export type SessionMode = 'nodes' | 'rules';
export type UiMode = 'panel' | 'shell';

export type ConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error';

export interface SessionConfig {
  mode: SessionMode;
  uiMode: UiMode;
  manifestFile: string;
  url?: string;
  token?: string;
  schemaVersion: number;
  includeValues: IncludeValuesMode;
  maxValues: number;
  startNode?: number;
}

export interface ConnectedSessionConfig extends SessionConfig {
  url: string;
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

export type NodeValueProfileMappingRole = 'inbound' | 'outbound' | 'watcher';

export interface NodeValueProfileAttribution {
  capabilityId: string;
  mappingRole: NodeValueProfileMappingRole;
  directionality?: string | null;
  provenanceLayer?: string | null;
  provenanceRuleId?: string | null;
  provenanceAction?: string | null;
}

export interface NodeCompiledValueAttribution {
  nodeId: number;
  valueAttributions: Record<string, NodeValueProfileAttribution[]>;
}

export interface NodeDetail {
  nodeId: number;
  state: Record<string, unknown> | null;
  neighbors: unknown;
  lifelineRoute?: unknown;
  notificationEvents: unknown;
  values?: NodeValueDetail[];
}

export interface RunLogEntry {
  timestamp: string;
  level: 'info' | 'error';
  message: string;
}

export interface InspectNodeResult {
  nodeId: number;
  name: string | null;
  homeyClass: string | null;
  outcome: string | null;
  confidence: string | null;
  reviewReason: string | null;
}

export interface SignatureInspectSummary {
  signature: string;
  totalNodes: number;
  outcomeCounts: Record<string, number>;
  nodes: InspectNodeResult[];
}

export interface ValidationSummary {
  signature: string;
  totalNodes: number;
  reviewNodes: number;
  outcomes: Record<string, number>;
  reportFile?: string;
  artifactFile?: string;
}

export interface SimulationSummary {
  signature: string;
  dryRun: boolean;
  inspectSkipped: boolean;
  inspectFormat: string;
  inspectCommandLine: string | null;
  validateCommandLine: string;
  gatePassed: boolean | null;
  totalNodes: number;
  reviewNodes: number;
  outcomes: Record<string, number>;
  reportFile: string | null;
  summaryJsonFile: string | null;
}

export interface ScaffoldDraft {
  signature: string;
  fileHint: string;
  bundle: Record<string, unknown>;
  generatedAt: string;
}

export interface DraftEditorState {
  baseDraft: ScaffoldDraft;
  workingDraft: ScaffoldDraft;
  dirty: boolean;
  errors: string[];
  warnings: string[];
  selectedCapabilityIndex: number;
  selectedFieldPath: string;
  lastValidatedAt?: string;
}

export interface RuleSummary {
  index: number;
  filePath: string;
  layer: string;
  name: string | null;
  signature: string | null;
  ruleCount: number;
  exists: boolean;
  loadError?: string;
}

export interface RuleDetail extends RuleSummary {
  manifestFile: string;
  absoluteFilePath: string;
  content: Record<string, unknown> | null;
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
  selectedSignature?: string;
  inspectSummary?: SignatureInspectSummary;
  validationSummary?: ValidationSummary;
  simulationSummary?: SimulationSummary;
  scaffoldDraft?: ScaffoldDraft;
  lastError?: string;
  runLog: RunLogEntry[];
}

export interface StatusSnapshot {
  mode?: SessionMode;
  connectionState: ConnectionState;
  selectedNodeId?: number;
  selectedRuleIndex?: number;
  selectedSignature?: string;
  cachedNodeCount: number;
  scaffoldFileHint?: string;
}

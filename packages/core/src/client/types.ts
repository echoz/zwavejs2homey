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

export interface MutationPolicy {
  enabled: boolean;
  allowCommands?: string[];
  requireAllowList?: boolean;
}

export interface ZwjsInitializeOptions {
  schemaVersion: number;
  additionalUserAgentComponents?: Record<string, string>;
}

export interface ZwjsLogFilter {
  source?: string;
  label?: string;
  primaryTags?: string;
  secondaryTags?: string;
  direction?: string;
  [key: string]: unknown;
}

export interface ZwjsControllerBeginInclusionArgs {
  strategy?: string;
  forceSecurity?: boolean;
  provisioning?: boolean;
  dsk?: string;
  [key: string]: unknown;
}

export interface ZwjsControllerBeginExclusionArgs {
  strategy?: string;
  provisionSmartStart?: boolean;
  [key: string]: unknown;
}

export interface ZwjsControllerInclusionCommandResult {
  success?: boolean;
  started?: boolean;
  status?: string;
  [key: string]: unknown;
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

export interface ZwjsDefinedValueId extends ZwjsValueId {
  propertyName?: string;
  propertyKeyName?: string;
  readable?: boolean;
  writeable?: boolean;
  label?: string;
  description?: string;
  unit?: string;
  type?: string;
  min?: number;
  max?: number;
  default?: unknown;
  states?: Record<string, unknown> | Array<unknown>;
  [key: string]: unknown;
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

export interface ZwjsDriverLogConfigResult {
  config?: {
    enabled?: boolean;
    level?: string | number;
    logToFile?: boolean;
    filename?: string;
    forceConsole?: boolean;
  };
  [key: string]: unknown;
}

export interface ZwjsDriverStatisticsEnabledResult {
  statisticsEnabled?: boolean;
  [key: string]: unknown;
}
export interface ZwjsDriverOtwFirmwareUpdateInProgressResult {
  progress?: boolean;
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

export type ZwjsControllerNodeNeighborsResult =
  | number[]
  | { neighbors?: number[]; [key: string]: unknown };
export interface ZwjsControllerAnyFirmwareUpdateProgressResult {
  progress?: boolean;
  [key: string]: unknown;
}
export interface ZwjsControllerAnyOtaFirmwareUpdateInProgressResult {
  progress?: boolean;
  [key: string]: unknown;
}
export interface ZwjsControllerAvailableFirmwareUpdatesResult {
  updates?: Array<unknown>;
  [key: string]: unknown;
}
export interface ZwjsControllerAvailableFirmwareUpdatesArgs {
  nodeId: number;
  apiKey?: string;
  includePrereleases?: boolean;
}
export interface ZwjsControllerFirmwareUpdateInProgressResult {
  progress?: boolean;
  [key: string]: unknown;
}

export type ZwjsDefinedValueIdsResult =
  | ZwjsDefinedValueId[]
  | { values?: ZwjsDefinedValueId[]; [key: string]: unknown };

export interface ZwjsNodeValueEnvelopeResult {
  value?: unknown;
  [key: string]: unknown;
}

export type ZwjsNodeValueResult =
  | string
  | number
  | boolean
  | null
  | ZwjsNodeValueEnvelopeResult
  | Array<unknown>;

export interface ZwjsNodeValueMetadataResult {
  type?: string;
  label?: string;
  description?: string;
  readable?: boolean;
  writeable?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  steps?: number;
  states?: Record<string, unknown> | Array<unknown>;
  default?: unknown;
  [key: string]: unknown;
}
export type ZwjsNodeValueTimestampResult =
  | number
  | string
  | null
  | {
      timestamp?: number | string | null;
      [key: string]: unknown;
    };
export type ZwjsNodeSupportedNotificationEventsResult = Record<string, unknown> | Array<unknown>;
export interface ZwjsNodeFirmwareUpdateCapabilitiesResult {
  capabilities?: Record<string, unknown> | Array<unknown>;
  [key: string]: unknown;
}
export interface ZwjsNodeFirmwareUpdateCapabilitiesCachedResult {
  capabilities?: Record<string, unknown> | Array<unknown>;
  cached?: boolean;
  [key: string]: unknown;
}
export interface ZwjsNodeDateAndTimeResult {
  dateAndTime?: Record<string, unknown> | string | number | null;
  [key: string]: unknown;
}
export interface ZwjsNodeFirmwareUpdateInProgressResult {
  inProgress?: boolean;
  progress?: boolean | number | Record<string, unknown> | Array<unknown> | null;
  [key: string]: unknown;
}
export interface ZwjsNodeFirmwareUpdateProgressResult {
  progress?: number | Record<string, unknown> | Array<unknown> | null;
  [key: string]: unknown;
}
export interface ZwjsNodeHealthCheckInProgressResult {
  inProgress?: boolean;
  progress?: boolean | number | Record<string, unknown> | Array<unknown> | null;
  [key: string]: unknown;
}
export interface ZwjsNodeDeviceConfigChangedResult {
  hasChanged?: boolean;
  changed?: boolean;
  [key: string]: unknown;
}
export interface ZwjsNodePingResult {
  success?: boolean;
  [key: string]: unknown;
}
export interface ZwjsNodeRefreshInfoResult {
  success?: boolean;
  [key: string]: unknown;
}
export interface ZwjsNodeRefreshValuesResult {
  success?: boolean;
  [key: string]: unknown;
}
export interface ZwjsNodePollValueArgs {
  nodeId: number;
  valueId: ZwjsValueId;
  timeoutMs?: number;
  [key: string]: unknown;
}
export interface ZwjsNodePollValueResult {
  success?: boolean;
  value?: unknown;
  [key: string]: unknown;
}
export type ZwjsFirmwareUpdateCommandResult = Record<string, unknown>;
export interface ZwjsDriverFirmwareUpdateOtwRawFileArgs {
  filename: string;
  file: string;
  fileFormat?: string | number;
}
export interface ZwjsDriverFirmwareUpdateOtwUpdateInfoArgs {
  updateInfo: Record<string, unknown>;
}
export type ZwjsDriverFirmwareUpdateOtwArgs =
  | ZwjsDriverFirmwareUpdateOtwRawFileArgs
  | ZwjsDriverFirmwareUpdateOtwUpdateInfoArgs;
export interface ZwjsControllerFirmwareUpdateOtaArgs {
  nodeId: number;
  updateInfo: Record<string, unknown>;
}
export interface ZwjsControllerFirmwareUpdateOtwArgs {
  filename: string;
  file: string;
  fileFormat?: string | number;
}
export interface ZwjsNodeBeginFirmwareUpdateArgs {
  nodeId: number;
  firmwareFilename: string;
  firmwareFile: string;
  firmwareFileFormat?: string | number;
  target?: number;
}
export interface ZwjsNodeFirmwareUpdateFileArgs {
  filename: string;
  file: string;
  fileFormat?: string | number;
  firmwareTarget?: number;
}
export interface ZwjsNodeUpdateFirmwareArgs {
  nodeId: number;
  updates: ZwjsNodeFirmwareUpdateFileArgs[];
}
export interface ZwjsEndpointTarget {
  nodeId: number;
  endpoint?: number;
}
export interface ZwjsEndpointCcQuery extends ZwjsEndpointTarget {
  commandClass: number | string;
}
export interface ZwjsEndpointInvokeCcApiArgs extends ZwjsEndpointCcQuery {
  methodName: string;
  args: unknown[];
}
export type ZwjsEndpointSupportsCcApiResult =
  | boolean
  | { supported?: boolean; [key: string]: unknown };
export type ZwjsEndpointSupportsCcResult =
  | boolean
  | { supported?: boolean; [key: string]: unknown };
export type ZwjsEndpointControlsCcResult = boolean | { controls?: boolean; [key: string]: unknown };
export type ZwjsEndpointIsCcSecureResult = boolean | { secure?: boolean; [key: string]: unknown };
export type ZwjsEndpointGetCcVersionResult = number | { version?: number; [key: string]: unknown };
export type ZwjsEndpointNodeRefResult = Record<string, unknown> | null;
export interface ZwjsMulticastGroupTarget {
  nodeIDs: number[];
}
export interface ZwjsVirtualEndpointCcQuery extends ZwjsMulticastGroupTarget {
  index: number;
  commandClass: number | string;
}
export interface ZwjsVirtualEndpointInvokeCcApiArgs extends ZwjsVirtualEndpointCcQuery {
  methodName: string;
  args: unknown[];
}
export type ZwjsVirtualEndpointEndpointCountResult =
  | number
  | { count?: number; [key: string]: unknown };
export type ZwjsVirtualEndpointSupportsCcResult =
  | boolean
  | { supported?: boolean; [key: string]: unknown };
export type ZwjsVirtualEndpointSupportsCcApiResult =
  | boolean
  | { supported?: boolean; [key: string]: unknown };
export type ZwjsVirtualEndpointGetCcVersionResult =
  | number
  | { version?: number; [key: string]: unknown };
export type ZwjsVirtualEndpointDefinedValueIdsResult = ZwjsDefinedValueIdsResult;
export type ZwjsInvokeCcApiResult =
  | Record<string, unknown>
  | Array<unknown>
  | string
  | number
  | boolean
  | null;
export interface ZwjsZnifferCapturedFramesResult {
  capturedFrames?: Array<unknown>;
  [key: string]: unknown;
}
export interface ZwjsZnifferCaptureAsZlfBufferResult {
  capture?: unknown;
  [key: string]: unknown;
}
export interface ZwjsZnifferSupportedFrequenciesResult {
  frequencies?: unknown;
  [key: string]: unknown;
}
export interface ZwjsZnifferCurrentFrequencyResult {
  frequency?: number;
  [key: string]: unknown;
}
export interface ZwjsZnifferInitArgs {
  devicePath: string;
  options: Record<string, unknown>;
}
export interface ZwjsZnifferSetFrequencyArgs {
  frequency: number;
}
export type ZwjsZnifferCommandEmptyResult = Record<string, never>;

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
  mutationPolicy?: Partial<MutationPolicy>;
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

export interface ZwjsNodeValueUpdatedEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'value updated';
  nodeId: number;
  args?: {
    newValue?: unknown;
    prevValue?: unknown;
    propertyName?: string;
    propertyKeyName?: string;
    [key: string]: unknown;
  };
}

export interface ZwjsNodeValueAddedEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'value added';
  nodeId: number;
  args?: Record<string, unknown>;
}

export interface ZwjsNodeValueRemovedEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'value removed';
  nodeId: number;
  args?: Record<string, unknown>;
}

export interface ZwjsNodeMetadataUpdatedEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'metadata updated';
  nodeId: number;
  args?: Record<string, unknown>;
}

export interface ZwjsNodeNotificationEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'notification';
  nodeId: number;
  args?: Record<string, unknown>;
}

export interface ZwjsNodeValueNotificationEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'value notification';
  nodeId: number;
  args?: Record<string, unknown>;
}

export interface ZwjsNodeWakeUpEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'wake up';
  nodeId: number;
  oldStatus?: unknown;
}

export interface ZwjsNodeSleepEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'sleep';
  nodeId: number;
  oldStatus?: unknown;
}

export interface ZwjsNodeInterviewStartedEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'interview started';
  nodeId: number;
  args?: Record<string, unknown>;
}

export interface ZwjsNodeInterviewCompletedEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'interview completed';
  nodeId: number;
  args?: Record<string, unknown>;
}

export interface ZwjsNodeInterviewFailedEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'interview failed';
  nodeId: number;
  args?: Record<string, unknown>;
}

export interface ZwjsNodeInterviewStageCompletedEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'interview stage completed';
  nodeId: number;
  stageName: string;
}

export interface ZwjsDriverLoggingEventPayload extends ZwjsProtocolEventPayload {
  source: 'driver';
  event: 'logging';
  formattedMessage: string;
  message: string | string[];
  [key: string]: unknown;
}

export interface ZwjsControllerNvmConvertProgressEventPayload extends ZwjsProtocolEventPayload {
  source: 'controller';
  event: 'nvm convert progress';
  bytesRead: number;
  total: number;
}

export interface ZwjsControllerNvmBackupProgressEventPayload extends ZwjsProtocolEventPayload {
  source: 'controller';
  event: 'nvm backup progress';
  bytesRead: number;
  total: number;
}

export interface ZwjsControllerGrantSecurityClassesEventPayload extends ZwjsProtocolEventPayload {
  source: 'controller';
  event: 'grant security classes';
  requested: Record<string, unknown>;
}

export interface ZwjsControllerValidateDskAndEnterPinEventPayload extends ZwjsProtocolEventPayload {
  source: 'controller';
  event: 'validate dsk and enter pin';
  dsk: string;
}

export interface ZwjsControllerInclusionAbortedEventPayload extends ZwjsProtocolEventPayload {
  source: 'controller';
  event: 'inclusion aborted';
}

export interface ZwjsControllerNvmRestoreProgressEventPayload extends ZwjsProtocolEventPayload {
  source: 'controller';
  event: 'nvm restore progress';
  bytesWritten: number;
  total: number;
}

export interface ZwjsDriverFirmwareUpdateProgressEventPayload extends ZwjsProtocolEventPayload {
  source: 'driver';
  event: 'firmware update progress';
  progress?: unknown;
}

export interface ZwjsDriverFirmwareUpdateFinishedEventPayload extends ZwjsProtocolEventPayload {
  source: 'driver';
  event: 'firmware update finished';
  result?: unknown;
}

export interface ZwjsControllerFirmwareUpdateProgressEventPayload extends ZwjsProtocolEventPayload {
  source: 'controller';
  event: 'firmware update progress';
  progress?: unknown;
}

export interface ZwjsControllerFirmwareUpdateFinishedEventPayload extends ZwjsProtocolEventPayload {
  source: 'controller';
  event: 'firmware update finished';
  result?: unknown;
}

export interface ZwjsZnifferReadyEventPayload extends ZwjsProtocolEventPayload {
  source: 'zniffer';
  event: 'ready';
}

export interface ZwjsZnifferCorruptedFrameEventPayload extends ZwjsProtocolEventPayload {
  source: 'zniffer';
  event: 'corrupted frame';
  corruptedFrame?: unknown;
  rawDate?: unknown;
}

export interface ZwjsZnifferFrameEventPayload extends ZwjsProtocolEventPayload {
  source: 'zniffer';
  event: 'frame';
  frame?: unknown;
  rawData?: unknown;
}

export interface ZwjsZnifferErrorEventPayload extends ZwjsProtocolEventPayload {
  source: 'zniffer';
  event: 'error';
  error?: unknown;
}

export interface ZwjsNodeTestPowerlevelProgressEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'test powerlevel progress';
  nodeId: number;
  acknowledged: number;
  total: number;
}

export interface ZwjsNodeCheckLifelineHealthProgressEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'check lifeline health progress';
  nodeId: number;
  round: number;
  totalRounds: number;
  lastRating: number;
}

export interface ZwjsNodeCheckRouteHealthProgressEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'check route health progress';
  nodeId: number;
  rounds: number;
  totalRounds: number;
  lastRating: number;
}

export interface ZwjsNodeFirmwareUpdateProgressEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'firmware update progress';
  nodeId: number;
  progress?: unknown;
  sentFragments?: number;
  totalFragments?: number;
}

export interface ZwjsNodeFirmwareUpdateFinishedEventPayload extends ZwjsProtocolEventPayload {
  source: 'node';
  event: 'firmware update finished';
  nodeId: number;
  result?: unknown;
  status?: unknown;
  waitTime?: unknown;
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
    | 'zwjs.event.node.value-updated'
    | 'zwjs.event.node.value-added'
    | 'zwjs.event.node.value-removed'
    | 'zwjs.event.node.value-notification'
    | 'zwjs.event.node.metadata-updated'
    | 'zwjs.event.node.notification'
    | 'zwjs.event.node.wake-up'
    | 'zwjs.event.node.sleep'
    | 'zwjs.event.node.interview-started'
    | 'zwjs.event.node.interview-completed'
    | 'zwjs.event.node.interview-failed'
    | 'zwjs.event.node.interview-stage-completed'
    | 'zwjs.event.driver.logging'
    | 'zwjs.event.driver.firmware-update-progress'
    | 'zwjs.event.driver.firmware-update-finished'
    | 'zwjs.event.controller.grant-security-classes'
    | 'zwjs.event.controller.validate-dsk-and-enter-pin'
    | 'zwjs.event.controller.inclusion-aborted'
    | 'zwjs.event.controller.nvm-backup-progress'
    | 'zwjs.event.controller.nvm-convert-progress'
    | 'zwjs.event.controller.nvm-restore-progress'
    | 'zwjs.event.controller.firmware-update-progress'
    | 'zwjs.event.controller.firmware-update-finished'
    | 'zwjs.event.zniffer.ready'
    | 'zwjs.event.zniffer.corrupted-frame'
    | 'zwjs.event.zniffer.frame'
    | 'zwjs.event.zniffer.error'
    | 'zwjs.event.node.test-powerlevel-progress'
    | 'zwjs.event.node.check-lifeline-health-progress'
    | 'zwjs.event.node.check-route-health-progress'
    | 'zwjs.event.node.firmware-update-progress'
    | 'zwjs.event.node.firmware-update-finished'
    | 'node.event.raw-normalized';
  ts: string;
  source: 'zwjs-client';
}

export type ZwjsClientEvent =
  | (ZwjsEventBase & { type: 'client.lifecycle'; from: ZwjsLifecycleState; to: ZwjsLifecycleState })
  | (ZwjsEventBase & {
      type: 'client.reconnect.scheduled';
      attempt: number;
      delayMs: number;
      reason?: ClientErrorSummary;
    })
  | (ZwjsEventBase & { type: 'transport.connected' })
  | (ZwjsEventBase & {
      type: 'transport.disconnected';
      code?: number;
      reason?: string;
      wasClean?: boolean;
    })
  | (ZwjsEventBase & { type: 'auth.succeeded' })
  | (ZwjsEventBase & { type: 'auth.failed'; error: ClientErrorSummary })
  | (ZwjsEventBase & {
      type: 'compat.warning';
      message: string;
      version?: string;
      adapterFamily?: string;
    })
  | (ZwjsEventBase & { type: 'protocol.error'; error: ClientErrorSummary; context?: unknown })
  | (ZwjsEventBase & { type: 'server.info'; info: ServerInfoResult })
  | (ZwjsEventBase & { type: 'nodes.snapshot'; nodes: NodeListResult })
  | (ZwjsEventBase & { type: 'zwjs.event.driver'; event: ZwjsProtocolEventPayload })
  | (ZwjsEventBase & { type: 'zwjs.event.controller'; event: ZwjsProtocolEventPayload })
  | (ZwjsEventBase & { type: 'zwjs.event.node'; event: ZwjsProtocolEventPayload })
  | (ZwjsEventBase & { type: 'zwjs.event.zniffer'; event: ZwjsProtocolEventPayload })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.value-updated';
      event: ZwjsNodeValueUpdatedEventPayload;
    })
  | (ZwjsEventBase & { type: 'zwjs.event.node.value-added'; event: ZwjsNodeValueAddedEventPayload })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.value-removed';
      event: ZwjsNodeValueRemovedEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.value-notification';
      event: ZwjsNodeValueNotificationEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.metadata-updated';
      event: ZwjsNodeMetadataUpdatedEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.notification';
      event: ZwjsNodeNotificationEventPayload;
    })
  | (ZwjsEventBase & { type: 'zwjs.event.node.wake-up'; event: ZwjsNodeWakeUpEventPayload })
  | (ZwjsEventBase & { type: 'zwjs.event.node.sleep'; event: ZwjsNodeSleepEventPayload })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.interview-started';
      event: ZwjsNodeInterviewStartedEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.interview-completed';
      event: ZwjsNodeInterviewCompletedEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.interview-failed';
      event: ZwjsNodeInterviewFailedEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.interview-stage-completed';
      event: ZwjsNodeInterviewStageCompletedEventPayload;
    })
  | (ZwjsEventBase & { type: 'zwjs.event.driver.logging'; event: ZwjsDriverLoggingEventPayload })
  | (ZwjsEventBase & {
      type: 'zwjs.event.driver.firmware-update-progress';
      event: ZwjsDriverFirmwareUpdateProgressEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.driver.firmware-update-finished';
      event: ZwjsDriverFirmwareUpdateFinishedEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.controller.grant-security-classes';
      event: ZwjsControllerGrantSecurityClassesEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.controller.validate-dsk-and-enter-pin';
      event: ZwjsControllerValidateDskAndEnterPinEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.controller.inclusion-aborted';
      event: ZwjsControllerInclusionAbortedEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.controller.nvm-backup-progress';
      event: ZwjsControllerNvmBackupProgressEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.controller.nvm-convert-progress';
      event: ZwjsControllerNvmConvertProgressEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.controller.nvm-restore-progress';
      event: ZwjsControllerNvmRestoreProgressEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.controller.firmware-update-progress';
      event: ZwjsControllerFirmwareUpdateProgressEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.controller.firmware-update-finished';
      event: ZwjsControllerFirmwareUpdateFinishedEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.zniffer.ready';
      event: ZwjsZnifferReadyEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.zniffer.corrupted-frame';
      event: ZwjsZnifferCorruptedFrameEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.zniffer.frame';
      event: ZwjsZnifferFrameEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.zniffer.error';
      event: ZwjsZnifferErrorEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.test-powerlevel-progress';
      event: ZwjsNodeTestPowerlevelProgressEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.check-lifeline-health-progress';
      event: ZwjsNodeCheckLifelineHealthProgressEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.check-route-health-progress';
      event: ZwjsNodeCheckRouteHealthProgressEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.firmware-update-progress';
      event: ZwjsNodeFirmwareUpdateProgressEventPayload;
    })
  | (ZwjsEventBase & {
      type: 'zwjs.event.node.firmware-update-finished';
      event: ZwjsNodeFirmwareUpdateFinishedEventPayload;
    })
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
  setApiSchema(schemaVersion: number): Promise<ZwjsCommandResult>;
  startListening(): Promise<ZwjsCommandResult<{ state?: unknown }>>;
  startListeningLogs(filter?: ZwjsLogFilter): Promise<ZwjsCommandResult>;
  stopListeningLogs(): Promise<ZwjsCommandResult>;
  sendCommand<TResult = unknown, TArgs = Record<string, unknown>>(
    request: ZwjsCommandRequest<TArgs>,
  ): Promise<ZwjsCommandResult<TResult>>;
  sendMutationCommand<TResult = unknown, TArgs = Record<string, unknown>>(
    request: ZwjsCommandRequest<TArgs>,
  ): Promise<ZwjsCommandResult<TResult>>;
  getDriverConfig(): Promise<ZwjsCommandResult<ZwjsDriverConfig>>;
  getDriverLogConfig(): Promise<ZwjsCommandResult<ZwjsDriverLogConfigResult>>;
  isDriverStatisticsEnabled(): Promise<ZwjsCommandResult<ZwjsDriverStatisticsEnabledResult>>;
  isDriverOtwFirmwareUpdateInProgress(): Promise<
    ZwjsCommandResult<ZwjsDriverOtwFirmwareUpdateInProgressResult>
  >;
  getControllerState(): Promise<ZwjsCommandResult<ZwjsControllerStateResult>>;
  getControllerNodeNeighbors(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsControllerNodeNeighborsResult>>;
  getControllerAnyFirmwareUpdateProgress(): Promise<
    ZwjsCommandResult<ZwjsControllerAnyFirmwareUpdateProgressResult>
  >;
  isControllerAnyOtaFirmwareUpdateInProgress(): Promise<
    ZwjsCommandResult<ZwjsControllerAnyOtaFirmwareUpdateInProgressResult>
  >;
  getControllerAvailableFirmwareUpdates(
    args: ZwjsControllerAvailableFirmwareUpdatesArgs,
  ): Promise<ZwjsCommandResult<ZwjsControllerAvailableFirmwareUpdatesResult>>;
  isControllerFirmwareUpdateInProgress(): Promise<
    ZwjsCommandResult<ZwjsControllerFirmwareUpdateInProgressResult>
  >;
  getNodeState(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeStateResult>>;
  getNodeDefinedValueIds(nodeId: number): Promise<ZwjsCommandResult<ZwjsDefinedValueIdsResult>>;
  getNodeValueMetadata(
    nodeId: number,
    valueId: ZwjsValueId,
  ): Promise<ZwjsCommandResult<ZwjsNodeValueMetadataResult>>;
  getNodeValue(
    nodeId: number,
    valueId: ZwjsValueId,
  ): Promise<ZwjsCommandResult<ZwjsNodeValueResult>>;
  getNodeValueTimestamp(
    nodeId: number,
    valueId: ZwjsValueId,
  ): Promise<ZwjsCommandResult<ZwjsNodeValueTimestampResult>>;
  getNodeSupportedNotificationEvents(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeSupportedNotificationEventsResult>>;
  getNodeFirmwareUpdateCapabilities(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeFirmwareUpdateCapabilitiesResult>>;
  getNodeFirmwareUpdateCapabilitiesCached(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeFirmwareUpdateCapabilitiesCachedResult>>;
  getNodeDateAndTime(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeDateAndTimeResult>>;
  isNodeFirmwareUpdateInProgress(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeFirmwareUpdateInProgressResult>>;
  getNodeFirmwareUpdateProgress(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeFirmwareUpdateProgressResult>>;
  isNodeHealthCheckInProgress(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeHealthCheckInProgressResult>>;
  hasNodeDeviceConfigChanged(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeDeviceConfigChangedResult>>;
  pingNode(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodePingResult>>;
  refreshNodeInfo(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeRefreshInfoResult>>;
  refreshNodeValues(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeRefreshValuesResult>>;
  pollNodeValue(args: ZwjsNodePollValueArgs): Promise<ZwjsCommandResult<ZwjsNodePollValueResult>>;
  driverFirmwareUpdateOtw(
    args: ZwjsDriverFirmwareUpdateOtwArgs,
  ): Promise<ZwjsCommandResult<ZwjsFirmwareUpdateCommandResult>>;
  controllerFirmwareUpdateOta(
    args: ZwjsControllerFirmwareUpdateOtaArgs,
  ): Promise<ZwjsCommandResult<ZwjsFirmwareUpdateCommandResult>>;
  controllerFirmwareUpdateOtw(
    args: ZwjsControllerFirmwareUpdateOtwArgs,
  ): Promise<ZwjsCommandResult<ZwjsFirmwareUpdateCommandResult>>;
  beginNodeFirmwareUpdate(
    args: ZwjsNodeBeginFirmwareUpdateArgs,
  ): Promise<ZwjsCommandResult<ZwjsFirmwareUpdateCommandResult>>;
  updateNodeFirmware(
    args: ZwjsNodeUpdateFirmwareArgs,
  ): Promise<ZwjsCommandResult<ZwjsFirmwareUpdateCommandResult>>;
  abortNodeFirmwareUpdate(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsFirmwareUpdateCommandResult>>;
  endpointSupportsCc(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointSupportsCcResult>>;
  endpointInvokeCcApi(
    args: ZwjsEndpointInvokeCcApiArgs,
  ): Promise<ZwjsCommandResult<ZwjsInvokeCcApiResult>>;
  endpointSupportsCcApi(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointSupportsCcApiResult>>;
  endpointControlsCc(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointControlsCcResult>>;
  endpointIsCcSecure(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointIsCcSecureResult>>;
  endpointGetCcVersion(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointGetCcVersionResult>>;
  endpointTryGetNode(
    args: ZwjsEndpointTarget,
  ): Promise<ZwjsCommandResult<ZwjsEndpointNodeRefResult>>;
  endpointGetNodeUnsafe(
    args: ZwjsEndpointTarget,
  ): Promise<ZwjsCommandResult<ZwjsEndpointNodeRefResult>>;
  broadcastNodeGetEndpointCount(): Promise<
    ZwjsCommandResult<ZwjsVirtualEndpointEndpointCountResult>
  >;
  broadcastNodeSupportsCc(
    args: Pick<ZwjsVirtualEndpointCcQuery, 'index' | 'commandClass'>,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointSupportsCcResult>>;
  broadcastNodeInvokeCcApi(
    args: Pick<
      ZwjsVirtualEndpointInvokeCcApiArgs,
      'index' | 'commandClass' | 'methodName' | 'args'
    >,
  ): Promise<ZwjsCommandResult<ZwjsInvokeCcApiResult>>;
  broadcastNodeSupportsCcApi(
    args: Pick<ZwjsVirtualEndpointCcQuery, 'index' | 'commandClass'>,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointSupportsCcApiResult>>;
  broadcastNodeGetCcVersion(
    args: Pick<ZwjsVirtualEndpointCcQuery, 'index' | 'commandClass'>,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointGetCcVersionResult>>;
  multicastGroupGetEndpointCount(
    args: ZwjsMulticastGroupTarget,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointEndpointCountResult>>;
  multicastGroupSupportsCc(
    args: ZwjsVirtualEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointSupportsCcResult>>;
  multicastGroupInvokeCcApi(
    args: ZwjsVirtualEndpointInvokeCcApiArgs,
  ): Promise<ZwjsCommandResult<ZwjsInvokeCcApiResult>>;
  multicastGroupSupportsCcApi(
    args: ZwjsVirtualEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointSupportsCcApiResult>>;
  multicastGroupGetCcVersion(
    args: ZwjsVirtualEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointGetCcVersionResult>>;
  multicastGroupGetDefinedValueIds(
    args: ZwjsMulticastGroupTarget,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointDefinedValueIdsResult>>;
  getZnifferCapturedFrames(): Promise<ZwjsCommandResult<ZwjsZnifferCapturedFramesResult>>;
  getZnifferCaptureAsZlfBuffer(): Promise<ZwjsCommandResult<ZwjsZnifferCaptureAsZlfBufferResult>>;
  getZnifferSupportedFrequencies(): Promise<
    ZwjsCommandResult<ZwjsZnifferSupportedFrequenciesResult>
  >;
  getZnifferCurrentFrequency(): Promise<ZwjsCommandResult<ZwjsZnifferCurrentFrequencyResult>>;
  initZniffer(args: ZwjsZnifferInitArgs): Promise<ZwjsCommandResult<ZwjsZnifferCommandEmptyResult>>;
  startZniffer(): Promise<ZwjsCommandResult<ZwjsZnifferCommandEmptyResult>>;
  stopZniffer(): Promise<ZwjsCommandResult<ZwjsZnifferCommandEmptyResult>>;
  destroyZniffer(): Promise<ZwjsCommandResult<ZwjsZnifferCommandEmptyResult>>;
  clearZnifferCapturedFrames(): Promise<ZwjsCommandResult<ZwjsZnifferCommandEmptyResult>>;
  setZnifferFrequency(
    args: ZwjsZnifferSetFrequencyArgs,
  ): Promise<ZwjsCommandResult<ZwjsZnifferCommandEmptyResult>>;
  beginInclusion(
    args?: ZwjsControllerBeginInclusionArgs,
  ): Promise<ZwjsCommandResult<ZwjsControllerInclusionCommandResult>>;
  beginExclusion(
    args?: ZwjsControllerBeginExclusionArgs,
  ): Promise<ZwjsCommandResult<ZwjsControllerInclusionCommandResult>>;
  stopInclusion(): Promise<ZwjsCommandResult<ZwjsControllerInclusionCommandResult>>;
  stopExclusion(): Promise<ZwjsCommandResult<ZwjsControllerInclusionCommandResult>>;
  getServerInfo(): Promise<ServerInfoResult>;
  getNodeList(): Promise<NodeListResult>;
}

export interface NormalizerContext {
  emit: (event: ZwjsClientEvent) => void;
}

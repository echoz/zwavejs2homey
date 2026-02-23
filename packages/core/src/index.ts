export type {
  CanonicalNodeSummary,
  ClientLogger,
  NodeListResult,
  ReconnectPolicy,
  ServerInfoResult,
  TimeoutPolicy,
  VersionPolicy,
  ZwjsCommandRequest,
  ZwjsCommandResult,
  ZwjsProtocolErrorPayload,
  ZwjsAuthConfig,
  ZwjsClient,
  ZwjsClientConfig,
  ZwjsControllerStateResult,
  ZwjsControllerNodeNeighborsResult,
  ZwjsClientEvent,
  ZwjsControllerNvmConvertProgressEventPayload,
  ZwjsControllerNvmRestoreProgressEventPayload,
  ZwjsDriverLoggingEventPayload,
  ZwjsNodeMetadataUpdatedEventPayload,
  ZwjsNodeNotificationEventPayload,
  ZwjsNodeValueUpdatedEventPayload,
  ZwjsInitializeOptions,
  ZwjsDriverConfig,
  ZwjsDriverLogConfigResult,
  ZwjsDriverStatisticsEnabledResult,
  ZwjsDefinedValueIdsResult,
  ZwjsNodeStateResult,
  ZwjsNodeValueMetadataResult,
  ZwjsNodeValueResult,
  ZwjsNodeSupportedNotificationEventsResult,
  ZwjsNodeValueTimestampResult,
  ZwjsClientStatus,
  ZwjsValueId,
} from './client/types';
export type { ClientErrorSummary, ZwjsClientErrorCode } from './errors';
export type {
  ZwjsEventFrame,
  ZwjsProtocolCommandFrame,
  ZwjsResultErrorFrame,
  ZwjsResultFrame,
  ZwjsResultSuccessFrame,
  ZwjsVersionFrame,
} from './protocol/raw-frame-types';

import { ZwjsClientImpl } from './client/zwjs-client';
import type { ZwjsClient, ZwjsClientConfig } from './client/types';

export function createZwjsClient(config: ZwjsClientConfig): ZwjsClient {
  return new ZwjsClientImpl(config);
}

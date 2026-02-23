export type {
  CanonicalNodeSummary,
  ClientLogger,
  NodeListResult,
  MutationPolicy,
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
  ZwjsControllerNvmBackupProgressEventPayload,
  ZwjsControllerNvmRestoreProgressEventPayload,
  ZwjsDriverLoggingEventPayload,
  ZwjsNodeMetadataUpdatedEventPayload,
  ZwjsNodeNotificationEventPayload,
  ZwjsNodeValueAddedEventPayload,
  ZwjsNodeCheckLifelineHealthProgressEventPayload,
  ZwjsNodeCheckRouteHealthProgressEventPayload,
  ZwjsNodeValueRemovedEventPayload,
  ZwjsNodeTestPowerlevelProgressEventPayload,
  ZwjsNodeValueUpdatedEventPayload,
  ZwjsInitializeOptions,
  ZwjsLogFilter,
  ZwjsDriverConfig,
  ZwjsDriverLogConfigResult,
  ZwjsDriverStatisticsEnabledResult,
  ZwjsDefinedValueIdsResult,
  ZwjsDefinedValueId,
  ZwjsNodeStateResult,
  ZwjsNodeValueMetadataResult,
  ZwjsNodeValueEnvelopeResult,
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
export { extractZwjsDefinedValueIds, isZwjsDefinedValueId, isZwjsValueId } from './protocol/value-id-guards';
export { extractZwjsNodeValue, isZwjsNodeValueEnvelopeResult } from './protocol/value-result-guards';

import { ZwjsClientImpl } from './client/zwjs-client';
import type { ZwjsClient, ZwjsClientConfig } from './client/types';

export function createZwjsClient(config: ZwjsClientConfig): ZwjsClient {
  return new ZwjsClientImpl(config);
}

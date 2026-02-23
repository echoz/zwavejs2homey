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
  ZwjsAuthConfig,
  ZwjsClient,
  ZwjsClientConfig,
  ZwjsControllerStateResult,
  ZwjsClientEvent,
  ZwjsInitializeOptions,
  ZwjsDriverConfig,
  ZwjsNodeStateResult,
  ZwjsClientStatus,
} from './client/types';
export type { ClientErrorSummary, ZwjsClientErrorCode } from './errors';
export type {
  ZwjsEventFrame,
  ZwjsProtocolCommandFrame,
  ZwjsResultFrame,
  ZwjsVersionFrame,
} from './protocol/raw-frame-types';

import { ZwjsClientImpl } from './client/zwjs-client';
import type { ZwjsClient, ZwjsClientConfig } from './client/types';

export function createZwjsClient(config: ZwjsClientConfig): ZwjsClient {
  return new ZwjsClientImpl(config);
}

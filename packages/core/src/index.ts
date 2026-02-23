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

import { ZwjsClientImpl } from './client/zwjs-client';
import type { ZwjsClient, ZwjsClientConfig } from './client/types';

export function createZwjsClient(config: ZwjsClientConfig): ZwjsClient {
  return new ZwjsClientImpl(config);
}

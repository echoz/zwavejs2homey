import { RequestTracker } from './request-tracker';
import { mergeReconnectPolicy, computeReconnectDelayMs } from './reconnect';
import { transitionState } from './state-machine';
import { SubscriberRegistry } from './subscribers';
import type {
  NodeListResult,
  ServerInfoResult,
  TimeoutPolicy,
  VersionPolicy,
  MutationPolicy,
  ZwjsCommandRequest,
  ZwjsCommandResult,
  ZwjsProtocolErrorPayload,
  ZwjsClient,
  ZwjsClientConfig,
  ZwjsControllerStateResult,
  ZwjsControllerNodeNeighborsResult,
  ZwjsDriverConfig,
  ZwjsDriverLogConfigResult,
  ZwjsDriverStatisticsEnabledResult,
  ZwjsClientEvent,
  ZwjsClientEventInput,
  ZwjsInitializeOptions,
  ZwjsLogFilter,
  ZwjsControllerBeginInclusionArgs,
  ZwjsControllerBeginExclusionArgs,
  ZwjsControllerInclusionCommandResult,
  ZwjsNodeStateResult,
  ZwjsDefinedValueIdsResult,
  ZwjsNodeValueMetadataResult,
  ZwjsNodeValueResult,
  ZwjsNodeValueTimestampResult,
  ZwjsNodeSupportedNotificationEventsResult,
  ZwjsNodeFirmwareUpdateCapabilitiesResult,
  ZwjsNodeFirmwareUpdateCapabilitiesCachedResult,
  ZwjsNodeDateAndTimeResult,
  ZwjsNodeFirmwareUpdateInProgressResult,
  ZwjsNodeFirmwareUpdateProgressResult,
  ZwjsNodeHealthCheckInProgressResult,
  ZwjsNodeDeviceConfigChangedResult,
  ZwjsNodePingResult,
  ZwjsNodeRefreshInfoResult,
  ZwjsNodeRefreshValuesResult,
  ZwjsNodePollValueArgs,
  ZwjsNodePollValueResult,
  ZwjsEndpointTarget,
  ZwjsEndpointCcQuery,
  ZwjsEndpointInvokeCcApiArgs,
  ZwjsEndpointSupportsCcResult,
  ZwjsEndpointSupportsCcApiResult,
  ZwjsEndpointControlsCcResult,
  ZwjsEndpointIsCcSecureResult,
  ZwjsEndpointGetCcVersionResult,
  ZwjsEndpointNodeRefResult,
  ZwjsMulticastGroupTarget,
  ZwjsVirtualEndpointCcQuery,
  ZwjsVirtualEndpointInvokeCcApiArgs,
  ZwjsVirtualEndpointEndpointCountResult,
  ZwjsVirtualEndpointSupportsCcResult,
  ZwjsVirtualEndpointSupportsCcApiResult,
  ZwjsVirtualEndpointGetCcVersionResult,
  ZwjsVirtualEndpointDefinedValueIdsResult,
  ZwjsInvokeCcApiResult,
  ZwjsZnifferCapturedFramesResult,
  ZwjsZnifferCaptureAsZlfBufferResult,
  ZwjsZnifferSupportedFrequenciesResult,
  ZwjsZnifferCurrentFrequencyResult,
  ZwjsValueId,
  ZwjsClientStatus,
  ZwjsLifecycleState,
} from './types';
import { toErrorSummary, ZwjsClientError } from '../errors';
import { WsTransport } from '../transport/ws-transport';
import { detectProtocolInfo } from '../protocol/detector';
import { selectAdapter } from '../protocol/normalizers/registry';
import type { ZwjsProtocolAdapter } from '../protocol/normalizers/types';

const DEFAULT_TIMEOUTS: TimeoutPolicy = {
  connectTimeoutMs: 10_000,
  requestTimeoutMs: 5_000,
};

const DEFAULT_VERSION_POLICY: VersionPolicy = {
  mode: 'adaptive',
  strictFamilyMatch: false,
};

const DEFAULT_MUTATION_POLICY: MutationPolicy = {
  enabled: false,
  requireAllowList: true,
};

export class ZwjsClientImpl implements ZwjsClient {
  private readonly config: Required<Pick<ZwjsClientConfig, 'url'>> & ZwjsClientConfig;
  private readonly transport = new WsTransport();
  private readonly subscribers = new SubscriberRegistry();
  private readonly requests = new RequestTracker();
  private readonly reconnectPolicy;
  private readonly timeouts: TimeoutPolicy;
  private readonly versionPolicy: VersionPolicy;
  private readonly mutationPolicy: MutationPolicy;

  private status: ZwjsClientStatus = {
    lifecycle: 'idle',
    transportConnected: false,
  };

  private adapter?: ZwjsProtocolAdapter;
  private listeningRequested = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private explicitStop = false;
  private startPromise?: Promise<void>;
  private stopPromise?: Promise<void>;
  private cachedServerInfo?: ServerInfoResult;
  private cachedNodeList?: NodeListResult;
  private startListeningState?: unknown;
  private pendingNodeListWaiters: Array<{
    resolve: (value: NodeListResult) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private pendingVersionWaiters: Array<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(config: ZwjsClientConfig) {
    this.config = config;
    this.reconnectPolicy = mergeReconnectPolicy(config.reconnect);
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts };
    this.versionPolicy = { ...DEFAULT_VERSION_POLICY, ...config.versionPolicy };
    this.mutationPolicy = { ...DEFAULT_MUTATION_POLICY, ...config.mutationPolicy };
  }

  onEvent(handler: (event: ZwjsClientEvent) => void): () => void {
    return this.subscribers.subscribe(handler);
  }

  getStatus(): ZwjsClientStatus {
    return { ...this.status };
  }

  async start(): Promise<void> {
    if (
      this.status.lifecycle === 'connected' ||
      this.status.lifecycle === 'connecting' ||
      this.status.lifecycle === 'reconnecting'
    ) {
      return this.startPromise ?? Promise.resolve();
    }
    if (this.status.lifecycle === 'stopping') {
      await this.stopPromise;
    }

    this.explicitStop = false;
    this.startPromise = this.connectFlow('connecting');
    return this.startPromise;
  }

  async stop(): Promise<void> {
    if (this.status.lifecycle === 'stopping' || this.status.lifecycle === 'stopped') {
      return this.stopPromise ?? Promise.resolve();
    }

    this.explicitStop = true;
    this.cancelReconnect();
    this.setLifecycle('stopping');

    this.stopPromise = Promise.resolve().then(() => {
      this.clearVersionWaiters(
        new ZwjsClientError({
          code: 'CLIENT_STOPPED',
          message: 'Client stopped',
          retryable: false,
        }),
      );
      this.clearNodeListWaiters(
        new ZwjsClientError({
          code: 'CLIENT_STOPPED',
          message: 'Client stopped',
          retryable: false,
        }),
      );
      this.requests.rejectAll(
        new ZwjsClientError({
          code: 'CLIENT_STOPPED',
          message: 'Client stopped',
          retryable: false,
        }),
      );
      this.transport.close();
      this.status.transportConnected = false;
      this.setLifecycle('stopped');
    });

    return this.stopPromise;
  }

  async getServerInfo(): Promise<ServerInfoResult> {
    if (this.cachedServerInfo) return this.cachedServerInfo;
    throw new ZwjsClientError({
      code: 'UNSUPPORTED_OPERATION',
      message: 'Server info not yet available; wait for version frame after connect',
    });
  }

  async getNodeList(): Promise<NodeListResult> {
    if (this.cachedNodeList) return this.cachedNodeList;
    if (!this.listeningRequested) {
      await this.startListening();
    }
    if (this.cachedNodeList) return this.cachedNodeList;
    return this.waitForNodeListSnapshot();
  }

  async initialize(options: ZwjsInitializeOptions): Promise<ZwjsCommandResult> {
    this.ensureAdapter();
    if (!this.adapter?.buildInitializeRequest) {
      throw new ZwjsClientError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Initialize command not supported by selected adapter',
      });
    }
    const result = await this.requestProtocolCommand((id) =>
      this.adapter!.buildInitializeRequest!(
        id,
        options.schemaVersion,
        options.additionalUserAgentComponents,
      ),
    );
    if (result.success) {
      this.status.initialized = true;
    }
    return result;
  }

  async setApiSchema(schemaVersion: number): Promise<ZwjsCommandResult> {
    return this.sendCommand({ command: 'set_api_schema', args: { schemaVersion } });
  }

  async startListening(): Promise<ZwjsCommandResult<{ state?: unknown }>> {
    this.ensureAdapter();
    if (this.listeningRequested) {
      return {
        messageId: 'already-listening',
        success: true,
        result: { state: this.startListeningState },
      };
    }
    if (!this.adapter?.buildStartListeningRequest) {
      throw new ZwjsClientError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'start_listening command not supported by selected adapter',
      });
    }
    const result = await this.requestProtocolCommand<{ state?: unknown }>((id) =>
      this.adapter!.buildStartListeningRequest!(id),
    );
    if (result.success) {
      this.listeningRequested = true;
      this.status.listening = true;
      this.startListeningState = result.result?.state;
    }
    return result;
  }

  async startListeningLogs(filter?: ZwjsLogFilter): Promise<ZwjsCommandResult> {
    return this.sendCommand({
      command: 'start_listening_logs',
      ...(filter ? { args: { filter } } : {}),
    });
  }

  async stopListeningLogs(): Promise<ZwjsCommandResult> {
    return this.sendCommand({ command: 'stop_listening_logs' });
  }

  async sendCommand<TResult = unknown, TArgs = Record<string, unknown>>(
    request: ZwjsCommandRequest<TArgs>,
  ): Promise<ZwjsCommandResult<TResult>> {
    this.ensureAdapter();
    if (!this.adapter?.buildCommandRequest) {
      throw new ZwjsClientError({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Generic command requests not supported by selected adapter',
      });
    }
    return this.requestProtocolCommand<TResult>((id) =>
      this.adapter!.buildCommandRequest!(
        id,
        request.command,
        (request.args ?? {}) as Record<string, unknown>,
      ),
    );
  }

  async sendMutationCommand<TResult = unknown, TArgs = Record<string, unknown>>(
    request: ZwjsCommandRequest<TArgs>,
  ): Promise<ZwjsCommandResult<TResult>> {
    this.assertMutationAllowed(request.command);
    return this.sendCommand<TResult, TArgs>(request);
  }

  async getDriverConfig(): Promise<ZwjsCommandResult<ZwjsDriverConfig>> {
    return this.sendCommand<ZwjsDriverConfig>({ command: 'driver.get_config' });
  }

  async getDriverLogConfig(): Promise<ZwjsCommandResult<ZwjsDriverLogConfigResult>> {
    return this.sendCommand<ZwjsDriverLogConfigResult>({ command: 'driver.get_log_config' });
  }

  async isDriverStatisticsEnabled(): Promise<ZwjsCommandResult<ZwjsDriverStatisticsEnabledResult>> {
    return this.sendCommand<ZwjsDriverStatisticsEnabledResult>({
      command: 'driver.is_statistics_enabled',
    });
  }

  async getControllerState(): Promise<ZwjsCommandResult<ZwjsControllerStateResult>> {
    return this.sendCommand<ZwjsControllerStateResult>({ command: 'controller.get_state' });
  }

  async getControllerNodeNeighbors(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsControllerNodeNeighborsResult>> {
    return this.sendCommand<ZwjsControllerNodeNeighborsResult, { nodeId: number }>({
      command: 'controller.get_node_neighbors',
      args: { nodeId },
    });
  }

  async getNodeState(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeStateResult>> {
    return this.sendCommand<ZwjsNodeStateResult, { nodeId: number }>({
      command: 'node.get_state',
      args: { nodeId },
    });
  }

  async getNodeDefinedValueIds(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsDefinedValueIdsResult>> {
    return this.sendCommand<ZwjsDefinedValueIdsResult, { nodeId: number }>({
      command: 'node.get_defined_value_ids',
      args: { nodeId },
    });
  }

  async getNodeValueMetadata(
    nodeId: number,
    valueId: ZwjsValueId,
  ): Promise<ZwjsCommandResult<ZwjsNodeValueMetadataResult>> {
    return this.sendCommand<ZwjsNodeValueMetadataResult, { nodeId: number; valueId: ZwjsValueId }>({
      command: 'node.get_value_metadata',
      args: { nodeId, valueId },
    });
  }

  async getNodeValue(
    nodeId: number,
    valueId: ZwjsValueId,
  ): Promise<ZwjsCommandResult<ZwjsNodeValueResult>> {
    return this.sendCommand<ZwjsNodeValueResult, { nodeId: number; valueId: ZwjsValueId }>({
      command: 'node.get_value',
      args: { nodeId, valueId },
    });
  }

  async getNodeValueTimestamp(
    nodeId: number,
    valueId: ZwjsValueId,
  ): Promise<ZwjsCommandResult<ZwjsNodeValueTimestampResult>> {
    return this.sendCommand<ZwjsNodeValueTimestampResult, { nodeId: number; valueId: ZwjsValueId }>(
      {
        command: 'node.get_value_timestamp',
        args: { nodeId, valueId },
      },
    );
  }

  async getNodeSupportedNotificationEvents(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeSupportedNotificationEventsResult>> {
    return this.sendCommand<ZwjsNodeSupportedNotificationEventsResult, { nodeId: number }>({
      command: 'node.get_supported_notification_events',
      args: { nodeId },
    });
  }

  async getNodeFirmwareUpdateCapabilities(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeFirmwareUpdateCapabilitiesResult>> {
    return this.sendCommand<ZwjsNodeFirmwareUpdateCapabilitiesResult, { nodeId: number }>({
      command: 'node.get_firmware_update_capabilities',
      args: { nodeId },
    });
  }

  async getNodeFirmwareUpdateCapabilitiesCached(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeFirmwareUpdateCapabilitiesCachedResult>> {
    return this.sendCommand<ZwjsNodeFirmwareUpdateCapabilitiesCachedResult, { nodeId: number }>({
      command: 'node.get_firmware_update_capabilities_cached',
      args: { nodeId },
    });
  }

  async getNodeDateAndTime(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeDateAndTimeResult>> {
    return this.sendCommand<ZwjsNodeDateAndTimeResult, { nodeId: number }>({
      command: 'node.get_date_and_time',
      args: { nodeId },
    });
  }

  async isNodeFirmwareUpdateInProgress(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeFirmwareUpdateInProgressResult>> {
    return this.sendCommand<ZwjsNodeFirmwareUpdateInProgressResult, { nodeId: number }>({
      command: 'node.is_firmware_update_in_progress',
      args: { nodeId },
    });
  }

  async getNodeFirmwareUpdateProgress(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeFirmwareUpdateProgressResult>> {
    return this.sendCommand<ZwjsNodeFirmwareUpdateProgressResult, { nodeId: number }>({
      command: 'node.get_firmware_update_progress',
      args: { nodeId },
    });
  }

  async isNodeHealthCheckInProgress(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeHealthCheckInProgressResult>> {
    return this.sendCommand<ZwjsNodeHealthCheckInProgressResult, { nodeId: number }>({
      command: 'node.is_health_check_in_progress',
      args: { nodeId },
    });
  }

  async hasNodeDeviceConfigChanged(
    nodeId: number,
  ): Promise<ZwjsCommandResult<ZwjsNodeDeviceConfigChangedResult>> {
    return this.sendCommand<ZwjsNodeDeviceConfigChangedResult, { nodeId: number }>({
      command: 'node.has_device_config_changed',
      args: { nodeId },
    });
  }

  async pingNode(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodePingResult>> {
    return this.sendMutationCommand<ZwjsNodePingResult, { nodeId: number }>({
      command: 'node.ping',
      args: { nodeId },
    });
  }

  async refreshNodeInfo(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeRefreshInfoResult>> {
    return this.sendMutationCommand<ZwjsNodeRefreshInfoResult, { nodeId: number }>({
      command: 'node.refresh_info',
      args: { nodeId },
    });
  }

  async refreshNodeValues(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeRefreshValuesResult>> {
    return this.sendMutationCommand<ZwjsNodeRefreshValuesResult, { nodeId: number }>({
      command: 'node.refresh_values',
      args: { nodeId },
    });
  }

  async pollNodeValue(
    args: ZwjsNodePollValueArgs,
  ): Promise<ZwjsCommandResult<ZwjsNodePollValueResult>> {
    return this.sendMutationCommand<ZwjsNodePollValueResult, ZwjsNodePollValueArgs>({
      command: 'node.poll_value',
      args,
    });
  }

  async endpointSupportsCc(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointSupportsCcResult>> {
    return this.sendCommand<ZwjsEndpointSupportsCcResult, ZwjsEndpointCcQuery>({
      command: 'endpoint.supports_cc',
      args,
    });
  }

  async endpointInvokeCcApi(
    args: ZwjsEndpointInvokeCcApiArgs,
  ): Promise<ZwjsCommandResult<ZwjsInvokeCcApiResult>> {
    return this.sendMutationCommand<ZwjsInvokeCcApiResult, ZwjsEndpointInvokeCcApiArgs>({
      command: 'endpoint.invoke_cc_api',
      args,
    });
  }

  async endpointSupportsCcApi(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointSupportsCcApiResult>> {
    return this.sendCommand<ZwjsEndpointSupportsCcApiResult, ZwjsEndpointCcQuery>({
      command: 'endpoint.supports_cc_api',
      args,
    });
  }

  async endpointControlsCc(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointControlsCcResult>> {
    return this.sendCommand<ZwjsEndpointControlsCcResult, ZwjsEndpointCcQuery>({
      command: 'endpoint.controls_cc',
      args,
    });
  }

  async endpointIsCcSecure(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointIsCcSecureResult>> {
    return this.sendCommand<ZwjsEndpointIsCcSecureResult, ZwjsEndpointCcQuery>({
      command: 'endpoint.is_cc_secure',
      args,
    });
  }

  async endpointGetCcVersion(
    args: ZwjsEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsEndpointGetCcVersionResult>> {
    return this.sendCommand<ZwjsEndpointGetCcVersionResult, ZwjsEndpointCcQuery>({
      command: 'endpoint.get_cc_version',
      args,
    });
  }

  async endpointTryGetNode(
    args: ZwjsEndpointTarget,
  ): Promise<ZwjsCommandResult<ZwjsEndpointNodeRefResult>> {
    return this.sendCommand<ZwjsEndpointNodeRefResult, ZwjsEndpointTarget>({
      command: 'endpoint.try_get_node',
      args,
    });
  }

  async endpointGetNodeUnsafe(
    args: ZwjsEndpointTarget,
  ): Promise<ZwjsCommandResult<ZwjsEndpointNodeRefResult>> {
    return this.sendCommand<ZwjsEndpointNodeRefResult, ZwjsEndpointTarget>({
      command: 'endpoint.get_node_unsafe',
      args,
    });
  }

  async broadcastNodeGetEndpointCount(): Promise<
    ZwjsCommandResult<ZwjsVirtualEndpointEndpointCountResult>
  > {
    return this.sendCommand<ZwjsVirtualEndpointEndpointCountResult>({
      command: 'broadcast_node.get_endpoint_count',
    });
  }

  async broadcastNodeSupportsCc(
    args: Pick<ZwjsVirtualEndpointCcQuery, 'index' | 'commandClass'>,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointSupportsCcResult>> {
    return this.sendCommand<
      ZwjsVirtualEndpointSupportsCcResult,
      Pick<ZwjsVirtualEndpointCcQuery, 'index' | 'commandClass'>
    >({
      command: 'broadcast_node.supports_cc',
      args,
    });
  }

  async broadcastNodeInvokeCcApi(
    args: Pick<
      ZwjsVirtualEndpointInvokeCcApiArgs,
      'index' | 'commandClass' | 'methodName' | 'args'
    >,
  ): Promise<ZwjsCommandResult<ZwjsInvokeCcApiResult>> {
    return this.sendMutationCommand<
      ZwjsInvokeCcApiResult,
      Pick<ZwjsVirtualEndpointInvokeCcApiArgs, 'index' | 'commandClass' | 'methodName' | 'args'>
    >({
      command: 'broadcast_node.invoke_cc_api',
      args,
    });
  }

  async broadcastNodeSupportsCcApi(
    args: Pick<ZwjsVirtualEndpointCcQuery, 'index' | 'commandClass'>,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointSupportsCcApiResult>> {
    return this.sendCommand<
      ZwjsVirtualEndpointSupportsCcApiResult,
      Pick<ZwjsVirtualEndpointCcQuery, 'index' | 'commandClass'>
    >({
      command: 'broadcast_node.supports_cc_api',
      args,
    });
  }

  async broadcastNodeGetCcVersion(
    args: Pick<ZwjsVirtualEndpointCcQuery, 'index' | 'commandClass'>,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointGetCcVersionResult>> {
    return this.sendCommand<
      ZwjsVirtualEndpointGetCcVersionResult,
      Pick<ZwjsVirtualEndpointCcQuery, 'index' | 'commandClass'>
    >({
      command: 'broadcast_node.get_cc_version',
      args,
    });
  }

  async multicastGroupGetEndpointCount(
    args: ZwjsMulticastGroupTarget,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointEndpointCountResult>> {
    return this.sendCommand<ZwjsVirtualEndpointEndpointCountResult, ZwjsMulticastGroupTarget>({
      command: 'multicast_group.get_endpoint_count',
      args,
    });
  }

  async multicastGroupSupportsCc(
    args: ZwjsVirtualEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointSupportsCcResult>> {
    return this.sendCommand<ZwjsVirtualEndpointSupportsCcResult, ZwjsVirtualEndpointCcQuery>({
      command: 'multicast_group.supports_cc',
      args,
    });
  }

  async multicastGroupInvokeCcApi(
    args: ZwjsVirtualEndpointInvokeCcApiArgs,
  ): Promise<ZwjsCommandResult<ZwjsInvokeCcApiResult>> {
    return this.sendMutationCommand<ZwjsInvokeCcApiResult, ZwjsVirtualEndpointInvokeCcApiArgs>({
      command: 'multicast_group.invoke_cc_api',
      args,
    });
  }

  async multicastGroupSupportsCcApi(
    args: ZwjsVirtualEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointSupportsCcApiResult>> {
    return this.sendCommand<ZwjsVirtualEndpointSupportsCcApiResult, ZwjsVirtualEndpointCcQuery>({
      command: 'multicast_group.supports_cc_api',
      args,
    });
  }

  async multicastGroupGetCcVersion(
    args: ZwjsVirtualEndpointCcQuery,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointGetCcVersionResult>> {
    return this.sendCommand<ZwjsVirtualEndpointGetCcVersionResult, ZwjsVirtualEndpointCcQuery>({
      command: 'multicast_group.get_cc_version',
      args,
    });
  }

  async multicastGroupGetDefinedValueIds(
    args: ZwjsMulticastGroupTarget,
  ): Promise<ZwjsCommandResult<ZwjsVirtualEndpointDefinedValueIdsResult>> {
    return this.sendCommand<ZwjsVirtualEndpointDefinedValueIdsResult, ZwjsMulticastGroupTarget>({
      command: 'multicast_group.get_defined_value_ids',
      args,
    });
  }

  async getZnifferCapturedFrames(): Promise<ZwjsCommandResult<ZwjsZnifferCapturedFramesResult>> {
    return this.sendCommand<ZwjsZnifferCapturedFramesResult>({
      command: 'zniffer.captured_frames',
    });
  }

  async getZnifferCaptureAsZlfBuffer(): Promise<
    ZwjsCommandResult<ZwjsZnifferCaptureAsZlfBufferResult>
  > {
    return this.sendCommand<ZwjsZnifferCaptureAsZlfBufferResult>({
      command: 'zniffer.get_capture_as_zlf_buffer',
    });
  }

  async getZnifferSupportedFrequencies(): Promise<
    ZwjsCommandResult<ZwjsZnifferSupportedFrequenciesResult>
  > {
    return this.sendCommand<ZwjsZnifferSupportedFrequenciesResult>({
      command: 'zniffer.supported_frequencies',
    });
  }

  async getZnifferCurrentFrequency(): Promise<
    ZwjsCommandResult<ZwjsZnifferCurrentFrequencyResult>
  > {
    return this.sendCommand<ZwjsZnifferCurrentFrequencyResult>({
      command: 'zniffer.current_frequency',
    });
  }

  async beginInclusion(
    args?: ZwjsControllerBeginInclusionArgs,
  ): Promise<ZwjsCommandResult<ZwjsControllerInclusionCommandResult>> {
    return this.sendMutationCommand<
      ZwjsControllerInclusionCommandResult,
      ZwjsControllerBeginInclusionArgs
    >({
      command: 'controller.begin_inclusion',
      ...(args ? { args } : {}),
    });
  }

  async beginExclusion(
    args?: ZwjsControllerBeginExclusionArgs,
  ): Promise<ZwjsCommandResult<ZwjsControllerInclusionCommandResult>> {
    return this.sendMutationCommand<
      ZwjsControllerInclusionCommandResult,
      ZwjsControllerBeginExclusionArgs
    >({
      command: 'controller.begin_exclusion',
      ...(args ? { args } : {}),
    });
  }

  async stopInclusion(): Promise<ZwjsCommandResult<ZwjsControllerInclusionCommandResult>> {
    return this.sendMutationCommand<ZwjsControllerInclusionCommandResult>({
      command: 'controller.stop_inclusion',
    });
  }

  async stopExclusion(): Promise<ZwjsCommandResult<ZwjsControllerInclusionCommandResult>> {
    return this.sendMutationCommand<ZwjsControllerInclusionCommandResult>({
      command: 'controller.stop_exclusion',
    });
  }

  private async connectFlow(
    targetState: Extract<ZwjsLifecycleState, 'connecting' | 'reconnecting'>,
  ): Promise<void> {
    this.setLifecycle(targetState);

    const headers = this.buildHeaders();
    const connectPromise = this.transport.connect(
      this.config.url,
      {
        onOpen: () => {
          this.status.transportConnected = true;
          this.status.versionReceived = false;
          this.status.initialized = false;
          this.status.listening = false;
          this.status.serverVersion = undefined;
          this.status.adapterFamily = undefined;
          this.status.connectedAt = new Date().toISOString();
          this.reconnectAttempt = 0;
          this.status.reconnectAttempt = undefined;
          this.adapter = undefined;
          this.cachedServerInfo = undefined;
          this.cachedNodeList = undefined;
          this.listeningRequested = false;
          this.startListeningState = undefined;
          this.emit({ type: 'transport.connected' });
        },
        onClose: (event) => {
          this.status.transportConnected = false;
          this.emit({
            type: 'transport.disconnected',
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });
          this.clearVersionWaiters(
            new ZwjsClientError({
              code: 'TRANSPORT_ERROR',
              message: 'Transport closed',
              retryable: true,
            }),
          );
          this.clearNodeListWaiters(
            new ZwjsClientError({
              code: 'TRANSPORT_ERROR',
              message: 'Transport closed',
              retryable: true,
            }),
          );
          this.requests.rejectAll(
            new ZwjsClientError({
              code: 'TRANSPORT_ERROR',
              message: 'Transport closed',
              retryable: true,
            }),
          );
          void this.handleDisconnect();
        },
        onError: (error) => {
          this.status.lastError = toErrorSummary(error, 'TRANSPORT_ERROR');
        },
        onMessage: (raw) => {
          this.status.lastMessageAt = new Date().toISOString();
          void this.handleIncoming(raw);
        },
      },
      headers,
    );

    let connectTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        connectPromise,
        new Promise<never>((_, reject) => {
          connectTimeout = setTimeout(
            () =>
              reject(
                new ZwjsClientError({
                  code: 'CONNECT_TIMEOUT',
                  message: 'Connection timed out',
                  retryable: true,
                }),
              ),
            this.timeouts.connectTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (connectTimeout) clearTimeout(connectTimeout);
    }

    await this.waitForVersionFrame();
    this.status.authenticated = this.config.auth?.type === 'bearer' ? true : undefined;
    if (this.config.auth?.type === 'bearer') {
      this.emit({ type: 'auth.succeeded' });
    }
    this.setLifecycle('connected');
  }

  private async handleIncoming(raw: string): Promise<void> {
    try {
      const message = JSON.parse(raw) as unknown;
      const detected = detectProtocolInfo(message);
      if (!this.adapter) {
        const selection = selectAdapter(detected.serverVersion);
        this.adapter = selection.adapter;
        this.status.adapterFamily = selection.adapter.family;
        if (detected.serverVersion) this.status.serverVersion = detected.serverVersion;
        if (selection.match !== 'exact') {
          this.emit({
            type: 'compat.warning',
            message: `Using ${selection.match} adapter match`,
            version: detected.serverVersion,
            adapterFamily: selection.adapter.family,
          });
        }
      }

      const normalized = this.adapter.normalizeIncoming(message);
      if (normalized.serverInfo) {
        this.cachedServerInfo = normalized.serverInfo;
        this.status.versionReceived = true;
        this.status.serverVersion =
          normalized.serverInfo.serverVersion ?? this.status.serverVersion;
        this.flushVersionWaiters();
      }
      if (normalized.nodesSnapshot) {
        this.cachedNodeList = normalized.nodesSnapshot;
        this.flushNodeListWaiters(normalized.nodesSnapshot);
      }
      if (normalized.requestResponse) {
        this.requests.resolve(normalized.requestResponse.id, normalized.requestResponse.payload);
      }
      if (normalized.requestError) {
        this.requests.reject(
          normalized.requestError.id,
          new ZwjsClientError({
            code: 'PROTOCOL_ERROR',
            message: 'Protocol command failed',
            retryable: false,
            cause: normalized.requestError.error,
          }),
        );
      }
      for (const event of normalized.events ?? []) {
        this.subscribers.dispatch(event, (error) => {
          this.config.logger?.error?.('zwjs event handler error', error);
        });
      }
    } catch (error) {
      const summary = toErrorSummary(error, 'PROTOCOL_ERROR');
      this.status.lastError = summary;
      this.emit({ type: 'protocol.error', error: summary, context: { raw } });
    }
  }

  private async handleDisconnect(): Promise<void> {
    if (this.explicitStop) return;
    if (!this.reconnectPolicy.enabled) {
      this.setLifecycle('error');
      return;
    }

    this.reconnectAttempt += 1;
    const delayMs = computeReconnectDelayMs(this.reconnectAttempt, this.reconnectPolicy);
    this.status.reconnectAttempt = this.reconnectAttempt;
    this.setLifecycle('reconnecting');
    this.emit({
      type: 'client.reconnect.scheduled',
      attempt: this.reconnectAttempt,
      delayMs,
      reason: this.status.lastError,
    });

    this.cancelReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.startPromise = this.connectFlow('reconnecting').catch((error) => {
        this.status.lastError = toErrorSummary(error, 'TRANSPORT_ERROR');
        void this.handleDisconnect();
      });
    }, delayMs);
  }

  private async request(builder: (id: string) => unknown): Promise<unknown> {
    if (!this.transport.isOpen()) {
      throw new ZwjsClientError({ code: 'INVALID_STATE', message: 'Client is not connected' });
    }
    const { id, promise } = this.requests.create<unknown>(this.timeouts.requestTimeoutMs);
    const frame = builder(id);
    this.transport.send(JSON.stringify(frame));
    return promise;
  }

  private async requestProtocolCommand<TResult = unknown>(
    builder: (id: string) => unknown,
  ): Promise<ZwjsCommandResult<TResult>> {
    if (!this.transport.isOpen()) {
      throw new ZwjsClientError({ code: 'INVALID_STATE', message: 'Client is not connected' });
    }
    const { id, promise } = this.requests.create<unknown>(this.timeouts.requestTimeoutMs);
    const frame = builder(id);
    this.transport.send(JSON.stringify(frame));
    let payload: unknown;
    try {
      payload = await promise;
    } catch (error) {
      if (error instanceof ZwjsClientError && error.code === 'PROTOCOL_ERROR') {
        const protocolError = this.toProtocolErrorPayload(error.cause ?? error.toSummary());
        return {
          messageId: id,
          success: false,
          error: protocolError,
          raw: protocolError.raw,
        };
      }
      throw error;
    }
    return {
      messageId: id,
      success: true,
      result: payload as TResult,
      raw: payload,
    };
  }

  private toProtocolErrorPayload(raw: unknown): ZwjsProtocolErrorPayload {
    const record =
      typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : undefined;
    return {
      errorCode: typeof record?.errorCode === 'string' ? record.errorCode : undefined,
      zwaveErrorCode:
        typeof record?.zwaveErrorCode === 'number' ? record.zwaveErrorCode : undefined,
      zwaveErrorMessage:
        typeof record?.zwaveErrorMessage === 'string' ? record.zwaveErrorMessage : undefined,
      error: record && 'error' in record ? record.error : undefined,
      raw,
    };
  }

  private buildHeaders(): Record<string, string> | undefined {
    const auth = this.config.auth;
    if (!auth || auth.type === 'none') return undefined;
    if (auth.type === 'bearer') {
      return { Authorization: `Bearer ${auth.token}` };
    }
    return undefined;
  }

  private setLifecycle(next: ZwjsLifecycleState): void {
    const from = this.status.lifecycle;
    this.status.lifecycle = transitionState(this.status.lifecycle, next);
    if (from !== next) {
      this.emit({ type: 'client.lifecycle', from, to: next });
    }
  }

  private emit(event: ZwjsClientEventInput): void {
    const fullEvent = {
      ...event,
      ts: new Date().toISOString(),
      source: 'zwjs-client' as const,
    } as ZwjsClientEvent;
    this.subscribers.dispatch(fullEvent, (error) => {
      this.config.logger?.error?.('zwjs event handler error', error);
    });
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private waitForNodeListSnapshot(): Promise<NodeListResult> {
    if (this.cachedNodeList) return Promise.resolve(this.cachedNodeList);
    return new Promise<NodeListResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingNodeListWaiters = this.pendingNodeListWaiters.filter(
          (waiter) => waiter.timer !== timer,
        );
        reject(
          new ZwjsClientError({
            code: 'REQUEST_TIMEOUT',
            message: 'Timed out waiting for node list snapshot after start_listening',
            retryable: true,
          }),
        );
      }, this.timeouts.requestTimeoutMs);
      this.pendingNodeListWaiters.push({ resolve, reject, timer });
    });
  }

  private waitForVersionFrame(): Promise<void> {
    if (this.status.versionReceived) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingVersionWaiters = this.pendingVersionWaiters.filter(
          (waiter) => waiter.timer !== timer,
        );
        reject(
          new ZwjsClientError({
            code: 'CONNECT_TIMEOUT',
            message: 'Timed out waiting for version frame after transport connect',
            retryable: true,
          }),
        );
      }, this.timeouts.connectTimeoutMs);
      this.pendingVersionWaiters.push({ resolve, reject, timer });
    });
  }

  private flushVersionWaiters(): void {
    const waiters = this.pendingVersionWaiters;
    this.pendingVersionWaiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
  }

  private clearVersionWaiters(error: ZwjsClientError): void {
    const waiters = this.pendingVersionWaiters;
    this.pendingVersionWaiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private flushNodeListWaiters(snapshot: NodeListResult): void {
    const waiters = this.pendingNodeListWaiters;
    this.pendingNodeListWaiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(snapshot);
    }
  }

  private clearNodeListWaiters(error: ZwjsClientError): void {
    const waiters = this.pendingNodeListWaiters;
    this.pendingNodeListWaiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private ensureAdapter(): void {
    if (this.adapter) return;
    const selection = selectAdapter(this.status.serverVersion);
    this.adapter = selection.adapter;
    this.status.adapterFamily = selection.adapter.family;
  }

  private assertMutationAllowed(command: string): void {
    if (!this.mutationPolicy.enabled) {
      throw new ZwjsClientError({
        code: 'UNSUPPORTED_OPERATION',
        message: `Mutation command blocked by policy: ${command}`,
        retryable: false,
      });
    }

    const allow = this.mutationPolicy.allowCommands;
    if (Array.isArray(allow) && allow.length > 0) {
      if (!allow.includes(command)) {
        throw new ZwjsClientError({
          code: 'UNSUPPORTED_OPERATION',
          message: `Mutation command not in allowlist: ${command}`,
          retryable: false,
        });
      }
      return;
    }

    if (this.mutationPolicy.requireAllowList !== false) {
      throw new ZwjsClientError({
        code: 'UNSUPPORTED_OPERATION',
        message: `Mutation command requires explicit allowlist: ${command}`,
        retryable: false,
      });
    }
  }
}

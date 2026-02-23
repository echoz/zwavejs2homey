import { RequestTracker } from './request-tracker';
import { mergeReconnectPolicy, computeReconnectDelayMs } from './reconnect';
import { transitionState } from './state-machine';
import { SubscriberRegistry } from './subscribers';
import type {
  NodeListResult,
  ServerInfoResult,
  TimeoutPolicy,
  VersionPolicy,
  ZwjsCommandRequest,
  ZwjsCommandResult,
  ZwjsProtocolErrorPayload,
  ZwjsClient,
  ZwjsClientConfig,
  ZwjsControllerStateResult,
  ZwjsDriverConfig,
  ZwjsClientEvent,
  ZwjsClientEventInput,
  ZwjsInitializeOptions,
  ZwjsNodeStateResult,
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

export class ZwjsClientImpl implements ZwjsClient {
  private readonly config: Required<Pick<ZwjsClientConfig, 'url'>> & ZwjsClientConfig;
  private readonly transport = new WsTransport();
  private readonly subscribers = new SubscriberRegistry();
  private readonly requests = new RequestTracker();
  private readonly reconnectPolicy;
  private readonly timeouts: TimeoutPolicy;
  private readonly versionPolicy: VersionPolicy;

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

  constructor(config: ZwjsClientConfig) {
    this.config = config;
    this.reconnectPolicy = mergeReconnectPolicy(config.reconnect);
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts };
    this.versionPolicy = { ...DEFAULT_VERSION_POLICY, ...config.versionPolicy };
  }

  onEvent(handler: (event: ZwjsClientEvent) => void): () => void {
    return this.subscribers.subscribe(handler);
  }

  getStatus(): ZwjsClientStatus {
    return { ...this.status };
  }

  async start(): Promise<void> {
    if (this.status.lifecycle === 'connected' || this.status.lifecycle === 'connecting' || this.status.lifecycle === 'reconnecting') {
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
      this.requests.rejectAll(new ZwjsClientError({ code: 'CLIENT_STOPPED', message: 'Client stopped', retryable: false }));
      this.transport.close();
      this.status.transportConnected = false;
      this.setLifecycle('stopped');
    });

    return this.stopPromise;
  }

  async getServerInfo(): Promise<ServerInfoResult> {
    if (this.cachedServerInfo) return this.cachedServerInfo;
    throw new ZwjsClientError({ code: 'UNSUPPORTED_OPERATION', message: 'Server info not yet available; wait for version frame after connect' });
  }

  async getNodeList(): Promise<NodeListResult> {
    if (this.cachedNodeList) return this.cachedNodeList;
    if (!this.listeningRequested) {
      await this.startListening();
    }
    if (this.cachedNodeList) return this.cachedNodeList;
    return { nodes: [] };
  }

  async initialize(options: ZwjsInitializeOptions): Promise<ZwjsCommandResult> {
    this.ensureAdapter();
    if (!this.adapter?.buildInitializeRequest) {
      throw new ZwjsClientError({ code: 'UNSUPPORTED_OPERATION', message: 'Initialize command not supported by selected adapter' });
    }
    const result = await this.requestProtocolCommand((id) =>
      this.adapter!.buildInitializeRequest!(id, options.schemaVersion, options.additionalUserAgentComponents),
    );
    if (result.success) {
      this.status.initialized = true;
    }
    return result;
  }

  async startListening(): Promise<ZwjsCommandResult<{ state?: unknown }>> {
    this.ensureAdapter();
    if (this.listeningRequested) {
      return { messageId: 'already-listening', success: true, result: { state: this.startListeningState } };
    }
    if (!this.adapter?.buildStartListeningRequest) {
      throw new ZwjsClientError({ code: 'UNSUPPORTED_OPERATION', message: 'start_listening command not supported by selected adapter' });
    }
    const result = await this.requestProtocolCommand<{ state?: unknown }>((id) => this.adapter!.buildStartListeningRequest!(id));
    if (result.success) {
      this.listeningRequested = true;
      this.status.listening = true;
      this.startListeningState = result.result?.state;
    }
    return result;
  }

  async sendCommand<TResult = unknown, TArgs = Record<string, unknown>>(
    request: ZwjsCommandRequest<TArgs>,
  ): Promise<ZwjsCommandResult<TResult>> {
    this.ensureAdapter();
    if (!this.adapter?.buildCommandRequest) {
      throw new ZwjsClientError({ code: 'UNSUPPORTED_OPERATION', message: 'Generic command requests not supported by selected adapter' });
    }
    return this.requestProtocolCommand<TResult>((id) =>
      this.adapter!.buildCommandRequest!(id, request.command, (request.args ?? {}) as Record<string, unknown>),
    );
  }

  async getDriverConfig(): Promise<ZwjsCommandResult<ZwjsDriverConfig>> {
    return this.sendCommand<ZwjsDriverConfig>({ command: 'driver.get_config' });
  }

  async getControllerState(): Promise<ZwjsCommandResult<ZwjsControllerStateResult>> {
    return this.sendCommand<ZwjsControllerStateResult>({ command: 'controller.get_state' });
  }

  async getNodeState(nodeId: number): Promise<ZwjsCommandResult<ZwjsNodeStateResult>> {
    return this.sendCommand<ZwjsNodeStateResult, { nodeId: number }>({ command: 'node.get_state', args: { nodeId } });
  }

  private async connectFlow(targetState: Extract<ZwjsLifecycleState, 'connecting' | 'reconnecting'>): Promise<void> {
    this.setLifecycle(targetState);

    const headers = this.buildHeaders();
    const connectPromise = this.transport.connect(this.config.url, {
      onOpen: () => {
        this.status.transportConnected = true;
        this.status.versionReceived = false;
        this.status.initialized = false;
        this.status.listening = false;
        this.status.connectedAt = new Date().toISOString();
        this.reconnectAttempt = 0;
        this.status.reconnectAttempt = undefined;
        this.listeningRequested = false;
        this.startListeningState = undefined;
        this.emit({ type: 'transport.connected' });
      },
      onClose: (event) => {
        this.status.transportConnected = false;
        this.emit({ type: 'transport.disconnected', code: event.code, reason: event.reason, wasClean: event.wasClean });
        this.requests.rejectAll(new ZwjsClientError({ code: 'TRANSPORT_ERROR', message: 'Transport closed', retryable: true }));
        void this.handleDisconnect();
      },
      onError: (error) => {
        this.status.lastError = toErrorSummary(error, 'TRANSPORT_ERROR');
      },
      onMessage: (raw) => {
        this.status.lastMessageAt = new Date().toISOString();
        void this.handleIncoming(raw);
      },
    }, headers);

    await Promise.race([
      connectPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new ZwjsClientError({ code: 'CONNECT_TIMEOUT', message: 'Connection timed out', retryable: true })), this.timeouts.connectTimeoutMs);
      }),
    ]);

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
        this.status.serverVersion = normalized.serverInfo.serverVersion ?? this.status.serverVersion;
      }
      if (normalized.nodesSnapshot) {
        this.cachedNodeList = normalized.nodesSnapshot;
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
    const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : undefined;
    return {
      errorCode: typeof record?.errorCode === 'string' ? record.errorCode : undefined,
      zwaveErrorCode: typeof record?.zwaveErrorCode === 'number' ? record.zwaveErrorCode : undefined,
      zwaveErrorMessage: typeof record?.zwaveErrorMessage === 'string' ? record.zwaveErrorMessage : undefined,
      error:
        record && 'error' in record
          ? record.error
          : undefined,
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

  private ensureAdapter(): void {
    if (this.adapter) return;
    const selection = selectAdapter(this.status.serverVersion);
    this.adapter = selection.adapter;
    this.status.adapterFamily = selection.adapter.family;
  }
}

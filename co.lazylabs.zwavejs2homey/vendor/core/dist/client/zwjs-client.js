"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZwjsClientImpl = void 0;
const request_tracker_1 = require("./request-tracker");
const reconnect_1 = require("./reconnect");
const state_machine_1 = require("./state-machine");
const subscribers_1 = require("./subscribers");
const errors_1 = require("../errors");
const ws_transport_1 = require("../transport/ws-transport");
const detector_1 = require("../protocol/detector");
const registry_1 = require("../protocol/normalizers/registry");
const command_ids_1 = require("./command-ids");
const DEFAULT_TIMEOUTS = {
    connectTimeoutMs: 10_000,
    requestTimeoutMs: 5_000,
};
const DEFAULT_VERSION_POLICY = {
    mode: 'adaptive',
    strictFamilyMatch: false,
};
const DEFAULT_MUTATION_POLICY = {
    enabled: false,
    requireAllowList: true,
};
class ZwjsClientImpl {
    constructor(config) {
        this.transport = new ws_transport_1.WsTransport();
        this.subscribers = new subscribers_1.SubscriberRegistry();
        this.requests = new request_tracker_1.RequestTracker();
        this.status = {
            lifecycle: 'idle',
            transportConnected: false,
        };
        this.listeningRequested = false;
        this.reconnectAttempt = 0;
        this.explicitStop = false;
        this.pendingNodeListWaiters = [];
        this.pendingVersionWaiters = [];
        this.config = config;
        this.reconnectPolicy = (0, reconnect_1.mergeReconnectPolicy)(config.reconnect);
        this.timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts };
        this.versionPolicy = { ...DEFAULT_VERSION_POLICY, ...config.versionPolicy };
        this.mutationPolicy = { ...DEFAULT_MUTATION_POLICY, ...config.mutationPolicy };
    }
    onEvent(handler) {
        return this.subscribers.subscribe(handler);
    }
    getStatus() {
        return { ...this.status };
    }
    async start() {
        if (this.status.lifecycle === 'connected' ||
            this.status.lifecycle === 'connecting' ||
            this.status.lifecycle === 'reconnecting') {
            return this.startPromise ?? Promise.resolve();
        }
        if (this.status.lifecycle === 'stopping') {
            await this.stopPromise;
        }
        this.explicitStop = false;
        this.startPromise = this.connectFlow('connecting');
        return this.startPromise;
    }
    async stop() {
        if (this.status.lifecycle === 'stopping' || this.status.lifecycle === 'stopped') {
            return this.stopPromise ?? Promise.resolve();
        }
        this.explicitStop = true;
        this.cancelReconnect();
        this.setLifecycle('stopping');
        this.stopPromise = Promise.resolve().then(() => {
            this.clearVersionWaiters(new errors_1.ZwjsClientError({
                code: 'CLIENT_STOPPED',
                message: 'Client stopped',
                retryable: false,
            }));
            this.clearNodeListWaiters(new errors_1.ZwjsClientError({
                code: 'CLIENT_STOPPED',
                message: 'Client stopped',
                retryable: false,
            }));
            this.requests.rejectAll(new errors_1.ZwjsClientError({
                code: 'CLIENT_STOPPED',
                message: 'Client stopped',
                retryable: false,
            }));
            this.transport.close();
            this.status.transportConnected = false;
            this.setLifecycle('stopped');
        });
        return this.stopPromise;
    }
    async getServerInfo() {
        if (this.cachedServerInfo)
            return this.cachedServerInfo;
        throw new errors_1.ZwjsClientError({
            code: 'UNSUPPORTED_OPERATION',
            message: 'Server info not yet available; wait for version frame after connect',
        });
    }
    async getNodeList() {
        if (this.cachedNodeList)
            return this.cachedNodeList;
        if (!this.listeningRequested) {
            await this.startListening();
        }
        if (this.cachedNodeList)
            return this.cachedNodeList;
        return this.waitForNodeListSnapshot();
    }
    async initialize(options) {
        this.ensureAdapter();
        if (!this.adapter?.buildInitializeRequest) {
            throw new errors_1.ZwjsClientError({
                code: 'UNSUPPORTED_OPERATION',
                message: 'Initialize command not supported by selected adapter',
            });
        }
        const result = await this.requestProtocolCommand((id) => this.adapter.buildInitializeRequest(id, options.schemaVersion, options.additionalUserAgentComponents));
        if (result.success) {
            this.status.initialized = true;
        }
        return result;
    }
    async setApiSchema(schemaVersion) {
        return this.sendCommand({ command: 'set_api_schema', args: { schemaVersion } });
    }
    async startListening() {
        this.ensureAdapter();
        if (this.listeningRequested) {
            return {
                messageId: 'already-listening',
                success: true,
                result: { state: this.startListeningState },
            };
        }
        if (!this.adapter?.buildStartListeningRequest) {
            throw new errors_1.ZwjsClientError({
                code: 'UNSUPPORTED_OPERATION',
                message: 'start_listening command not supported by selected adapter',
            });
        }
        const result = await this.requestProtocolCommand((id) => this.adapter.buildStartListeningRequest(id));
        if (result.success) {
            this.listeningRequested = true;
            this.status.listening = true;
            this.startListeningState = result.result?.state;
        }
        return result;
    }
    async startListeningLogs(filter) {
        return this.sendCommand({
            command: 'start_listening_logs',
            ...(filter ? { args: { filter } } : {}),
        });
    }
    async stopListeningLogs() {
        return this.sendCommand({ command: 'stop_listening_logs' });
    }
    async sendCommand(request) {
        this.ensureAdapter();
        if (!this.adapter?.buildCommandRequest) {
            throw new errors_1.ZwjsClientError({
                code: 'UNSUPPORTED_OPERATION',
                message: 'Generic command requests not supported by selected adapter',
            });
        }
        return this.requestProtocolCommand((id) => this.adapter.buildCommandRequest(id, request.command, (request.args ?? {})));
    }
    async sendMutationCommand(request) {
        this.assertMutationAllowed(request.command);
        return this.sendCommand(request);
    }
    async getDriverConfig() {
        return this.sendCommand({ command: 'driver.get_config' });
    }
    async getDriverLogConfig() {
        return this.sendCommand({ command: 'driver.get_log_config' });
    }
    async updateDriverLogConfig(args) {
        return this.sendMutationCommand({
            command: 'driver.update_log_config',
            args,
        });
    }
    async isDriverStatisticsEnabled() {
        return this.sendCommand({
            command: 'driver.is_statistics_enabled',
        });
    }
    async checkDriverConfigUpdates() {
        return this.sendCommand({
            command: 'driver.check_for_config_updates',
        });
    }
    async installDriverConfigUpdate() {
        return this.sendMutationCommand({
            command: 'driver.install_config_update',
        });
    }
    async isDriverOtwFirmwareUpdateInProgress() {
        return this.sendCommand({
            command: 'driver.is_otw_firmware_update_in_progress',
        });
    }
    async getControllerState() {
        return this.sendCommand({ command: 'controller.get_state' });
    }
    async getControllerNodeNeighbors(nodeId) {
        return this.sendCommand({
            command: 'controller.get_node_neighbors',
            args: { nodeId },
        });
    }
    async getControllerAnyFirmwareUpdateProgress() {
        return this.sendCommand({
            command: 'controller.get_any_firmware_update_progress',
        });
    }
    async isControllerAnyOtaFirmwareUpdateInProgress() {
        return this.sendCommand({
            command: 'controller.is_any_ota_firmware_update_in_progress',
        });
    }
    async getControllerAvailableFirmwareUpdates(args) {
        return this.sendCommand({
            command: 'controller.get_available_firmware_updates',
            args,
        });
    }
    async isControllerFirmwareUpdateInProgress() {
        return this.sendCommand({
            command: 'controller.is_firmware_update_in_progress',
        });
    }
    async getControllerKnownLifelineRoutes() {
        return this.sendCommand({
            command: 'controller.get_known_lifeline_routes',
        });
    }
    async getControllerRfRegion() {
        return this.sendCommand({
            command: 'controller.get_rf_region',
        });
    }
    async getControllerPowerlevel() {
        return this.sendCommand({
            command: 'controller.get_powerlevel',
        });
    }
    async getControllerMaxLongRangePowerlevel() {
        return this.sendCommand({
            command: 'controller.get_max_long_range_powerlevel',
        });
    }
    async getControllerLongRangeChannel() {
        return this.sendCommand({
            command: 'controller.get_long_range_channel',
        });
    }
    async getNodeState(nodeId) {
        return this.sendCommand({
            command: 'node.get_state',
            args: { nodeId },
        });
    }
    async getNodeDefinedValueIds(nodeId) {
        return this.sendCommand({
            command: 'node.get_defined_value_ids',
            args: { nodeId },
        });
    }
    async getNodeValueMetadata(nodeId, valueId) {
        return this.sendCommand({
            command: 'node.get_value_metadata',
            args: { nodeId, valueId },
        });
    }
    async getNodeValue(nodeId, valueId) {
        return this.sendCommand({
            command: 'node.get_value',
            args: { nodeId, valueId },
        });
    }
    async getNodeValueTimestamp(nodeId, valueId) {
        return this.sendCommand({
            command: 'node.get_value_timestamp',
            args: { nodeId, valueId },
        });
    }
    async getNodeSupportedNotificationEvents(nodeId) {
        return this.sendCommand({
            command: 'node.get_supported_notification_events',
            args: { nodeId },
        });
    }
    async getNodeFirmwareUpdateCapabilities(nodeId) {
        return this.sendCommand({
            command: 'node.get_firmware_update_capabilities',
            args: { nodeId },
        });
    }
    async getNodeFirmwareUpdateCapabilitiesCached(nodeId) {
        return this.sendCommand({
            command: 'node.get_firmware_update_capabilities_cached',
            args: { nodeId },
        });
    }
    async getNodeDateAndTime(nodeId) {
        return this.sendCommand({
            command: 'node.get_date_and_time',
            args: { nodeId },
        });
    }
    async isNodeFirmwareUpdateInProgress(nodeId) {
        return this.sendCommand({
            command: 'node.is_firmware_update_in_progress',
            args: { nodeId },
        });
    }
    async getNodeFirmwareUpdateProgress(nodeId) {
        return this.sendCommand({
            command: 'node.get_firmware_update_progress',
            args: { nodeId },
        });
    }
    async isNodeHealthCheckInProgress(nodeId) {
        return this.sendCommand({
            command: 'node.is_health_check_in_progress',
            args: { nodeId },
        });
    }
    async hasNodeDeviceConfigChanged(nodeId) {
        return this.sendCommand({
            command: 'node.has_device_config_changed',
            args: { nodeId },
        });
    }
    async pingNode(nodeId) {
        return this.sendMutationCommand({
            command: 'node.ping',
            args: { nodeId },
        });
    }
    async refreshNodeInfo(nodeId) {
        return this.sendMutationCommand({
            command: 'node.refresh_info',
            args: { nodeId },
        });
    }
    async refreshNodeValues(nodeId) {
        return this.sendMutationCommand({
            command: 'node.refresh_values',
            args: { nodeId },
        });
    }
    async pollNodeValue(args) {
        return this.sendMutationCommand({
            command: 'node.poll_value',
            args,
        });
    }
    async setNodeValue(args) {
        return this.sendMutationCommand({
            command: command_ids_1.ZWJS_COMMAND_NODE_SET_VALUE,
            args,
        });
    }
    async driverFirmwareUpdateOtw(args) {
        this.assertMutationAllowed('driver.firmware_update_otw');
        this.assertDriverFirmwareUpdateOtwArgs(args);
        return this.sendMutationCommand({
            command: 'driver.firmware_update_otw',
            args,
        });
    }
    async controllerFirmwareUpdateOta(args) {
        return this.sendMutationCommand({
            command: 'controller.firmware_update_ota',
            args,
        });
    }
    async controllerFirmwareUpdateOtw(args) {
        return this.sendMutationCommand({
            command: 'controller.firmware_update_otw',
            args,
        });
    }
    async beginNodeFirmwareUpdate(args) {
        return this.sendMutationCommand({
            command: 'node.begin_firmware_update',
            args,
        });
    }
    async updateNodeFirmware(args) {
        this.assertMutationAllowed('node.update_firmware');
        this.assertNodeUpdateFirmwareArgs(args);
        return this.sendMutationCommand({
            command: 'node.update_firmware',
            args,
        });
    }
    async abortNodeFirmwareUpdate(nodeId) {
        return this.sendMutationCommand({
            command: 'node.abort_firmware_update',
            args: { nodeId },
        });
    }
    async endpointSupportsCc(args) {
        return this.sendCommand({
            command: 'endpoint.supports_cc',
            args,
        });
    }
    async endpointInvokeCcApi(args) {
        return this.sendMutationCommand({
            command: 'endpoint.invoke_cc_api',
            args,
        });
    }
    async endpointSupportsCcApi(args) {
        return this.sendCommand({
            command: 'endpoint.supports_cc_api',
            args,
        });
    }
    async endpointControlsCc(args) {
        return this.sendCommand({
            command: 'endpoint.controls_cc',
            args,
        });
    }
    async endpointIsCcSecure(args) {
        return this.sendCommand({
            command: 'endpoint.is_cc_secure',
            args,
        });
    }
    async endpointGetCcVersion(args) {
        return this.sendCommand({
            command: 'endpoint.get_cc_version',
            args,
        });
    }
    async endpointTryGetNode(args) {
        return this.sendCommand({
            command: 'endpoint.try_get_node',
            args,
        });
    }
    async endpointGetNodeUnsafe(args) {
        return this.sendCommand({
            command: 'endpoint.get_node_unsafe',
            args,
        });
    }
    async broadcastNodeGetEndpointCount() {
        return this.sendCommand({
            command: 'broadcast_node.get_endpoint_count',
        });
    }
    async broadcastNodeSupportsCc(args) {
        return this.sendCommand({
            command: 'broadcast_node.supports_cc',
            args,
        });
    }
    async broadcastNodeInvokeCcApi(args) {
        return this.sendMutationCommand({
            command: 'broadcast_node.invoke_cc_api',
            args,
        });
    }
    async broadcastNodeSupportsCcApi(args) {
        return this.sendCommand({
            command: 'broadcast_node.supports_cc_api',
            args,
        });
    }
    async broadcastNodeGetCcVersion(args) {
        return this.sendCommand({
            command: 'broadcast_node.get_cc_version',
            args,
        });
    }
    async multicastGroupGetEndpointCount(args) {
        return this.sendCommand({
            command: 'multicast_group.get_endpoint_count',
            args,
        });
    }
    async multicastGroupSupportsCc(args) {
        return this.sendCommand({
            command: 'multicast_group.supports_cc',
            args,
        });
    }
    async multicastGroupInvokeCcApi(args) {
        return this.sendMutationCommand({
            command: 'multicast_group.invoke_cc_api',
            args,
        });
    }
    async multicastGroupSupportsCcApi(args) {
        return this.sendCommand({
            command: 'multicast_group.supports_cc_api',
            args,
        });
    }
    async multicastGroupGetCcVersion(args) {
        return this.sendCommand({
            command: 'multicast_group.get_cc_version',
            args,
        });
    }
    async multicastGroupGetDefinedValueIds(args) {
        return this.sendCommand({
            command: 'multicast_group.get_defined_value_ids',
            args,
        });
    }
    async getZnifferCapturedFrames() {
        return this.sendCommand({
            command: 'zniffer.captured_frames',
        });
    }
    async getZnifferCaptureAsZlfBuffer() {
        return this.sendCommand({
            command: 'zniffer.get_capture_as_zlf_buffer',
        });
    }
    async getZnifferSupportedFrequencies() {
        return this.sendCommand({
            command: 'zniffer.supported_frequencies',
        });
    }
    async getZnifferCurrentFrequency() {
        return this.sendCommand({
            command: 'zniffer.current_frequency',
        });
    }
    async initZniffer(args) {
        return this.sendMutationCommand({
            command: 'zniffer.init',
            args,
        });
    }
    async startZniffer() {
        return this.sendMutationCommand({
            command: 'zniffer.start',
        });
    }
    async stopZniffer() {
        return this.sendMutationCommand({
            command: 'zniffer.stop',
        });
    }
    async destroyZniffer() {
        return this.sendMutationCommand({
            command: 'zniffer.destroy',
        });
    }
    async clearZnifferCapturedFrames() {
        return this.sendMutationCommand({
            command: 'zniffer.clear_captured_frames',
        });
    }
    async setZnifferFrequency(args) {
        return this.sendMutationCommand({
            command: 'zniffer.set_frequency',
            args,
        });
    }
    async beginInclusion(args) {
        return this.sendMutationCommand({
            command: 'controller.begin_inclusion',
            ...(args ? { args } : {}),
        });
    }
    async beginExclusion(args) {
        return this.sendMutationCommand({
            command: 'controller.begin_exclusion',
            ...(args ? { args } : {}),
        });
    }
    async stopInclusion() {
        return this.sendMutationCommand({
            command: 'controller.stop_inclusion',
        });
    }
    async stopExclusion() {
        return this.sendMutationCommand({
            command: 'controller.stop_exclusion',
        });
    }
    async connectFlow(targetState) {
        this.setLifecycle(targetState);
        const headers = this.buildHeaders();
        const connectPromise = this.transport.connect(this.config.url, {
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
                this.clearVersionWaiters(new errors_1.ZwjsClientError({
                    code: 'TRANSPORT_ERROR',
                    message: 'Transport closed',
                    retryable: true,
                }));
                this.clearNodeListWaiters(new errors_1.ZwjsClientError({
                    code: 'TRANSPORT_ERROR',
                    message: 'Transport closed',
                    retryable: true,
                }));
                this.requests.rejectAll(new errors_1.ZwjsClientError({
                    code: 'TRANSPORT_ERROR',
                    message: 'Transport closed',
                    retryable: true,
                }));
                void this.handleDisconnect();
            },
            onError: (error) => {
                this.status.lastError = (0, errors_1.toErrorSummary)(error, 'TRANSPORT_ERROR');
            },
            onMessage: (raw) => {
                this.status.lastMessageAt = new Date().toISOString();
                void this.handleIncoming(raw);
            },
        }, headers);
        let connectTimeout;
        try {
            await Promise.race([
                connectPromise,
                new Promise((_, reject) => {
                    connectTimeout = setTimeout(() => reject(new errors_1.ZwjsClientError({
                        code: 'CONNECT_TIMEOUT',
                        message: 'Connection timed out',
                        retryable: true,
                    })), this.timeouts.connectTimeoutMs);
                }),
            ]);
        }
        finally {
            if (connectTimeout)
                clearTimeout(connectTimeout);
        }
        await this.waitForVersionFrame();
        this.status.authenticated = this.config.auth?.type === 'bearer' ? true : undefined;
        if (this.config.auth?.type === 'bearer') {
            this.emit({ type: 'auth.succeeded' });
        }
        this.setLifecycle('connected');
    }
    assertDriverFirmwareUpdateOtwArgs(args) {
        const record = args;
        const hasUpdateInfo = typeof args === 'object' &&
            args !== null &&
            'updateInfo' in args &&
            typeof record.updateInfo === 'object' &&
            record.updateInfo !== null;
        const hasRawFile = typeof args === 'object' &&
            args !== null &&
            typeof record.filename === 'string' &&
            typeof record.file === 'string';
        if (hasUpdateInfo === hasRawFile) {
            throw new errors_1.ZwjsClientError({
                code: 'PROTOCOL_ERROR',
                message: 'driver.firmware_update_otw requires exactly one payload mode: raw file (`filename` + `file`) or `updateInfo`',
            });
        }
    }
    assertNodeUpdateFirmwareArgs(args) {
        if (!Array.isArray(args.updates) || args.updates.length === 0) {
            throw new errors_1.ZwjsClientError({
                code: 'PROTOCOL_ERROR',
                message: 'node.update_firmware requires a non-empty `updates` array',
            });
        }
    }
    async handleIncoming(raw) {
        try {
            const message = JSON.parse(raw);
            const detected = (0, detector_1.detectProtocolInfo)(message);
            if (!this.adapter) {
                const selection = (0, registry_1.selectAdapter)(detected.serverVersion);
                this.adapter = selection.adapter;
                this.status.adapterFamily = selection.adapter.family;
                if (detected.serverVersion)
                    this.status.serverVersion = detected.serverVersion;
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
                this.requests.reject(normalized.requestError.id, new errors_1.ZwjsClientError({
                    code: 'PROTOCOL_ERROR',
                    message: 'Protocol command failed',
                    retryable: false,
                    cause: normalized.requestError.error,
                }));
            }
            for (const event of normalized.events ?? []) {
                this.subscribers.dispatch(event, (error) => {
                    this.config.logger?.error?.('zwjs event handler error', error);
                });
            }
        }
        catch (error) {
            const summary = (0, errors_1.toErrorSummary)(error, 'PROTOCOL_ERROR');
            this.status.lastError = summary;
            this.emit({ type: 'protocol.error', error: summary, context: { raw } });
        }
    }
    async handleDisconnect() {
        if (this.explicitStop)
            return;
        if (!this.reconnectPolicy.enabled) {
            this.setLifecycle('error');
            return;
        }
        this.reconnectAttempt += 1;
        const delayMs = (0, reconnect_1.computeReconnectDelayMs)(this.reconnectAttempt, this.reconnectPolicy);
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
                this.status.lastError = (0, errors_1.toErrorSummary)(error, 'TRANSPORT_ERROR');
                void this.handleDisconnect();
            });
        }, delayMs);
    }
    async request(builder) {
        if (!this.transport.isOpen()) {
            throw new errors_1.ZwjsClientError({ code: 'INVALID_STATE', message: 'Client is not connected' });
        }
        const { id, promise } = this.requests.create(this.timeouts.requestTimeoutMs);
        const frame = builder(id);
        this.transport.send(JSON.stringify(frame));
        return promise;
    }
    async requestProtocolCommand(builder) {
        if (!this.transport.isOpen()) {
            throw new errors_1.ZwjsClientError({ code: 'INVALID_STATE', message: 'Client is not connected' });
        }
        const { id, promise } = this.requests.create(this.timeouts.requestTimeoutMs);
        const frame = builder(id);
        this.transport.send(JSON.stringify(frame));
        let payload;
        try {
            payload = await promise;
        }
        catch (error) {
            if (error instanceof errors_1.ZwjsClientError && error.code === 'PROTOCOL_ERROR') {
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
            result: payload,
            raw: payload,
        };
    }
    toProtocolErrorPayload(raw) {
        const record = typeof raw === 'object' && raw !== null ? raw : undefined;
        return {
            errorCode: typeof record?.errorCode === 'string' ? record.errorCode : undefined,
            zwaveErrorCode: typeof record?.zwaveErrorCode === 'number' ? record.zwaveErrorCode : undefined,
            zwaveErrorMessage: typeof record?.zwaveErrorMessage === 'string' ? record.zwaveErrorMessage : undefined,
            error: record && 'error' in record ? record.error : undefined,
            raw,
        };
    }
    buildHeaders() {
        const auth = this.config.auth;
        if (!auth || auth.type === 'none')
            return undefined;
        if (auth.type === 'bearer') {
            return { Authorization: `Bearer ${auth.token}` };
        }
        return undefined;
    }
    setLifecycle(next) {
        const from = this.status.lifecycle;
        this.status.lifecycle = (0, state_machine_1.transitionState)(this.status.lifecycle, next);
        if (from !== next) {
            this.emit({ type: 'client.lifecycle', from, to: next });
        }
    }
    emit(event) {
        const fullEvent = {
            ...event,
            ts: new Date().toISOString(),
            source: 'zwjs-client',
        };
        this.subscribers.dispatch(fullEvent, (error) => {
            this.config.logger?.error?.('zwjs event handler error', error);
        });
    }
    cancelReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }
    waitForNodeListSnapshot() {
        if (this.cachedNodeList)
            return Promise.resolve(this.cachedNodeList);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingNodeListWaiters = this.pendingNodeListWaiters.filter((waiter) => waiter.timer !== timer);
                reject(new errors_1.ZwjsClientError({
                    code: 'REQUEST_TIMEOUT',
                    message: 'Timed out waiting for node list snapshot after start_listening',
                    retryable: true,
                }));
            }, this.timeouts.requestTimeoutMs);
            this.pendingNodeListWaiters.push({ resolve, reject, timer });
        });
    }
    waitForVersionFrame() {
        if (this.status.versionReceived)
            return Promise.resolve();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingVersionWaiters = this.pendingVersionWaiters.filter((waiter) => waiter.timer !== timer);
                reject(new errors_1.ZwjsClientError({
                    code: 'CONNECT_TIMEOUT',
                    message: 'Timed out waiting for version frame after transport connect',
                    retryable: true,
                }));
            }, this.timeouts.connectTimeoutMs);
            this.pendingVersionWaiters.push({ resolve, reject, timer });
        });
    }
    flushVersionWaiters() {
        const waiters = this.pendingVersionWaiters;
        this.pendingVersionWaiters = [];
        for (const waiter of waiters) {
            clearTimeout(waiter.timer);
            waiter.resolve();
        }
    }
    clearVersionWaiters(error) {
        const waiters = this.pendingVersionWaiters;
        this.pendingVersionWaiters = [];
        for (const waiter of waiters) {
            clearTimeout(waiter.timer);
            waiter.reject(error);
        }
    }
    flushNodeListWaiters(snapshot) {
        const waiters = this.pendingNodeListWaiters;
        this.pendingNodeListWaiters = [];
        for (const waiter of waiters) {
            clearTimeout(waiter.timer);
            waiter.resolve(snapshot);
        }
    }
    clearNodeListWaiters(error) {
        const waiters = this.pendingNodeListWaiters;
        this.pendingNodeListWaiters = [];
        for (const waiter of waiters) {
            clearTimeout(waiter.timer);
            waiter.reject(error);
        }
    }
    ensureAdapter() {
        if (this.adapter)
            return;
        const selection = (0, registry_1.selectAdapter)(this.status.serverVersion);
        this.adapter = selection.adapter;
        this.status.adapterFamily = selection.adapter.family;
    }
    assertMutationAllowed(command) {
        if (!this.mutationPolicy.enabled) {
            throw new errors_1.ZwjsClientError({
                code: 'UNSUPPORTED_OPERATION',
                message: `Mutation command blocked by policy: ${command}`,
                retryable: false,
            });
        }
        const allow = this.mutationPolicy.allowCommands;
        if (Array.isArray(allow) && allow.length > 0) {
            if (!allow.includes(command)) {
                throw new errors_1.ZwjsClientError({
                    code: 'UNSUPPORTED_OPERATION',
                    message: `Mutation command not in allowlist: ${command}`,
                    retryable: false,
                });
            }
            return;
        }
        if (this.mutationPolicy.requireAllowList !== false) {
            throw new errors_1.ZwjsClientError({
                code: 'UNSUPPORTED_OPERATION',
                message: `Mutation command requires explicit allowlist: ${command}`,
                retryable: false,
            });
        }
    }
}
exports.ZwjsClientImpl = ZwjsClientImpl;

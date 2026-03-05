'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const core_1 = require("@zwavejs2homey/core");
const compiled_profiles_1 = require("./compiled-profiles");
const curation_1 = require("./curation");
const pairing_1 = require("./pairing");
module.exports = (_a = class Zwavejs2HomeyApp extends homey_1.default.App {
        constructor() {
            super(...arguments);
            this.bridgeId = pairing_1.ZWJS_DEFAULT_BRIDGE_ID;
            this.curationRuntime = (0, curation_1.loadCurationRuntimeFromSettings)(undefined);
            this.clientLogger = {
                info: (msg, meta) => this.log(msg, meta),
                warn: (msg, meta) => this.error(msg, meta),
                error: (msg, meta) => this.error(msg, meta),
            };
            this.lifecycleQueue = Promise.resolve();
            this.shuttingDown = false;
            this.onSettingsChanged = (key) => {
                if (this.shuttingDown)
                    return;
                if (![
                    core_1.ZWJS_CONNECTION_SETTINGS_KEY,
                    compiled_profiles_1.COMPILED_PROFILES_PATH_SETTINGS_KEY,
                    curation_1.CURATION_SETTINGS_KEY,
                ].includes(key)) {
                    return;
                }
                this.enqueueLifecycle(async () => {
                    if (key === core_1.ZWJS_CONNECTION_SETTINGS_KEY) {
                        await this.reloadZwjsClient('settings-updated');
                        await this.refreshNodeRuntimeMappings('zwjs-connection-updated');
                        await this.refreshBridgeRuntimeDiagnostics('zwjs-connection-updated');
                    }
                    else if (key === compiled_profiles_1.COMPILED_PROFILES_PATH_SETTINGS_KEY) {
                        await this.loadCompiledProfilesRuntime('settings-updated');
                        await this.refreshNodeRuntimeMappings('compiled-profiles-updated');
                        await this.refreshBridgeRuntimeDiagnostics('compiled-profiles-updated');
                    }
                    else if (key === curation_1.CURATION_SETTINGS_KEY) {
                        this.loadCurationRuntime('settings-updated');
                        await this.refreshNodeRuntimeMappings('curation-updated');
                        await this.refreshBridgeRuntimeDiagnostics('curation-updated');
                    }
                }).catch((error) => {
                    this.error('Failed to apply settings update', { key, error });
                });
            };
        }
        static wait(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }
        static isDriverNotInitializedError(error, driverId) {
            if (!(error instanceof Error))
                return false;
            const message = error.message;
            return (message === `Driver Not Initialized: ${driverId}` ||
                message.startsWith('Driver Not Initialized:'));
        }
        static toStringOrNull(value) {
            if (typeof value !== 'string')
                return null;
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        }
        static toNumberOrNull(value) {
            if (typeof value === 'number' && Number.isFinite(value))
                return value;
            return null;
        }
        static toBooleanOrDefault(value, fallback = false) {
            return typeof value === 'boolean' ? value : fallback;
        }
        static normalizeProfileConfidenceCode(value) {
            if (typeof value !== 'string')
                return null;
            const normalized = value.trim().toLowerCase();
            if (normalized === 'curated')
                return 'curated';
            if (normalized === 'ha-derived')
                return 'ha-derived';
            if (normalized === 'generic')
                return 'generic';
            return null;
        }
        static describeProfileConfidenceCode(code) {
            if (code === 'curated')
                return 'Project rule match';
            if (code === 'ha-derived')
                return 'Home Assistant-derived rule match';
            if (code === 'generic')
                return 'Generic fallback rule';
            return 'Unknown rule match level';
        }
        static describeProfileSourceCode(code) {
            if (code === 'compiled+curation-override')
                return 'Compiled profile + device override';
            if (code === 'compiled-only')
                return 'Compiled profile only';
            return 'Profile resolution pending';
        }
        static describeRecommendationReason(reasonCode) {
            if (!reasonCode)
                return null;
            return _a.RECOMMENDATION_REASON_LABELS[reasonCode] ?? reasonCode;
        }
        static buildProfileAttribution(options) {
            const confidenceLabel = _a.describeProfileConfidenceCode(options.confidenceCode);
            const sourceCode = options.profileId || options.fallbackReason
                ? options.curationEntryPresent
                    ? 'compiled+curation-override'
                    : 'compiled-only'
                : 'unresolved';
            const sourceLabel = _a.describeProfileSourceCode(sourceCode);
            const summary = sourceCode === 'compiled+curation-override'
                ? `${confidenceLabel}; device override present`
                : sourceCode === 'compiled-only'
                    ? `${confidenceLabel}; no device override`
                    : 'Profile resolution is pending; runtime defaults are active';
            return {
                confidenceCode: options.confidenceCode,
                confidenceLabel,
                sourceCode,
                sourceLabel,
                summary,
                curationEntryPresent: options.curationEntryPresent,
            };
        }
        static parseNumericIdentityOrNull(value) {
            if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) {
                return value;
            }
            if (typeof value !== 'string')
                return null;
            const trimmed = value.trim();
            if (trimmed.length === 0)
                return null;
            if (/^0x[0-9a-f]+$/i.test(trimmed)) {
                const parsedHex = Number.parseInt(trimmed.slice(2), 16);
                return Number.isInteger(parsedHex) && Number.isFinite(parsedHex) ? parsedHex : null;
            }
            if (/^\d+$/.test(trimmed)) {
                const parsedDec = Number.parseInt(trimmed, 10);
                return Number.isInteger(parsedDec) && Number.isFinite(parsedDec) ? parsedDec : null;
            }
            return null;
        }
        static normalizeNodeStateSnapshot(profileResolution) {
            let nodeState;
            if (profileResolution.nodeState && typeof profileResolution.nodeState === 'object') {
                nodeState = profileResolution.nodeState;
            }
            return {
                manufacturerId: _a.parseNumericIdentityOrNull(nodeState?.manufacturerId),
                productType: _a.parseNumericIdentityOrNull(nodeState?.productType),
                productId: _a.parseNumericIdentityOrNull(nodeState?.productId),
                manufacturer: _a.toStringOrNull(nodeState?.manufacturer),
                product: _a.toStringOrNull(nodeState?.product),
                location: _a.toStringOrNull(nodeState?.location),
                interviewStage: _a.toStringOrNull(nodeState?.interviewStage),
                status: _a.toStringOrNull(nodeState?.status),
                firmwareVersion: _a.toStringOrNull(nodeState?.firmwareVersion),
                ready: typeof nodeState?.ready === 'boolean' ? nodeState.ready : null,
                isFailed: typeof nodeState?.isFailed === 'boolean' ? nodeState.isFailed : null,
            };
        }
        normalizeZwjsDiagnosticsStatus() {
            const status = this.zwjsClient?.getStatus();
            return {
                available: Boolean(this.zwjsClient),
                transportConnected: status?.transportConnected === true,
                lifecycle: status?.lifecycle ?? 'stopped',
                versionReceived: typeof status?.versionReceived === 'boolean' ? status.versionReceived : null,
                initialized: typeof status?.initialized === 'boolean' ? status.initialized : null,
                listening: typeof status?.listening === 'boolean' ? status.listening : null,
                authenticated: typeof status?.authenticated === 'boolean' ? status.authenticated : null,
                serverVersion: _a.toStringOrNull(status?.serverVersion),
                adapterFamily: _a.toStringOrNull(status?.adapterFamily),
                reconnectAttempt: _a.toNumberOrNull(status?.reconnectAttempt),
                connectedAt: _a.toStringOrNull(status?.connectedAt),
                lastMessageAt: _a.toStringOrNull(status?.lastMessageAt),
            };
        }
        static toRecommendationActionPriority(action) {
            if (action === 'backfill-marker')
                return 0;
            if (action === 'adopt-recommended-baseline')
                return 1;
            return 2;
        }
        static toRecommendationActionSelection(value) {
            if (typeof value === 'undefined')
                return 'auto';
            if (value === 'auto')
                return value;
            if (value === 'backfill-marker')
                return value;
            if (value === 'adopt-recommended-baseline')
                return value;
            if (value === 'none')
                return value;
            return null;
        }
        static summarizeMappingDiagnostics(profileResolution) {
            const diagnostics = Array.isArray(profileResolution.mappingDiagnostics)
                ? profileResolution.mappingDiagnostics
                : [];
            let inboundConfigured = 0;
            let inboundEnabled = 0;
            let outboundConfigured = 0;
            let outboundEnabled = 0;
            const skipReasons = {};
            for (const item of diagnostics) {
                if (!item || typeof item !== 'object')
                    continue;
                const diagnostic = item;
                if (diagnostic.inbound?.configured === true)
                    inboundConfigured += 1;
                if (diagnostic.inbound?.enabled === true)
                    inboundEnabled += 1;
                if (diagnostic.outbound?.configured === true)
                    outboundConfigured += 1;
                if (diagnostic.outbound?.enabled === true)
                    outboundEnabled += 1;
                const inboundReason = _a.toStringOrNull(diagnostic.inbound?.reason);
                if (inboundReason) {
                    skipReasons[inboundReason] = (skipReasons[inboundReason] ?? 0) + 1;
                }
                const outboundReason = _a.toStringOrNull(diagnostic.outbound?.reason);
                if (outboundReason) {
                    skipReasons[outboundReason] = (skipReasons[outboundReason] ?? 0) + 1;
                }
            }
            return {
                capabilityCount: diagnostics.length,
                inboundConfigured,
                inboundEnabled,
                outboundConfigured,
                outboundEnabled,
                skipReasons,
            };
        }
        normalizeNodeDiagnosticsEntry(profileResolution, deviceData) {
            const mappingSummary = _a.summarizeMappingDiagnostics(profileResolution);
            const node = _a.normalizeNodeStateSnapshot(profileResolution);
            let classification;
            if (profileResolution.classification && typeof profileResolution.classification === 'object') {
                classification = profileResolution.classification;
            }
            let curationReport;
            if (profileResolution.curationReport && typeof profileResolution.curationReport === 'object') {
                curationReport = profileResolution.curationReport;
            }
            let curationSummary;
            if (curationReport?.summary && typeof curationReport.summary === 'object') {
                curationSummary = curationReport.summary;
            }
            let homeyDeviceId = _a.toStringOrNull(profileResolution.homeyDeviceId);
            if (homeyDeviceId === null) {
                homeyDeviceId = _a.toStringOrNull(deviceData?.id);
            }
            const bridgeId = _a.toStringOrNull(deviceData?.bridgeId);
            let nodeId = _a.toNumberOrNull(deviceData?.nodeId);
            if (nodeId === null) {
                let selectorNodeId;
                if (profileResolution.selector && typeof profileResolution.selector === 'object') {
                    selectorNodeId = profileResolution.selector.nodeId;
                }
                nodeId = _a.toNumberOrNull(selectorNodeId);
            }
            const profileId = _a.toStringOrNull(profileResolution.profileId);
            const fallbackReason = _a.toStringOrNull(profileResolution.fallbackReason);
            const confidenceCode = _a.normalizeProfileConfidenceCode(classification?.confidence);
            const curationEntryPresent = _a.toBooleanOrDefault(profileResolution.curationEntryPresent);
            const recommendationReason = _a.toStringOrNull(profileResolution.recommendationReason);
            return {
                homeyDeviceId,
                bridgeId,
                nodeId,
                node,
                sync: {
                    syncedAt: _a.toStringOrNull(profileResolution.syncedAt),
                    syncReason: _a.toStringOrNull(profileResolution.syncReason),
                },
                profile: {
                    matchBy: _a.toStringOrNull(profileResolution.matchBy),
                    matchKey: _a.toStringOrNull(profileResolution.matchKey),
                    profileId,
                    fallbackReason,
                    homeyClass: _a.toStringOrNull(classification?.homeyClass),
                    confidence: confidenceCode,
                    uncurated: _a.toBooleanOrDefault(classification?.uncurated, true),
                },
                profileAttribution: _a.buildProfileAttribution({
                    confidenceCode,
                    curationEntryPresent,
                    profileId,
                    fallbackReason,
                }),
                curation: {
                    loaded: _a.toBooleanOrDefault(profileResolution.curationLoaded),
                    source: _a.toStringOrNull(profileResolution.curationSource),
                    error: _a.toStringOrNull(profileResolution.curationError),
                    entryPresent: curationEntryPresent,
                    appliedActions: _a.toNumberOrNull(curationSummary?.applied) ?? 0,
                    skippedActions: _a.toNumberOrNull(curationSummary?.skipped) ?? 0,
                    errorCount: _a.toNumberOrNull(curationSummary?.errors) ?? 0,
                },
                recommendation: {
                    available: _a.toBooleanOrDefault(profileResolution.recommendationAvailable),
                    reason: recommendationReason,
                    reasonLabel: _a.describeRecommendationReason(recommendationReason),
                    backfillNeeded: _a.toBooleanOrDefault(profileResolution.recommendationBackfillNeeded),
                    projectionVersion: _a.toStringOrNull(profileResolution.recommendationProjectionVersion),
                    currentBaselineHash: _a.toStringOrNull(profileResolution.currentBaselineHash),
                    storedBaselineHash: _a.toStringOrNull(profileResolution.storedBaselineHash),
                    currentPipelineFingerprint: _a.toStringOrNull(profileResolution.currentBaselinePipelineFingerprint),
                    storedPipelineFingerprint: _a.toStringOrNull(profileResolution.storedBaselinePipelineFingerprint),
                },
                mapping: {
                    verticalSliceApplied: _a.toBooleanOrDefault(profileResolution.verticalSliceApplied),
                    capabilityCount: mappingSummary.capabilityCount,
                    inboundConfigured: mappingSummary.inboundConfigured,
                    inboundEnabled: mappingSummary.inboundEnabled,
                    inboundSkipped: mappingSummary.inboundConfigured - mappingSummary.inboundEnabled,
                    outboundConfigured: mappingSummary.outboundConfigured,
                    outboundEnabled: mappingSummary.outboundEnabled,
                    outboundSkipped: mappingSummary.outboundConfigured - mappingSummary.outboundEnabled,
                    skipReasons: mappingSummary.skipReasons,
                },
            };
        }
        createPendingNodeDiagnosticsEntry(deviceData) {
            return {
                homeyDeviceId: _a.toStringOrNull(deviceData?.id),
                bridgeId: _a.toStringOrNull(deviceData?.bridgeId),
                nodeId: _a.toNumberOrNull(deviceData?.nodeId),
                node: {
                    manufacturerId: null,
                    productType: null,
                    productId: null,
                    manufacturer: null,
                    product: null,
                    location: null,
                    interviewStage: null,
                    status: null,
                    firmwareVersion: null,
                    ready: null,
                    isFailed: null,
                },
                sync: {
                    syncedAt: null,
                    syncReason: null,
                },
                profile: {
                    matchBy: null,
                    matchKey: null,
                    profileId: null,
                    fallbackReason: 'profile-resolution-not-ready',
                    homeyClass: null,
                    confidence: null,
                    uncurated: true,
                },
                profileAttribution: _a.buildProfileAttribution({
                    confidenceCode: null,
                    curationEntryPresent: false,
                    profileId: null,
                    fallbackReason: null,
                }),
                curation: {
                    loaded: this.curationRuntime.status.loaded,
                    source: this.curationRuntime.status.source,
                    error: this.curationRuntime.status.errorMessage,
                    entryPresent: false,
                    appliedActions: 0,
                    skippedActions: 0,
                    errorCount: 0,
                },
                recommendation: {
                    available: false,
                    reason: 'profile-resolution-not-ready',
                    reasonLabel: _a.describeRecommendationReason('profile-resolution-not-ready'),
                    backfillNeeded: false,
                    projectionVersion: null,
                    currentBaselineHash: null,
                    storedBaselineHash: null,
                    currentPipelineFingerprint: null,
                    storedPipelineFingerprint: null,
                },
                mapping: {
                    verticalSliceApplied: false,
                    capabilityCount: 0,
                    inboundConfigured: 0,
                    inboundEnabled: 0,
                    inboundSkipped: 0,
                    outboundConfigured: 0,
                    outboundEnabled: 0,
                    outboundSkipped: 0,
                    skipReasons: {},
                },
            };
        }
        getNodeDriverDevices() {
            const nodeDriver = this.homey.drivers.getDriver('node');
            return nodeDriver.getDevices();
        }
        findNodeDeviceByHomeyDeviceId(homeyDeviceId, devices) {
            return devices.find((device) => {
                const data = device.getData?.();
                return _a.toStringOrNull(data?.id) === homeyDeviceId;
            });
        }
        toRecommendationActionQueueItem(node) {
            let action = 'none';
            if (!node.homeyDeviceId) {
                action = 'none';
            }
            else if (node.recommendation.backfillNeeded) {
                action = 'backfill-marker';
            }
            else if (node.recommendation.available) {
                action = 'adopt-recommended-baseline';
            }
            let reason = node.recommendation.reason ?? 'none';
            if (action === 'none' && !node.homeyDeviceId) {
                reason = 'missing-homey-device-id';
            }
            return {
                homeyDeviceId: node.homeyDeviceId,
                nodeId: node.nodeId,
                profileId: node.profile.profileId,
                action,
                reason,
                recommendationAvailable: node.recommendation.available,
                recommendationBackfillNeeded: node.recommendation.backfillNeeded,
                recommendationProjectionVersion: node.recommendation.projectionVersion,
                currentBaselineHash: node.recommendation.currentBaselineHash,
                storedBaselineHash: node.recommendation.storedBaselineHash,
                currentPipelineFingerprint: node.recommendation.currentPipelineFingerprint,
            };
        }
        enqueueLifecycle(work) {
            this.lifecycleQueue = this.lifecycleQueue.then(work).catch((error) => {
                this.error('ZWJS lifecycle operation failed', error);
            });
            return this.lifecycleQueue;
        }
        async stopZwjsClient(reason) {
            if (!this.zwjsClient)
                return;
            this.log(`Stopping ZWJS client (${reason})`);
            await this.zwjsClient.stop();
            this.zwjsClient = undefined;
        }
        static hasConfiguredZwjsUrl(rawSettings) {
            if (typeof rawSettings === 'string') {
                const candidate = rawSettings.trim();
                if (!candidate)
                    return false;
                try {
                    const parsed = new URL(candidate);
                    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
                }
                catch {
                    return false;
                }
            }
            if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
                return false;
            }
            const urlValue = rawSettings.url;
            if (typeof urlValue !== 'string')
                return false;
            const candidate = urlValue.trim();
            if (!candidate)
                return false;
            try {
                const parsed = new URL(candidate);
                return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
            }
            catch {
                return false;
            }
        }
        async startZwjsClient(reason) {
            const rawConnectionSettings = this.homey.settings.get(core_1.ZWJS_CONNECTION_SETTINGS_KEY);
            if (!_a.hasConfiguredZwjsUrl(rawConnectionSettings)) {
                this.log(`Skipping ZWJS client start (${reason}): no explicit ${core_1.ZWJS_CONNECTION_SETTINGS_KEY}.url configured`);
                return;
            }
            const resolved = (0, core_1.resolveZwjsConnectionConfig)(rawConnectionSettings);
            for (const warning of resolved.warnings) {
                this.error('ZWJS config warning', warning);
            }
            this.log(`Starting ZWJS client (${reason}) from ${resolved.source}: ${resolved.clientConfig.url}`);
            const nextClient = (0, core_1.createZwjsClient)({
                url: resolved.clientConfig.url,
                auth: resolved.clientConfig.auth,
                logger: this.clientLogger,
                mutationPolicy: {
                    enabled: true,
                    requireAllowList: true,
                    allowCommands: [core_1.ZWJS_COMMAND_NODE_SET_VALUE],
                },
            });
            nextClient.onEvent((event) => {
                this.log('zwjs event', event.type);
                const refreshNodeId = this.getRuntimeRefreshNodeIdFromEvent(event);
                if (refreshNodeId === undefined || this.shuttingDown) {
                    return;
                }
                this.enqueueLifecycle(async () => {
                    await this.refreshNodeRuntimeMappingsForNode(refreshNodeId, `event:${event.type}:node-${refreshNodeId}`);
                    await this.refreshBridgeRuntimeDiagnostics(`event:${event.type}:node-${refreshNodeId}`);
                }).catch((error) => {
                    this.error('Failed to refresh node runtime mappings from event', {
                        eventType: event.type,
                        nodeId: refreshNodeId,
                        error,
                    });
                });
            });
            await nextClient.start();
            this.zwjsClient = nextClient;
            this.log('zwjs status', this.zwjsClient.getStatus());
        }
        async loadCompiledProfilesRuntime(reason) {
            const sourcePath = (0, compiled_profiles_1.resolveCompiledProfilesArtifactPath)(__dirname, this.homey.settings.get(compiled_profiles_1.COMPILED_PROFILES_PATH_SETTINGS_KEY));
            const runtime = await (0, compiled_profiles_1.tryLoadCompiledProfilesRuntimeFromFile)(sourcePath);
            this.compiledProfilesRuntime = runtime;
            if (runtime.status.loaded) {
                this.log('Compiled profiles loaded', {
                    reason,
                    sourcePath,
                    entryCount: runtime.status.entryCount,
                    pipelineFingerprint: runtime.status.pipelineFingerprint,
                    duplicateKeys: runtime.status.duplicateKeys,
                });
                return;
            }
            this.error('Compiled profiles unavailable; node profile fallback mode is active', {
                reason,
                sourcePath,
                errorMessage: runtime.status.errorMessage,
            });
        }
        async reloadZwjsClient(reason) {
            await this.stopZwjsClient(`${reason}:reload`);
            await this.startZwjsClient(reason);
        }
        loadCurationRuntime(reason) {
            const runtime = (0, curation_1.loadCurationRuntimeFromSettings)(this.homey.settings.get(curation_1.CURATION_SETTINGS_KEY));
            this.curationRuntime = runtime;
            if (runtime.status.loaded) {
                this.log('Curation settings loaded', {
                    reason,
                    source: runtime.status.source,
                    entryCount: runtime.status.entryCount,
                });
                return;
            }
            this.error('Curation settings invalid; curation is disabled until fixed', {
                reason,
                source: runtime.status.source,
                errorMessage: runtime.status.errorMessage,
                settingsKey: curation_1.CURATION_SETTINGS_KEY,
            });
        }
        async refreshNodeRuntimeMappings(reason) {
            try {
                const nodeDriver = await this.getDriverWhenReady('node', `refreshNodeRuntimeMappings:${reason}`);
                if (!nodeDriver)
                    return;
                const devices = nodeDriver.getDevices();
                this.log('Refreshing node runtime mappings', {
                    reason,
                    devices: devices.length,
                });
                for (const device of devices) {
                    if (typeof device.onRuntimeMappingsRefresh === 'function') {
                        await device.onRuntimeMappingsRefresh(reason);
                    }
                }
            }
            catch (error) {
                this.error('Failed to refresh node runtime mappings', { reason, error });
            }
        }
        async refreshBridgeRuntimeDiagnostics(reason) {
            try {
                const bridgeDriver = await this.getDriverWhenReady('bridge', `refreshBridgeRuntimeDiagnostics:${reason}`);
                if (!bridgeDriver)
                    return;
                const devices = bridgeDriver.getDevices();
                this.log('Refreshing bridge runtime diagnostics', {
                    reason,
                    devices: devices.length,
                });
                for (const device of devices) {
                    if (typeof device.onRuntimeDiagnosticsRefresh === 'function') {
                        await device.onRuntimeDiagnosticsRefresh(reason);
                    }
                }
            }
            catch (error) {
                this.error('Failed to refresh bridge runtime diagnostics', { reason, error });
            }
        }
        getRuntimeRefreshNodeIdFromEvent(event) {
            if (!_a.NODE_EVENT_REFRESH_TYPES.has(event.type)) {
                return undefined;
            }
            if (!('event' in event)) {
                return undefined;
            }
            const payload = event.event;
            if (!payload || typeof payload.nodeId !== 'number' || !Number.isFinite(payload.nodeId)) {
                return undefined;
            }
            return payload.nodeId;
        }
        async refreshNodeRuntimeMappingsForNode(nodeId, reason) {
            try {
                const nodeDriver = await this.getDriverWhenReady('node', `refreshNodeRuntimeMappingsForNode:${reason}`);
                if (!nodeDriver)
                    return;
                const devices = nodeDriver.getDevices();
                let refreshed = 0;
                for (const device of devices) {
                    const data = device.getData?.();
                    if (!data || typeof data.nodeId !== 'number' || data.nodeId !== nodeId) {
                        continue;
                    }
                    if (data.bridgeId && data.bridgeId !== this.bridgeId) {
                        continue;
                    }
                    if (typeof device.onRuntimeMappingsRefresh === 'function') {
                        await device.onRuntimeMappingsRefresh(reason);
                        refreshed += 1;
                    }
                }
                this.log('Refreshed node runtime mappings for node', {
                    reason,
                    nodeId,
                    refreshed,
                });
            }
            catch (error) {
                this.error('Failed targeted node runtime mapping refresh', { nodeId, reason, error });
            }
        }
        async getDriverWhenReady(driverId, reason) {
            const startedAt = Date.now();
            const timeoutAt = startedAt + _a.DRIVER_READY_TIMEOUT_MS;
            let attempts = 0;
            while (!this.shuttingDown) {
                attempts += 1;
                try {
                    return this.homey.drivers.getDriver(driverId);
                }
                catch (error) {
                    if (!_a.isDriverNotInitializedError(error, driverId)) {
                        throw error;
                    }
                    if (Date.now() >= timeoutAt) {
                        this.error('Timed out waiting for driver initialization', {
                            driverId,
                            reason,
                            attempts,
                            waitedMs: Date.now() - startedAt,
                        });
                        return undefined;
                    }
                    await _a.wait(_a.DRIVER_READY_RETRY_MS);
                }
            }
            return undefined;
        }
        /**
         * onInit is called when the app is initialized.
         */
        async onInit() {
            this.settingsSetListener = (key) => this.onSettingsChanged(key);
            this.settingsUnsetListener = (key) => this.onSettingsChanged(key);
            this.homey.settings.on('set', this.settingsSetListener);
            this.homey.settings.on('unset', this.settingsUnsetListener);
            await this.enqueueLifecycle(async () => {
                await this.loadCompiledProfilesRuntime('startup');
                this.loadCurationRuntime('startup');
                await this.startZwjsClient('startup');
                await this.refreshNodeRuntimeMappings('startup');
                await this.refreshBridgeRuntimeDiagnostics('startup');
            });
            this.log('zwavejs2homey initialized');
        }
        async onUninit() {
            this.shuttingDown = true;
            if (this.settingsSetListener) {
                this.homey.settings.removeListener('set', this.settingsSetListener);
                this.settingsSetListener = undefined;
            }
            if (this.settingsUnsetListener) {
                this.homey.settings.removeListener('unset', this.settingsUnsetListener);
                this.settingsUnsetListener = undefined;
            }
            await this.enqueueLifecycle(async () => {
                await this.stopZwjsClient('shutdown');
            });
        }
        getZwjsClient() {
            return this.zwjsClient;
        }
        getBridgeId() {
            return this.bridgeId;
        }
        getCompiledProfilesStatus() {
            if (this.compiledProfilesRuntime?.status)
                return this.compiledProfilesRuntime.status;
            const sourcePath = (0, compiled_profiles_1.resolveCompiledProfilesArtifactPath)(__dirname, this.homey.settings.get(compiled_profiles_1.COMPILED_PROFILES_PATH_SETTINGS_KEY));
            return {
                sourcePath,
                loaded: false,
                generatedAt: null,
                pipelineFingerprint: null,
                entryCount: 0,
                duplicateKeys: {
                    productTriple: 0,
                    nodeId: 0,
                    deviceKey: 0,
                },
                errorMessage: 'Compiled profile runtime not loaded',
            };
        }
        resolveCompiledProfileEntry(selector, options) {
            return (0, compiled_profiles_1.resolveCompiledProfileEntryFromRuntime)(this.compiledProfilesRuntime, selector, options);
        }
        getCurationStatus() {
            return this.curationRuntime.status;
        }
        resolveCurationEntry(homeyDeviceId) {
            return (0, curation_1.resolveCurationEntryFromRuntime)(this.curationRuntime, homeyDeviceId);
        }
        async getNodeRuntimeDiagnostics(options) {
            const devices = this.getNodeDriverDevices();
            const filterHomeyDeviceId = _a.toStringOrNull(options?.homeyDeviceId);
            const nodeDiagnostics = [];
            for (const device of devices) {
                try {
                    const profileResolution = await device.getStoreValue?.('profileResolution');
                    if (!profileResolution || typeof profileResolution !== 'object')
                        continue;
                    const diagnosticsEntry = this.normalizeNodeDiagnosticsEntry(profileResolution, device.getData?.());
                    if (filterHomeyDeviceId && diagnosticsEntry.homeyDeviceId !== filterHomeyDeviceId) {
                        continue;
                    }
                    nodeDiagnostics.push(diagnosticsEntry);
                }
                catch (error) {
                    this.error('Failed to read node diagnostics', { error });
                }
            }
            nodeDiagnostics.sort((a, b) => {
                const nodeA = _a.toNumberOrNull(a.nodeId);
                const nodeB = _a.toNumberOrNull(b.nodeId);
                if (nodeA !== null && nodeB !== null && nodeA !== nodeB) {
                    return nodeA - nodeB;
                }
                if (nodeA !== null && nodeB === null)
                    return -1;
                if (nodeA === null && nodeB !== null)
                    return 1;
                const idA = _a.toStringOrNull(a.homeyDeviceId) ?? '';
                const idB = _a.toStringOrNull(b.homeyDeviceId) ?? '';
                return idA.localeCompare(idB);
            });
            return {
                generatedAt: new Date().toISOString(),
                bridgeId: this.bridgeId,
                zwjs: this.normalizeZwjsDiagnosticsStatus(),
                compiledProfiles: this.getCompiledProfilesStatus(),
                curation: this.getCurationStatus(),
                nodes: nodeDiagnostics,
            };
        }
        async getNodeDeviceToolsSnapshot(options) {
            const homeyDeviceId = _a.toStringOrNull(options?.homeyDeviceId);
            if (!homeyDeviceId) {
                throw new Error('Invalid homeyDeviceId for node device tools snapshot');
            }
            const devices = this.getNodeDriverDevices();
            const device = this.findNodeDeviceByHomeyDeviceId(homeyDeviceId, devices);
            if (!device) {
                throw new Error(`Node device not found for homeyDeviceId: ${homeyDeviceId}`);
            }
            const deviceData = device.getData?.();
            const profileResolution = await device.getStoreValue?.('profileResolution');
            let diagnosticsEntry;
            if (profileResolution && typeof profileResolution === 'object') {
                diagnosticsEntry = this.normalizeNodeDiagnosticsEntry(profileResolution, deviceData);
            }
            else {
                diagnosticsEntry = this.createPendingNodeDiagnosticsEntry(deviceData);
            }
            const recommendation = this.toRecommendationActionQueueItem(diagnosticsEntry);
            return {
                schemaVersion: 'node-device-tools/v1',
                generatedAt: new Date().toISOString(),
                device: {
                    homeyDeviceId,
                    bridgeId: diagnosticsEntry.bridgeId,
                    nodeId: diagnosticsEntry.nodeId,
                },
                runtime: {
                    zwjs: this.normalizeZwjsDiagnosticsStatus(),
                    compiledProfiles: this.getCompiledProfilesStatus(),
                    curation: this.getCurationStatus(),
                },
                node: diagnosticsEntry.node,
                sync: diagnosticsEntry.sync,
                profile: diagnosticsEntry.profile,
                profileAttribution: diagnosticsEntry.profileAttribution,
                mapping: diagnosticsEntry.mapping,
                curation: diagnosticsEntry.curation,
                recommendation: {
                    available: diagnosticsEntry.recommendation.available,
                    reason: diagnosticsEntry.recommendation.reason,
                    reasonLabel: diagnosticsEntry.recommendation.reasonLabel,
                    backfillNeeded: diagnosticsEntry.recommendation.backfillNeeded,
                    suggestedAction: recommendation.action,
                    actionable: recommendation.action !== 'none',
                },
                profileReference: {
                    projectionVersion: diagnosticsEntry.recommendation.projectionVersion,
                    currentBaselineHash: diagnosticsEntry.recommendation.currentBaselineHash,
                    storedBaselineHash: diagnosticsEntry.recommendation.storedBaselineHash,
                    currentPipelineFingerprint: diagnosticsEntry.recommendation.currentPipelineFingerprint,
                    storedPipelineFingerprint: diagnosticsEntry.recommendation.storedPipelineFingerprint,
                },
                ui: {
                    readOnly: true,
                    actionsEnabled: false,
                },
            };
        }
        async getRecommendationActionQueue(options) {
            const diagnostics = await this.getNodeRuntimeDiagnostics({
                homeyDeviceId: options?.homeyDeviceId,
            });
            const includeNoAction = options?.includeNoAction === true;
            const queueItems = diagnostics.nodes.map((node) => this.toRecommendationActionQueueItem(node));
            const items = includeNoAction
                ? queueItems
                : queueItems.filter((item) => item.action !== 'none');
            items.sort((a, b) => {
                const priorityA = _a.toRecommendationActionPriority(a.action);
                const priorityB = _a.toRecommendationActionPriority(b.action);
                if (priorityA !== priorityB)
                    return priorityA - priorityB;
                const nodeA = a.nodeId ?? Number.MAX_SAFE_INTEGER;
                const nodeB = b.nodeId ?? Number.MAX_SAFE_INTEGER;
                if (nodeA !== nodeB)
                    return nodeA - nodeB;
                const idA = a.homeyDeviceId ?? '';
                const idB = b.homeyDeviceId ?? '';
                return idA.localeCompare(idB);
            });
            return {
                generatedAt: new Date().toISOString(),
                total: queueItems.length,
                actionable: queueItems.filter((item) => item.action !== 'none').length,
                items,
            };
        }
        async executeRecommendationAction(options) {
            const requestedAction = _a.toRecommendationActionSelection(options.action);
            if (!requestedAction) {
                return {
                    homeyDeviceId: _a.toStringOrNull(options.homeyDeviceId),
                    requestedAction: 'auto',
                    selectedAction: 'none',
                    executed: false,
                    reason: 'invalid-action-selection',
                };
            }
            const normalizedHomeyDeviceId = _a.toStringOrNull(options.homeyDeviceId);
            if (!normalizedHomeyDeviceId) {
                return {
                    homeyDeviceId: null,
                    requestedAction,
                    selectedAction: 'none',
                    executed: false,
                    reason: 'invalid-homey-device-id',
                };
            }
            const queue = await this.getRecommendationActionQueue({
                homeyDeviceId: normalizedHomeyDeviceId,
                includeNoAction: true,
            });
            const item = queue.items.find((entry) => entry.homeyDeviceId === normalizedHomeyDeviceId);
            if (!item) {
                return {
                    homeyDeviceId: normalizedHomeyDeviceId,
                    requestedAction,
                    selectedAction: 'none',
                    executed: false,
                    reason: 'node-not-found',
                };
            }
            if (requestedAction !== 'auto' && requestedAction !== item.action) {
                return {
                    homeyDeviceId: normalizedHomeyDeviceId,
                    requestedAction,
                    selectedAction: item.action,
                    executed: false,
                    reason: 'action-mismatch',
                    latestReason: item.reason,
                };
            }
            if (item.action === 'none') {
                return {
                    homeyDeviceId: normalizedHomeyDeviceId,
                    requestedAction,
                    selectedAction: 'none',
                    executed: false,
                    reason: item.reason,
                    latestReason: item.reason,
                };
            }
            const resolveFailedExecution = async (attemptedAction, executionReason, createdEntry) => {
                const latestQueue = await this.getRecommendationActionQueue({
                    homeyDeviceId: normalizedHomeyDeviceId,
                    includeNoAction: true,
                });
                const latestItem = latestQueue.items.find((entry) => entry.homeyDeviceId === normalizedHomeyDeviceId);
                if (!latestItem) {
                    return {
                        homeyDeviceId: normalizedHomeyDeviceId,
                        requestedAction,
                        selectedAction: attemptedAction,
                        executed: false,
                        reason: executionReason,
                        createdEntry,
                    };
                }
                const stateChanged = latestItem.action !== attemptedAction;
                return {
                    homeyDeviceId: normalizedHomeyDeviceId,
                    requestedAction,
                    selectedAction: stateChanged ? latestItem.action : attemptedAction,
                    executed: false,
                    reason: stateChanged ? 'action-state-changed' : executionReason,
                    createdEntry,
                    latestReason: latestItem.reason,
                    stateChanged,
                };
            };
            if (item.action === 'backfill-marker') {
                const result = await this.backfillCurationBaselineMarker(normalizedHomeyDeviceId);
                if (!result.updated) {
                    return resolveFailedExecution('backfill-marker', result.reason, result.createdEntry);
                }
                return {
                    homeyDeviceId: normalizedHomeyDeviceId,
                    requestedAction,
                    selectedAction: 'backfill-marker',
                    executed: true,
                    reason: result.reason,
                    createdEntry: result.createdEntry,
                };
            }
            const result = await this.adoptRecommendedBaseline(normalizedHomeyDeviceId);
            if (!result.adopted) {
                return resolveFailedExecution('adopt-recommended-baseline', result.reason);
            }
            return {
                homeyDeviceId: normalizedHomeyDeviceId,
                requestedAction,
                selectedAction: 'adopt-recommended-baseline',
                executed: true,
                reason: result.reason,
            };
        }
        async executeRecommendationActions(options) {
            const queue = await this.getRecommendationActionQueue({
                homeyDeviceId: options?.homeyDeviceId,
                includeNoAction: true,
            });
            const includeNoAction = options?.includeNoAction === true;
            const results = [];
            for (const item of queue.items) {
                if (!includeNoAction && item.action === 'none')
                    continue;
                if (item.homeyDeviceId) {
                    const executionResult = await this.executeRecommendationAction({
                        homeyDeviceId: item.homeyDeviceId,
                        action: item.action,
                    });
                    results.push(executionResult);
                    continue;
                }
                results.push({
                    homeyDeviceId: item.homeyDeviceId,
                    requestedAction: 'none',
                    selectedAction: item.action,
                    executed: false,
                    reason: item.reason,
                });
            }
            const executed = results.filter((entry) => entry.executed).length;
            return {
                total: results.length,
                executed,
                skipped: results.length - executed,
                results,
            };
        }
        async backfillMissingCurationBaselineMarkers(options) {
            const queue = await this.getRecommendationActionQueue({
                homeyDeviceId: options?.homeyDeviceId,
                includeNoAction: true,
            });
            const items = [];
            let nextDocument = this.curationRuntime.document;
            let updated = 0;
            let createdEntries = 0;
            for (const item of queue.items) {
                if (item.action !== 'backfill-marker') {
                    items.push({
                        homeyDeviceId: item.homeyDeviceId,
                        action: item.action,
                        updated: false,
                        createdEntry: false,
                        reason: 'action-not-backfill',
                    });
                    continue;
                }
                if (!item.homeyDeviceId) {
                    items.push({
                        homeyDeviceId: null,
                        action: item.action,
                        updated: false,
                        createdEntry: false,
                        reason: 'missing-homey-device-id',
                    });
                    continue;
                }
                if (!item.currentBaselineHash) {
                    items.push({
                        homeyDeviceId: item.homeyDeviceId,
                        action: item.action,
                        updated: false,
                        createdEntry: false,
                        reason: 'baseline-marker-unavailable',
                    });
                    continue;
                }
                const nowIso = new Date().toISOString();
                const baselineMarker = {
                    projectionVersion: item.recommendationProjectionVersion ?? curation_1.BASELINE_MARKER_PROJECTION_VERSION,
                    baselineProfileHash: item.currentBaselineHash,
                    updatedAt: nowIso,
                };
                if (item.currentPipelineFingerprint) {
                    baselineMarker.pipelineFingerprint = item.currentPipelineFingerprint;
                }
                const mutation = (0, curation_1.upsertCurationBaselineMarkerV1)(nextDocument, item.homeyDeviceId, baselineMarker, { now: nowIso });
                nextDocument = mutation.document;
                updated += 1;
                if (mutation.createdEntry)
                    createdEntries += 1;
                items.push({
                    homeyDeviceId: item.homeyDeviceId,
                    action: item.action,
                    updated: true,
                    createdEntry: mutation.createdEntry,
                    reason: mutation.createdEntry ? 'created-entry-and-backfilled-marker' : 'backfilled-marker',
                });
            }
            if (updated > 0) {
                this.homey.settings.set(curation_1.CURATION_SETTINGS_KEY, nextDocument);
                await this.lifecycleQueue;
            }
            return {
                updated,
                createdEntries,
                skipped: items.length - updated,
                items,
            };
        }
        async backfillCurationBaselineMarker(homeyDeviceId) {
            const normalizedHomeyDeviceId = _a.toStringOrNull(homeyDeviceId);
            if (!normalizedHomeyDeviceId) {
                return {
                    updated: false,
                    createdEntry: false,
                    reason: 'invalid-homey-device-id',
                };
            }
            const diagnostics = await this.getNodeRuntimeDiagnostics({
                homeyDeviceId: normalizedHomeyDeviceId,
            });
            const node = diagnostics.nodes[0];
            if (!node) {
                return {
                    updated: false,
                    createdEntry: false,
                    reason: 'node-not-found',
                };
            }
            if (!node.recommendation.currentBaselineHash) {
                return {
                    updated: false,
                    createdEntry: false,
                    reason: 'baseline-marker-unavailable',
                };
            }
            const nowIso = new Date().toISOString();
            const baselineMarker = {
                projectionVersion: node.recommendation.projectionVersion ?? curation_1.BASELINE_MARKER_PROJECTION_VERSION,
                baselineProfileHash: node.recommendation.currentBaselineHash,
                updatedAt: nowIso,
            };
            if (node.recommendation.currentPipelineFingerprint) {
                baselineMarker.pipelineFingerprint = node.recommendation.currentPipelineFingerprint;
            }
            const mutation = (0, curation_1.upsertCurationBaselineMarkerV1)(this.curationRuntime.document, normalizedHomeyDeviceId, baselineMarker, { now: nowIso });
            this.homey.settings.set(curation_1.CURATION_SETTINGS_KEY, mutation.document);
            await this.lifecycleQueue;
            return {
                updated: true,
                createdEntry: mutation.createdEntry,
                reason: mutation.createdEntry ? 'created-entry-and-backfilled-marker' : 'backfilled-marker',
            };
        }
        async adoptRecommendedBaseline(homeyDeviceId) {
            const normalizedHomeyDeviceId = _a.toStringOrNull(homeyDeviceId);
            if (!normalizedHomeyDeviceId) {
                return {
                    adopted: false,
                    reason: 'invalid-homey-device-id',
                };
            }
            const diagnostics = await this.getNodeRuntimeDiagnostics({
                homeyDeviceId: normalizedHomeyDeviceId,
            });
            const node = diagnostics.nodes[0];
            if (!node) {
                return {
                    adopted: false,
                    reason: 'node-not-found',
                };
            }
            if (node.recommendation.backfillNeeded) {
                return {
                    adopted: false,
                    reason: 'marker-backfill-required',
                };
            }
            if (!node.recommendation.available) {
                return {
                    adopted: false,
                    reason: 'recommendation-unavailable',
                };
            }
            const mutation = (0, curation_1.removeCurationEntryV1)(this.curationRuntime.document, normalizedHomeyDeviceId);
            if (!mutation.removed) {
                return {
                    adopted: false,
                    reason: 'curation-entry-missing',
                };
            }
            this.homey.settings.set(curation_1.CURATION_SETTINGS_KEY, mutation.document);
            await this.lifecycleQueue;
            return {
                adopted: true,
                reason: 'adopted-and-removed-curation-entry',
            };
        }
    },
    _a.NODE_EVENT_REFRESH_TYPES = new Set([
        'zwjs.event.node.interview-completed',
        'zwjs.event.node.value-added',
        'zwjs.event.node.metadata-updated',
    ]),
    _a.RECOMMENDATION_REASON_LABELS = {
        'baseline-hash-changed': 'Compiled profile changed for this device.',
        'marker-missing-backfill': 'Profile reference metadata is missing for this curated device.',
        'baseline-hash-unchanged': 'Current curated profile still matches the compiled baseline.',
        'profile-resolution-not-ready': 'Runtime mapping has not been generated for this device yet.',
        'no-curation-entry': 'No curation exists yet for this device.',
        'missing-homey-device-id': 'Device identifier is unavailable in runtime diagnostics.',
        none: 'No recommendation is available.',
    },
    _a.DRIVER_READY_RETRY_MS = 25,
    _a.DRIVER_READY_TIMEOUT_MS = 5000,
    _a);

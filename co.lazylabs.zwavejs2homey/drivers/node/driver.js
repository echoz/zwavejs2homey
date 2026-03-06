"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const compiled_profiles_1 = require("../../compiled-profiles");
const pairing_1 = require("../../pairing");
const pairing_icons_1 = require("../../pairing-icons");
module.exports = (_a = class NodeDriver extends homey_1.default.Driver {
        registerTimedSessionHandler(session, event, timeoutMs, context, handler) {
            session.setHandler(event, async (payload) => {
                return this.withTimeout(handler(payload), timeoutMs, `${context} (${event})`);
            });
        }
        toSerializablePairPayload(value, context) {
            try {
                return JSON.parse(JSON.stringify(value));
            }
            catch (error) {
                this.error('Failed to serialize pairing payload', { context, error });
                throw error;
            }
        }
        async onPair(session) {
            this.log('Node pair session started');
            this.registerTimedSessionHandler(session, 'list_devices', _a.PAIR_HANDLER_TIMEOUT_MS, 'node pair list', async () => {
                this.log('Node pair list requested (session handler)');
                return this.onPairListDevices();
            });
            this.log('Node pair handler registered', { event: 'list_devices' });
            // Proactively publish candidates for runtimes that do not eagerly call list_devices.
            void this.withTimeout((async () => {
                const candidates = await this.onPairListDevices();
                await session.emit('list_devices', candidates);
                this.log('Node pair preloaded list_devices candidates', {
                    candidates: Array.isArray(candidates) ? candidates.length : 0,
                });
            })(), _a.PAIR_HANDLER_TIMEOUT_MS, 'node pair preload list_devices').catch((error) => {
                this.error('Node pair preload failed', { error });
            });
        }
        async onInit() {
            this.log('NodeDriver initialized');
            const driverPrototypeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(this)).sort();
            const manifestPairViews = this.homey.manifest?.drivers?.find((driver) => driver && driver.id === 'node')?.pair ?? [];
            this.log('NodeDriver runtime pairing shape', {
                hasOnPairListDevices: typeof this.onPairListDevices ===
                    'function',
                prototypeMethods: driverPrototypeMethods,
                pairViews: Array.isArray(manifestPairViews)
                    ? manifestPairViews.map((view) => ({
                        id: view?.id,
                        template: view?.template,
                        next: view?.navigation?.next,
                        singular: view?.options?.singular === true,
                    }))
                    : [],
            });
        }
        resolveBridgeRuntime(app) {
            const session = app.getBridgeSession?.(pairing_1.ZWJS_DEFAULT_BRIDGE_ID);
            const bridgeId = this.normalizeStringOrNull(session?.bridgeId) ??
                app.getBridgeId?.() ??
                pairing_1.ZWJS_DEFAULT_BRIDGE_ID;
            const client = session?.getZwjsClient?.() ?? app.getZwjsClient?.();
            return { bridgeId, client };
        }
        countImportedNodeDevices(bridgeId) {
            return this.getDevices()
                .map((device) => device.getData())
                .filter((entry) => entry?.kind === 'zwjs-node' && entry.bridgeId === bridgeId)
                .filter((entry) => typeof entry?.nodeId === 'number' && Number.isInteger(entry.nodeId))
                .length;
        }
        async loadImportSummaryStatus() {
            const app = this.homey.app;
            const runtime = this.resolveBridgeRuntime(app);
            const bridgeId = runtime.bridgeId;
            const client = runtime.client;
            const status = client?.getStatus?.();
            const warnings = [];
            const zwjs = {
                available: Boolean(client),
                transportConnected: status?.transportConnected === true,
                lifecycle: typeof status?.lifecycle === 'string' ? status.lifecycle : 'stopped',
                serverVersion: typeof status?.serverVersion === 'string' && status.serverVersion.trim().length > 0
                    ? status.serverVersion.trim()
                    : null,
                adapterFamily: typeof status?.adapterFamily === 'string' && status.adapterFamily.trim().length > 0
                    ? status.adapterFamily.trim()
                    : null,
                versionReceived: typeof status?.versionReceived === 'boolean' ? status.versionReceived : null,
                initialized: typeof status?.initialized === 'boolean' ? status.initialized : null,
                listening: typeof status?.listening === 'boolean' ? status.listening : null,
                authenticated: typeof status?.authenticated === 'boolean' ? status.authenticated : null,
                reconnectAttempt: typeof status?.reconnectAttempt === 'number' && Number.isFinite(status.reconnectAttempt)
                    ? Math.max(0, Math.trunc(status.reconnectAttempt))
                    : null,
                connectedAt: typeof status?.connectedAt === 'string' && status.connectedAt.trim().length > 0
                    ? status.connectedAt.trim()
                    : null,
                lastMessageAt: typeof status?.lastMessageAt === 'string' && status.lastMessageAt.trim().length > 0
                    ? status.lastMessageAt.trim()
                    : null,
            };
            const discoveredNodeNames = new Map();
            let discoveredNodes = null;
            if (client) {
                try {
                    const nodeList = await client.getNodeList();
                    const nodes = Array.isArray(nodeList?.nodes) ? nodeList.nodes : [];
                    discoveredNodes = nodes.filter((node) => {
                        const nodeId = node?.nodeId;
                        if (typeof node?.name === 'string' &&
                            typeof nodeId === 'number' &&
                            Number.isInteger(nodeId)) {
                            const trimmedName = node.name.trim();
                            if (trimmedName.length > 0) {
                                discoveredNodeNames.set(nodeId, trimmedName);
                            }
                        }
                        return typeof nodeId === 'number' && Number.isInteger(nodeId) && nodeId > 1;
                    }).length;
                }
                catch (error) {
                    this.error('Failed to load node list for node import summary status', {
                        error,
                        bridgeId,
                    });
                    warnings.push('Unable to load discovered-node count from ZWJS.');
                }
            }
            else {
                warnings.push('ZWJS client is unavailable; configure zwjs_connection.url in app settings.');
            }
            let importedNodeDetails = [];
            let importedNodes = this.countImportedNodeDevices(bridgeId);
            let actionNeededNodes = 0;
            let backfillNeededNodes = 0;
            let compiledOnlyNodes = 0;
            let overrideNodes = 0;
            let unresolvedNodes = 0;
            let confidenceCuratedNodes = 0;
            let confidenceHaDerivedNodes = 0;
            let confidenceGenericNodes = 0;
            let confidenceUnknownNodes = 0;
            if (app.getNodeRuntimeDiagnostics) {
                try {
                    const diagnostics = await app.getNodeRuntimeDiagnostics();
                    if (diagnostics?.zwjs && typeof diagnostics.zwjs === 'object') {
                        if (zwjs.versionReceived === null &&
                            typeof diagnostics.zwjs.versionReceived === 'boolean') {
                            zwjs.versionReceived = diagnostics.zwjs.versionReceived;
                        }
                        if (zwjs.initialized === null && typeof diagnostics.zwjs.initialized === 'boolean') {
                            zwjs.initialized = diagnostics.zwjs.initialized;
                        }
                        if (zwjs.listening === null && typeof diagnostics.zwjs.listening === 'boolean') {
                            zwjs.listening = diagnostics.zwjs.listening;
                        }
                        if (zwjs.authenticated === null && typeof diagnostics.zwjs.authenticated === 'boolean') {
                            zwjs.authenticated = diagnostics.zwjs.authenticated;
                        }
                        if (zwjs.reconnectAttempt === null &&
                            typeof diagnostics.zwjs.reconnectAttempt === 'number' &&
                            Number.isFinite(diagnostics.zwjs.reconnectAttempt)) {
                            zwjs.reconnectAttempt = Math.max(0, Math.trunc(diagnostics.zwjs.reconnectAttempt));
                        }
                        if (zwjs.connectedAt === null &&
                            typeof diagnostics.zwjs.connectedAt === 'string' &&
                            diagnostics.zwjs.connectedAt.trim().length > 0) {
                            zwjs.connectedAt = diagnostics.zwjs.connectedAt.trim();
                        }
                        if (zwjs.lastMessageAt === null &&
                            typeof diagnostics.zwjs.lastMessageAt === 'string' &&
                            diagnostics.zwjs.lastMessageAt.trim().length > 0) {
                            zwjs.lastMessageAt = diagnostics.zwjs.lastMessageAt.trim();
                        }
                    }
                    if (Array.isArray(diagnostics.nodes)) {
                        importedNodeDetails = diagnostics.nodes
                            .filter((entry) => {
                            const entryBridgeId = this.normalizeStringOrNull(entry.bridgeId);
                            if (!entryBridgeId)
                                return true;
                            return entryBridgeId === bridgeId;
                        })
                            .map((entry) => {
                            const nodeId = typeof entry.nodeId === 'number' && Number.isInteger(entry.nodeId)
                                ? entry.nodeId
                                : null;
                            const recommendationAction = this.toRecommendationAction(entry.recommendation);
                            const profileAttribution = this.normalizeProfileAttribution(entry);
                            return {
                                homeyDeviceId: this.normalizeStringOrNull(entry.homeyDeviceId),
                                bridgeId: this.normalizeStringOrNull(entry.bridgeId) ?? bridgeId,
                                nodeId,
                                name: nodeId !== null ? (discoveredNodeNames.get(nodeId) ?? null) : null,
                                manufacturer: this.normalizeStringOrNull(entry.node?.manufacturer),
                                product: this.normalizeStringOrNull(entry.node?.product),
                                location: this.normalizeStringOrNull(entry.node?.location),
                                status: this.normalizeStringOrNull(entry.node?.status),
                                profileHomeyClass: this.normalizeStringOrNull(entry.profile?.homeyClass),
                                profileId: this.normalizeStringOrNull(entry.profile?.profileId),
                                profileMatch: this.buildProfileMatchSummary(entry.profile),
                                profileSource: profileAttribution.sourceLabel,
                                ruleMatch: profileAttribution.confidenceLabel,
                                fallbackReason: this.normalizeStringOrNull(entry.profile?.fallbackReason),
                                recommendationAction,
                                recommendationReason: this.normalizeStringOrNull(entry.recommendation?.reasonLabel),
                            };
                        })
                            .sort((left, right) => {
                            if (left.nodeId !== null && right.nodeId !== null && left.nodeId !== right.nodeId) {
                                return left.nodeId - right.nodeId;
                            }
                            if (left.nodeId !== null && right.nodeId === null)
                                return -1;
                            if (left.nodeId === null && right.nodeId !== null)
                                return 1;
                            const leftId = left.homeyDeviceId ?? '';
                            const rightId = right.homeyDeviceId ?? '';
                            return leftId.localeCompare(rightId);
                        });
                        for (const entry of diagnostics.nodes) {
                            const recommendation = entry.recommendation && typeof entry.recommendation === 'object'
                                ? entry.recommendation
                                : null;
                            if (recommendation?.backfillNeeded === true) {
                                actionNeededNodes += 1;
                                backfillNeededNodes += 1;
                            }
                            else if (recommendation?.available === true) {
                                actionNeededNodes += 1;
                            }
                            const profileAttribution = this.normalizeProfileAttribution(entry);
                            if (profileAttribution.sourceCode === 'compiled+curation-override') {
                                overrideNodes += 1;
                            }
                            else if (profileAttribution.sourceCode === 'compiled-only') {
                                compiledOnlyNodes += 1;
                            }
                            else {
                                unresolvedNodes += 1;
                            }
                            if (profileAttribution.confidenceCode === 'curated')
                                confidenceCuratedNodes += 1;
                            else if (profileAttribution.confidenceCode === 'ha-derived')
                                confidenceHaDerivedNodes += 1;
                            else if (profileAttribution.confidenceCode === 'generic')
                                confidenceGenericNodes += 1;
                            else
                                confidenceUnknownNodes += 1;
                        }
                        importedNodes = importedNodeDetails.length;
                    }
                }
                catch (error) {
                    this.error('Failed to load runtime node diagnostics for import summary status', {
                        error,
                        bridgeId,
                    });
                    warnings.push('Unable to load imported-node count from runtime diagnostics.');
                }
            }
            const pendingImportNodes = typeof discoveredNodes === 'number' ? Math.max(discoveredNodes - importedNodes, 0) : null;
            if (!zwjs.transportConnected) {
                warnings.push('ZWJS transport is not connected; discovery/import counts may be stale.');
            }
            if (actionNeededNodes > 0) {
                warnings.push(`${actionNeededNodes} imported node(s) currently require runtime action.`);
            }
            if (unresolvedNodes > 0) {
                warnings.push(`${unresolvedNodes} imported node(s) have unresolved profile attribution.`);
            }
            if (typeof zwjs.reconnectAttempt === 'number' && zwjs.reconnectAttempt > 0) {
                warnings.push(`ZWJS reconnect attempts observed (${zwjs.reconnectAttempt}).`);
            }
            return {
                generatedAt: new Date().toISOString(),
                bridgeId,
                zwjs,
                discoveredNodes,
                importedNodes,
                pendingImportNodes,
                importedNodeDetails,
                actionNeededNodes,
                backfillNeededNodes,
                compiledOnlyNodes,
                overrideNodes,
                unresolvedNodes,
                confidenceCuratedNodes,
                confidenceHaDerivedNodes,
                confidenceGenericNodes,
                confidenceUnknownNodes,
                warnings,
            };
        }
        normalizeStringOrNull(value) {
            if (typeof value !== 'string')
                return null;
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        }
        toRecommendationAction(recommendation) {
            if (recommendation?.backfillNeeded === true)
                return 'backfill-marker';
            if (recommendation?.available === true)
                return 'adopt-recommended-baseline';
            return 'none';
        }
        buildProfileMatchSummary(profile) {
            const matchBy = this.normalizeStringOrNull(profile?.matchBy);
            const matchKey = this.normalizeStringOrNull(profile?.matchKey);
            if (!matchBy && !matchKey)
                return null;
            return `${matchBy ?? 'n/a'} / ${matchKey ?? 'n/a'}`;
        }
        describeProfileConfidenceLabel(confidence) {
            const normalized = typeof confidence === 'string' ? confidence.trim().toLowerCase() : '';
            if (normalized === 'curated')
                return 'Project rule match';
            if (normalized === 'ha-derived')
                return 'Home Assistant-derived rule match';
            if (normalized === 'generic')
                return 'Generic fallback rule';
            return 'Unknown rule match level';
        }
        normalizeProfileAttribution(entry) {
            if (entry.profileAttribution && typeof entry.profileAttribution === 'object') {
                const confidenceCode = this.normalizeStringOrNull(entry.profileAttribution.confidenceCode);
                const confidenceLabel = this.normalizeStringOrNull(entry.profileAttribution.confidenceLabel) ??
                    this.describeProfileConfidenceLabel(confidenceCode);
                const sourceCode = this.normalizeStringOrNull(entry.profileAttribution.sourceCode) ?? 'unresolved';
                const sourceLabel = this.normalizeStringOrNull(entry.profileAttribution.sourceLabel) ??
                    (sourceCode === 'compiled+curation-override'
                        ? 'Compiled profile + device override'
                        : sourceCode === 'compiled-only'
                            ? 'Compiled profile only'
                            : 'Profile resolution pending');
                return {
                    confidenceCode,
                    confidenceLabel,
                    sourceCode,
                    sourceLabel,
                };
            }
            const confidenceCode = this.normalizeStringOrNull(entry.profile?.confidence);
            const confidenceLabel = this.describeProfileConfidenceLabel(confidenceCode);
            const hasProfile = Boolean(this.normalizeStringOrNull(entry.profile?.profileId)) ||
                Boolean(this.normalizeStringOrNull(entry.profile?.fallbackReason));
            const sourceCode = hasProfile
                ? entry.curation?.entryPresent
                    ? 'compiled+curation-override'
                    : 'compiled-only'
                : 'unresolved';
            const sourceLabel = sourceCode === 'compiled+curation-override'
                ? 'Compiled profile + device override'
                : sourceCode === 'compiled-only'
                    ? 'Compiled profile only'
                    : 'Profile resolution pending';
            return {
                confidenceCode,
                confidenceLabel,
                sourceCode,
                sourceLabel,
            };
        }
        async withTimeout(promise, timeoutMs, label) {
            return await new Promise((resolve, reject) => {
                let settled = false;
                const timeoutHandle = setTimeout(() => {
                    if (settled)
                        return;
                    settled = true;
                    reject(new Error(`${label} timed out after ${timeoutMs}ms`));
                }, timeoutMs);
                promise.then((value) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timeoutHandle);
                    resolve(value);
                }, (error) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timeoutHandle);
                    reject(error);
                });
            });
        }
        async runWithConcurrencyLimit(items, limit, worker) {
            const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
            let index = 0;
            const runWorker = async () => {
                while (true) {
                    const currentIndex = index;
                    index += 1;
                    if (currentIndex >= items.length)
                        return;
                    await worker(items[currentIndex]);
                }
            };
            await Promise.all(Array.from({ length: safeLimit }, () => runWorker()));
        }
        extractZoneNames(source) {
            const valuesToScan = [];
            if (Array.isArray(source)) {
                valuesToScan.push(...source);
            }
            else if (source && typeof source === 'object') {
                const objectSource = source;
                if (Array.isArray(objectSource.zones))
                    valuesToScan.push(...objectSource.zones);
                if (objectSource.zones && typeof objectSource.zones === 'object') {
                    valuesToScan.push(...Object.values(objectSource.zones));
                }
                valuesToScan.push(...Object.values(objectSource));
            }
            const uniqueNames = new Set();
            for (const value of valuesToScan) {
                if (!value || typeof value !== 'object')
                    continue;
                const zone = value;
                if (typeof zone.name !== 'string')
                    continue;
                const trimmed = zone.name.trim();
                if (trimmed.length > 0)
                    uniqueNames.add(trimmed);
            }
            return [...uniqueNames];
        }
        async loadHomeyZoneNames() {
            const zonesManager = this.homey.zones;
            const getZones = typeof zonesManager?.getZones === 'function'
                ? zonesManager.getZones.bind(zonesManager)
                : undefined;
            if (typeof getZones === 'function') {
                try {
                    const zones = await new Promise((resolve, reject) => {
                        if (getZones.length >= 1) {
                            getZones((error, result) => {
                                if (error) {
                                    reject(error);
                                    return;
                                }
                                resolve(result ?? {});
                            });
                            return;
                        }
                        Promise.resolve(getZones())
                            .then((result) => resolve(result ?? {}))
                            .catch((error) => reject(error));
                    });
                    const names = this.extractZoneNames(zones);
                    if (names.length > 0)
                        return names;
                }
                catch (error) {
                    this.error('Failed to load Homey zones via manager during node pairing', { error });
                }
            }
            return [];
        }
        async onPairListDevices() {
            this.log('Node pair list requested');
            const app = this.homey.app;
            const runtime = this.resolveBridgeRuntime(app);
            const client = runtime.client;
            if (!client) {
                this.error('Node pair list unavailable: ZWJS client is not connected. Configure zwjs_connection.url in app settings and pair a bridge first.');
                return [];
            }
            let latestCandidates = [];
            const runPairFlow = async () => {
                const bridgeId = runtime.bridgeId;
                const existingData = this.getDevices().map((device) => {
                    return device.getData();
                });
                const existingNodeIds = (0, pairing_1.collectExistingNodeIdsFromData)(existingData, bridgeId);
                let nodes = [];
                try {
                    const nodeListResult = await this.withTimeout(client.getNodeList(), _a.PAIR_NODE_LIST_TIMEOUT_MS, 'node list lookup');
                    nodes = Array.isArray(nodeListResult?.nodes) ? nodeListResult.nodes : [];
                }
                catch (error) {
                    this.error('Failed to load node list during pairing', {
                        error,
                    });
                    return [];
                }
                let knownZoneNames = [];
                try {
                    knownZoneNames = await this.withTimeout(this.loadHomeyZoneNames(), _a.PAIR_ZONE_LOOKUP_TIMEOUT_MS, 'zone lookup');
                }
                catch (error) {
                    this.error('Timed out loading Homey zones during node pairing; continuing without zone hints', {
                        error,
                    });
                    knownZoneNames = [];
                }
                const candidates = (0, pairing_1.buildNodePairCandidates)(nodes, bridgeId, existingNodeIds, undefined, {
                    knownZoneNames,
                    pairIconDriverId: 'node',
                });
                latestCandidates = candidates;
                if (app.resolveCompiledProfileEntry) {
                    try {
                        await this.withTimeout(this.runWithConcurrencyLimit(candidates, _a.PAIR_ICON_INFERENCE_CONCURRENCY, async (candidate) => {
                            try {
                                const nodeStateResult = await this.withTimeout(client.getNodeState(candidate.data.nodeId), _a.PAIR_NODE_STATE_TIMEOUT_MS, `node ${candidate.data.nodeId} state lookup`);
                                if (!nodeStateResult.success)
                                    return;
                                const selector = (0, compiled_profiles_1.buildNodeResolverSelector)({ bridgeId, nodeId: candidate.data.nodeId }, nodeStateResult.result?.state);
                                const match = app.resolveCompiledProfileEntry?.(selector);
                                if (match?.by === 'none')
                                    return;
                                const homeyClass = (0, pairing_icons_1.normalizeHomeyClassForPairIcon)(match?.entry?.compiled?.profile?.classification?.homeyClass);
                                candidate.icon = (0, pairing_icons_1.resolveDriverPairIconForHomeyClass)(homeyClass, 'node');
                                candidate.store.inferredHomeyClass = homeyClass;
                            }
                            catch (error) {
                                this.error('Failed to infer node pairing icon', {
                                    bridgeId,
                                    nodeId: candidate.data.nodeId,
                                    error,
                                });
                            }
                        }), _a.PAIR_ICON_INFERENCE_TIMEOUT_MS, 'node icon inference');
                    }
                    catch (error) {
                        this.error('Node pairing icon inference timed out; returning candidates without inferred icons', {
                            error,
                            bridgeId,
                            candidates: candidates.length,
                        });
                    }
                }
                this.log('Node pair list generated', {
                    bridgeId,
                    discovered: nodes.length,
                    existing: existingNodeIds.size,
                    candidates: candidates.length,
                    knownZones: knownZoneNames.length,
                });
                const payload = candidates.map((candidate) => ({
                    name: candidate.name,
                    data: candidate.data,
                    store: candidate.store,
                }));
                return this.toSerializablePairPayload(payload, 'node:onPairListDevices');
            };
            try {
                return await this.withTimeout(runPairFlow(), _a.PAIR_FLOW_TIMEOUT_MS, 'node pairing flow');
            }
            catch (error) {
                this.error('Node pairing flow failed; returning empty candidate list', {
                    error,
                });
                if (latestCandidates.length > 0) {
                    this.log('Node pairing flow failed after candidate discovery; returning partial pair list', {
                        candidates: latestCandidates.length,
                    });
                    return latestCandidates;
                }
                return [];
            }
        }
        async onRepair(session, device) {
            const app = this.homey.app;
            const homeyDeviceId = this.resolveHomeyDeviceId(device);
            const loadSnapshot = async () => {
                if (!homeyDeviceId) {
                    throw new Error('Device Tools unavailable: node device ID is missing.');
                }
                if (!app.getNodeDeviceToolsSnapshot) {
                    throw new Error('Device Tools unavailable: app runtime snapshot API is not ready.');
                }
                return app.getNodeDeviceToolsSnapshot({ homeyDeviceId });
            };
            const executeAction = async (payload) => {
                if (!homeyDeviceId) {
                    throw new Error('Device Tools unavailable: node device ID is missing.');
                }
                if (!app.executeRecommendationAction) {
                    throw new Error('Device Tools unavailable: recommendation action API is not ready.');
                }
                if (!app.getNodeDeviceToolsSnapshot) {
                    throw new Error('Device Tools unavailable: app runtime snapshot API is not ready.');
                }
                const actionSelection = this.parseActionSelection(payload);
                const actionResult = await app.executeRecommendationAction({
                    homeyDeviceId,
                    action: actionSelection,
                });
                const snapshot = await app.getNodeDeviceToolsSnapshot({ homeyDeviceId });
                return {
                    actionResult,
                    snapshot,
                };
            };
            this.registerTimedSessionHandler(session, 'device_tools:get_snapshot', _a.REPAIR_HANDLER_TIMEOUT_MS, 'node repair handler', async () => loadSnapshot());
            this.registerTimedSessionHandler(session, 'device_tools:refresh', _a.REPAIR_HANDLER_TIMEOUT_MS, 'node repair handler', async () => loadSnapshot());
            this.registerTimedSessionHandler(session, 'device_tools:execute_action', _a.REPAIR_HANDLER_TIMEOUT_MS, 'node repair handler', async (payload) => executeAction(payload));
        }
        resolveHomeyDeviceId(device) {
            const data = device.getData();
            if (!data || typeof data.id !== 'string')
                return null;
            const trimmed = data.id.trim();
            return trimmed.length > 0 ? trimmed : null;
        }
        parseActionSelection(payload) {
            if (!payload || typeof payload !== 'object')
                return 'auto';
            const { action } = payload;
            if (typeof action === 'undefined')
                return 'auto';
            if (typeof action !== 'string') {
                throw new Error('Invalid Device Tools action selection: action must be a string.');
            }
            const normalized = action.trim();
            const allowedSelections = [
                'auto',
                'backfill-marker',
                'adopt-recommended-baseline',
                'none',
            ];
            if (allowedSelections.includes(normalized)) {
                return normalized;
            }
            throw new Error('Invalid Device Tools action selection. Expected one of: auto, backfill-marker, adopt-recommended-baseline, none.');
        }
    },
    _a.PAIR_FLOW_TIMEOUT_MS = 12000,
    _a.PAIR_NODE_LIST_TIMEOUT_MS = 8000,
    _a.PAIR_ZONE_LOOKUP_TIMEOUT_MS = 1500,
    _a.PAIR_NODE_STATE_TIMEOUT_MS = 1000,
    _a.PAIR_ICON_INFERENCE_CONCURRENCY = 6,
    _a.PAIR_ICON_INFERENCE_TIMEOUT_MS = 7000,
    _a.PAIR_HANDLER_TIMEOUT_MS = 15000,
    _a.REPAIR_HANDLER_TIMEOUT_MS = 15000,
    _a);

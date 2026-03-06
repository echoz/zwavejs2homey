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
        async onInit() {
            this.log('NodeDriver initialized');
        }
        async onPair(session) {
            this.log('Node pair session started');
            session.setHandler('list_devices', async () => {
                this.log('Node pair list requested');
                return await this.onPairListDevices();
            });
            session.setHandler('import_summary:get_status', async () => {
                return this.loadImportSummaryStatus();
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
            if (app.getNodeRuntimeDiagnostics) {
                try {
                    const diagnostics = await app.getNodeRuntimeDiagnostics();
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
            return {
                generatedAt: new Date().toISOString(),
                bridgeId,
                zwjs,
                discoveredNodes,
                importedNodes,
                pendingImportNodes,
                importedNodeDetails,
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
            const app = this.homey.app;
            const runtime = this.resolveBridgeRuntime(app);
            const client = runtime.client;
            if (!client) {
                throw new Error('ZWJS client unavailable. Configure zwjs_connection.url in app settings and connect a bridge first.');
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
                                candidate.icon = (0, pairing_icons_1.resolvePairIconForHomeyClass)(homeyClass);
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
                return candidates;
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
            session.setHandler('device_tools:get_snapshot', async () => loadSnapshot());
            session.setHandler('device_tools:refresh', async () => loadSnapshot());
            session.setHandler('device_tools:execute_action', async (payload) => executeAction(payload));
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
    _a);

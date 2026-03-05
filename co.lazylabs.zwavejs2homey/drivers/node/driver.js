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
            const client = app.getZwjsClient?.();
            if (!client) {
                throw new Error('ZWJS client unavailable. Configure zwjs_connection.url in app settings and connect a bridge first.');
            }
            let latestCandidates = [];
            const runPairFlow = async () => {
                const bridgeId = app.getBridgeId?.() ?? pairing_1.ZWJS_DEFAULT_BRIDGE_ID;
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

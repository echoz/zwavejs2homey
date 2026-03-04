"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const compiled_profiles_1 = require("../../compiled-profiles");
const pairing_1 = require("../../pairing");
const pairing_icons_1 = require("../../pairing-icons");
module.exports = class NodeDriver extends homey_1.default.Driver {
    async onInit() {
        this.log('NodeDriver initialized');
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
    async loadHomeyZoneNamesFromApi() {
        const api = this.homey.api;
        const get = api?.get;
        if (typeof get !== 'function')
            return [];
        const requestPaths = ['manager/zones/zone', '/manager/zones/zone'];
        let lastError;
        for (const requestPath of requestPaths) {
            try {
                const response = await new Promise((resolve, reject) => {
                    if (get.length >= 2) {
                        get(requestPath, (error, result) => {
                            if (error) {
                                reject(error);
                                return;
                            }
                            resolve(result);
                        });
                        return;
                    }
                    Promise.resolve(get(requestPath))
                        .then((result) => resolve(result))
                        .catch((error) => reject(error));
                });
                const names = this.extractZoneNames(response);
                if (names.length > 0)
                    return names;
            }
            catch (error) {
                lastError = error;
            }
        }
        if (lastError) {
            this.error('Failed to load Homey zones via Manager API during node pairing', {
                error: lastError,
            });
        }
        return [];
    }
    async loadHomeyZoneNames() {
        const zonesManager = this.homey.zones;
        const getZones = zonesManager?.getZones;
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
        return this.loadHomeyZoneNamesFromApi();
    }
    async onPairListDevices() {
        const app = this.homey.app;
        const client = app.getZwjsClient?.();
        if (!client) {
            throw new Error('ZWJS client unavailable. Verify bridge connection settings.');
        }
        const bridgeId = app.getBridgeId?.() ?? pairing_1.ZWJS_DEFAULT_BRIDGE_ID;
        const existingData = this.getDevices().map((device) => {
            return device.getData();
        });
        const existingNodeIds = (0, pairing_1.collectExistingNodeIdsFromData)(existingData, bridgeId);
        const { nodes } = await client.getNodeList();
        const knownZoneNames = await this.loadHomeyZoneNames();
        const candidates = (0, pairing_1.buildNodePairCandidates)(nodes, bridgeId, existingNodeIds, undefined, {
            knownZoneNames,
        });
        for (const candidate of candidates) {
            if (!app.resolveCompiledProfileEntry)
                continue;
            try {
                const nodeStateResult = await client.getNodeState(candidate.data.nodeId);
                if (!nodeStateResult.success)
                    continue;
                const selector = (0, compiled_profiles_1.buildNodeResolverSelector)({ bridgeId, nodeId: candidate.data.nodeId }, nodeStateResult.result?.state);
                const match = app.resolveCompiledProfileEntry(selector);
                if (match?.by === 'none')
                    continue;
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
        }
        this.log('Node pair list generated', {
            bridgeId,
            discovered: nodes.length,
            existing: existingNodeIds.size,
            candidates: candidates.length,
            knownZones: knownZoneNames.length,
        });
        return candidates;
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
};

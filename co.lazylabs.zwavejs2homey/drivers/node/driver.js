"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const pairing_1 = require("../../pairing");
module.exports = class NodeDriver extends homey_1.default.Driver {
    async onInit() {
        this.log('NodeDriver initialized');
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
        const candidates = (0, pairing_1.buildNodePairCandidates)(nodes, bridgeId, existingNodeIds);
        this.log('Node pair list generated', {
            bridgeId,
            discovered: nodes.length,
            existing: existingNodeIds.size,
            candidates: candidates.length,
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

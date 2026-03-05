"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const pairing_1 = require("../../pairing");
module.exports = class BridgeDriver extends homey_1.default.Driver {
    async onInit() {
        this.log('BridgeDriver initialized');
    }
    hasBridgeDeviceAlreadyPaired() {
        const existingData = this.getDevices().map((device) => device.getData());
        return (0, pairing_1.hasBridgePairDeviceFromData)(existingData);
    }
    async onPairListDevices() {
        if (this.hasBridgeDeviceAlreadyPaired()) {
            this.log('Bridge device already paired, returning empty pair list');
            return [];
        }
        return [(0, pairing_1.createBridgePairCandidate)()];
    }
    async onRepair(session, device) {
        const app = this.homey.app;
        const loadSnapshot = async () => {
            if (!app.getNodeRuntimeDiagnostics) {
                throw new Error('Bridge Tools unavailable: app runtime diagnostics API is not ready.');
            }
            const diagnostics = await app.getNodeRuntimeDiagnostics();
            const nodeSummary = {
                total: diagnostics.nodes.length,
                curationEntryCount: 0,
                recommendationAvailableCount: 0,
                recommendationBackfillCount: 0,
                inboundSkipped: 0,
                outboundSkipped: 0,
            };
            const nodes = diagnostics.nodes.map((node) => {
                if (node.curation.entryPresent)
                    nodeSummary.curationEntryCount += 1;
                if (node.recommendation.available)
                    nodeSummary.recommendationAvailableCount += 1;
                if (node.recommendation.backfillNeeded)
                    nodeSummary.recommendationBackfillCount += 1;
                const inboundSkipped = Math.max(node.mapping.inboundConfigured - node.mapping.inboundEnabled, 0);
                const outboundSkipped = Math.max(node.mapping.outboundConfigured - node.mapping.outboundEnabled, 0);
                nodeSummary.inboundSkipped += inboundSkipped;
                nodeSummary.outboundSkipped += outboundSkipped;
                return {
                    homeyDeviceId: node.homeyDeviceId,
                    nodeId: node.nodeId,
                    curation: node.curation,
                    profile: node.profile,
                    recommendation: node.recommendation,
                    mapping: {
                        inboundConfigured: node.mapping.inboundConfigured,
                        inboundEnabled: node.mapping.inboundEnabled,
                        outboundConfigured: node.mapping.outboundConfigured,
                        outboundEnabled: node.mapping.outboundEnabled,
                        inboundSkipped,
                        outboundSkipped,
                    },
                };
            });
            const data = device.getData();
            const homeyDeviceId = typeof data?.id === 'string' && data.id.trim().length > 0 ? data.id.trim() : null;
            const bridgeId = typeof data?.bridgeId === 'string' && data.bridgeId.trim().length > 0
                ? data.bridgeId.trim()
                : diagnostics.bridgeId;
            return {
                schemaVersion: 'bridge-device-tools/v1',
                generatedAt: new Date().toISOString(),
                device: {
                    homeyDeviceId,
                    bridgeId,
                },
                runtime: {
                    zwjs: diagnostics.zwjs,
                    compiledProfiles: diagnostics.compiledProfiles,
                    curation: diagnostics.curation,
                },
                nodeSummary,
                nodes,
            };
        };
        session.setHandler('bridge_tools:get_snapshot', async () => loadSnapshot());
        session.setHandler('bridge_tools:refresh', async () => loadSnapshot());
    }
};

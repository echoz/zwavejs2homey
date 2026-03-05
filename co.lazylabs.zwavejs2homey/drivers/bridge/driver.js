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
    normalizeProfileAttribution(node) {
        if (node.profileAttribution && typeof node.profileAttribution === 'object') {
            return node.profileAttribution;
        }
        const confidenceCode = node.profile.confidence ?? null;
        const confidenceLabel = this.describeProfileConfidenceLabel(confidenceCode);
        const sourceCode = node.profile.profileId || node.profile.fallbackReason
            ? node.curation.entryPresent
                ? 'compiled+curation-override'
                : 'compiled-only'
            : 'unresolved';
        const sourceLabel = sourceCode === 'compiled+curation-override'
            ? 'Compiled profile + device override'
            : sourceCode === 'compiled-only'
                ? 'Compiled profile only'
                : 'Profile resolution pending';
        const summary = sourceCode === 'compiled+curation-override'
            ? `${confidenceLabel}; device override present`
            : sourceCode === 'compiled-only'
                ? `${confidenceLabel}; no device override`
                : 'Profile resolution is pending; runtime defaults are active';
        return {
            confidenceCode,
            confidenceLabel,
            sourceCode,
            sourceLabel,
            summary,
            curationEntryPresent: node.curation.entryPresent,
        };
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
                profileResolvedCount: 0,
                profilePendingCount: 0,
                readyCount: 0,
                failedCount: 0,
                curationEntryCount: 0,
                curationAppliedActions: 0,
                curationSkippedActions: 0,
                curationErrorCount: 0,
                recommendationAvailableCount: 0,
                recommendationBackfillCount: 0,
                capabilityCount: 0,
                inboundSkipped: 0,
                outboundSkipped: 0,
                skipReasons: {},
            };
            const nodes = diagnostics.nodes.map((node) => {
                const nodeState = node.node && typeof node.node === 'object'
                    ? node.node
                    : {
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
                    };
                const sync = node.sync && typeof node.sync === 'object'
                    ? node.sync
                    : {
                        syncedAt: null,
                        syncReason: null,
                    };
                const curation = {
                    loaded: node.curation.loaded === true,
                    source: node.curation.source ?? null,
                    error: node.curation.error ?? null,
                    entryPresent: node.curation.entryPresent === true,
                    appliedActions: Number.isInteger(node.curation.appliedActions)
                        ? node.curation.appliedActions
                        : 0,
                    skippedActions: Number.isInteger(node.curation.skippedActions)
                        ? node.curation.skippedActions
                        : 0,
                    errorCount: Number.isInteger(node.curation.errorCount) ? node.curation.errorCount : 0,
                };
                const profile = {
                    matchBy: node.profile.matchBy ?? null,
                    matchKey: node.profile.matchKey ?? null,
                    profileId: node.profile.profileId ?? null,
                    fallbackReason: node.profile.fallbackReason ?? null,
                    homeyClass: node.profile.homeyClass ?? null,
                    confidence: node.profile.confidence ?? null,
                    uncurated: node.profile.uncurated === true,
                };
                const skipReasons = node.mapping.skipReasons && typeof node.mapping.skipReasons === 'object'
                    ? node.mapping.skipReasons
                    : {};
                const mapping = {
                    verticalSliceApplied: node.mapping.verticalSliceApplied === true,
                    capabilityCount: Number.isInteger(node.mapping.capabilityCount)
                        ? node.mapping.capabilityCount
                        : 0,
                    inboundConfigured: Number.isInteger(node.mapping.inboundConfigured)
                        ? node.mapping.inboundConfigured
                        : 0,
                    inboundEnabled: Number.isInteger(node.mapping.inboundEnabled)
                        ? node.mapping.inboundEnabled
                        : 0,
                    outboundConfigured: Number.isInteger(node.mapping.outboundConfigured)
                        ? node.mapping.outboundConfigured
                        : 0,
                    outboundEnabled: Number.isInteger(node.mapping.outboundEnabled)
                        ? node.mapping.outboundEnabled
                        : 0,
                    skipReasons,
                };
                if (profile.profileId || profile.fallbackReason)
                    nodeSummary.profileResolvedCount += 1;
                else
                    nodeSummary.profilePendingCount += 1;
                if (nodeState.ready === true)
                    nodeSummary.readyCount += 1;
                if (nodeState.isFailed === true)
                    nodeSummary.failedCount += 1;
                if (curation.entryPresent)
                    nodeSummary.curationEntryCount += 1;
                nodeSummary.curationAppliedActions += curation.appliedActions;
                nodeSummary.curationSkippedActions += curation.skippedActions;
                nodeSummary.curationErrorCount += curation.errorCount;
                if (node.recommendation.available)
                    nodeSummary.recommendationAvailableCount += 1;
                if (node.recommendation.backfillNeeded)
                    nodeSummary.recommendationBackfillCount += 1;
                nodeSummary.capabilityCount += mapping.capabilityCount;
                const inboundSkipped = Math.max(mapping.inboundConfigured - mapping.inboundEnabled, 0);
                const outboundSkipped = Math.max(mapping.outboundConfigured - mapping.outboundEnabled, 0);
                nodeSummary.inboundSkipped += inboundSkipped;
                nodeSummary.outboundSkipped += outboundSkipped;
                for (const [reason, count] of Object.entries(mapping.skipReasons)) {
                    if (typeof count !== 'number' || count <= 0)
                        continue;
                    nodeSummary.skipReasons[reason] = (nodeSummary.skipReasons[reason] ?? 0) + count;
                }
                return {
                    homeyDeviceId: node.homeyDeviceId,
                    nodeId: node.nodeId,
                    node: nodeState,
                    sync,
                    curation,
                    profile,
                    profileAttribution: this.normalizeProfileAttribution(node),
                    recommendation: {
                        available: node.recommendation.available,
                        reason: node.recommendation.reason,
                        reasonLabel: node.recommendation.reasonLabel ?? null,
                        backfillNeeded: node.recommendation.backfillNeeded,
                    },
                    mapping: {
                        verticalSliceApplied: mapping.verticalSliceApplied,
                        capabilityCount: mapping.capabilityCount,
                        inboundConfigured: mapping.inboundConfigured,
                        inboundEnabled: mapping.inboundEnabled,
                        inboundSkipped,
                        outboundConfigured: mapping.outboundConfigured,
                        outboundEnabled: mapping.outboundEnabled,
                        outboundSkipped,
                        skipReasons: mapping.skipReasons,
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

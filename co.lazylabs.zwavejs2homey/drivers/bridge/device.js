"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
module.exports = class BridgeDevice extends homey_1.default.Device {
    static toBooleanOption(options, key) {
        if (!options || typeof options !== 'object')
            return null;
        const value = options[key];
        if (typeof value === 'undefined')
            return null;
        return typeof value === 'boolean' ? value : null;
    }
    static toStringOption(options, key) {
        if (!options || typeof options !== 'object')
            return null;
        const value = options[key];
        if (typeof value !== 'string')
            return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    static toActionOption(options) {
        const value = BridgeDevice.toStringOption(options, 'action');
        if (!value)
            return null;
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
    getRuntimeApp() {
        return this.homey.app;
    }
    resolveBridgeRuntime(app) {
        const session = app.getBridgeSession?.();
        const bridgeId = (typeof session?.bridgeId === 'string' && session.bridgeId.trim().length > 0
            ? session.bridgeId.trim()
            : undefined) ??
            app.getBridgeId?.() ??
            'unknown';
        const client = session?.getZwjsClient?.() ?? app.getZwjsClient?.();
        return { bridgeId, client };
    }
    async refreshRuntimeDiagnostics(reason) {
        const app = this.getRuntimeApp();
        const diagnostics = await app.getNodeRuntimeDiagnostics?.();
        if (!diagnostics)
            return;
        let recommendationAvailableCount = 0;
        let recommendationBackfillCount = 0;
        let curationEntryCount = 0;
        let inboundSkipped = 0;
        let outboundSkipped = 0;
        for (const node of diagnostics.nodes) {
            if (node.recommendation.available)
                recommendationAvailableCount += 1;
            if (node.recommendation.backfillNeeded)
                recommendationBackfillCount += 1;
            if (node.curation.entryPresent)
                curationEntryCount += 1;
            inboundSkipped += node.mapping.inboundSkipped;
            outboundSkipped += node.mapping.outboundSkipped;
        }
        await this.setStoreValue('runtimeDiagnostics', {
            refreshedAt: new Date().toISOString(),
            reason,
            generatedAt: diagnostics.generatedAt,
            bridgeId: diagnostics.bridgeId,
            zwjs: diagnostics.zwjs,
            compiledProfiles: {
                loaded: diagnostics.compiledProfiles.loaded,
                sourcePath: diagnostics.compiledProfiles.sourcePath,
                generatedAt: diagnostics.compiledProfiles.generatedAt,
                pipelineFingerprint: diagnostics.compiledProfiles.pipelineFingerprint,
                entryCount: diagnostics.compiledProfiles.entryCount,
                errorMessage: diagnostics.compiledProfiles.errorMessage,
            },
            curation: {
                loaded: diagnostics.curation.loaded,
                source: diagnostics.curation.source,
                entryCount: diagnostics.curation.entryCount,
                errorMessage: diagnostics.curation.errorMessage,
            },
            nodeSummary: {
                total: diagnostics.nodes.length,
                curationEntryCount,
                recommendationAvailableCount,
                recommendationBackfillCount,
                inboundSkipped,
                outboundSkipped,
            },
        });
    }
    async getRuntimeDiagnostics(options) {
        const app = this.getRuntimeApp();
        const homeyDeviceId = BridgeDevice.toStringOption(options, 'homeyDeviceId');
        return app.getNodeRuntimeDiagnostics?.({
            homeyDeviceId: homeyDeviceId ?? undefined,
        });
    }
    async getRecommendationActionQueue(options) {
        const app = this.getRuntimeApp();
        const homeyDeviceId = BridgeDevice.toStringOption(options, 'homeyDeviceId');
        const includeNoAction = BridgeDevice.toBooleanOption(options, 'includeNoAction');
        return app.getRecommendationActionQueue?.({
            homeyDeviceId: homeyDeviceId ?? undefined,
            includeNoAction: includeNoAction === true,
        });
    }
    async executeRecommendationAction(options) {
        const app = this.getRuntimeApp();
        const homeyDeviceId = BridgeDevice.toStringOption(options, 'homeyDeviceId');
        if (!homeyDeviceId) {
            throw new Error('Invalid homeyDeviceId for recommendation action');
        }
        const action = BridgeDevice.toActionOption(options);
        if (typeof options.action !== 'undefined' && !action) {
            throw new Error('Invalid recommendation action');
        }
        const result = await app.executeRecommendationAction?.({
            homeyDeviceId,
            action: action ?? undefined,
        });
        await this.refreshRuntimeDiagnostics('recommendation-action-executed');
        return result;
    }
    async executeRecommendationActions(options) {
        const app = this.getRuntimeApp();
        const homeyDeviceId = BridgeDevice.toStringOption(options, 'homeyDeviceId');
        const includeNoAction = BridgeDevice.toBooleanOption(options, 'includeNoAction');
        const result = await app.executeRecommendationActions?.({
            homeyDeviceId: homeyDeviceId ?? undefined,
            includeNoAction: includeNoAction === true,
        });
        await this.refreshRuntimeDiagnostics('recommendation-actions-executed');
        return result;
    }
    async onInit() {
        const app = this.getRuntimeApp();
        const runtime = this.resolveBridgeRuntime(app);
        const bridgeId = runtime.bridgeId;
        const status = runtime.client?.getStatus();
        this.log('BridgeDevice initialized', {
            bridgeId,
            transportConnected: status?.transportConnected === true,
            lifecycle: status?.lifecycle ?? 'stopped',
        });
        await this.refreshRuntimeDiagnostics('init');
    }
    async onRuntimeDiagnosticsRefresh(reason = 'runtime-refresh') {
        await this.refreshRuntimeDiagnostics(reason);
    }
    async onAdded() {
        this.log('BridgeDevice paired');
    }
    async onSettings({ oldSettings: _oldSettings, newSettings: _newSettings, changedKeys, }) {
        this.log('BridgeDevice settings changed', { changedKeys });
    }
    async onRenamed(newName) {
        this.log('BridgeDevice renamed', { newName });
    }
    async onDeleted() {
        this.log('BridgeDevice deleted');
    }
};

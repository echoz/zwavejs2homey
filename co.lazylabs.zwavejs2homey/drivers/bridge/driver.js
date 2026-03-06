"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const pairing_1 = require("../../pairing");
module.exports = (_a = class BridgeDriver extends homey_1.default.Driver {
        async onInit() {
            this.log('BridgeDriver initialized');
        }
        hasBridgeDeviceAlreadyPaired() {
            const existingData = this.getDevices().map((device) => device.getData());
            return (0, pairing_1.hasBridgePairDeviceFromData)(existingData);
        }
        async onPairListDevices() {
            this.log('Bridge pair list requested');
            try {
                if (this.hasBridgeDeviceAlreadyPaired()) {
                    this.log('Bridge device already paired, returning empty pair list');
                    return [];
                }
                return [(0, pairing_1.createBridgePairCandidate)()];
            }
            catch (error) {
                this.error('Bridge pair list generation failed; returning fallback candidate', { error });
                return [(0, pairing_1.createBridgePairCandidate)()];
            }
        }
        async onPair(session) {
            const manifestPairViews = this.homey.manifest?.drivers?.find((driver) => driver && driver.id === 'bridge')?.pair ?? [];
            this.log('Bridge pair session started', {
                pairViews: Array.isArray(manifestPairViews)
                    ? manifestPairViews.map((view) => ({
                        id: view?.id,
                        template: view?.template,
                        next: view?.navigation?.next,
                        singular: view?.options?.singular === true,
                    }))
                    : [],
            });
            let listDevicesRequested = false;
            const listRequestWatchdog = setTimeout(() => {
                if (listDevicesRequested)
                    return;
                this.error('Bridge pair watchdog: Homey did not request list_devices in time', {
                    timeoutMs: _a.PAIR_LIST_REQUEST_WATCHDOG_MS,
                });
            }, _a.PAIR_LIST_REQUEST_WATCHDOG_MS);
            try {
                session.setHandler('list_devices', async () => {
                    listDevicesRequested = true;
                    clearTimeout(listRequestWatchdog);
                    try {
                        const candidates = await this.onPairListDevices();
                        this.log('Bridge pair list response ready', {
                            candidates: Array.isArray(candidates) ? candidates.length : 0,
                        });
                        return candidates;
                    }
                    catch (error) {
                        this.error('Bridge pair list handler failed; returning empty list', { error });
                        return [];
                    }
                });
                this.log('Bridge pair handler registered', { event: 'list_devices' });
            }
            catch (error) {
                this.error('Failed to register bridge pair handler', {
                    event: 'list_devices',
                    error,
                });
                throw error;
            }
            try {
                session.setHandler('next_steps:get_status', async () => {
                    return this.loadNextStepsStatus();
                });
                this.log('Bridge pair handler registered', { event: 'next_steps:get_status' });
            }
            catch (error) {
                this.error('Failed to register bridge pair handler; next steps panel will be unavailable', {
                    event: 'next_steps:get_status',
                    error,
                });
            }
            this.log('Bridge pair session ready');
        }
        resolveBridgeRuntime(app) {
            const session = app.getBridgeSession?.(pairing_1.ZWJS_DEFAULT_BRIDGE_ID);
            const bridgeId = (typeof session?.bridgeId === 'string' && session.bridgeId.trim().length > 0
                ? session.bridgeId.trim()
                : undefined) ??
                app.getBridgeId?.() ??
                pairing_1.ZWJS_DEFAULT_BRIDGE_ID;
            const client = session?.getZwjsClient?.() ?? app.getZwjsClient?.();
            return { bridgeId, client };
        }
        async loadNextStepsStatus() {
            const app = this.homey.app;
            const runtime = this.resolveBridgeRuntime(app);
            const client = runtime.client;
            const status = client?.getStatus?.();
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
            let discoveredNodes = null;
            const discoveredNodeNames = new Map();
            let importedNodes = null;
            let importedNodeDetails = [];
            let actionNeededNodes = 0;
            let backfillNeededNodes = 0;
            let compiledOnlyNodes = 0;
            let overrideNodes = 0;
            let unresolvedNodes = 0;
            let bridgeId = runtime.bridgeId;
            const warnings = [];
            if (client?.getNodeList) {
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
                    this.error('Failed to load node list for bridge next steps status', { error });
                    warnings.push('Unable to load node discovery status from ZWJS.');
                }
            }
            else {
                warnings.push('ZWJS client is unavailable; configure zwjs_connection.url in app settings.');
            }
            if (app.getNodeRuntimeDiagnostics) {
                try {
                    const diagnostics = await app.getNodeRuntimeDiagnostics();
                    if (diagnostics &&
                        typeof diagnostics.bridgeId === 'string' &&
                        diagnostics.bridgeId.trim().length > 0) {
                        bridgeId = diagnostics.bridgeId.trim();
                    }
                    if (Array.isArray(diagnostics.nodes)) {
                        importedNodeDetails = diagnostics.nodes
                            .filter((node) => {
                            const nodeBridgeId = this.normalizeStringOrNull(node.bridgeId);
                            if (!nodeBridgeId)
                                return true;
                            return nodeBridgeId === bridgeId;
                        })
                            .map((node) => {
                            const nodeId = typeof node.nodeId === 'number' && Number.isInteger(node.nodeId)
                                ? node.nodeId
                                : null;
                            return {
                                homeyDeviceId: this.normalizeStringOrNull(node.homeyDeviceId),
                                bridgeId: this.normalizeStringOrNull(node.bridgeId) ?? bridgeId,
                                nodeId,
                                name: nodeId !== null ? (discoveredNodeNames.get(nodeId) ?? null) : null,
                                manufacturer: this.normalizeStringOrNull(node.node?.manufacturer),
                                product: this.normalizeStringOrNull(node.node?.product),
                                location: this.normalizeStringOrNull(node.node?.location),
                                status: this.normalizeStringOrNull(node.node?.status),
                                profileHomeyClass: this.normalizeStringOrNull(node.profile?.homeyClass),
                                profileId: this.normalizeStringOrNull(node.profile?.profileId),
                                profileMatch: this.toProfileMatchSummary(node.profile),
                                ruleMatch: node.profileAttribution && typeof node.profileAttribution === 'object'
                                    ? this.normalizeStringOrNull(node.profileAttribution.confidenceLabel)
                                    : null,
                                profileSource: node.profileAttribution && typeof node.profileAttribution === 'object'
                                    ? this.normalizeStringOrNull(node.profileAttribution.sourceLabel)
                                    : null,
                                recommendationAction: this.toRecommendationAction(node.recommendation),
                                recommendationReason: this.normalizeStringOrNull(node.recommendation?.reasonLabel),
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
                        for (const node of diagnostics.nodes) {
                            const recommendation = node.recommendation && typeof node.recommendation === 'object'
                                ? node.recommendation
                                : null;
                            if (recommendation?.backfillNeeded === true) {
                                actionNeededNodes += 1;
                                backfillNeededNodes += 1;
                            }
                            else if (recommendation?.available === true) {
                                actionNeededNodes += 1;
                            }
                            const attribution = node.profileAttribution && typeof node.profileAttribution === 'object'
                                ? node.profileAttribution
                                : null;
                            let sourceCode = attribution && typeof attribution.sourceCode === 'string'
                                ? attribution.sourceCode
                                : null;
                            if (!sourceCode) {
                                const hasProfile = node.profile &&
                                    typeof node.profile === 'object' &&
                                    (this.normalizeStringOrNull(node.profile.profileId) ||
                                        this.normalizeStringOrNull(node.profile.fallbackReason));
                                const hasOverride = node.curation &&
                                    typeof node.curation === 'object' &&
                                    node.curation.entryPresent === true;
                                if (hasProfile) {
                                    sourceCode = hasOverride ? 'compiled+curation-override' : 'compiled-only';
                                }
                                else {
                                    sourceCode = 'unresolved';
                                }
                            }
                            if (sourceCode === 'compiled+curation-override')
                                overrideNodes += 1;
                            else if (sourceCode === 'compiled-only')
                                compiledOnlyNodes += 1;
                            else
                                unresolvedNodes += 1;
                        }
                        importedNodes = importedNodeDetails.length;
                    }
                    else {
                        importedNodes = 0;
                    }
                }
                catch (error) {
                    this.error('Failed to load imported node count for bridge next steps status', { error });
                    warnings.push('Unable to read imported node count from runtime diagnostics.');
                }
            }
            else {
                warnings.push('Runtime diagnostics are not ready yet.');
            }
            let pendingImportNodes = null;
            if (typeof discoveredNodes === 'number' && typeof importedNodes === 'number') {
                pendingImportNodes = Math.max(discoveredNodes - importedNodes, 0);
            }
            if (!zwjs.transportConnected) {
                warnings.push('ZWJS transport is not connected; node import list may be empty.');
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
                warnings,
            };
        }
        normalizeStringOrNull(value) {
            if (typeof value !== 'string')
                return null;
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        }
        toProfileMatchSummary(profile) {
            const matchBy = this.normalizeStringOrNull(profile.matchBy);
            const matchKey = this.normalizeStringOrNull(profile.matchKey);
            if (!matchBy && !matchKey)
                return null;
            return `${matchBy ?? 'n/a'} / ${matchKey ?? 'n/a'}`;
        }
        toRecommendationAction(recommendation) {
            if (recommendation.backfillNeeded)
                return 'backfill-marker';
            if (recommendation.available)
                return 'adopt-recommended-baseline';
            return 'none';
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
                    profileSourceCompiledOnlyCount: 0,
                    profileSourceOverrideCount: 0,
                    profileSourceUnresolvedCount: 0,
                    confidenceCuratedCount: 0,
                    confidenceHaDerivedCount: 0,
                    confidenceGenericCount: 0,
                    confidenceUnknownCount: 0,
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
                    const profileAttribution = this.normalizeProfileAttribution(node);
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
                    if (profileAttribution.sourceCode === 'compiled+curation-override') {
                        nodeSummary.profileSourceOverrideCount += 1;
                    }
                    else if (profileAttribution.sourceCode === 'compiled-only') {
                        nodeSummary.profileSourceCompiledOnlyCount += 1;
                    }
                    else {
                        nodeSummary.profileSourceUnresolvedCount += 1;
                    }
                    if (profileAttribution.confidenceCode === 'curated') {
                        nodeSummary.confidenceCuratedCount += 1;
                    }
                    else if (profileAttribution.confidenceCode === 'ha-derived') {
                        nodeSummary.confidenceHaDerivedCount += 1;
                    }
                    else if (profileAttribution.confidenceCode === 'generic') {
                        nodeSummary.confidenceGenericCount += 1;
                    }
                    else {
                        nodeSummary.confidenceUnknownCount += 1;
                    }
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
                        profileAttribution,
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
    },
    _a.PAIR_LIST_REQUEST_WATCHDOG_MS = 5000,
    _a);

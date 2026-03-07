"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const core_1 = require("@zwavejs2homey/core");
const compiled_profiles_1 = require("../../compiled-profiles");
const node_runtime_1 = require("../../node-runtime");
const curation_1 = require("../../curation");
function parseNumericIdentity(value) {
    if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) {
        return value;
    }
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return undefined;
    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
        const parsedHex = Number.parseInt(trimmed.slice(2), 16);
        return Number.isInteger(parsedHex) && Number.isFinite(parsedHex) ? parsedHex : undefined;
    }
    if (/^\d+$/.test(trimmed)) {
        const parsedDec = Number.parseInt(trimmed, 10);
        return Number.isInteger(parsedDec) && Number.isFinite(parsedDec) ? parsedDec : undefined;
    }
    return undefined;
}
function normalizeComparableValue(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return undefined;
}
function normalizeValueTypeHint(value) {
    if (typeof value !== 'string')
        return undefined;
    const normalizedType = value.trim();
    return normalizedType.length > 0 ? normalizedType : undefined;
}
function normalizeNodeText(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function formatProductLabel(description, label) {
    if (description && label) {
        if (description.includes(label))
            return description;
        return `${description} (${label})`;
    }
    return description ?? label;
}
function extractNodeStateSnapshot(nodeState) {
    const state = nodeState && typeof nodeState === 'object' ? nodeState : {};
    const deviceConfig = state.deviceConfig && typeof state.deviceConfig === 'object'
        ? state.deviceConfig
        : undefined;
    const manufacturer = normalizeNodeText(state.manufacturer) ?? normalizeNodeText(deviceConfig?.manufacturer);
    const product = normalizeNodeText(state.product) ??
        formatProductLabel(normalizeNodeText(deviceConfig?.description) ?? normalizeNodeText(state.productDescription), normalizeNodeText(deviceConfig?.label) ?? normalizeNodeText(state.productLabel));
    return {
        manufacturerId: parseNumericIdentity(state.manufacturerId) ?? null,
        productType: parseNumericIdentity(state.productType) ?? null,
        productId: parseNumericIdentity(state.productId) ?? null,
        manufacturer,
        product,
        location: normalizeNodeText(state.location),
        interviewStage: normalizeNodeText(state.interviewStage),
        status: normalizeNodeText(state.status),
        firmwareVersion: normalizeNodeText(state.firmwareVersion),
        ready: typeof state.ready === 'boolean' ? state.ready : null,
        isFailed: typeof state.isFailed === 'boolean' ? state.isFailed : null,
    };
}
function toValueIdLookupKey(valueId) {
    const commandClass = parseNumericIdentity(valueId.commandClass);
    const property = normalizeComparableValue(valueId.property);
    if (commandClass === undefined || property === undefined)
        return undefined;
    const endpoint = parseNumericIdentity(valueId.endpoint);
    const normalizedEndpoint = endpoint ?? 0;
    let propertyKey = '';
    if (valueId.propertyKey !== undefined) {
        const normalizedPropertyKey = normalizeComparableValue(valueId.propertyKey);
        if (normalizedPropertyKey === undefined)
            return undefined;
        propertyKey = normalizedPropertyKey;
    }
    return `${commandClass}|${normalizedEndpoint}|${property}|${propertyKey}`;
}
function cloneValueId(valueId) {
    const clone = {
        commandClass: valueId.commandClass,
        property: valueId.property,
    };
    if (valueId.endpoint !== undefined)
        clone.endpoint = valueId.endpoint;
    if (valueId.propertyKey !== undefined)
        clone.propertyKey = valueId.propertyKey;
    return clone;
}
module.exports = class NodeDevice extends homey_1.default.Device {
    constructor() {
        super(...arguments);
        this.zwjsEventUnsubscribers = [];
    }
    createMappingDiagnostic(slice) {
        return {
            capabilityId: slice.capabilityId,
            inbound: {
                configured: Boolean(slice.inboundSelector || slice.inboundEventSelector),
                enabled: false,
                reason: null,
                valueId: slice.inboundSelector ? cloneValueId(slice.inboundSelector) : null,
            },
            outbound: {
                configured: Boolean(slice.outboundTarget),
                enabled: false,
                reason: null,
                valueId: slice.outboundTarget ? cloneValueId(slice.outboundTarget) : null,
            },
        };
    }
    async loadNodeDefinedValueIndex(client, nodeId) {
        const index = new Map();
        const result = await client.getNodeDefinedValueIds(nodeId);
        if (!result.success) {
            this.error('NodeDevice failed to load node defined value IDs', {
                nodeId,
                error: result.error,
            });
            return index;
        }
        const valueIds = (0, core_1.extractZwjsDefinedValueIds)(result.result);
        for (const valueId of valueIds) {
            const key = toValueIdLookupKey(valueId);
            if (!key)
                continue;
            const existing = index.get(key);
            if (existing) {
                if (existing.readable === undefined && typeof valueId.readable === 'boolean') {
                    existing.readable = valueId.readable;
                }
                if (existing.writeable === undefined && typeof valueId.writeable === 'boolean') {
                    existing.writeable = valueId.writeable;
                }
                if (existing.type === undefined) {
                    const normalizedType = normalizeValueTypeHint(valueId.type);
                    if (normalizedType)
                        existing.type = normalizedType;
                }
                continue;
            }
            const normalizedType = normalizeValueTypeHint(valueId.type);
            index.set(key, {
                readable: typeof valueId.readable === 'boolean' ? valueId.readable : undefined,
                writeable: typeof valueId.writeable === 'boolean' ? valueId.writeable : undefined,
                type: normalizedType,
            });
        }
        return index;
    }
    getNodeDefinedValueFacts(valueIndex, valueId) {
        const key = toValueIdLookupKey(valueId);
        if (!key)
            return undefined;
        return valueIndex.get(key);
    }
    async resolveWriteabilityFromMetadata(client, nodeId, valueId, metadataWriteableCache) {
        const key = toValueIdLookupKey(valueId);
        if (!key)
            return null;
        if (metadataWriteableCache.has(key)) {
            return metadataWriteableCache.get(key) ?? null;
        }
        const metadataResult = await client.getNodeValueMetadata(nodeId, valueId);
        if (!metadataResult.success) {
            this.error('NodeDevice failed to read value metadata', {
                nodeId,
                valueId,
                error: metadataResult.error,
            });
            metadataWriteableCache.set(key, null);
            return null;
        }
        const metadata = metadataResult.result;
        if ((0, core_1.isZwjsNodeValueMetadataResult)(metadata) && typeof metadata.writeable === 'boolean') {
            metadataWriteableCache.set(key, metadata.writeable);
            return metadata.writeable;
        }
        let metadataRecord;
        if (metadata && typeof metadata === 'object') {
            metadataRecord = metadata;
        }
        if (metadataRecord && typeof metadataRecord.writeable === 'boolean') {
            const { writeable } = metadataRecord;
            metadataWriteableCache.set(key, writeable);
            return writeable;
        }
        metadataWriteableCache.set(key, null);
        return null;
    }
    getNodeContext() {
        const data = this.getData();
        const maybeGetId = this.getId;
        let fromHomeyApi;
        if (typeof maybeGetId === 'function') {
            const resolved = maybeGetId.call(this);
            if (typeof resolved === 'string' && resolved.trim().length > 0) {
                fromHomeyApi = resolved;
            }
        }
        let fromData;
        if (typeof data?.id === 'string') {
            const trimmed = data.id.trim();
            if (trimmed.length > 0)
                fromData = trimmed;
        }
        const homeyDeviceId = fromHomeyApi ?? fromData;
        return {
            bridgeId: data?.bridgeId ?? 'unknown',
            nodeId: typeof data?.nodeId === 'number' ? data.nodeId : undefined,
            homeyDeviceId,
        };
    }
    clearZwjsEventSubscriptions() {
        for (const unsubscribe of this.zwjsEventUnsubscribers) {
            unsubscribe();
        }
        this.zwjsEventUnsubscribers = [];
    }
    async applyCapabilityVerticalSlice(client, nodeId, slice, valueIndex, metadataWriteableCache) {
        const { capabilityId, inboundSelector, inboundEventSelector, inboundTransformRef, outboundTarget, outboundTransformRef, } = slice;
        const diagnostic = this.createMappingDiagnostic(slice);
        if (!this.hasCapability(capabilityId)) {
            if (diagnostic.inbound.configured) {
                diagnostic.inbound.reason = 'capability_missing_on_homey_device';
            }
            if (diagnostic.outbound.configured) {
                diagnostic.outbound.reason = 'capability_missing_on_homey_device';
            }
            return { applied: false, diagnostic };
        }
        let enabledInboundSelector;
        let enabledInboundEventType;
        let enabledInboundValueType;
        if (inboundSelector) {
            const facts = this.getNodeDefinedValueFacts(valueIndex, inboundSelector);
            if (!facts) {
                diagnostic.inbound.reason = 'inbound_selector_not_defined';
            }
            else if (facts.readable === false) {
                diagnostic.inbound.reason = 'inbound_selector_not_readable';
            }
            else {
                enabledInboundSelector = inboundSelector;
                enabledInboundValueType = facts.type;
                diagnostic.inbound.enabled = true;
            }
        }
        if (inboundEventSelector) {
            enabledInboundEventType = inboundEventSelector.eventType;
            diagnostic.inbound.enabled = true;
            diagnostic.inbound.reason = null;
        }
        let enabledOutboundTarget;
        let enabledOutboundValueType;
        if (outboundTarget) {
            const facts = this.getNodeDefinedValueFacts(valueIndex, outboundTarget);
            if (!facts) {
                diagnostic.outbound.reason = 'outbound_target_not_defined';
            }
            else {
                const { writeable: factsWriteable } = facts;
                let writeable = factsWriteable;
                if (writeable !== true) {
                    writeable = await this.resolveWriteabilityFromMetadata(client, nodeId, outboundTarget, metadataWriteableCache);
                }
                if (writeable === true) {
                    enabledOutboundTarget = outboundTarget;
                    enabledOutboundValueType = facts.type;
                    diagnostic.outbound.enabled = true;
                }
                else if (writeable === false) {
                    diagnostic.outbound.reason = 'outbound_target_not_writeable';
                }
                else {
                    diagnostic.outbound.reason = 'outbound_target_writeability_unknown';
                }
            }
        }
        if (enabledInboundSelector) {
            try {
                const valueResult = await client.getNodeValue(nodeId, enabledInboundSelector);
                if (!valueResult.success) {
                    this.error('NodeDevice failed to read inbound value', {
                        nodeId,
                        capabilityId,
                        error: valueResult.error,
                    });
                }
                else {
                    const nextValue = (0, node_runtime_1.coerceCapabilityInboundValue)(capabilityId, valueResult.result, inboundTransformRef, enabledInboundValueType);
                    if (nextValue !== undefined) {
                        await this.setCapabilityValue(capabilityId, nextValue);
                    }
                    else {
                        this.error('NodeDevice failed to coerce inbound value', {
                            nodeId,
                            capabilityId,
                            value: valueResult.result,
                        });
                    }
                }
            }
            catch (error) {
                this.error('NodeDevice failed to read inbound value', {
                    nodeId,
                    capabilityId,
                    error,
                });
            }
        }
        if (enabledOutboundTarget) {
            this.registerCapabilityListener(capabilityId, async (value) => {
                const outboundValue = (0, node_runtime_1.coerceCapabilityOutboundValue)(capabilityId, value, outboundTransformRef, enabledOutboundValueType);
                if (outboundValue === undefined) {
                    throw new Error(`${capabilityId} capability value is not supported for outbound mapping`);
                }
                const mutationResult = await client.setNodeValue({
                    nodeId,
                    valueId: enabledOutboundTarget,
                    value: outboundValue,
                });
                if (!mutationResult.success) {
                    throw new Error(`setNodeValue failed (${mutationResult.error.errorCode ?? 'unknown'})`);
                }
            });
        }
        if (enabledInboundSelector || enabledInboundEventType) {
            const unsubscribe = client.onEvent((event) => {
                const protocolEvent = event && typeof event === 'object' && 'event' in event ? event.event : undefined;
                const protocolNodeId = protocolEvent && typeof protocolEvent === 'object' && 'nodeId' in protocolEvent
                    ? protocolEvent.nodeId
                    : undefined;
                if (typeof protocolNodeId !== 'number' || protocolNodeId !== nodeId)
                    return;
                if (enabledInboundSelector && event.type === 'zwjs.event.node.value-updated') {
                    if (!(0, node_runtime_1.selectorMatchesNodeValueUpdatedEvent)(enabledInboundSelector, event.event))
                        return;
                    const nextValue = (0, node_runtime_1.coerceCapabilityInboundValue)(capabilityId, event.event.args?.newValue, inboundTransformRef, enabledInboundValueType);
                    if (nextValue === undefined)
                        return;
                    this.setCapabilityValue(capabilityId, nextValue).catch((error) => {
                        this.error('NodeDevice failed to apply value-updated event', {
                            nodeId,
                            capabilityId,
                            error,
                        });
                    });
                    return;
                }
                if (enabledInboundEventType && event.type === enabledInboundEventType) {
                    const nextValue = (0, node_runtime_1.coerceCapabilityInboundValue)(capabilityId, event, inboundTransformRef, enabledInboundValueType);
                    if (nextValue === undefined)
                        return;
                    this.setCapabilityValue(capabilityId, nextValue).catch((error) => {
                        this.error('NodeDevice failed to apply event-mapped inbound update', {
                            nodeId,
                            capabilityId,
                            eventType: enabledInboundEventType,
                            error,
                        });
                    });
                }
            });
            this.zwjsEventUnsubscribers.push(unsubscribe);
        }
        return {
            applied: Boolean(enabledInboundSelector || enabledOutboundTarget),
            diagnostic,
        };
    }
    async syncRuntimeMappings(syncReason) {
        const app = this.homey.app;
        const ctx = this.getNodeContext();
        const session = app.getBridgeSession?.(ctx.bridgeId);
        const client = session?.getZwjsClient?.() ?? app.getZwjsClient?.(ctx.bridgeId);
        const clientStatus = client?.getStatus();
        const resolverStatus = app.getCompiledProfilesStatus?.();
        const curationStatus = app.getCurationStatus?.();
        let selector;
        let match = { by: 'none' };
        let classification = (0, compiled_profiles_1.resolveNodeProfileClassification)(match, resolverStatus);
        let verticalSliceApplied = false;
        const mappingDiagnostics = [];
        let curationEntry;
        let curationReport = null;
        let recommendationState = null;
        let nodeStateSnapshot = extractNodeStateSnapshot(undefined);
        this.clearZwjsEventSubscriptions();
        if (ctx.nodeId !== undefined && client) {
            try {
                const nodeStateResult = await client.getNodeState(ctx.nodeId);
                if (nodeStateResult.success) {
                    nodeStateSnapshot = extractNodeStateSnapshot(nodeStateResult.result?.state);
                    const valueIndex = await this.loadNodeDefinedValueIndex(client, ctx.nodeId);
                    const metadataWriteableCache = new Map();
                    const nodeContext = {
                        bridgeId: ctx.bridgeId,
                        nodeId: ctx.nodeId,
                    };
                    selector = (0, compiled_profiles_1.buildNodeResolverSelector)(nodeContext, nodeStateResult.result?.state);
                    match = app.resolveCompiledProfileEntry?.(selector) ?? { by: 'none' };
                    classification = (0, compiled_profiles_1.resolveNodeProfileClassification)(match, resolverStatus);
                    if (match.entry) {
                        const baselineProfile = match.entry.compiled.profile;
                        let effectiveProfile = baselineProfile;
                        if (ctx.homeyDeviceId) {
                            curationEntry = app.resolveCurationEntry?.(ctx.homeyDeviceId);
                        }
                        recommendationState = (0, curation_1.evaluateBaselineRecommendationState)(baselineProfile, curationEntry, {
                            pipelineFingerprint: resolverStatus?.pipelineFingerprint ?? undefined,
                        });
                        if (curationEntry) {
                            const result = (0, curation_1.applyCurationEntryToProfile)(baselineProfile, curationEntry, {
                                homeyDeviceId: ctx.homeyDeviceId,
                            });
                            effectiveProfile = result.profile;
                            curationReport = result.report;
                        }
                        let effectiveClassification;
                        if (effectiveProfile && typeof effectiveProfile === 'object') {
                            effectiveClassification = effectiveProfile.classification;
                        }
                        if (effectiveClassification && typeof effectiveClassification === 'object') {
                            let homeyClass;
                            if (typeof effectiveClassification.homeyClass === 'string') {
                                homeyClass = effectiveClassification.homeyClass;
                            }
                            if (homeyClass) {
                                const nextClassification = {
                                    homeyClass,
                                    confidence: classification.classification.confidence,
                                    uncurated: classification.classification.uncurated,
                                };
                                const baseDriverTemplateId = classification.classification.driverTemplateId;
                                if (baseDriverTemplateId !== undefined) {
                                    nextClassification.driverTemplateId = baseDriverTemplateId;
                                }
                                if (typeof effectiveClassification.driverTemplateId === 'string') {
                                    nextClassification.driverTemplateId = effectiveClassification.driverTemplateId;
                                }
                                classification = {
                                    matchBy: classification.matchBy,
                                    matchKey: classification.matchKey,
                                    profileId: classification.profileId,
                                    fallbackReason: classification.fallbackReason,
                                    classification: nextClassification,
                                };
                            }
                        }
                        const mappingSlices = (0, node_runtime_1.extractCapabilityRuntimeVerticals)(effectiveProfile);
                        for (const mappingSlice of mappingSlices) {
                            const result = await this.applyCapabilityVerticalSlice(client, ctx.nodeId, mappingSlice, valueIndex, metadataWriteableCache);
                            mappingDiagnostics.push(result.diagnostic);
                            if (result.applied)
                                verticalSliceApplied = true;
                        }
                    }
                }
                else {
                    classification = {
                        matchBy: classification.matchBy,
                        matchKey: classification.matchKey,
                        profileId: classification.profileId,
                        classification: classification.classification,
                        fallbackReason: 'zwjs_node_state_unavailable',
                    };
                    this.error('NodeDevice failed to fetch node state', {
                        bridgeId: ctx.bridgeId,
                        nodeId: ctx.nodeId,
                        error: nodeStateResult.error,
                    });
                }
            }
            catch (error) {
                classification = {
                    matchBy: classification.matchBy,
                    matchKey: classification.matchKey,
                    profileId: classification.profileId,
                    classification: classification.classification,
                    fallbackReason: 'zwjs_node_state_error',
                };
                this.error('NodeDevice failed to fetch node state', {
                    bridgeId: ctx.bridgeId,
                    nodeId: ctx.nodeId,
                    error,
                });
            }
        }
        else if (!client) {
            classification = {
                matchBy: classification.matchBy,
                matchKey: classification.matchKey,
                profileId: classification.profileId,
                classification: classification.classification,
                fallbackReason: 'zwjs_client_unavailable',
            };
        }
        await this.setStoreValue('profileResolution', {
            resolvedAt: new Date().toISOString(),
            syncedAt: new Date().toISOString(),
            syncReason,
            homeyDeviceId: ctx.homeyDeviceId ?? null,
            nodeState: nodeStateSnapshot,
            selector: selector ?? null,
            matchBy: classification.matchBy,
            matchKey: classification.matchKey,
            profileId: classification.profileId,
            classification: classification.classification,
            fallbackReason: classification.fallbackReason,
            resolverLoaded: resolverStatus?.loaded === true,
            resolverSourcePath: resolverStatus?.sourcePath ?? null,
            resolverError: resolverStatus?.errorMessage ?? null,
            curationLoaded: curationStatus?.loaded === true,
            curationSource: curationStatus?.source ?? null,
            curationError: curationStatus?.errorMessage ?? null,
            curationEntryPresent: Boolean(curationEntry),
            curationReport,
            recommendationAvailable: recommendationState?.recommendationAvailable ?? false,
            recommendationReason: recommendationState?.recommendationReason ?? null,
            recommendationProjectionVersion: recommendationState?.projectionVersion ?? null,
            recommendationBackfillNeeded: recommendationState?.shouldBackfillMarker ?? false,
            currentBaselineHash: recommendationState?.currentMarker?.baselineProfileHash ?? null,
            currentBaselinePipelineFingerprint: recommendationState?.currentMarker?.pipelineFingerprint ?? null,
            storedBaselineHash: recommendationState?.storedMarker?.baselineProfileHash ?? null,
            storedBaselinePipelineFingerprint: recommendationState?.storedMarker?.pipelineFingerprint ?? null,
            verticalSliceApplied,
            manufacturerId: nodeStateSnapshot.manufacturerId,
            productType: nodeStateSnapshot.productType,
            productId: nodeStateSnapshot.productId,
            manufacturer: nodeStateSnapshot.manufacturer,
            product: nodeStateSnapshot.product,
            location: nodeStateSnapshot.location,
            interviewStage: nodeStateSnapshot.interviewStage,
            mappingDiagnostics,
        });
        this.log('NodeDevice initialized', {
            bridgeId: ctx.bridgeId,
            nodeId: ctx.nodeId,
            zwjsTransportConnected: clientStatus?.transportConnected === true,
            zwjsLifecycle: clientStatus?.lifecycle ?? 'stopped',
            syncReason,
            profileMatchBy: classification.matchBy,
            profileId: classification.profileId,
            fallbackReason: classification.fallbackReason,
            curationLoaded: curationStatus?.loaded === true,
            curationEntryPresent: Boolean(curationEntry),
            curationAppliedActions: curationReport?.summary.applied ?? 0,
            recommendationAvailable: recommendationState?.recommendationAvailable ?? false,
            recommendationReason: recommendationState?.recommendationReason ?? null,
            verticalSliceApplied,
            manufacturerId: nodeStateSnapshot.manufacturerId,
            productType: nodeStateSnapshot.productType,
            productId: nodeStateSnapshot.productId,
            manufacturer: nodeStateSnapshot.manufacturer,
            product: nodeStateSnapshot.product,
            location: nodeStateSnapshot.location,
            interviewStage: nodeStateSnapshot.interviewStage,
        });
    }
    async onInit() {
        await this.syncRuntimeMappings('init');
    }
    async onRuntimeMappingsRefresh(reason = 'runtime-refresh') {
        await this.syncRuntimeMappings(reason);
    }
    async onAdded() {
        const ctx = this.getNodeContext();
        this.log('NodeDevice paired', ctx);
    }
    async onSettings({ oldSettings: _oldSettings, newSettings: _newSettings, changedKeys, }) {
        this.log('NodeDevice settings changed', { changedKeys });
    }
    async onRenamed(newName) {
        this.log('NodeDevice renamed', { newName });
    }
    async onDeleted() {
        this.clearZwjsEventSubscriptions();
        const ctx = this.getNodeContext();
        this.log('NodeDevice deleted', ctx);
    }
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProfileBuildState = createProfileBuildState;
exports.applyDeviceIdentityRuleAction = applyDeviceIdentityRuleAction;
exports.addIgnoredValue = addIgnoredValue;
exports.applyCapabilityRuleAction = applyCapabilityRuleAction;
exports.removeCapabilityRuleAction = removeCapabilityRuleAction;
exports.materializeCapabilityPlans = materializeCapabilityPlans;
exports.resolveCapabilityConflicts = resolveCapabilityConflicts;
exports.materializeIgnoredValues = materializeIgnoredValues;
exports.materializeDeviceIdentity = materializeDeviceIdentity;
const layer_semantics_1 = require("./layer-semantics");
const CAPABILITY_FLAG_KEYS = [
    'readable',
    'writeable',
    'assumedState',
    'allowMulti',
    'entityRegistryEnabledDefault',
    'debounceMs',
];
function recordSuppressedAction(state, suppressed) {
    if (suppressed.mode === 'fill') {
        state.suppressedFillActionsCount += 1;
    }
    if (state.collectSuppressedActions) {
        state.suppressedActions.push(suppressed);
    }
}
function createProfileBuildState(options) {
    return {
        collectSuppressedActions: options?.collectSuppressedActions ?? true,
        suppressedFillActionsCount: 0,
        hasPotentialConflicts: false,
        appliedDeviceIdentityActions: new Set(),
        deviceIdentity: undefined,
        capabilities: new Map(),
        ignoredValues: new Map(),
        suppressedActions: [],
    };
}
function applyDeviceIdentityRuleAction(state, action, provenance) {
    const mode = (0, layer_semantics_1.normalizeRuleActionMode)(action.mode);
    (0, layer_semantics_1.assertRuleActionModeAllowedForLayer)(provenance.layer, mode);
    const existing = state.deviceIdentity;
    if (!existing) {
        state.deviceIdentity = {
            homeyClass: action.homeyClass,
            driverTemplateId: action.driverTemplateId,
            provenance: { ...provenance, action: mode },
            provenanceHistory: [{ ...provenance, action: mode }],
        };
        return 'created';
    }
    if (mode === 'fill') {
        let changed = false;
        if (existing.homeyClass === undefined && action.homeyClass !== undefined) {
            existing.homeyClass = action.homeyClass;
            changed = true;
        }
        else if (existing.homeyClass !== undefined && action.homeyClass !== undefined) {
            recordSuppressedAction(state, {
                slot: 'deviceIdentity.homeyClass',
                reason: 'occupied',
                mode,
                layer: provenance.layer,
                ruleId: provenance.ruleId,
            });
        }
        if (existing.driverTemplateId === undefined && action.driverTemplateId !== undefined) {
            existing.driverTemplateId = action.driverTemplateId;
            changed = true;
        }
        else if (existing.driverTemplateId !== undefined && action.driverTemplateId !== undefined) {
            recordSuppressedAction(state, {
                slot: 'deviceIdentity.driverTemplateId',
                reason: 'occupied',
                mode,
                layer: provenance.layer,
                ruleId: provenance.ruleId,
            });
        }
        if (changed) {
            existing.provenanceHistory.push({ ...provenance, action: mode });
            return 'updated';
        }
        return 'noop';
    }
    if (mode === 'augment') {
        if (existing.homeyClass === undefined)
            existing.homeyClass = action.homeyClass;
        if (existing.driverTemplateId === undefined)
            existing.driverTemplateId = action.driverTemplateId;
        existing.provenanceHistory.push({ ...provenance, action: mode });
        return 'updated';
    }
    const superseded = existing.provenanceHistory.map((p) => `${p.layer}:${p.ruleId}`);
    existing.homeyClass = action.homeyClass;
    existing.driverTemplateId = action.driverTemplateId;
    existing.provenance = { ...provenance, action: mode, supersedes: superseded };
    existing.provenanceHistory.push({ ...provenance, action: mode, supersedes: superseded });
    return 'replaced';
}
function valueIdKey(valueId) {
    return JSON.stringify([
        valueId.commandClass,
        valueId.endpoint ?? 0,
        valueId.property,
        valueId.propertyKey ?? null,
    ]);
}
function addIgnoredValue(state, valueId, provenance) {
    const key = valueIdKey(valueId);
    const existing = state.ignoredValues.get(key);
    if (existing) {
        existing.provenance.push({ ...provenance });
        return;
    }
    state.ignoredValues.set(key, {
        valueId: { ...valueId },
        provenance: [{ ...provenance }],
    });
}
function cloneInboundMapping(mapping) {
    return mapping
        ? {
            ...mapping,
            selector: 'eventType' in mapping.selector ? { ...mapping.selector } : { ...mapping.selector },
            watchers: mapping.watchers?.map((watcher) => 'eventType' in watcher ? { ...watcher } : { ...watcher }),
            transformParams: mapping.transformParams ? { ...mapping.transformParams } : undefined,
        }
        : undefined;
}
function cloneOutboundMapping(mapping) {
    return mapping
        ? {
            ...mapping,
            target: 'command' in mapping.target ? { ...mapping.target } : { ...mapping.target },
            transformParams: mapping.transformParams ? { ...mapping.transformParams } : undefined,
            validation: mapping.validation
                ? {
                    ...mapping.validation,
                    enum: mapping.validation.enum ? [...mapping.validation.enum] : undefined,
                }
                : undefined,
            executionHints: mapping.executionHints ? { ...mapping.executionHints } : undefined,
        }
        : undefined;
}
function mergeFlags(current, next) {
    if (!next)
        return current ? { ...current } : undefined;
    return { ...(current ?? {}), ...next };
}
function deriveDirectionality(action) {
    if (action.inboundMapping && action.outboundMapping)
        return 'bidirectional';
    if (action.outboundMapping)
        return 'outbound-only';
    return 'inbound-only';
}
function normalizeConflict(conflict) {
    if (!conflict)
        return undefined;
    return {
        key: conflict.key,
        mode: conflict.mode ?? 'exclusive',
        priority: conflict.priority ?? 50,
    };
}
function markPotentialConflictsFromConflict(state, conflict) {
    if (state.hasPotentialConflicts)
        return;
    if (conflict && conflict.mode !== 'allow-multi') {
        state.hasPotentialConflicts = true;
    }
}
function pushSuppressed(state, action, slot, mode, provenance) {
    recordSuppressedAction(state, {
        capabilityId: action.capabilityId,
        slot,
        reason: 'occupied',
        mode,
        layer: provenance.layer,
        ruleId: provenance.ruleId,
    });
}
function applyCapabilityRuleAction(state, action, provenance) {
    const mode = (0, layer_semantics_1.normalizeRuleActionMode)(action.mode);
    (0, layer_semantics_1.assertRuleActionModeAllowedForLayer)(provenance.layer, mode);
    const existing = state.capabilities.get(action.capabilityId);
    if (!existing) {
        if (mode === 'augment') {
            // Augment against missing target behaves as fill in v1.
        }
        const conflict = normalizeConflict(action.conflict);
        markPotentialConflictsFromConflict(state, conflict);
        state.capabilities.set(action.capabilityId, {
            capabilityId: action.capabilityId,
            conflict,
            inboundMapping: cloneInboundMapping(action.inboundMapping),
            outboundMapping: cloneOutboundMapping(action.outboundMapping),
            directionality: deriveDirectionality(action),
            flags: mergeFlags(undefined, action.flags),
            provenance: { ...provenance, action: mode },
            provenanceHistory: [{ ...provenance, action: mode }],
        });
        return 'created';
    }
    if (mode === 'fill') {
        let changed = false;
        if (!existing.inboundMapping && action.inboundMapping) {
            existing.inboundMapping = cloneInboundMapping(action.inboundMapping);
            changed = true;
        }
        else if (existing.inboundMapping && action.inboundMapping) {
            pushSuppressed(state, action, 'inboundMapping', mode, provenance);
        }
        if (!existing.outboundMapping && action.outboundMapping) {
            existing.outboundMapping = cloneOutboundMapping(action.outboundMapping);
            changed = true;
        }
        else if (existing.outboundMapping && action.outboundMapping) {
            pushSuppressed(state, action, 'outboundMapping', mode, provenance);
        }
        if (!existing.flags && action.flags) {
            existing.flags = mergeFlags(undefined, action.flags);
            changed = true;
        }
        else if (existing.flags && action.flags) {
            const missingKeys = CAPABILITY_FLAG_KEYS.filter((key) => action.flags?.[key] !== undefined && existing.flags?.[key] === undefined);
            if (missingKeys.length > 0) {
                existing.flags = mergeFlags(existing.flags, action.flags);
                changed = true;
            }
            else {
                pushSuppressed(state, action, 'flags', mode, provenance);
            }
        }
        if (!existing.conflict && action.conflict) {
            existing.conflict = normalizeConflict(action.conflict);
            markPotentialConflictsFromConflict(state, existing.conflict);
            changed = true;
        }
        else if (existing.conflict && action.conflict) {
            pushSuppressed(state, action, 'conflict', mode, provenance);
        }
        if (changed) {
            existing.directionality =
                existing.inboundMapping && existing.outboundMapping
                    ? 'bidirectional'
                    : existing.outboundMapping
                        ? 'outbound-only'
                        : 'inbound-only';
            existing.provenanceHistory.push({ ...provenance, action: mode });
            return 'updated';
        }
        return 'noop';
    }
    if (mode === 'augment') {
        const nextInbound = existing.inboundMapping && action.inboundMapping
            ? {
                ...existing.inboundMapping,
                watchers: [
                    ...(existing.inboundMapping.watchers ?? []),
                    ...(action.inboundMapping.watchers ?? []),
                ],
            }
            : (existing.inboundMapping ?? cloneInboundMapping(action.inboundMapping));
        const nextOutbound = existing.outboundMapping ?? cloneOutboundMapping(action.outboundMapping);
        const nextFlags = mergeFlags(existing.flags, action.flags);
        const nextConflict = existing.conflict ?? normalizeConflict(action.conflict);
        markPotentialConflictsFromConflict(state, nextConflict);
        existing.inboundMapping = nextInbound;
        existing.outboundMapping = nextOutbound;
        existing.flags = nextFlags;
        existing.conflict = nextConflict;
        existing.directionality =
            existing.inboundMapping && existing.outboundMapping
                ? 'bidirectional'
                : existing.outboundMapping
                    ? 'outbound-only'
                    : 'inbound-only';
        existing.provenanceHistory.push({ ...provenance, action: mode });
        return 'updated';
    }
    // replace
    const superseded = existing.provenanceHistory.map((p) => `${p.layer}:${p.ruleId}`);
    existing.inboundMapping = cloneInboundMapping(action.inboundMapping);
    existing.outboundMapping = cloneOutboundMapping(action.outboundMapping);
    existing.flags = mergeFlags(undefined, action.flags);
    existing.conflict = normalizeConflict(action.conflict);
    markPotentialConflictsFromConflict(state, existing.conflict);
    existing.directionality = deriveDirectionality(action);
    existing.provenance = { ...provenance, action: mode, supersedes: superseded };
    existing.provenanceHistory.push({ ...provenance, action: mode, supersedes: superseded });
    return 'replaced';
}
function removeCapabilityRuleAction(state, capabilityId) {
    return state.capabilities.delete(capabilityId);
}
function materializeCapabilityPlans(state) {
    return [...state.capabilities.values()]
        .map((cap) => ({
        capabilityId: cap.capabilityId,
        inboundMapping: cap.inboundMapping,
        outboundMapping: cap.outboundMapping,
        directionality: cap.directionality,
        flags: cap.flags,
        provenance: cap.provenance,
    }))
        .sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
}
function inboundSelectorKey(cap) {
    const mapping = cap.inboundMapping;
    if (!mapping)
        return null;
    if (mapping.kind === 'event') {
        return `event:${mapping.selector.eventType}`;
    }
    const selector = mapping.selector;
    return [
        'value',
        selector.commandClass,
        selector.endpoint ?? 0,
        String(selector.property),
        selector.propertyKey === undefined ? '' : String(selector.propertyKey),
    ].join(':');
}
const OVERLAP_LAYER_WEIGHT = {
    'project-product': 3,
    'ha-derived': 2,
    'project-generic': 1,
    'user-curation': 4,
};
function compareOverlapPriority(a, b) {
    const layerCmp = OVERLAP_LAYER_WEIGHT[b.provenance.layer] - OVERLAP_LAYER_WEIGHT[a.provenance.layer];
    if (layerCmp !== 0)
        return layerCmp;
    const prioA = a.conflict?.priority ?? 0;
    const prioB = b.conflict?.priority ?? 0;
    if (prioB !== prioA)
        return prioB - prioA;
    const ruleCmp = a.provenance.ruleId.localeCompare(b.provenance.ruleId);
    if (ruleCmp !== 0)
        return ruleCmp;
    return a.capabilityId.localeCompare(b.capabilityId);
}
function resolveCapabilityConflicts(state) {
    if (!state.hasPotentialConflicts) {
        return { suppressedCapabilities: [] };
    }
    const buckets = new Map();
    for (const cap of state.capabilities.values()) {
        const selectorKey = inboundSelectorKey(cap);
        if (!selectorKey || !cap.conflict)
            continue;
        if (cap.conflict.mode === 'allow-multi')
            continue;
        const bucketKey = `${selectorKey}::${cap.conflict.key}`;
        const arr = buckets.get(bucketKey) ?? [];
        arr.push(cap);
        buckets.set(bucketKey, arr);
    }
    const suppressed = [];
    for (const [bucketKey, caps] of buckets.entries()) {
        if (caps.length < 2)
            continue;
        const sep = bucketKey.indexOf('::');
        const selectorKey = sep >= 0 ? bucketKey.slice(0, sep) : bucketKey;
        const sorted = [...caps].sort(compareOverlapPriority);
        const winner = sorted[0];
        const conflictKey = winner.conflict?.key ?? 'unknown';
        for (const loser of sorted.slice(1)) {
            state.capabilities.delete(loser.capabilityId);
            suppressed.push({
                capabilityId: loser.capabilityId,
                winnerCapabilityId: winner.capabilityId,
                selectorKey,
                conflictKey,
                reason: `conflict-exclusive:${conflictKey}`,
            });
            recordSuppressedAction(state, {
                capabilityId: loser.capabilityId,
                slot: 'conflict',
                reason: 'occupied',
                mode: loser.provenance.action,
                layer: loser.provenance.layer,
                ruleId: loser.provenance.ruleId,
            });
        }
    }
    return { suppressedCapabilities: suppressed };
}
function materializeIgnoredValues(state) {
    return [...state.ignoredValues.values()]
        .map((entry) => ({ ...entry.valueId }))
        .sort((a, b) => {
        if (a.commandClass !== b.commandClass)
            return a.commandClass - b.commandClass;
        const aEp = a.endpoint ?? 0;
        const bEp = b.endpoint ?? 0;
        if (aEp !== bEp)
            return aEp - bEp;
        const aProp = String(a.property);
        const bProp = String(b.property);
        if (aProp !== bProp)
            return aProp.localeCompare(bProp);
        return String(a.propertyKey ?? '').localeCompare(String(b.propertyKey ?? ''));
    });
}
function materializeDeviceIdentity(state) {
    if (!state.deviceIdentity)
        return undefined;
    return {
        homeyClass: state.deviceIdentity.homeyClass,
        driverTemplateId: state.deviceIdentity.driverTemplateId,
        provenance: state.deviceIdentity.provenance,
    };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileDevice = compileDevice;
const apply_rule_1 = require("./apply-rule");
const layer_semantics_1 = require("./layer-semantics");
const rule_matcher_1 = require("./rule-matcher");
const profile_build_state_1 = require("./profile-build-state");
const ruleLayerOrder = (0, layer_semantics_1.getRuleLayerOrder)();
const ruleLayerRank = new Map(ruleLayerOrder.map((layer, index) => [layer, index]));
const sortedRulesCache = new WeakMap();
const SUMMARY_SELECTOR_CACHE_MAX_ENTRIES = 1024;
const SUMMARY_SELECTOR_CACHE_ORDER_COMPACT_THRESHOLD = 256;
function pushIndex(indexMap, key, index) {
    const list = indexMap.get(key);
    if (list) {
        list.push(index);
        return;
    }
    indexMap.set(key, [index]);
}
function propertyTokenKey(value) {
    return `${typeof value}:${String(value)}`;
}
function uniqueTokens(tokens) {
    return [...new Set(tokens)];
}
function getMap2(map, key1, key2) {
    return map.get(key1)?.get(key2);
}
function getMap3(map, key1, key2, key3) {
    return map.get(key1)?.get(key2)?.get(key3);
}
function ensureMap2(map, key1) {
    const existing = map.get(key1);
    if (existing)
        return existing;
    const created = new Map();
    map.set(key1, created);
    return created;
}
function ensureMap3(map, key1, key2) {
    const nested = ensureMap2(map, key1);
    const existing = nested.get(key2);
    if (existing)
        return existing;
    const created = new Map();
    nested.set(key2, created);
    return created;
}
function pushSummaryBucket2(bucket, key1, key2, index) {
    const nested = ensureMap2(bucket, key1);
    const list = nested.get(key2);
    if (!list) {
        nested.set(key2, [index]);
        return;
    }
    if (list[list.length - 1] !== index) {
        list.push(index);
    }
}
function pushSummaryBucket3(bucket, key1, key2, key3, index) {
    const nested = ensureMap3(bucket, key1, key2);
    const list = nested.get(key3);
    if (!list) {
        nested.set(key3, [index]);
        return;
    }
    if (list[list.length - 1] !== index) {
        list.push(index);
    }
}
function resolveSummaryCandidateSeed(plan, valueId) {
    const commandClass = valueId.commandClass;
    const property = propertyTokenKey(valueId.property);
    const endpoint = valueId.endpoint ?? 0;
    const cached = getMap3(plan.summarySelectorCache, commandClass, property, endpoint);
    if (cached)
        return cached;
    const merged = [];
    let actionCount = 0;
    const mergeStamp = nextSummarySelectorMergeStamp(plan);
    const addIndices = (indices) => {
        if (!indices)
            return;
        for (const index of indices) {
            if (plan.summarySelectorMergeMarks[index] === mergeStamp)
                continue;
            plan.summarySelectorMergeMarks[index] = mergeStamp;
            merged.push(index);
            actionCount += plan.entries[index].actionCount;
        }
    };
    addIndices(getMap3(plan.summaryBucketCPE, commandClass, property, endpoint));
    addIndices(getMap2(plan.summaryBucketCP, commandClass, property));
    addIndices(getMap2(plan.summaryBucketCE, commandClass, endpoint));
    addIndices(plan.summaryBucketC.get(commandClass));
    addIndices(getMap2(plan.summaryBucketPE, property, endpoint));
    addIndices(plan.summaryBucketP.get(property));
    addIndices(plan.summaryBucketE.get(endpoint));
    addIndices(plan.summaryBucketAny);
    const selection = {
        indices: merged,
        actionCount,
    };
    if (plan.summarySelectorCacheSize >= SUMMARY_SELECTOR_CACHE_MAX_ENTRIES) {
        while (plan.summarySelectorCacheSize >= SUMMARY_SELECTOR_CACHE_MAX_ENTRIES) {
            const oldest = plan.summarySelectorCacheOrder[plan.summarySelectorCacheOrderHead];
            if (!oldest) {
                plan.summarySelectorCache.clear();
                plan.summarySelectorCacheOrder = [];
                plan.summarySelectorCacheOrderHead = 0;
                plan.summarySelectorCacheSize = 0;
                break;
            }
            plan.summarySelectorCacheOrderHead += 1;
            const [oldestCommandClass, oldestProperty, oldestEndpoint] = oldest;
            const cacheByProperty = plan.summarySelectorCache.get(oldestCommandClass);
            const cacheByEndpoint = cacheByProperty?.get(oldestProperty);
            if (cacheByEndpoint && cacheByEndpoint.delete(oldestEndpoint)) {
                plan.summarySelectorCacheSize -= 1;
            }
            if (cacheByEndpoint && cacheByEndpoint.size === 0) {
                cacheByProperty?.delete(oldestProperty);
            }
            if (cacheByProperty && cacheByProperty.size === 0) {
                plan.summarySelectorCache.delete(oldestCommandClass);
            }
        }
        if (plan.summarySelectorCacheOrderHead >= SUMMARY_SELECTOR_CACHE_ORDER_COMPACT_THRESHOLD &&
            plan.summarySelectorCacheOrderHead * 2 >= plan.summarySelectorCacheOrder.length) {
            plan.summarySelectorCacheOrder = plan.summarySelectorCacheOrder.slice(plan.summarySelectorCacheOrderHead);
            plan.summarySelectorCacheOrderHead = 0;
        }
    }
    const cacheByProperty = ensureMap2(plan.summarySelectorCache, commandClass);
    const cacheByEndpoint = cacheByProperty.get(property) ??
        (() => {
            const created = new Map();
            cacheByProperty.set(property, created);
            return created;
        })();
    cacheByEndpoint.set(endpoint, selection);
    plan.summarySelectorCacheOrder.push([commandClass, property, endpoint]);
    plan.summarySelectorCacheSize += 1;
    return selection;
}
function resolveEligibleSummaryCandidateSeed(plan, valueId, deviceIneligibleMask, cache) {
    const commandClass = valueId.commandClass;
    const property = propertyTokenKey(valueId.property);
    const endpoint = valueId.endpoint ?? 0;
    const cached = getMap3(cache, commandClass, property, endpoint);
    if (cached)
        return cached;
    const seed = resolveSummaryCandidateSeed(plan, valueId);
    const eligibleIndices = [];
    let eligibleActionCount = 0;
    for (const index of seed.indices) {
        if (deviceIneligibleMask[index] === 1)
            continue;
        eligibleIndices.push(index);
        eligibleActionCount += plan.entries[index].actionCount;
    }
    const eligibleSeed = {
        indices: eligibleIndices,
        actionCount: eligibleActionCount,
    };
    const cacheByProperty = ensureMap2(cache, commandClass);
    const cacheByEndpoint = cacheByProperty.get(property) ??
        (() => {
            const created = new Map();
            cacheByProperty.set(property, created);
            return created;
        })();
    cacheByEndpoint.set(endpoint, eligibleSeed);
    return eligibleSeed;
}
function buildRuleExecutionPlan(rules) {
    const sortedRules = [...rules].sort((a, b) => {
        const aRank = ruleLayerRank.get(a.layer) ?? Number.MAX_SAFE_INTEGER;
        const bRank = ruleLayerRank.get(b.layer) ?? Number.MAX_SAFE_INTEGER;
        return aRank - bRank;
    });
    const entries = sortedRules.map((rule) => ({
        rule,
        actionCount: rule.actions.length,
        unmatchedTemplates: rule.actions.map((action) => ({
            ruleId: rule.ruleId,
            actionType: action.type,
            applied: false,
            reason: 'rule-not-matched',
            layer: rule.layer,
        })),
    }));
    const commandClassWildcardIndices = [];
    const byCommandClass = new Map();
    const propertyWildcardIndices = [];
    const byProperty = new Map();
    const endpointWildcardIndices = [];
    const byEndpoint = new Map();
    const summaryBucketCPE = new Map();
    const summaryBucketCP = new Map();
    const summaryBucketCE = new Map();
    const summaryBucketC = new Map();
    const summaryBucketPE = new Map();
    const summaryBucketP = new Map();
    const summaryBucketE = new Map();
    const summaryBucketAny = [];
    const summarySelectorCache = new Map();
    const summarySelectorCacheOrder = [];
    const summarySelectorMergeMarks = new Uint32Array(entries.length);
    const summarySelectorMergeStamp = 0;
    const deviceEligibilityRuleIndices = [];
    let summarySelectorCacheOrderHead = 0;
    let summarySelectorCacheSize = 0;
    let totalActionCountPerValue = 0;
    for (const [index, entry] of entries.entries()) {
        const matcher = entry.rule.value;
        const constraints = entry.rule.constraints;
        if (entry.rule.device ||
            (constraints?.requiredValues && constraints.requiredValues.length > 0) ||
            (constraints?.absentValues && constraints.absentValues.length > 0)) {
            deviceEligibilityRuleIndices.push(index);
        }
        totalActionCountPerValue += entry.actionCount;
        const commandClasses = matcher?.commandClass;
        if (!commandClasses || commandClasses.length === 0) {
            commandClassWildcardIndices.push(index);
        }
        else {
            for (const commandClass of commandClasses) {
                pushIndex(byCommandClass, commandClass, index);
            }
        }
        const properties = matcher?.property;
        if (!properties || properties.length === 0) {
            propertyWildcardIndices.push(index);
        }
        else {
            for (const property of properties) {
                pushIndex(byProperty, propertyTokenKey(property), index);
            }
        }
        const endpoints = matcher?.endpoint;
        if (!endpoints || endpoints.length === 0) {
            endpointWildcardIndices.push(index);
        }
        else {
            for (const endpoint of endpoints) {
                pushIndex(byEndpoint, endpoint, index);
            }
        }
    }
    for (const [index, entry] of entries.entries()) {
        const matcher = entry.rule.value;
        const commandClasses = matcher?.commandClass ? uniqueTokens(matcher.commandClass) : undefined;
        const properties = matcher?.property
            ? uniqueTokens(matcher.property.map((property) => propertyTokenKey(property)))
            : undefined;
        const endpoints = matcher?.endpoint ? uniqueTokens(matcher.endpoint) : undefined;
        if (!commandClasses && !properties && !endpoints) {
            if (summaryBucketAny[summaryBucketAny.length - 1] !== index) {
                summaryBucketAny.push(index);
            }
            continue;
        }
        if (commandClasses && properties && endpoints) {
            for (const commandClass of commandClasses) {
                for (const property of properties) {
                    for (const endpoint of endpoints) {
                        pushSummaryBucket3(summaryBucketCPE, commandClass, property, endpoint, index);
                    }
                }
            }
            continue;
        }
        if (commandClasses && properties) {
            for (const commandClass of commandClasses) {
                for (const property of properties) {
                    pushSummaryBucket2(summaryBucketCP, commandClass, property, index);
                }
            }
            continue;
        }
        if (commandClasses && endpoints) {
            for (const commandClass of commandClasses) {
                for (const endpoint of endpoints) {
                    pushSummaryBucket2(summaryBucketCE, commandClass, endpoint, index);
                }
            }
            continue;
        }
        if (properties && endpoints) {
            for (const property of properties) {
                for (const endpoint of endpoints) {
                    pushSummaryBucket2(summaryBucketPE, property, endpoint, index);
                }
            }
            continue;
        }
        if (commandClasses) {
            for (const commandClass of commandClasses) {
                pushIndex(summaryBucketC, commandClass, index);
            }
            continue;
        }
        if (properties) {
            for (const property of properties) {
                pushIndex(summaryBucketP, property, index);
            }
            continue;
        }
        if (endpoints) {
            for (const endpoint of endpoints) {
                pushIndex(summaryBucketE, endpoint, index);
            }
        }
    }
    return {
        entries,
        commandClassWildcardIndices,
        byCommandClass,
        summaryBucketCPE,
        summaryBucketCP,
        summaryBucketCE,
        summaryBucketC,
        summaryBucketPE,
        summaryBucketP,
        summaryBucketE,
        summaryBucketAny,
        summarySelectorCache,
        summarySelectorCacheOrder,
        summarySelectorCacheOrderHead,
        summarySelectorCacheSize,
        summarySelectorMergeMarks,
        summarySelectorMergeStamp,
        deviceEligibilityRuleIndices,
        propertyWildcardIndices,
        byProperty,
        endpointWildcardIndices,
        byEndpoint,
        totalActionCountPerValue,
    };
}
function resolveRuleExecutionPlan(rules) {
    const cached = sortedRulesCache.get(rules);
    if (cached && cached.sourceLength === rules.length)
        return cached.plan;
    const plan = buildRuleExecutionPlan(rules);
    sortedRulesCache.set(rules, { sourceLength: rules.length, plan });
    return plan;
}
function createCandidateScratch(length) {
    return {
        commandClassMarks: new Uint32Array(length),
        propertyMarks: new Uint32Array(length),
        endpointMarks: new Uint32Array(length),
        stamp: 0,
    };
}
function nextScratchStamp(scratch) {
    if (scratch.stamp >= 0xffffffff) {
        scratch.commandClassMarks.fill(0);
        scratch.propertyMarks.fill(0);
        scratch.endpointMarks.fill(0);
        scratch.stamp = 1;
        return scratch.stamp;
    }
    scratch.stamp += 1;
    return scratch.stamp;
}
function nextSummarySelectorMergeStamp(plan) {
    if (plan.summarySelectorMergeStamp >= 0xffffffff) {
        plan.summarySelectorMergeMarks.fill(0);
        plan.summarySelectorMergeStamp = 1;
        return plan.summarySelectorMergeStamp;
    }
    plan.summarySelectorMergeStamp += 1;
    return plan.summarySelectorMergeStamp;
}
function markIndices(marks, indices, stamp) {
    for (const index of indices) {
        marks[index] = stamp;
    }
}
function markCandidatesForValue(plan, scratch, valueId) {
    const stamp = nextScratchStamp(scratch);
    markIndices(scratch.commandClassMarks, plan.commandClassWildcardIndices, stamp);
    markIndices(scratch.commandClassMarks, plan.byCommandClass.get(valueId.commandClass) ?? [], stamp);
    markIndices(scratch.propertyMarks, plan.propertyWildcardIndices, stamp);
    markIndices(scratch.propertyMarks, plan.byProperty.get(propertyTokenKey(valueId.property)) ?? [], stamp);
    markIndices(scratch.endpointMarks, plan.endpointWildcardIndices, stamp);
    markIndices(scratch.endpointMarks, plan.byEndpoint.get(valueId.endpoint ?? 0) ?? [], stamp);
    return stamp;
}
function isRuleCandidate(scratch, index, stamp) {
    return (scratch.commandClassMarks[index] === stamp &&
        scratch.propertyMarks[index] === stamp &&
        scratch.endpointMarks[index] === stamp);
}
function pushUnmatchedActions(actions, entry, valueId, counters) {
    for (const template of entry.unmatchedTemplates) {
        actions.push({
            ...template,
            valueId,
        });
    }
    counters.unmatchedActions += entry.unmatchedTemplates.length;
    counters.totalActions += entry.unmatchedTemplates.length;
}
function pushAppliedRuleResults(actions, entry, valueId, results, counters) {
    for (const result of results) {
        actions.push({
            ...result,
            layer: entry.rule.layer,
            valueId,
        });
        counters.totalActions += 1;
        if (result.applied && result.changed !== false) {
            counters.appliedActions += 1;
            if (entry.rule.layer === 'project-product') {
                counters.appliedProjectProductActions += 1;
            }
        }
        if (result.reason === 'rule-not-matched') {
            counters.unmatchedActions += 1;
        }
    }
}
function buildDeviceEligibility(device, plan) {
    let ineligibleMask;
    let hasIneligibleRules = false;
    for (const index of plan.deviceEligibilityRuleIndices) {
        const entry = plan.entries[index];
        const eligible = (0, rule_matcher_1.matchesDevice)(device, entry.rule.device) &&
            (0, rule_matcher_1.matchesRuleCompanionConstraints)(device, entry.rule);
        if (!eligible) {
            if (!ineligibleMask) {
                ineligibleMask = new Uint8Array(plan.entries.length);
            }
            ineligibleMask[index] = 1;
            hasIneligibleRules = true;
        }
    }
    return {
        ineligibleMask,
        hasIneligibleRules,
    };
}
function compileDevice(device, rules, options) {
    const includeActions = options?.reportMode !== 'summary';
    const state = (0, profile_build_state_1.createProfileBuildState)({ collectSuppressedActions: includeActions });
    const executionPlan = resolveRuleExecutionPlan(rules);
    const deviceEligibility = buildDeviceEligibility(device, executionPlan);
    const actions = [];
    const counters = {
        appliedActions: 0,
        unmatchedActions: 0,
        totalActions: 0,
        appliedProjectProductActions: 0,
    };
    if (!includeActions) {
        counters.totalActions = executionPlan.totalActionCountPerValue * device.values.length;
        if (deviceEligibility.hasIneligibleRules) {
            const deviceIneligibleMask = deviceEligibility.ineligibleMask;
            if (!deviceIneligibleMask) {
                throw new Error('device eligibility mask missing for ineligible-rule summary path');
            }
            const eligibleSummarySelectorCache = new Map();
            for (const value of device.values) {
                const eligibleSummarySeed = resolveEligibleSummaryCandidateSeed(executionPlan, value.valueId, deviceIneligibleMask, eligibleSummarySelectorCache);
                let unmatchedForValue = executionPlan.totalActionCountPerValue - eligibleSummarySeed.actionCount;
                for (const index of eligibleSummarySeed.indices) {
                    const entry = executionPlan.entries[index];
                    const summaryResult = (0, apply_rule_1.applyRuleToValueSummaryAssumingDeviceEligible)(state, value, entry.rule);
                    if (!summaryResult.matched) {
                        unmatchedForValue += summaryResult.actionCount;
                        continue;
                    }
                    counters.appliedActions += summaryResult.appliedChangedActions;
                    if (entry.rule.layer === 'project-product') {
                        counters.appliedProjectProductActions += summaryResult.appliedChangedActions;
                    }
                }
                counters.unmatchedActions += unmatchedForValue;
            }
        }
        else {
            for (const value of device.values) {
                const summarySeed = resolveSummaryCandidateSeed(executionPlan, value.valueId);
                let unmatchedForValue = executionPlan.totalActionCountPerValue - summarySeed.actionCount;
                for (const index of summarySeed.indices) {
                    const entry = executionPlan.entries[index];
                    const summaryResult = (0, apply_rule_1.applyRuleToValueSummaryAssumingDeviceEligible)(state, value, entry.rule);
                    if (!summaryResult.matched) {
                        unmatchedForValue += summaryResult.actionCount;
                        continue;
                    }
                    counters.appliedActions += summaryResult.appliedChangedActions;
                    if (entry.rule.layer === 'project-product') {
                        counters.appliedProjectProductActions += summaryResult.appliedChangedActions;
                    }
                }
                counters.unmatchedActions += unmatchedForValue;
            }
        }
    }
    else {
        const candidateScratch = createCandidateScratch(executionPlan.entries.length);
        const valueIdSnapshots = device.values.map((value) => 
        // Reused across many emitted action records; frozen to prevent accidental cross-record mutation.
        Object.freeze({ ...value.valueId }));
        if (deviceEligibility.hasIneligibleRules) {
            const deviceIneligibleMask = deviceEligibility.ineligibleMask;
            if (!deviceIneligibleMask) {
                throw new Error('device eligibility mask missing for ineligible-rule full-report path');
            }
            for (const [valueIndex, value] of device.values.entries()) {
                const candidateStamp = markCandidatesForValue(executionPlan, candidateScratch, value.valueId);
                const valueIdSnapshot = valueIdSnapshots[valueIndex];
                for (const [index, entry] of executionPlan.entries.entries()) {
                    if (deviceIneligibleMask[index] === 1 ||
                        !isRuleCandidate(candidateScratch, index, candidateStamp)) {
                        pushUnmatchedActions(actions, entry, valueIdSnapshot, counters);
                        continue;
                    }
                    const results = (0, apply_rule_1.applyRuleToValueAssumingDeviceEligible)(state, value, entry.rule);
                    pushAppliedRuleResults(actions, entry, valueIdSnapshot, results, counters);
                }
            }
        }
        else {
            for (const [valueIndex, value] of device.values.entries()) {
                const candidateStamp = markCandidatesForValue(executionPlan, candidateScratch, value.valueId);
                const valueIdSnapshot = valueIdSnapshots[valueIndex];
                for (const [index, entry] of executionPlan.entries.entries()) {
                    if (!isRuleCandidate(candidateScratch, index, candidateStamp)) {
                        pushUnmatchedActions(actions, entry, valueIdSnapshot, counters);
                        continue;
                    }
                    const results = (0, apply_rule_1.applyRuleToValueAssumingDeviceEligible)(state, value, entry.rule);
                    pushAppliedRuleResults(actions, entry, valueIdSnapshot, results, counters);
                }
            }
        }
    }
    const overlap = (0, profile_build_state_1.resolveCapabilityConflicts)(state);
    return {
        deviceIdentity: (0, profile_build_state_1.materializeDeviceIdentity)(state),
        capabilities: (0, profile_build_state_1.materializeCapabilityPlans)(state),
        ignoredValues: (0, profile_build_state_1.materializeIgnoredValues)(state),
        report: {
            actions,
            suppressedActions: [...state.suppressedActions],
            summary: {
                appliedActions: counters.appliedActions,
                unmatchedActions: counters.unmatchedActions,
                totalActions: counters.totalActions,
                appliedProjectProductActions: counters.appliedProjectProductActions,
                suppressedFillActions: state.suppressedFillActionsCount,
                ignoredValues: state.ignoredValues.size,
            },
            ...(overlap.suppressedCapabilities.length > 0
                ? {
                    overlapPolicy: overlap,
                }
                : {}),
        },
    };
}

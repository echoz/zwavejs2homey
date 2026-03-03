"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyRuleToValue = applyRuleToValue;
exports.applyRuleToValueAssumingDeviceEligible = applyRuleToValueAssumingDeviceEligible;
exports.applyRuleToValueSummary = applyRuleToValueSummary;
exports.applyRuleToValueSummaryAssumingDeviceEligible = applyRuleToValueSummaryAssumingDeviceEligible;
const profile_build_state_1 = require("./profile-build-state");
const rule_matcher_1 = require("./rule-matcher");
const layer_semantics_1 = require("./layer-semantics");
function ruleNotMatchedResults(rule) {
    return rule.actions.map((action) => ({
        ruleId: rule.ruleId,
        actionType: action.type,
        applied: false,
        reason: 'rule-not-matched',
    }));
}
function unmatchedSummaryResult(rule) {
    return {
        matched: false,
        actionCount: rule.actions.length,
        appliedChangedActions: 0,
    };
}
function applyMatchedRuleToValue(state, value, rule) {
    return rule.actions.map((action, actionIndex) => {
        const provenance = toProvenance(rule, action, value);
        if (action.type === 'capability') {
            const outcome = (0, profile_build_state_1.applyCapabilityRuleAction)(state, action, provenance);
            return {
                ruleId: rule.ruleId,
                actionType: action.type,
                applied: true,
                changed: outcome !== 'noop',
            };
        }
        if (action.type === 'device-identity') {
            const dedupeKey = `${rule.ruleId}:${actionIndex}:${value.valueId.commandClass}:${value.valueId.endpoint ?? 0}:${String(value.valueId.property)}:${String(value.valueId.propertyKey ?? '')}`;
            if (state.appliedDeviceIdentityActions.has(dedupeKey)) {
                return {
                    ruleId: rule.ruleId,
                    actionType: action.type,
                    applied: false,
                    changed: false,
                    reason: 'device-identity-already-applied',
                };
            }
            const outcome = (0, profile_build_state_1.applyDeviceIdentityRuleAction)(state, action, provenance);
            state.appliedDeviceIdentityActions.add(dedupeKey);
            return {
                ruleId: rule.ruleId,
                actionType: action.type,
                applied: true,
                changed: outcome !== 'noop',
            };
        }
        if (action.type === 'remove-capability') {
            return applyRemoveCapabilityAction(state, action, provenance);
        }
        const ignoreResult = applyIgnoreValueAction(state, action, provenance, value);
        return { ...ignoreResult, changed: true };
    });
}
function applyMatchedRuleToValueSummary(state, value, rule) {
    const actionCount = rule.actions.length;
    let appliedChangedActions = 0;
    for (const [actionIndex, action] of rule.actions.entries()) {
        const provenance = toProvenance(rule, action, value);
        if (action.type === 'capability') {
            const outcome = (0, profile_build_state_1.applyCapabilityRuleAction)(state, action, provenance);
            if (outcome !== 'noop') {
                appliedChangedActions += 1;
            }
            continue;
        }
        if (action.type === 'device-identity') {
            const dedupeKey = `${rule.ruleId}:${actionIndex}:${value.valueId.commandClass}:${value.valueId.endpoint ?? 0}:${String(value.valueId.property)}:${String(value.valueId.propertyKey ?? '')}`;
            if (state.appliedDeviceIdentityActions.has(dedupeKey)) {
                continue;
            }
            const outcome = (0, profile_build_state_1.applyDeviceIdentityRuleAction)(state, action, provenance);
            state.appliedDeviceIdentityActions.add(dedupeKey);
            if (outcome !== 'noop') {
                appliedChangedActions += 1;
            }
            continue;
        }
        if (action.type === 'remove-capability') {
            const removeMode = action.mode ?? 'replace';
            (0, layer_semantics_1.assertRuleActionModeAllowedForLayer)(provenance.layer, removeMode);
            if ((0, profile_build_state_1.removeCapabilityRuleAction)(state, action.capabilityId)) {
                appliedChangedActions += 1;
            }
            continue;
        }
        (0, profile_build_state_1.addIgnoredValue)(state, action.valueId ?? value.valueId, provenance);
        appliedChangedActions += 1;
    }
    return {
        matched: true,
        actionCount,
        appliedChangedActions,
    };
}
function toProvenance(rule, action, value) {
    const selector = value != null
        ? `cc=${value.valueId.commandClass},ep=${value.valueId.endpoint ?? 0},prop=${String(value.valueId.property)}`
        : undefined;
    return {
        layer: rule.layer,
        ruleId: rule.ruleId,
        action: action.type === 'remove-capability'
            ? (action.mode ?? 'replace')
            : (0, layer_semantics_1.normalizeRuleActionMode)(action.mode),
        sourceRef: rule.ruleId,
        reason: selector,
    };
}
function applyIgnoreValueAction(state, action, provenance, value) {
    (0, profile_build_state_1.addIgnoredValue)(state, action.valueId ?? value.valueId, provenance);
    return {
        ruleId: provenance.ruleId,
        actionType: 'ignore-value',
        applied: true,
    };
}
function applyRemoveCapabilityAction(state, action, provenance) {
    const mode = action.mode ?? 'replace';
    (0, layer_semantics_1.assertRuleActionModeAllowedForLayer)(provenance.layer, mode);
    const changed = (0, profile_build_state_1.removeCapabilityRuleAction)(state, action.capabilityId);
    return {
        ruleId: provenance.ruleId,
        actionType: 'remove-capability',
        applied: true,
        changed,
    };
}
function applyRuleToValue(state, device, value, rule) {
    if (!(0, rule_matcher_1.matchesRuleForValue)(device, value, rule)) {
        return ruleNotMatchedResults(rule);
    }
    return applyMatchedRuleToValue(state, value, rule);
}
function applyRuleToValueAssumingDeviceEligible(state, value, rule) {
    if (!(0, rule_matcher_1.matchesValueAfterSelectorGates)(value, rule.value)) {
        return ruleNotMatchedResults(rule);
    }
    return applyMatchedRuleToValue(state, value, rule);
}
function applyRuleToValueSummary(state, device, value, rule) {
    if (!(0, rule_matcher_1.matchesRuleForValue)(device, value, rule)) {
        return unmatchedSummaryResult(rule);
    }
    return applyMatchedRuleToValueSummary(state, value, rule);
}
function applyRuleToValueSummaryAssumingDeviceEligible(state, value, rule) {
    if (!(0, rule_matcher_1.matchesValueAfterSelectorGates)(value, rule.value)) {
        return unmatchedSummaryResult(rule);
    }
    return applyMatchedRuleToValueSummary(state, value, rule);
}

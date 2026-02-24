import type { ProvenanceRecord } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueFacts } from '../models/zwave-facts';
import type {
  CapabilityRuleAction,
  DeviceIdentityRuleAction,
  IgnoreValueRuleAction,
  MappingRule,
  RuleAction,
} from '../rules/types';
import {
  addIgnoredValue,
  applyCapabilityRuleAction,
  applyDeviceIdentityRuleAction,
  type ProfileBuildState,
} from './profile-build-state';
import { matchesRuleForValue } from './rule-matcher';
import { normalizeRuleActionMode } from './layer-semantics';

export interface AppliedRuleActionResult {
  ruleId: string;
  actionType: RuleAction['type'];
  applied: boolean;
  reason?: 'rule-not-matched' | 'device-identity-already-applied';
}

function toProvenance(
  rule: MappingRule,
  action: RuleAction,
  value?: NormalizedZwaveValueFacts,
): ProvenanceRecord {
  const selector =
    value != null
      ? `cc=${value.valueId.commandClass},ep=${value.valueId.endpoint ?? 0},prop=${String(value.valueId.property)}`
      : undefined;
  return {
    layer: rule.layer,
    ruleId: rule.ruleId,
    action: normalizeRuleActionMode(action.mode),
    sourceRef: rule.ruleId,
    reason: selector,
  };
}

function applyIgnoreValueAction(
  state: ProfileBuildState,
  action: IgnoreValueRuleAction,
  provenance: ProvenanceRecord,
  value: NormalizedZwaveValueFacts,
): AppliedRuleActionResult {
  addIgnoredValue(state, action.valueId ?? value.valueId, provenance);
  return {
    ruleId: provenance.ruleId,
    actionType: 'ignore-value',
    applied: true,
  };
}

export function applyRuleToValue(
  state: ProfileBuildState,
  device: NormalizedZwaveDeviceFacts,
  value: NormalizedZwaveValueFacts,
  rule: MappingRule,
): AppliedRuleActionResult[] {
  if (!matchesRuleForValue(device, value, rule)) {
    return rule.actions.map((action) => ({
      ruleId: rule.ruleId,
      actionType: action.type,
      applied: false,
      reason: 'rule-not-matched',
    }));
  }

  return rule.actions.map((action, actionIndex) => {
    const provenance = toProvenance(rule, action, value);
    if (action.type === 'capability') {
      applyCapabilityRuleAction(state, action as CapabilityRuleAction, provenance);
      return { ruleId: rule.ruleId, actionType: action.type, applied: true };
    }
    if (action.type === 'device-identity') {
      const dedupeKey = `${rule.ruleId}:${actionIndex}`;
      if (state.appliedDeviceIdentityActions.has(dedupeKey)) {
        return {
          ruleId: rule.ruleId,
          actionType: action.type,
          applied: false,
          reason: 'device-identity-already-applied',
        };
      }
      applyDeviceIdentityRuleAction(state, action as DeviceIdentityRuleAction, provenance);
      state.appliedDeviceIdentityActions.add(dedupeKey);
      return { ruleId: rule.ruleId, actionType: action.type, applied: true };
    }
    return applyIgnoreValueAction(state, action as IgnoreValueRuleAction, provenance, value);
  });
}

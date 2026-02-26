import type { ProvenanceRecord } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueFacts } from '../models/zwave-facts';
import type {
  CapabilityRuleAction,
  DeviceIdentityRuleAction,
  IgnoreValueRuleAction,
  MappingRule,
  RemoveCapabilityRuleAction,
  RuleAction,
} from '../rules/types';
import {
  addIgnoredValue,
  applyCapabilityRuleAction,
  applyDeviceIdentityRuleAction,
  type ProfileBuildState,
  removeCapabilityRuleAction,
} from './profile-build-state';
import { matchesRuleForValue } from './rule-matcher';
import { assertRuleActionModeAllowedForLayer, normalizeRuleActionMode } from './layer-semantics';

export interface AppliedRuleActionResult {
  ruleId: string;
  actionType: RuleAction['type'];
  applied: boolean;
  changed?: boolean;
  reason?: 'rule-not-matched' | 'device-identity-already-applied';
}

export interface ApplyRuleToValueSummaryResult {
  matched: boolean;
  actionCount: number;
  appliedChangedActions: number;
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
    action:
      action.type === 'remove-capability'
        ? (action.mode ?? 'replace')
        : normalizeRuleActionMode(action.mode),
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

function applyRemoveCapabilityAction(
  state: ProfileBuildState,
  action: RemoveCapabilityRuleAction,
  provenance: ProvenanceRecord,
): AppliedRuleActionResult {
  const mode = action.mode ?? 'replace';
  assertRuleActionModeAllowedForLayer(
    provenance.layer as Exclude<ProvenanceRecord['layer'], 'user-curation'>,
    mode,
  );
  const changed = removeCapabilityRuleAction(state, action.capabilityId);
  return {
    ruleId: provenance.ruleId,
    actionType: 'remove-capability',
    applied: true,
    changed,
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
      const outcome = applyCapabilityRuleAction(state, action as CapabilityRuleAction, provenance);
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
      const outcome = applyDeviceIdentityRuleAction(
        state,
        action as DeviceIdentityRuleAction,
        provenance,
      );
      state.appliedDeviceIdentityActions.add(dedupeKey);
      return {
        ruleId: rule.ruleId,
        actionType: action.type,
        applied: true,
        changed: outcome !== 'noop',
      };
    }
    if (action.type === 'remove-capability') {
      return applyRemoveCapabilityAction(state, action as RemoveCapabilityRuleAction, provenance);
    }
    const ignoreResult = applyIgnoreValueAction(
      state,
      action as IgnoreValueRuleAction,
      provenance,
      value,
    );
    return { ...ignoreResult, changed: true };
  });
}

export function applyRuleToValueSummary(
  state: ProfileBuildState,
  device: NormalizedZwaveDeviceFacts,
  value: NormalizedZwaveValueFacts,
  rule: MappingRule,
): ApplyRuleToValueSummaryResult {
  const actionCount = rule.actions.length;
  if (!matchesRuleForValue(device, value, rule)) {
    return {
      matched: false,
      actionCount,
      appliedChangedActions: 0,
    };
  }

  let appliedChangedActions = 0;
  for (const [actionIndex, action] of rule.actions.entries()) {
    const provenance = toProvenance(rule, action, value);
    if (action.type === 'capability') {
      const outcome = applyCapabilityRuleAction(state, action as CapabilityRuleAction, provenance);
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
      const outcome = applyDeviceIdentityRuleAction(
        state,
        action as DeviceIdentityRuleAction,
        provenance,
      );
      state.appliedDeviceIdentityActions.add(dedupeKey);
      if (outcome !== 'noop') {
        appliedChangedActions += 1;
      }
      continue;
    }
    if (action.type === 'remove-capability') {
      const removeMode = action.mode ?? 'replace';
      assertRuleActionModeAllowedForLayer(
        provenance.layer as Exclude<ProvenanceRecord['layer'], 'user-curation'>,
        removeMode,
      );
      if (removeCapabilityRuleAction(state, action.capabilityId)) {
        appliedChangedActions += 1;
      }
      continue;
    }
    addIgnoredValue(state, action.valueId ?? value.valueId, provenance);
    appliedChangedActions += 1;
  }

  return {
    matched: true,
    actionCount,
    appliedChangedActions,
  };
}

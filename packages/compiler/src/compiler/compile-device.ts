import type { HomeyCapabilityPlan } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueId } from '../models/zwave-facts';
import type { MappingRule } from '../rules/types';
import type { AppliedRuleActionResult } from './apply-rule';
import { applyRuleToValue } from './apply-rule';
import { getRuleLayerOrder } from './layer-semantics';
import {
  createProfileBuildState,
  materializeCapabilityPlans,
  materializeIgnoredValues,
} from './profile-build-state';

export interface CompileDeviceReportEntry extends AppliedRuleActionResult {
  valueId: NormalizedZwaveValueId;
}

export interface CompileDeviceResult {
  capabilities: HomeyCapabilityPlan[];
  ignoredValues: NormalizedZwaveValueId[];
  report: {
    actions: CompileDeviceReportEntry[];
    suppressedActions: ReturnType<typeof createProfileBuildState>['suppressedActions'];
  };
}

export function compileDevice(
  device: NormalizedZwaveDeviceFacts,
  rules: MappingRule[],
): CompileDeviceResult {
  const state = createProfileBuildState();
  const layerOrder = getRuleLayerOrder();
  const sortedRules = [...rules].sort(
    (a, b) => layerOrder.indexOf(a.layer) - layerOrder.indexOf(b.layer),
  );
  const actions: CompileDeviceReportEntry[] = [];

  for (const value of device.values) {
    for (const rule of sortedRules) {
      const results = applyRuleToValue(state, device, value, rule);
      for (const result of results) {
        actions.push({
          ...result,
          valueId: { ...value.valueId },
        });
      }
    }
  }

  return {
    capabilities: materializeCapabilityPlans(state),
    ignoredValues: materializeIgnoredValues(state),
    report: {
      actions,
      suppressedActions: [...state.suppressedActions],
    },
  };
}

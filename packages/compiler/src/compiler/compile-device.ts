import type { HomeyCapabilityPlan } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueId } from '../models/zwave-facts';
import type { MappingRule } from '../rules/types';
import type { AppliedRuleActionResult } from './apply-rule';
import { applyRuleToValue } from './apply-rule';
import { getRuleLayerOrder } from './layer-semantics';
import {
  createProfileBuildState,
  materializeCapabilityPlans,
  materializeDeviceIdentity,
  materializeIgnoredValues,
} from './profile-build-state';

export interface CompileDeviceReportEntry extends AppliedRuleActionResult {
  layer: MappingRule['layer'];
  valueId: NormalizedZwaveValueId;
}

export interface CompileDeviceResult {
  deviceIdentity?: {
    homeyClass?: string;
    driverTemplateId?: string;
    provenance?: import('../models/homey-plan').ProvenanceRecord;
  };
  capabilities: HomeyCapabilityPlan[];
  ignoredValues: NormalizedZwaveValueId[];
  report: {
    actions: CompileDeviceReportEntry[];
    suppressedActions: ReturnType<typeof createProfileBuildState>['suppressedActions'];
    summary: {
      appliedActions: number;
      unmatchedActions: number;
      suppressedFillActions: number;
      ignoredValues: number;
    };
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
          layer: rule.layer,
          valueId: { ...value.valueId },
        });
      }
    }
  }

  return {
    deviceIdentity: materializeDeviceIdentity(state),
    capabilities: materializeCapabilityPlans(state),
    ignoredValues: materializeIgnoredValues(state),
    report: {
      actions,
      suppressedActions: [...state.suppressedActions],
      summary: {
        appliedActions: actions.filter((a) => a.applied).length,
        unmatchedActions: actions.filter((a) => a.reason === 'rule-not-matched').length,
        suppressedFillActions: state.suppressedActions.filter((a) => a.mode === 'fill').length,
        ignoredValues: state.ignoredValues.size,
      },
    },
  };
}

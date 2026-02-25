import type { HomeyCapabilityPlan } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueId } from '../models/zwave-facts';
import type { MappingRule, RuleAction } from '../rules/types';
import type { AppliedRuleActionResult } from './apply-rule';
import { applyRuleToValue } from './apply-rule';
import { getRuleLayerOrder } from './layer-semantics';
import { matchesDevice, matchesRuleCompanionConstraints } from './rule-matcher';
import {
  type CapabilityConflictSuppression,
  createProfileBuildState,
  materializeCapabilityPlans,
  materializeDeviceIdentity,
  materializeIgnoredValues,
  resolveCapabilityConflicts,
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
    overlapPolicy?: {
      suppressedCapabilities: CapabilityConflictSuppression[];
    };
  };
}

interface SortedRulesCacheEntry {
  sourceLength: number;
  plan: CompileRuleExecutionPlan;
}

interface CompileRuleExecutionEntry {
  rule: MappingRule;
  actionTypes: RuleAction['type'][];
}

interface CompileRuleExecutionPlan {
  entries: CompileRuleExecutionEntry[];
  commandClassWildcardIndices: number[];
  byCommandClass: Map<number, number[]>;
  propertyWildcardIndices: number[];
  byProperty: Map<string, number[]>;
  endpointWildcardIndices: number[];
  byEndpoint: Map<number, number[]>;
}

const ruleLayerOrder = getRuleLayerOrder();
const ruleLayerRank = new Map(ruleLayerOrder.map((layer, index) => [layer, index]));
const sortedRulesCache = new WeakMap<readonly MappingRule[], SortedRulesCacheEntry>();

function pushIndex<K>(indexMap: Map<K, number[]>, key: K, index: number): void {
  const list = indexMap.get(key);
  if (list) {
    list.push(index);
    return;
  }
  indexMap.set(key, [index]);
}

function propertyTokenKey(value: string | number): string {
  return `${typeof value}:${String(value)}`;
}

function buildRuleExecutionPlan(rules: MappingRule[]): CompileRuleExecutionPlan {
  const sortedRules = [...rules].sort((a, b) => {
    const aRank = ruleLayerRank.get(a.layer) ?? Number.MAX_SAFE_INTEGER;
    const bRank = ruleLayerRank.get(b.layer) ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank;
  });
  const entries = sortedRules.map((rule) => ({
    rule,
    actionTypes: rule.actions.map((action) => action.type),
  }));
  const commandClassWildcardIndices: number[] = [];
  const byCommandClass = new Map<number, number[]>();
  const propertyWildcardIndices: number[] = [];
  const byProperty = new Map<string, number[]>();
  const endpointWildcardIndices: number[] = [];
  const byEndpoint = new Map<number, number[]>();

  for (const [index, entry] of entries.entries()) {
    const matcher = entry.rule.value;
    const commandClasses = entry.rule.value?.commandClass;
    if (!commandClasses || commandClasses.length === 0) {
      commandClassWildcardIndices.push(index);
    } else {
      for (const commandClass of commandClasses) {
        pushIndex(byCommandClass, commandClass, index);
      }
    }

    const properties = matcher?.property;
    if (!properties || properties.length === 0) {
      propertyWildcardIndices.push(index);
    } else {
      for (const property of properties) {
        pushIndex(byProperty, propertyTokenKey(property), index);
      }
    }

    const endpoints = matcher?.endpoint;
    if (!endpoints || endpoints.length === 0) {
      endpointWildcardIndices.push(index);
    } else {
      for (const endpoint of endpoints) {
        pushIndex(byEndpoint, endpoint, index);
      }
    }
  }

  return {
    entries,
    commandClassWildcardIndices,
    byCommandClass,
    propertyWildcardIndices,
    byProperty,
    endpointWildcardIndices,
    byEndpoint,
  };
}

function resolveRuleExecutionPlan(rules: MappingRule[]): CompileRuleExecutionPlan {
  const cached = sortedRulesCache.get(rules);
  if (cached && cached.sourceLength === rules.length) return cached.plan;

  const plan = buildRuleExecutionPlan(rules);
  sortedRulesCache.set(rules, { sourceLength: rules.length, plan });
  return plan;
}

function buildCandidateMaskForValue(
  plan: CompileRuleExecutionPlan,
  valueId: NormalizedZwaveValueId,
): Uint8Array {
  const commandClassMask = new Uint8Array(plan.entries.length);
  for (const index of plan.commandClassWildcardIndices) {
    commandClassMask[index] = 1;
  }
  for (const index of plan.byCommandClass.get(valueId.commandClass) ?? []) {
    commandClassMask[index] = 1;
  }

  const propertyMask = new Uint8Array(plan.entries.length);
  for (const index of plan.propertyWildcardIndices) {
    propertyMask[index] = 1;
  }
  for (const index of plan.byProperty.get(propertyTokenKey(valueId.property)) ?? []) {
    propertyMask[index] = 1;
  }

  const endpointMask = new Uint8Array(plan.entries.length);
  for (const index of plan.endpointWildcardIndices) {
    endpointMask[index] = 1;
  }
  for (const index of plan.byEndpoint.get(valueId.endpoint ?? 0) ?? []) {
    endpointMask[index] = 1;
  }

  for (let index = 0; index < commandClassMask.length; index += 1) {
    if (commandClassMask[index] === 0 || propertyMask[index] === 0 || endpointMask[index] === 0) {
      commandClassMask[index] = 0;
    }
  }

  return commandClassMask;
}

function pushUnmatchedActions(
  actions: CompileDeviceReportEntry[],
  entry: CompileRuleExecutionEntry,
  valueId: NormalizedZwaveValueId,
): void {
  for (const actionType of entry.actionTypes) {
    actions.push({
      ruleId: entry.rule.ruleId,
      actionType,
      applied: false,
      reason: 'rule-not-matched',
      layer: entry.rule.layer,
      valueId: { ...valueId },
    });
  }
}

function pushAppliedRuleResults(
  actions: CompileDeviceReportEntry[],
  entry: CompileRuleExecutionEntry,
  valueId: NormalizedZwaveValueId,
  results: AppliedRuleActionResult[],
): void {
  for (const result of results) {
    actions.push({
      ...result,
      layer: entry.rule.layer,
      valueId: { ...valueId },
    });
  }
}

function buildDeviceEligibleMask(
  device: NormalizedZwaveDeviceFacts,
  plan: CompileRuleExecutionPlan,
): Uint8Array {
  const mask = new Uint8Array(plan.entries.length);
  for (const [index, entry] of plan.entries.entries()) {
    mask[index] =
      matchesDevice(device, entry.rule.device) &&
      matchesRuleCompanionConstraints(device, entry.rule)
        ? 1
        : 0;
  }
  return mask;
}

export function compileDevice(
  device: NormalizedZwaveDeviceFacts,
  rules: MappingRule[],
): CompileDeviceResult {
  const state = createProfileBuildState();
  const executionPlan = resolveRuleExecutionPlan(rules);
  const deviceEligibleMask = buildDeviceEligibleMask(device, executionPlan);
  const actions: CompileDeviceReportEntry[] = [];

  for (const value of device.values) {
    const candidateMask = buildCandidateMaskForValue(executionPlan, value.valueId);
    for (const [index, entry] of executionPlan.entries.entries()) {
      if (deviceEligibleMask[index] === 0 || candidateMask[index] === 0) {
        pushUnmatchedActions(actions, entry, value.valueId);
        continue;
      }

      const results = applyRuleToValue(state, device, value, entry.rule);
      pushAppliedRuleResults(actions, entry, value.valueId, results);
    }
  }

  const overlap = resolveCapabilityConflicts(state);

  return {
    deviceIdentity: materializeDeviceIdentity(state),
    capabilities: materializeCapabilityPlans(state),
    ignoredValues: materializeIgnoredValues(state),
    report: {
      actions,
      suppressedActions: [...state.suppressedActions],
      summary: {
        appliedActions: actions.filter((a) => a.applied && a.changed !== false).length,
        unmatchedActions: actions.filter((a) => a.reason === 'rule-not-matched').length,
        suppressedFillActions: state.suppressedActions.filter((a) => a.mode === 'fill').length,
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

import type { HomeyCapabilityPlan } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueId } from '../models/zwave-facts';
import type { MappingRule, RuleAction } from '../rules/types';
import type { AppliedRuleActionResult } from './apply-rule';
import { applyRuleToValue } from './apply-rule';
import { getRuleLayerOrder } from './layer-semantics';
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
  alwaysCandidateIndices: number[];
  byCommandClass: Map<number, number[]>;
}

const ruleLayerOrder = getRuleLayerOrder();
const ruleLayerRank = new Map(ruleLayerOrder.map((layer, index) => [layer, index]));
const sortedRulesCache = new WeakMap<readonly MappingRule[], SortedRulesCacheEntry>();

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
  const alwaysCandidateIndices: number[] = [];
  const byCommandClass = new Map<number, number[]>();

  for (const [index, entry] of entries.entries()) {
    const commandClasses = entry.rule.value?.commandClass;
    if (!commandClasses || commandClasses.length === 0) {
      alwaysCandidateIndices.push(index);
      continue;
    }
    for (const commandClass of commandClasses) {
      const list = byCommandClass.get(commandClass) ?? [];
      list.push(index);
      byCommandClass.set(commandClass, list);
    }
  }

  return {
    entries,
    alwaysCandidateIndices,
    byCommandClass,
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
  commandClass: number,
): Uint8Array {
  const mask = new Uint8Array(plan.entries.length);
  for (const index of plan.alwaysCandidateIndices) {
    mask[index] = 1;
  }
  for (const index of plan.byCommandClass.get(commandClass) ?? []) {
    mask[index] = 1;
  }
  return mask;
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

export function compileDevice(
  device: NormalizedZwaveDeviceFacts,
  rules: MappingRule[],
): CompileDeviceResult {
  const state = createProfileBuildState();
  const executionPlan = resolveRuleExecutionPlan(rules);
  const actions: CompileDeviceReportEntry[] = [];

  for (const value of device.values) {
    const candidateMask = buildCandidateMaskForValue(executionPlan, value.valueId.commandClass);
    for (const [index, entry] of executionPlan.entries.entries()) {
      if (candidateMask[index] === 0) {
        pushUnmatchedActions(actions, entry, value.valueId);
        continue;
      }

      const results = applyRuleToValue(state, device, value, entry.rule);
      for (const result of results) {
        actions.push({
          ...result,
          layer: entry.rule.layer,
          valueId: { ...value.valueId },
        });
      }
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

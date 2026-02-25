import type { HomeyCapabilityPlan } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueId } from '../models/zwave-facts';
import type { MappingRule } from '../rules/types';
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
  unmatchedTemplates: Array<Omit<CompileDeviceReportEntry, 'valueId'>>;
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

interface CandidateScratch {
  commandClassMarks: Uint32Array;
  propertyMarks: Uint32Array;
  endpointMarks: Uint32Array;
  stamp: number;
}

interface ActionSummaryCounters {
  appliedActions: number;
  unmatchedActions: number;
}

interface PreparedValue {
  original: NormalizedZwaveDeviceFacts['values'][number];
  clonedValueId: NormalizedZwaveValueId;
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
    unmatchedTemplates: rule.actions.map((action) => ({
      ruleId: rule.ruleId,
      actionType: action.type,
      applied: false as const,
      reason: 'rule-not-matched' as const,
      layer: rule.layer,
    })),
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

function createCandidateScratch(length: number): CandidateScratch {
  return {
    commandClassMarks: new Uint32Array(length),
    propertyMarks: new Uint32Array(length),
    endpointMarks: new Uint32Array(length),
    stamp: 0,
  };
}

function nextScratchStamp(scratch: CandidateScratch): number {
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

function markIndices(marks: Uint32Array, indices: number[], stamp: number): void {
  for (const index of indices) {
    marks[index] = stamp;
  }
}

function markCandidatesForValue(
  plan: CompileRuleExecutionPlan,
  scratch: CandidateScratch,
  valueId: NormalizedZwaveValueId,
): number {
  const stamp = nextScratchStamp(scratch);

  markIndices(scratch.commandClassMarks, plan.commandClassWildcardIndices, stamp);
  markIndices(
    scratch.commandClassMarks,
    plan.byCommandClass.get(valueId.commandClass) ?? [],
    stamp,
  );
  markIndices(scratch.propertyMarks, plan.propertyWildcardIndices, stamp);
  markIndices(
    scratch.propertyMarks,
    plan.byProperty.get(propertyTokenKey(valueId.property)) ?? [],
    stamp,
  );
  markIndices(scratch.endpointMarks, plan.endpointWildcardIndices, stamp);
  markIndices(scratch.endpointMarks, plan.byEndpoint.get(valueId.endpoint ?? 0) ?? [], stamp);

  return stamp;
}

function isRuleCandidate(scratch: CandidateScratch, index: number, stamp: number): boolean {
  return (
    scratch.commandClassMarks[index] === stamp &&
    scratch.propertyMarks[index] === stamp &&
    scratch.endpointMarks[index] === stamp
  );
}

function pushUnmatchedActions(
  actions: CompileDeviceReportEntry[],
  entry: CompileRuleExecutionEntry,
  valueId: NormalizedZwaveValueId,
  counters: ActionSummaryCounters,
): void {
  for (const template of entry.unmatchedTemplates) {
    actions.push({
      ...template,
      valueId,
    });
  }
  counters.unmatchedActions += entry.unmatchedTemplates.length;
}

function pushAppliedRuleResults(
  actions: CompileDeviceReportEntry[],
  entry: CompileRuleExecutionEntry,
  valueId: NormalizedZwaveValueId,
  results: AppliedRuleActionResult[],
  counters: ActionSummaryCounters,
): void {
  for (const result of results) {
    actions.push({
      ...result,
      layer: entry.rule.layer,
      valueId,
    });
    if (result.applied && result.changed !== false) {
      counters.appliedActions += 1;
    }
    if (result.reason === 'rule-not-matched') {
      counters.unmatchedActions += 1;
    }
  }
}

function prepareValues(device: NormalizedZwaveDeviceFacts): PreparedValue[] {
  return device.values.map((value) => ({
    original: value,
    // Reused across many emitted action records; frozen to prevent accidental cross-record mutation.
    clonedValueId: Object.freeze({ ...value.valueId }),
  }));
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
  const candidateScratch = createCandidateScratch(executionPlan.entries.length);
  const preparedValues = prepareValues(device);
  const actions: CompileDeviceReportEntry[] = [];
  const counters: ActionSummaryCounters = {
    appliedActions: 0,
    unmatchedActions: 0,
  };

  for (const value of preparedValues) {
    const candidateStamp = markCandidatesForValue(
      executionPlan,
      candidateScratch,
      value.original.valueId,
    );
    for (const [index, entry] of executionPlan.entries.entries()) {
      if (
        deviceEligibleMask[index] === 0 ||
        !isRuleCandidate(candidateScratch, index, candidateStamp)
      ) {
        pushUnmatchedActions(actions, entry, value.clonedValueId, counters);
        continue;
      }

      const results = applyRuleToValue(state, device, value.original, entry.rule);
      pushAppliedRuleResults(actions, entry, value.clonedValueId, results, counters);
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
        appliedActions: counters.appliedActions,
        unmatchedActions: counters.unmatchedActions,
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

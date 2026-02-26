import type { HomeyCapabilityPlan } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueId } from '../models/zwave-facts';
import type { MappingRule } from '../rules/types';
import type { AppliedRuleActionResult } from './apply-rule';
import { applyRuleToValue, applyRuleToValueSummary } from './apply-rule';
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
      totalActions: number;
      appliedProjectProductActions: number;
      suppressedFillActions: number;
      ignoredValues: number;
    };
    overlapPolicy?: {
      suppressedCapabilities: CapabilityConflictSuppression[];
    };
  };
}

export interface CompileDeviceOptions {
  reportMode?: 'full' | 'summary';
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
  summaryBucketCPE: Map<number, Map<string, Map<number, number[]>>>;
  summaryBucketCP: Map<number, Map<string, number[]>>;
  summaryBucketCE: Map<number, Map<number, number[]>>;
  summaryBucketC: Map<number, number[]>;
  summaryBucketPE: Map<string, Map<number, number[]>>;
  summaryBucketP: Map<string, number[]>;
  summaryBucketE: Map<number, number[]>;
  summaryBucketAny: number[];
  summarySelectorCache: Map<number, Map<string, Map<number, number[]>>>;
  summarySelectorCacheOrder: Array<[commandClass: number, propertyKey: string, endpoint: number]>;
  summarySelectorCacheSize: number;
  propertyWildcardIndices: number[];
  byProperty: Map<string, number[]>;
  endpointWildcardIndices: number[];
  byEndpoint: Map<number, number[]>;
  totalActionCountPerValue: number;
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
  totalActions: number;
  appliedProjectProductActions: number;
}

const ruleLayerOrder = getRuleLayerOrder();
const ruleLayerRank = new Map(ruleLayerOrder.map((layer, index) => [layer, index]));
const sortedRulesCache = new WeakMap<readonly MappingRule[], SortedRulesCacheEntry>();
const SUMMARY_SELECTOR_CACHE_MAX_ENTRIES = 1024;

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

function uniqueTokens<T>(tokens: readonly T[]): T[] {
  return [...new Set(tokens)];
}

function getMap2<K1, K2, V>(map: Map<K1, Map<K2, V>>, key1: K1, key2: K2): V | undefined {
  return map.get(key1)?.get(key2);
}

function getMap3<K1, K2, K3, V>(
  map: Map<K1, Map<K2, Map<K3, V>>>,
  key1: K1,
  key2: K2,
  key3: K3,
): V | undefined {
  return map.get(key1)?.get(key2)?.get(key3);
}

function ensureMap2<K1, K2, V>(map: Map<K1, Map<K2, V>>, key1: K1): Map<K2, V> {
  const existing = map.get(key1);
  if (existing) return existing;
  const created = new Map<K2, V>();
  map.set(key1, created);
  return created;
}

function ensureMap3<K1, K2, K3, V>(
  map: Map<K1, Map<K2, Map<K3, V>>>,
  key1: K1,
  key2: K2,
): Map<K3, V> {
  const nested = ensureMap2<K1, K2, Map<K3, V>>(map, key1);
  const existing = nested.get(key2);
  if (existing) return existing;
  const created = new Map<K3, V>();
  nested.set(key2, created);
  return created;
}

function pushSummaryBucket2<K1, K2>(
  bucket: Map<K1, Map<K2, number[]>>,
  key1: K1,
  key2: K2,
  index: number,
): void {
  const nested = ensureMap2<K1, K2, number[]>(bucket, key1);
  const list = nested.get(key2);
  if (!list) {
    nested.set(key2, [index]);
    return;
  }
  if (list[list.length - 1] !== index) {
    list.push(index);
  }
}

function pushSummaryBucket3<K1, K2, K3>(
  bucket: Map<K1, Map<K2, Map<K3, number[]>>>,
  key1: K1,
  key2: K2,
  key3: K3,
  index: number,
): void {
  const nested = ensureMap3<K1, K2, K3, number[]>(bucket, key1, key2);
  const list = nested.get(key3);
  if (!list) {
    nested.set(key3, [index]);
    return;
  }
  if (list[list.length - 1] !== index) {
    list.push(index);
  }
}

function resolveSummaryCandidateSeed(
  plan: CompileRuleExecutionPlan,
  valueId: NormalizedZwaveValueId,
): number[] {
  const commandClass = valueId.commandClass;
  const property = propertyTokenKey(valueId.property);
  const endpoint = valueId.endpoint ?? 0;
  const cached = getMap3(plan.summarySelectorCache, commandClass, property, endpoint);
  if (cached) return cached;

  const merged: number[] = [];
  const seen = new Set<number>();
  const addIndices = (indices: readonly number[] | undefined): void => {
    if (!indices) return;
    for (const index of indices) {
      if (seen.has(index)) continue;
      seen.add(index);
      merged.push(index);
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

  if (plan.summarySelectorCacheSize >= SUMMARY_SELECTOR_CACHE_MAX_ENTRIES) {
    const oldest = plan.summarySelectorCacheOrder.shift();
    if (oldest) {
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
  }
  const cacheByProperty = ensureMap2<number, string, Map<number, number[]>>(
    plan.summarySelectorCache,
    commandClass,
  );
  const cacheByEndpoint =
    cacheByProperty.get(property) ??
    (() => {
      const created = new Map<number, number[]>();
      cacheByProperty.set(property, created);
      return created;
    })();
  cacheByEndpoint.set(endpoint, merged);
  plan.summarySelectorCacheOrder.push([commandClass, property, endpoint]);
  plan.summarySelectorCacheSize += 1;
  return merged;
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
  const summaryBucketCPE = new Map<number, Map<string, Map<number, number[]>>>();
  const summaryBucketCP = new Map<number, Map<string, number[]>>();
  const summaryBucketCE = new Map<number, Map<number, number[]>>();
  const summaryBucketC = new Map<number, number[]>();
  const summaryBucketPE = new Map<string, Map<number, number[]>>();
  const summaryBucketP = new Map<string, number[]>();
  const summaryBucketE = new Map<number, number[]>();
  const summaryBucketAny: number[] = [];
  const summarySelectorCache = new Map<number, Map<string, Map<number, number[]>>>();
  const summarySelectorCacheOrder: Array<
    [commandClass: number, propertyKey: string, endpoint: number]
  > = [];
  let summarySelectorCacheSize = 0;
  let totalActionCountPerValue = 0;

  for (const [index, entry] of entries.entries()) {
    const matcher = entry.rule.value;
    totalActionCountPerValue += entry.unmatchedTemplates.length;
    const commandClasses = matcher?.commandClass;
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
    summarySelectorCacheSize,
    propertyWildcardIndices,
    byProperty,
    endpointWildcardIndices,
    byEndpoint,
    totalActionCountPerValue,
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
  counters.totalActions += entry.unmatchedTemplates.length;
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
  options?: CompileDeviceOptions,
): CompileDeviceResult {
  const includeActions = options?.reportMode !== 'summary';
  const state = createProfileBuildState({ collectSuppressedActions: includeActions });
  const executionPlan = resolveRuleExecutionPlan(rules);
  const deviceEligibleMask = buildDeviceEligibleMask(device, executionPlan);
  const actions: CompileDeviceReportEntry[] = [];
  const counters: ActionSummaryCounters = {
    appliedActions: 0,
    unmatchedActions: 0,
    totalActions: 0,
    appliedProjectProductActions: 0,
  };

  if (!includeActions) {
    for (const value of device.values) {
      counters.totalActions += executionPlan.totalActionCountPerValue;
      counters.unmatchedActions += executionPlan.totalActionCountPerValue;

      const summarySeedIndices = resolveSummaryCandidateSeed(executionPlan, value.valueId);
      for (const index of summarySeedIndices) {
        if (deviceEligibleMask[index] === 0) continue;
        const entry = executionPlan.entries[index];
        const summaryResult = applyRuleToValueSummary(state, device, value, entry.rule);
        if (!summaryResult.matched) continue;
        counters.unmatchedActions -= summaryResult.actionCount;
        counters.appliedActions += summaryResult.appliedChangedActions;
        if (entry.rule.layer === 'project-product') {
          counters.appliedProjectProductActions += summaryResult.appliedChangedActions;
        }
      }
    }
  } else {
    const candidateScratch = createCandidateScratch(executionPlan.entries.length);
    const valueIdSnapshots = device.values.map((value) =>
      // Reused across many emitted action records; frozen to prevent accidental cross-record mutation.
      Object.freeze({ ...value.valueId }),
    );
    for (const [valueIndex, value] of device.values.entries()) {
      const candidateStamp = markCandidatesForValue(executionPlan, candidateScratch, value.valueId);
      const valueIdSnapshot = valueIdSnapshots[valueIndex];
      for (const [index, entry] of executionPlan.entries.entries()) {
        if (
          deviceEligibleMask[index] === 0 ||
          !isRuleCandidate(candidateScratch, index, candidateStamp)
        ) {
          pushUnmatchedActions(actions, entry, valueIdSnapshot, counters);
          continue;
        }

        const results = applyRuleToValue(state, device, value, entry.rule);
        pushAppliedRuleResults(actions, entry, valueIdSnapshot, results, counters);
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

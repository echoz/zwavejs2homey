import type { NormalizedZwaveDeviceFacts } from '../models/zwave-facts';
import type { CompileProfilePlanOptions } from './compile-profile-plan';
import { compileProfilePlan } from './compile-profile-plan';
import {
  loadJsonRuleFiles,
  loadJsonRuleSetManifest,
  type RuleSetManifestEntry,
} from './rule-loader';

export interface RuleSourceMetadata {
  filePath: string;
  ruleCount: number;
  ruleIds: string[];
}

export interface CompileProfilePlanFromFilesResult {
  profile: ReturnType<typeof compileProfilePlan>['profile'];
  report: ReturnType<typeof compileProfilePlan>['report'] & {
    byRule: Array<{
      ruleId: string;
      layer: string;
      applied: number;
      unmatched: number;
      actionTypes: Record<string, number>;
    }>;
    bySuppressedSlot: Array<{
      slot: string;
      layer: string;
      ruleId: string;
      count: number;
    }>;
    curationCandidates: {
      likelyNeedsReview: boolean;
      reasons: string[];
    };
  };
  ruleSources: RuleSourceMetadata[];
  classificationProvenance?: {
    layer?: string;
    ruleId?: string;
    action?: string;
    reason?: string;
  };
}

function groupReportByRule(
  report: ReturnType<typeof compileProfilePlan>['report'],
): CompileProfilePlanFromFilesResult['report']['byRule'] {
  const grouped = new Map<
    string,
    {
      ruleId: string;
      layer: string;
      applied: number;
      unmatched: number;
      actionTypes: Record<string, number>;
    }
  >();

  for (const action of report.actions) {
    const key = `${action.layer}:${action.ruleId}`;
    const existing =
      grouped.get(key) ??
      ({
        ruleId: action.ruleId,
        layer: action.layer,
        applied: 0,
        unmatched: 0,
        actionTypes: {},
      } as const);
    if (!grouped.has(key)) grouped.set(key, { ...existing });
    const entry = grouped.get(key);
    if (!entry) continue;
    if (action.applied) entry.applied += 1;
    if (action.reason === 'rule-not-matched') entry.unmatched += 1;
    entry.actionTypes[action.actionType] = (entry.actionTypes[action.actionType] ?? 0) + 1;
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.layer !== b.layer) return a.layer.localeCompare(b.layer);
    return a.ruleId.localeCompare(b.ruleId);
  });
}

function groupSuppressedBySlot(
  report: ReturnType<typeof compileProfilePlan>['report'],
): CompileProfilePlanFromFilesResult['report']['bySuppressedSlot'] {
  const grouped = new Map<string, { slot: string; layer: string; ruleId: string; count: number }>();
  for (const item of report.suppressedActions) {
    const key = `${item.layer}:${item.ruleId}:${item.slot}`;
    const existing = grouped.get(key) ?? {
      slot: item.slot,
      layer: item.layer,
      ruleId: item.ruleId,
      count: 0,
    };
    existing.count += 1;
    grouped.set(key, existing);
  }
  return [...grouped.values()].sort((a, b) => {
    if (a.layer !== b.layer) return a.layer.localeCompare(b.layer);
    if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId);
    return a.slot.localeCompare(b.slot);
  });
}

function deriveCurationCandidates(
  report: ReturnType<typeof compileProfilePlan>['report'],
): CompileProfilePlanFromFilesResult['report']['curationCandidates'] {
  const reasons: string[] = [];
  if (report.summary.suppressedFillActions > 0) {
    reasons.push(`suppressed-fill-actions:${report.summary.suppressedFillActions}`);
  }
  if (report.summary.appliedActions === 0) {
    reasons.push('no-applied-actions');
  }
  const unmatchedRatio =
    report.actions.length > 0 ? report.summary.unmatchedActions / report.actions.length : 0;
  if (unmatchedRatio > 0.75) {
    reasons.push(`high-unmatched-ratio:${unmatchedRatio.toFixed(2)}`);
  }
  return {
    likelyNeedsReview: reasons.length > 0,
    reasons,
  };
}

function deriveClassificationProvenance(
  report: ReturnType<typeof compileProfilePlan>['report'],
): CompileProfilePlanFromFilesResult['classificationProvenance'] {
  const appliedDeviceIdentityActions = report.actions.filter(
    (action) => action.applied && action.actionType === 'device-identity',
  );
  const last = appliedDeviceIdentityActions[appliedDeviceIdentityActions.length - 1];
  if (!last) return undefined;
  return {
    layer: last.layer,
    ruleId: last.ruleId,
    action: 'derived-from-device-identity-action',
  };
}

export function compileProfilePlanFromRuleFiles(
  device: NormalizedZwaveDeviceFacts,
  ruleFilePaths: string[],
  options?: CompileProfilePlanOptions,
): CompileProfilePlanFromFilesResult {
  const loaded = loadJsonRuleFiles(ruleFilePaths);
  const rules = loaded.flatMap((entry) => entry.rules);
  const { profile, report } = compileProfilePlan(device, rules, options);

  return {
    profile,
    report: {
      ...report,
      byRule: groupReportByRule(report),
      bySuppressedSlot: groupSuppressedBySlot(report),
      curationCandidates: deriveCurationCandidates(report),
    },
    ruleSources: loaded.map((entry) => ({
      filePath: entry.filePath,
      ruleCount: entry.rules.length,
      ruleIds: entry.rules.map((rule) => rule.ruleId),
    })),
    classificationProvenance: deriveClassificationProvenance(report),
  };
}

export function compileProfilePlanFromRuleSetManifest(
  device: NormalizedZwaveDeviceFacts,
  manifestEntries: RuleSetManifestEntry[],
  options?: CompileProfilePlanOptions,
): CompileProfilePlanFromFilesResult {
  const loaded = loadJsonRuleSetManifest(manifestEntries);
  const rules = loaded.entries.flatMap((entry) => entry.rules);
  const { profile, report } = compileProfilePlan(device, rules, options);

  return {
    profile,
    report: {
      ...report,
      byRule: groupReportByRule(report),
      bySuppressedSlot: groupSuppressedBySlot(report),
      curationCandidates: deriveCurationCandidates(report),
    },
    ruleSources: loaded.entries.map((entry) => ({
      filePath: entry.filePath,
      ruleCount: entry.rules.length,
      ruleIds: entry.rules.map((rule) => rule.ruleId),
    })),
    classificationProvenance: deriveClassificationProvenance(report),
  };
}

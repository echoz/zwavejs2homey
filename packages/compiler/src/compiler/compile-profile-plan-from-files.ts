import type { NormalizedZwaveDeviceFacts } from '../models/zwave-facts';
import type { CompileProfilePlanOptions } from './compile-profile-plan';
import { compileProfilePlan } from './compile-profile-plan';
import { loadJsonRuleFiles } from './rule-loader';

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
  };
  ruleSources: RuleSourceMetadata[];
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
    },
    ruleSources: loaded.map((entry) => ({
      filePath: entry.filePath,
      ruleCount: entry.rules.length,
      ruleIds: entry.rules.map((rule) => rule.ruleId),
    })),
  };
}

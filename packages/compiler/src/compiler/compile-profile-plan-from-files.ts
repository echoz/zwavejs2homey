import {
  loadCatalogDevicesArtifact,
  type CatalogDevicesArtifactV1,
} from '../catalog/catalog-device-artifact';
import type { NormalizedZwaveDeviceFacts } from '../models/zwave-facts';
import type { CompileProfilePlanOptions } from './compile-profile-plan';
import { compileProfilePlan } from './compile-profile-plan';
import {
  type LoadedRuleSetManifest,
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
    profileOutcome: 'curated' | 'ha-derived' | 'generic' | 'empty';
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
    catalogContext?: {
      knownCatalogDevice: boolean;
      catalogId?: string;
      label?: string;
      matchRef?: string;
    };
    unknownDeviceReport?: {
      kind: 'known-catalog' | 'unknown-catalog' | 'no-catalog';
      diagnosticDeviceKey: string;
      profileOutcome: 'curated' | 'ha-derived' | 'generic' | 'empty';
      matchRef?: string;
      label?: string;
      reasons: string[];
    };
    diagnosticDeviceKey: string;
  };
  ruleSources: RuleSourceMetadata[];
  classificationProvenance?: {
    layer?: string;
    ruleId?: string;
    action?: string;
    reason?: string;
  };
  catalogLookup?: {
    matched: boolean;
    by: 'product-triple' | 'none';
    catalogId?: string;
    label?: string;
  };
}

function deriveDiagnosticDeviceKey(
  device: NormalizedZwaveDeviceFacts,
  catalogLookup?: CompileProfilePlanFromFilesResult['catalogLookup'],
): string {
  if (catalogLookup?.matched && catalogLookup.catalogId)
    return `catalog:${catalogLookup.catalogId}`;
  if (
    device.manufacturerId !== undefined &&
    device.productType !== undefined &&
    device.productId !== undefined
  ) {
    return `product-triple:${device.manufacturerId}-${device.productType}-${device.productId}`;
  }
  return `deviceKey:${device.deviceKey ?? 'unknown'}`;
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
    if (action.applied && action.changed !== false) entry.applied += 1;
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
  profile: ReturnType<typeof compileProfilePlan>['profile'],
  catalogLookup?: CompileProfilePlanFromFilesResult['catalogLookup'],
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
  if ((profile.capabilities?.length ?? 0) === 0 && !profile.classification.driverTemplateId) {
    reasons.push('no-meaningful-mapping');
  } else if (profile.classification.uncurated) {
    reasons.push(`uncurated-profile:${profile.classification.confidence}`);
  }
  if (catalogLookup?.matched) {
    if ((profile.capabilities?.length ?? 0) === 0 && !profile.classification.driverTemplateId) {
      reasons.push('known-device-unmapped');
    } else if (profile.classification.confidence === 'generic') {
      reasons.push('known-device-generic-fallback');
    }
  } else if (catalogLookup && profile.classification.confidence === 'generic') {
    reasons.push('unknown-device-generic-fallback');
  }
  return {
    likelyNeedsReview: reasons.length > 0,
    reasons,
  };
}

function deriveProfileOutcome(
  profile: ReturnType<typeof compileProfilePlan>['profile'],
): CompileProfilePlanFromFilesResult['report']['profileOutcome'] {
  if ((profile.capabilities?.length ?? 0) === 0 && !profile.classification.driverTemplateId) {
    return 'empty';
  }
  return profile.classification.confidence;
}

function deriveUnknownDeviceReport(
  profile: ReturnType<typeof compileProfilePlan>['profile'],
  curationCandidates: CompileProfilePlanFromFilesResult['report']['curationCandidates'],
  diagnosticDeviceKey: string,
  catalogLookup?: CompileProfilePlanFromFilesResult['catalogLookup'],
): CompileProfilePlanFromFilesResult['report']['unknownDeviceReport'] | undefined {
  if (!profile.classification.uncurated && curationCandidates.reasons.length === 0)
    return undefined;

  const profileOutcome = deriveProfileOutcome(profile);
  if (profileOutcome !== 'generic' && profileOutcome !== 'empty') return undefined;

  if (catalogLookup?.matched) {
    return {
      kind: 'known-catalog',
      diagnosticDeviceKey,
      profileOutcome,
      matchRef: `catalog:${catalogLookup.catalogId}`,
      label: catalogLookup.label,
      reasons: curationCandidates.reasons,
    };
  }
  if (catalogLookup) {
    return {
      kind: 'unknown-catalog',
      diagnosticDeviceKey,
      profileOutcome,
      reasons: curationCandidates.reasons,
    };
  }
  return {
    kind: 'no-catalog',
    diagnosticDeviceKey,
    profileOutcome,
    reasons: curationCandidates.reasons,
  };
}

function deriveClassificationProvenance(
  report: ReturnType<typeof compileProfilePlan>['report'],
): CompileProfilePlanFromFilesResult['classificationProvenance'] {
  const appliedDeviceIdentityActions = report.actions.filter(
    (action) =>
      action.applied && action.changed !== false && action.actionType === 'device-identity',
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
  const loaded = loadJsonRuleSetManifest(ruleFilePaths.map((filePath) => ({ filePath })));
  return compileProfilePlanFromLoadedRuleSetManifest(device, loaded, options);
}

export function compileProfilePlanFromLoadedRuleSetManifest(
  device: NormalizedZwaveDeviceFacts,
  loaded: LoadedRuleSetManifest,
  options?: CompileProfilePlanOptions,
): CompileProfilePlanFromFilesResult {
  const rules = loaded.entries.flatMap((entry) => entry.rules);
  const { profile, report, catalogLookup } = compileProfilePlan(device, rules, options);
  const profileOutcome = deriveProfileOutcome(profile);
  const curationCandidates = deriveCurationCandidates(report, profile, catalogLookup);
  const diagnosticDeviceKey = deriveDiagnosticDeviceKey(device, catalogLookup);

  return {
    profile,
    report: {
      ...report,
      profileOutcome,
      byRule: groupReportByRule(report),
      bySuppressedSlot: groupSuppressedBySlot(report),
      curationCandidates,
      catalogContext: catalogLookup?.matched
        ? {
            knownCatalogDevice: true,
            catalogId: catalogLookup.catalogId,
            label: catalogLookup.label,
            matchRef: `catalog:${catalogLookup.catalogId}`,
          }
        : catalogLookup
          ? {
              knownCatalogDevice: false,
            }
          : undefined,
      unknownDeviceReport: deriveUnknownDeviceReport(
        profile,
        curationCandidates,
        diagnosticDeviceKey,
        catalogLookup,
      ),
      diagnosticDeviceKey,
    },
    ruleSources: loaded.entries.map((entry) => ({
      filePath: entry.filePath,
      ruleCount: entry.rules.length,
      ruleIds: entry.rules.map((rule) => rule.ruleId),
    })),
    classificationProvenance: deriveClassificationProvenance(report),
    catalogLookup,
  };
}

export function compileProfilePlanFromRuleSetManifest(
  device: NormalizedZwaveDeviceFacts,
  manifestEntries: RuleSetManifestEntry[],
  options?: CompileProfilePlanOptions,
): CompileProfilePlanFromFilesResult {
  const loaded = loadJsonRuleSetManifest(manifestEntries);
  return compileProfilePlanFromLoadedRuleSetManifest(device, loaded, options);
}

export function compileProfilePlanFromRuleFilesWithCatalog(
  device: NormalizedZwaveDeviceFacts,
  ruleFilePaths: string[],
  catalogFilePath: string,
  options?: Omit<CompileProfilePlanOptions, 'catalogArtifact'>,
): CompileProfilePlanFromFilesResult {
  const catalogArtifact = loadCatalogDevicesArtifact(catalogFilePath) as CatalogDevicesArtifactV1;
  return compileProfilePlanFromRuleFiles(device, ruleFilePaths, {
    ...options,
    catalogArtifact,
  });
}

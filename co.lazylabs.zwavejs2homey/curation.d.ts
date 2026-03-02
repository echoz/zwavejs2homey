import type { CompiledHomeyProfilePlan } from '@zwavejs2homey/compiler';

export const CURATION_SETTINGS_KEY: 'curation.v1';
export const CURATION_SCHEMA_VERSION: 'homey-curation/v1';

export interface HomeyCurationTargetDeviceV1 {
  homeyDeviceId: string;
  catalogId?: string;
  diagnosticDeviceKey?: string;
}

export interface HomeyCurationBaselineMarkerV1 {
  projectionVersion: string;
  pipelineFingerprint?: string;
  baselineProfileHash: string;
  updatedAt: string;
}

export interface HomeyCurationCapabilityOverrideV1 {
  inboundMapping?: Record<string, unknown>;
  outboundMapping?: Record<string, unknown>;
  flags?: Record<string, unknown>;
}

export interface HomeyCurationCollectionsV1 {
  capabilitiesAdd?: unknown[];
  capabilitiesRemove?: unknown[];
  subscriptionsAdd?: unknown[];
  subscriptionsRemove?: unknown[];
  ignoredValuesAdd?: unknown[];
  ignoredValuesRemove?: unknown[];
}

export interface HomeyCurationOverridesV1 {
  deviceIdentity?: {
    homeyClass?: string;
    driverTemplateId?: string;
  };
  capabilities?: Record<string, HomeyCurationCapabilityOverrideV1>;
  collections?: HomeyCurationCollectionsV1;
}

export interface HomeyCurationEntryV1 {
  targetDevice: HomeyCurationTargetDeviceV1;
  baselineMarker: HomeyCurationBaselineMarkerV1;
  overrides?: HomeyCurationOverridesV1;
  note?: string;
  updatedAt: string;
}

export interface HomeyCurationDocumentV1 {
  schemaVersion: 'homey-curation/v1';
  updatedAt: string | null;
  entries: Record<string, HomeyCurationEntryV1>;
}

export interface HomeyCurationRuntimeStatusV1 {
  loaded: boolean;
  sourceKey: 'curation.v1';
  source: 'settings' | 'settings-default-empty';
  schemaVersion: 'homey-curation/v1' | null;
  updatedAt: string | null;
  entryCount: number;
  errorMessage: string | null;
}

export interface HomeyCurationRuntimeV1 {
  document: HomeyCurationDocumentV1;
  entriesByDeviceId: Map<string, HomeyCurationEntryV1>;
  status: HomeyCurationRuntimeStatusV1;
}

export interface HomeyCurationRuntimeAction {
  ruleId: string;
  kind:
    | 'set-device-identity'
    | 'set-capability'
    | 'add-capability'
    | 'remove-capability'
    | 'add-subscription'
    | 'remove-subscription'
    | 'add-ignored-value'
    | 'remove-ignored-value';
  path: string;
  payload: Record<string, unknown>;
}

export interface HomeyCurationApplyReport {
  loweredActions: HomeyCurationRuntimeAction[];
  appliedActions: Array<{
    ruleId: string;
    kind: HomeyCurationRuntimeAction['kind'];
    path: string;
  }>;
  skippedActions: Array<{
    ruleId: string;
    kind: HomeyCurationRuntimeAction['kind'];
    path: string;
    reason: string;
  }>;
  errors: Array<{
    ruleId: string;
    kind: HomeyCurationRuntimeAction['kind'];
    path: string;
    message: string;
  }>;
  summary: {
    lowered: number;
    applied: number;
    skipped: number;
    errors: number;
  };
}

export function loadCurationRuntimeFromSettings(settingsValue: unknown): HomeyCurationRuntimeV1;

export function resolveCurationEntryFromRuntime(
  runtime: HomeyCurationRuntimeV1 | undefined,
  homeyDeviceId: string,
): HomeyCurationEntryV1 | undefined;

export function lowerCurationEntryToRuntimeActions(
  curationEntry: HomeyCurationEntryV1 | undefined,
  options?: {
    homeyDeviceId?: string;
  },
): HomeyCurationRuntimeAction[];

export function applyCurationEntryToProfile(
  baseProfile: CompiledHomeyProfilePlan,
  curationEntry: HomeyCurationEntryV1 | undefined,
  options?: {
    homeyDeviceId?: string;
  },
): {
  profile: CompiledHomeyProfilePlan;
  report: HomeyCurationApplyReport;
};

import type {
  HomeyCapabilityPlan,
  HomeyInboundMapping,
  HomeyOutboundMapping,
  ProvenanceRecord,
} from '../models/homey-plan';
import type { NormalizedZwaveValueId } from '../models/zwave-facts';
import type {
  CapabilityRuleAction,
  DeviceIdentityRuleAction,
  RuleActionMode,
} from '../rules/types';
import { assertRuleActionModeAllowedForLayer, normalizeRuleActionMode } from './layer-semantics';

type CapabilityFlags = NonNullable<HomeyCapabilityPlan['flags']>;
const CAPABILITY_FLAG_KEYS: Array<keyof CapabilityFlags> = [
  'readable',
  'writeable',
  'assumedState',
  'debounceMs',
];

export interface ProfileBuildStateCapability extends HomeyCapabilityPlan {
  provenanceHistory: ProvenanceRecord[];
}

export type RuleActionApplyOutcome = 'created' | 'updated' | 'replaced' | 'noop';

export interface ProfileBuildState {
  appliedDeviceIdentityActions: Set<string>;
  deviceIdentity?: {
    homeyClass?: string;
    driverTemplateId?: string;
    provenance: ProvenanceRecord;
    provenanceHistory: ProvenanceRecord[];
  };
  capabilities: Map<string, ProfileBuildStateCapability>;
  ignoredValues: Map<string, { valueId: NormalizedZwaveValueId; provenance: ProvenanceRecord[] }>;
  suppressedActions: Array<{
    capabilityId?: string;
    slot:
      | 'deviceIdentity.homeyClass'
      | 'deviceIdentity.driverTemplateId'
      | 'capability'
      | 'inboundMapping'
      | 'outboundMapping'
      | 'flags';
    reason: 'occupied';
    mode: RuleActionMode;
    layer: ProvenanceRecord['layer'];
    ruleId: string;
  }>;
}

export function createProfileBuildState(): ProfileBuildState {
  return {
    appliedDeviceIdentityActions: new Set(),
    deviceIdentity: undefined,
    capabilities: new Map(),
    ignoredValues: new Map(),
    suppressedActions: [],
  };
}

export function applyDeviceIdentityRuleAction(
  state: ProfileBuildState,
  action: DeviceIdentityRuleAction,
  provenance: ProvenanceRecord,
): RuleActionApplyOutcome {
  const mode = normalizeRuleActionMode(action.mode);
  assertRuleActionModeAllowedForLayer(
    provenance.layer as Exclude<ProvenanceRecord['layer'], 'user-curation'>,
    mode,
  );

  const existing = state.deviceIdentity;
  if (!existing) {
    state.deviceIdentity = {
      homeyClass: action.homeyClass,
      driverTemplateId: action.driverTemplateId,
      provenance: { ...provenance, action: mode },
      provenanceHistory: [{ ...provenance, action: mode }],
    };
    return 'created';
  }

  if (mode === 'fill') {
    let changed = false;
    if (existing.homeyClass === undefined && action.homeyClass !== undefined) {
      existing.homeyClass = action.homeyClass;
      changed = true;
    } else if (existing.homeyClass !== undefined && action.homeyClass !== undefined) {
      state.suppressedActions.push({
        slot: 'deviceIdentity.homeyClass',
        reason: 'occupied',
        mode,
        layer: provenance.layer,
        ruleId: provenance.ruleId,
      });
    }
    if (existing.driverTemplateId === undefined && action.driverTemplateId !== undefined) {
      existing.driverTemplateId = action.driverTemplateId;
      changed = true;
    } else if (existing.driverTemplateId !== undefined && action.driverTemplateId !== undefined) {
      state.suppressedActions.push({
        slot: 'deviceIdentity.driverTemplateId',
        reason: 'occupied',
        mode,
        layer: provenance.layer,
        ruleId: provenance.ruleId,
      });
    }
    if (changed) {
      existing.provenanceHistory.push({ ...provenance, action: mode });
      return 'updated';
    }
    return 'noop';
  }

  if (mode === 'augment') {
    if (existing.homeyClass === undefined) existing.homeyClass = action.homeyClass;
    if (existing.driverTemplateId === undefined)
      existing.driverTemplateId = action.driverTemplateId;
    existing.provenanceHistory.push({ ...provenance, action: mode });
    return 'updated';
  }

  const superseded = existing.provenanceHistory.map((p) => `${p.layer}:${p.ruleId}`);
  existing.homeyClass = action.homeyClass;
  existing.driverTemplateId = action.driverTemplateId;
  existing.provenance = { ...provenance, action: mode, supersedes: superseded };
  existing.provenanceHistory.push({ ...provenance, action: mode, supersedes: superseded });
  return 'replaced';
}

function valueIdKey(valueId: NormalizedZwaveValueId): string {
  return JSON.stringify([
    valueId.commandClass,
    valueId.endpoint ?? 0,
    valueId.property,
    valueId.propertyKey ?? null,
  ]);
}

export function addIgnoredValue(
  state: ProfileBuildState,
  valueId: NormalizedZwaveValueId,
  provenance: ProvenanceRecord,
): void {
  const key = valueIdKey(valueId);
  const existing = state.ignoredValues.get(key);
  if (existing) {
    existing.provenance.push({ ...provenance });
    return;
  }
  state.ignoredValues.set(key, {
    valueId: { ...valueId },
    provenance: [{ ...provenance }],
  });
}

function cloneInboundMapping(
  mapping: HomeyInboundMapping | undefined,
): HomeyInboundMapping | undefined {
  return mapping
    ? {
        ...mapping,
        selector:
          'eventType' in mapping.selector ? { ...mapping.selector } : { ...mapping.selector },
        watchers: mapping.watchers?.map((watcher) =>
          'eventType' in watcher ? { ...watcher } : { ...watcher },
        ),
        transformParams: mapping.transformParams ? { ...mapping.transformParams } : undefined,
      }
    : undefined;
}

function cloneOutboundMapping(
  mapping: HomeyOutboundMapping | undefined,
): HomeyOutboundMapping | undefined {
  return mapping
    ? {
        ...mapping,
        target: 'command' in mapping.target ? { ...mapping.target } : { ...mapping.target },
        transformParams: mapping.transformParams ? { ...mapping.transformParams } : undefined,
        validation: mapping.validation
          ? {
              ...mapping.validation,
              enum: mapping.validation.enum ? [...mapping.validation.enum] : undefined,
            }
          : undefined,
        executionHints: mapping.executionHints ? { ...mapping.executionHints } : undefined,
      }
    : undefined;
}

function mergeFlags(
  current: HomeyCapabilityPlan['flags'] | undefined,
  next: HomeyCapabilityPlan['flags'] | undefined,
): HomeyCapabilityPlan['flags'] | undefined {
  if (!next) return current ? { ...current } : undefined;
  return { ...(current ?? {}), ...next };
}

function deriveDirectionality(action: CapabilityRuleAction): HomeyCapabilityPlan['directionality'] {
  if (action.inboundMapping && action.outboundMapping) return 'bidirectional';
  if (action.outboundMapping) return 'outbound-only';
  return 'inbound-only';
}

function pushSuppressed(
  state: ProfileBuildState,
  action: CapabilityRuleAction,
  slot: 'capability' | 'inboundMapping' | 'outboundMapping' | 'flags',
  mode: RuleActionMode,
  provenance: ProvenanceRecord,
): void {
  state.suppressedActions.push({
    capabilityId: action.capabilityId,
    slot,
    reason: 'occupied',
    mode,
    layer: provenance.layer,
    ruleId: provenance.ruleId,
  });
}

export function applyCapabilityRuleAction(
  state: ProfileBuildState,
  action: CapabilityRuleAction,
  provenance: ProvenanceRecord,
): RuleActionApplyOutcome {
  const mode = normalizeRuleActionMode(action.mode);
  assertRuleActionModeAllowedForLayer(
    provenance.layer as Exclude<ProvenanceRecord['layer'], 'user-curation'>,
    mode,
  );

  const existing = state.capabilities.get(action.capabilityId);

  if (!existing) {
    if (mode === 'augment') {
      // Augment against missing target behaves as fill in v1.
    }
    state.capabilities.set(action.capabilityId, {
      capabilityId: action.capabilityId,
      inboundMapping: cloneInboundMapping(action.inboundMapping),
      outboundMapping: cloneOutboundMapping(action.outboundMapping),
      directionality: deriveDirectionality(action),
      flags: mergeFlags(undefined, action.flags),
      provenance: { ...provenance, action: mode },
      provenanceHistory: [{ ...provenance, action: mode }],
    });
    return 'created';
  }

  if (mode === 'fill') {
    let changed = false;
    if (!existing.inboundMapping && action.inboundMapping) {
      existing.inboundMapping = cloneInboundMapping(action.inboundMapping);
      changed = true;
    } else if (existing.inboundMapping && action.inboundMapping) {
      pushSuppressed(state, action, 'inboundMapping', mode, provenance);
    }

    if (!existing.outboundMapping && action.outboundMapping) {
      existing.outboundMapping = cloneOutboundMapping(action.outboundMapping);
      changed = true;
    } else if (existing.outboundMapping && action.outboundMapping) {
      pushSuppressed(state, action, 'outboundMapping', mode, provenance);
    }

    if (!existing.flags && action.flags) {
      existing.flags = mergeFlags(undefined, action.flags);
      changed = true;
    } else if (existing.flags && action.flags) {
      const missingKeys = CAPABILITY_FLAG_KEYS.filter(
        (key) => action.flags?.[key] !== undefined && existing.flags?.[key] === undefined,
      );
      if (missingKeys.length > 0) {
        existing.flags = mergeFlags(existing.flags, action.flags);
        changed = true;
      } else {
        pushSuppressed(state, action, 'flags', mode, provenance);
      }
    }

    if (changed) {
      existing.directionality =
        existing.inboundMapping && existing.outboundMapping
          ? 'bidirectional'
          : existing.outboundMapping
            ? 'outbound-only'
            : 'inbound-only';
      existing.provenanceHistory.push({ ...provenance, action: mode });
      return 'updated';
    }
    return 'noop';
  }

  if (mode === 'augment') {
    const nextInbound =
      existing.inboundMapping && action.inboundMapping
        ? {
            ...existing.inboundMapping,
            watchers: [
              ...(existing.inboundMapping.watchers ?? []),
              ...(action.inboundMapping.watchers ?? []),
            ],
          }
        : (existing.inboundMapping ?? cloneInboundMapping(action.inboundMapping));

    const nextOutbound = existing.outboundMapping ?? cloneOutboundMapping(action.outboundMapping);
    const nextFlags = mergeFlags(existing.flags, action.flags);

    existing.inboundMapping = nextInbound;
    existing.outboundMapping = nextOutbound;
    existing.flags = nextFlags;
    existing.directionality =
      existing.inboundMapping && existing.outboundMapping
        ? 'bidirectional'
        : existing.outboundMapping
          ? 'outbound-only'
          : 'inbound-only';
    existing.provenanceHistory.push({ ...provenance, action: mode });
    return 'updated';
  }

  // replace
  const superseded = existing.provenanceHistory.map((p) => `${p.layer}:${p.ruleId}`);
  existing.inboundMapping = cloneInboundMapping(action.inboundMapping);
  existing.outboundMapping = cloneOutboundMapping(action.outboundMapping);
  existing.flags = mergeFlags(undefined, action.flags);
  existing.directionality = deriveDirectionality(action);
  existing.provenance = { ...provenance, action: mode, supersedes: superseded };
  existing.provenanceHistory.push({ ...provenance, action: mode, supersedes: superseded });
  return 'replaced';
}

export function materializeCapabilityPlans(state: ProfileBuildState): HomeyCapabilityPlan[] {
  return [...state.capabilities.values()]
    .map((cap) => ({
      capabilityId: cap.capabilityId,
      inboundMapping: cap.inboundMapping,
      outboundMapping: cap.outboundMapping,
      directionality: cap.directionality,
      flags: cap.flags,
      provenance: cap.provenance,
    }))
    .sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
}

export function materializeIgnoredValues(state: ProfileBuildState): NormalizedZwaveValueId[] {
  return [...state.ignoredValues.values()]
    .map((entry) => ({ ...entry.valueId }))
    .sort((a, b) => {
      if (a.commandClass !== b.commandClass) return a.commandClass - b.commandClass;
      const aEp = a.endpoint ?? 0;
      const bEp = b.endpoint ?? 0;
      if (aEp !== bEp) return aEp - bEp;
      const aProp = String(a.property);
      const bProp = String(b.property);
      if (aProp !== bProp) return aProp.localeCompare(bProp);
      return String(a.propertyKey ?? '').localeCompare(String(b.propertyKey ?? ''));
    });
}

export function materializeDeviceIdentity(state: ProfileBuildState):
  | {
      homeyClass?: string;
      driverTemplateId?: string;
      provenance?: ProvenanceRecord;
    }
  | undefined {
  if (!state.deviceIdentity) return undefined;
  return {
    homeyClass: state.deviceIdentity.homeyClass,
    driverTemplateId: state.deviceIdentity.driverTemplateId,
    provenance: state.deviceIdentity.provenance,
  };
}

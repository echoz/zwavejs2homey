import type { HomeyCapabilityPlan, ProvenanceRecord } from '../models/homey-plan';
import type { NormalizedZwaveValueId } from '../models/zwave-facts';
import type { CapabilityRuleAction, DeviceIdentityRuleAction, RuleActionMode } from '../rules/types';
export interface ProfileBuildStateCapability extends HomeyCapabilityPlan {
    conflict?: {
        key: string;
        mode: 'exclusive' | 'allow-multi';
        priority: number;
    };
    provenanceHistory: ProvenanceRecord[];
}
export type RuleActionApplyOutcome = 'created' | 'updated' | 'replaced' | 'noop';
export interface ProfileBuildState {
    collectSuppressedActions: boolean;
    suppressedFillActionsCount: number;
    hasPotentialConflicts: boolean;
    appliedDeviceIdentityActions: Set<string>;
    deviceIdentity?: {
        homeyClass?: string;
        driverTemplateId?: string;
        provenance: ProvenanceRecord;
        provenanceHistory: ProvenanceRecord[];
    };
    capabilities: Map<string, ProfileBuildStateCapability>;
    ignoredValues: Map<string, {
        valueId: NormalizedZwaveValueId;
        provenance: ProvenanceRecord[];
    }>;
    suppressedActions: Array<{
        capabilityId?: string;
        slot: 'deviceIdentity.homeyClass' | 'deviceIdentity.driverTemplateId' | 'capability' | 'inboundMapping' | 'outboundMapping' | 'flags' | 'conflict';
        reason: 'occupied';
        mode: RuleActionMode;
        layer: ProvenanceRecord['layer'];
        ruleId: string;
    }>;
}
export declare function createProfileBuildState(options?: {
    collectSuppressedActions?: boolean;
}): ProfileBuildState;
export declare function applyDeviceIdentityRuleAction(state: ProfileBuildState, action: DeviceIdentityRuleAction, provenance: ProvenanceRecord): RuleActionApplyOutcome;
export declare function addIgnoredValue(state: ProfileBuildState, valueId: NormalizedZwaveValueId, provenance: ProvenanceRecord): void;
export declare function applyCapabilityRuleAction(state: ProfileBuildState, action: CapabilityRuleAction, provenance: ProvenanceRecord): RuleActionApplyOutcome;
export declare function removeCapabilityRuleAction(state: ProfileBuildState, capabilityId: string): boolean;
export declare function materializeCapabilityPlans(state: ProfileBuildState): HomeyCapabilityPlan[];
export interface CapabilityConflictSuppression {
    capabilityId: string;
    winnerCapabilityId: string;
    selectorKey: string;
    conflictKey: string;
    reason: string;
}
export declare function resolveCapabilityConflicts(state: ProfileBuildState): {
    suppressedCapabilities: CapabilityConflictSuppression[];
};
export declare function materializeIgnoredValues(state: ProfileBuildState): NormalizedZwaveValueId[];
export declare function materializeDeviceIdentity(state: ProfileBuildState): {
    homeyClass?: string;
    driverTemplateId?: string;
    provenance?: ProvenanceRecord;
} | undefined;

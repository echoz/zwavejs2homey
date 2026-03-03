import type { HomeyCapabilityPlan } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueId } from '../models/zwave-facts';
import type { MappingRule } from '../rules/types';
import type { AppliedRuleActionResult } from './apply-rule';
import { type CapabilityConflictSuppression, createProfileBuildState } from './profile-build-state';
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
export declare function compileDevice(device: NormalizedZwaveDeviceFacts, rules: MappingRule[], options?: CompileDeviceOptions): CompileDeviceResult;

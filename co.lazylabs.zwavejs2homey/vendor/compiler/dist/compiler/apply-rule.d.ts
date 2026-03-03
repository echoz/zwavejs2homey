import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueFacts } from '../models/zwave-facts';
import type { MappingRule, RuleAction } from '../rules/types';
import { type ProfileBuildState } from './profile-build-state';
export interface AppliedRuleActionResult {
    ruleId: string;
    actionType: RuleAction['type'];
    applied: boolean;
    changed?: boolean;
    reason?: 'rule-not-matched' | 'device-identity-already-applied';
}
export interface ApplyRuleToValueSummaryResult {
    matched: boolean;
    actionCount: number;
    appliedChangedActions: number;
}
export declare function applyRuleToValue(state: ProfileBuildState, device: NormalizedZwaveDeviceFacts, value: NormalizedZwaveValueFacts, rule: MappingRule): AppliedRuleActionResult[];
export declare function applyRuleToValueAssumingDeviceEligible(state: ProfileBuildState, value: NormalizedZwaveValueFacts, rule: MappingRule): AppliedRuleActionResult[];
export declare function applyRuleToValueSummary(state: ProfileBuildState, device: NormalizedZwaveDeviceFacts, value: NormalizedZwaveValueFacts, rule: MappingRule): ApplyRuleToValueSummaryResult;
export declare function applyRuleToValueSummaryAssumingDeviceEligible(state: ProfileBuildState, value: NormalizedZwaveValueFacts, rule: MappingRule): ApplyRuleToValueSummaryResult;

import type { NormalizedZwaveDeviceFacts, NormalizedZwaveValueFacts } from '../models/zwave-facts';
import type { MappingRule, RuleDeviceMatcher, RuleValueMatcher } from '../rules/types';
export declare function matchesDevice(device: NormalizedZwaveDeviceFacts, matcher?: RuleDeviceMatcher): boolean;
export declare function matchesValue(value: NormalizedZwaveValueFacts, matcher?: RuleValueMatcher): boolean;
export declare function matchesValueAfterSelectorGates(value: NormalizedZwaveValueFacts, matcher?: RuleValueMatcher): boolean;
export declare function valueMatcherMatchesAny(values: NormalizedZwaveValueFacts[], matcher: RuleValueMatcher): boolean;
export declare function matchesRuleCompanionConstraints(device: NormalizedZwaveDeviceFacts, rule: MappingRule): boolean;
export declare function matchesRuleForValue(device: NormalizedZwaveDeviceFacts, value: NormalizedZwaveValueFacts, rule: MappingRule): boolean;

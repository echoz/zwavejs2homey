import type { RuleActionMode, RuleLayer } from '../rules/types';
export declare const RULE_LAYER_ORDER: readonly RuleLayer[];
export declare function getRuleLayerOrder(): RuleLayer[];
export declare function isRuleActionModeAllowedForLayer(layer: RuleLayer, mode: RuleActionMode): boolean;
export declare function assertRuleActionModeAllowedForLayer(layer: RuleLayer, mode: RuleActionMode): void;
export declare function normalizeRuleActionMode(mode?: RuleActionMode): RuleActionMode;

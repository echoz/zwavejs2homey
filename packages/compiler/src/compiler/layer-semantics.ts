import type { RuleActionMode, RuleLayer } from '../rules/types';

export const RULE_LAYER_ORDER: readonly RuleLayer[] = [
  'ha-derived',
  'project-product',
  'project-generic',
] as const;

export function getRuleLayerOrder(): RuleLayer[] {
  return [...RULE_LAYER_ORDER];
}

export function isRuleActionModeAllowedForLayer(layer: RuleLayer, mode: RuleActionMode): boolean {
  if (mode === 'fill' || mode === 'augment') {
    return true;
  }

  if (mode === 'replace') {
    return layer === 'project-product';
  }

  return false;
}

export function assertRuleActionModeAllowedForLayer(layer: RuleLayer, mode: RuleActionMode): void {
  if (!isRuleActionModeAllowedForLayer(layer, mode)) {
    throw new Error(`Rule action mode "${mode}" is not allowed in layer "${layer}"`);
  }
}

export function normalizeRuleActionMode(mode?: RuleActionMode): RuleActionMode {
  return mode ?? 'fill';
}

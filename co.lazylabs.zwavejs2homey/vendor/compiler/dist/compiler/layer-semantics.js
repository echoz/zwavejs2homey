"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RULE_LAYER_ORDER = void 0;
exports.getRuleLayerOrder = getRuleLayerOrder;
exports.isRuleActionModeAllowedForLayer = isRuleActionModeAllowedForLayer;
exports.assertRuleActionModeAllowedForLayer = assertRuleActionModeAllowedForLayer;
exports.normalizeRuleActionMode = normalizeRuleActionMode;
exports.RULE_LAYER_ORDER = [
    'ha-derived',
    'project-product',
    'project-generic',
];
function getRuleLayerOrder() {
    return [...exports.RULE_LAYER_ORDER];
}
function isRuleActionModeAllowedForLayer(layer, mode) {
    if (mode === 'fill' || mode === 'augment') {
        return true;
    }
    if (mode === 'replace') {
        return layer === 'project-product';
    }
    return false;
}
function assertRuleActionModeAllowedForLayer(layer, mode) {
    if (!isRuleActionModeAllowedForLayer(layer, mode)) {
        throw new Error(`Rule action mode "${mode}" is not allowed in layer "${layer}"`);
    }
}
function normalizeRuleActionMode(mode) {
    return mode ?? 'fill';
}

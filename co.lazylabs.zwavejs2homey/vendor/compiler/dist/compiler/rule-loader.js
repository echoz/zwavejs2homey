"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateJsonRuleArray = exports.RuleFileLoadError = exports.RuleSetLoadError = void 0;
exports.loadJsonRuleFile = loadJsonRuleFile;
exports.loadJsonRuleFiles = loadJsonRuleFiles;
exports.loadJsonRuleSetManifest = loadJsonRuleSetManifest;
exports.loadJsonRuleSetManifestWithOptions = loadJsonRuleSetManifestWithOptions;
const fs = require('node:fs');
const generated_rule_artifact_1 = require("../importers/ha/generated-rule-artifact");
const rule_validation_1 = require("./rule-validation");
const layer_semantics_1 = require("./layer-semantics");
class RuleSetLoadError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RuleSetLoadError';
    }
}
exports.RuleSetLoadError = RuleSetLoadError;
function isObject(value) {
    return typeof value === 'object' && value !== null;
}
function parseProductRulesBundleV1(parsed, filePath, options) {
    if (!isObject(parsed)) {
        throw new rule_validation_1.RuleFileLoadError('product-rules/v1 file must be a JSON object', filePath);
    }
    if (options?.declaredLayer && options.declaredLayer !== 'project-product') {
        throw new rule_validation_1.RuleFileLoadError(`product-rules/v1 file can only be loaded with manifest layer "project-product" (got "${options.declaredLayer}")`, filePath);
    }
    const allowedTopLevelKeys = new Set(['schemaVersion', 'name', 'target', 'rules']);
    for (const key of Object.keys(parsed)) {
        if (!allowedTopLevelKeys.has(key)) {
            throw new rule_validation_1.RuleFileLoadError(`product-rules/v1 file has unsupported top-level field "${key}"`, filePath);
        }
    }
    if (parsed.schemaVersion !== 'product-rules/v1') {
        throw new rule_validation_1.RuleFileLoadError('schemaVersion must be "product-rules/v1"', filePath);
    }
    if (parsed.name !== undefined &&
        (typeof parsed.name !== 'string' || parsed.name.trim().length === 0)) {
        throw new rule_validation_1.RuleFileLoadError('product-rules/v1 name must be a non-empty string when provided', filePath);
    }
    const target = parsed.target;
    if (!isObject(target)) {
        throw new rule_validation_1.RuleFileLoadError('product-rules/v1 target must be an object', filePath);
    }
    for (const key of Object.keys(target)) {
        if (!['manufacturerId', 'productType', 'productId'].includes(key)) {
            throw new rule_validation_1.RuleFileLoadError(`product-rules/v1 target has unsupported field "${key}"`, filePath);
        }
    }
    const hasValidTargetId = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
    if (!hasValidTargetId(target.manufacturerId)) {
        throw new rule_validation_1.RuleFileLoadError('product-rules/v1 target.manufacturerId must be a non-negative integer', filePath);
    }
    if (!hasValidTargetId(target.productType)) {
        throw new rule_validation_1.RuleFileLoadError('product-rules/v1 target.productType must be a non-negative integer', filePath);
    }
    if (!hasValidTargetId(target.productId)) {
        throw new rule_validation_1.RuleFileLoadError('product-rules/v1 target.productId must be a non-negative integer', filePath);
    }
    if (!Array.isArray(parsed.rules)) {
        throw new rule_validation_1.RuleFileLoadError('product-rules/v1 rules must be an array', filePath);
    }
    const expandedRules = parsed.rules.map((rule, index) => {
        if (!isObject(rule)) {
            throw new rule_validation_1.RuleFileLoadError(`product-rules/v1 rules[${index}] must be an object`, filePath);
        }
        if (rule.layer !== undefined) {
            throw new rule_validation_1.RuleFileLoadError(`product-rules/v1 rules[${index}] must not define layer`, filePath);
        }
        if (rule.device !== undefined) {
            throw new rule_validation_1.RuleFileLoadError(`product-rules/v1 rules[${index}] must not define device`, filePath);
        }
        return {
            ...rule,
            layer: 'project-product',
            device: {
                manufacturerId: [target.manufacturerId],
                productType: [target.productType],
                productId: [target.productId],
            },
        };
    });
    return (0, rule_validation_1.validateJsonRuleArray)(expandedRules, filePath);
}
function loadJsonRuleFile(filePath, options) {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown parse/read error';
        throw new rule_validation_1.RuleFileLoadError(`Failed to read or parse JSON rule file: ${message}`, filePath);
    }
    if (isObject(parsed) && parsed.schemaVersion === 'product-rules/v1') {
        return parseProductRulesBundleV1(parsed, filePath, options);
    }
    if (options?.declaredLayer === 'project-product') {
        throw new rule_validation_1.RuleFileLoadError('Manifest layer "project-product" requires schemaVersion "product-rules/v1" bundle files', filePath);
    }
    if (options?.declaredLayer) {
        return (0, rule_validation_1.validateJsonRuleArrayWithOptions)(parsed, filePath, options);
    }
    return (0, rule_validation_1.validateJsonRuleArray)(parsed, filePath, options);
}
function loadJsonRuleFiles(filePaths) {
    return filePaths.map((filePath) => ({ filePath, rules: loadJsonRuleFile(filePath) }));
}
function loadJsonRuleSetManifest(entries) {
    return loadJsonRuleSetManifestWithOptions(entries);
}
function loadJsonRuleSetManifestWithOptions(entries, options) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new RuleSetLoadError('Manifest must include at least one entry');
    }
    const seenFilePaths = new Set();
    for (const [index, entry] of entries.entries()) {
        if (typeof entry.filePath !== 'string' || entry.filePath.length === 0) {
            throw new RuleSetLoadError(`Manifest entry ${index} requires a non-empty filePath`);
        }
        if (seenFilePaths.has(entry.filePath)) {
            throw new RuleSetLoadError(`Duplicate manifest filePath detected at entry ${index}: ${entry.filePath}`);
        }
        seenFilePaths.add(entry.filePath);
    }
    for (const [index, entry] of entries.entries()) {
        if (entry.kind !== undefined &&
            entry.kind !== 'rules-json' &&
            entry.kind !== 'ha-derived-generated') {
            throw new RuleSetLoadError(`Manifest entry ${index} has unsupported kind "${String(entry.kind)}"`);
        }
    }
    const layerOrder = (0, layer_semantics_1.getRuleLayerOrder)();
    let previousDeclaredLayerIndex = -1;
    for (const [index, entry] of entries.entries()) {
        if (!entry.layer)
            continue;
        const currentLayerIndex = layerOrder.indexOf(entry.layer);
        if (currentLayerIndex === -1) {
            throw new RuleSetLoadError(`Manifest entry ${index} has unsupported layer "${String(entry.layer)}"`);
        }
        if (currentLayerIndex < previousDeclaredLayerIndex) {
            throw new RuleSetLoadError(`Manifest entry ${index} layer "${entry.layer}" is out of order; expected non-decreasing layer order ${layerOrder.join(' -> ')}`);
        }
        previousDeclaredLayerIndex = currentLayerIndex;
    }
    const loaded = entries.map((entry) => ({
        filePath: entry.filePath,
        declaredLayer: entry.layer,
        resolvedLayer: undefined,
        rules: entry.kind === 'ha-derived-generated'
            ? (0, generated_rule_artifact_1.loadHaDerivedGeneratedRuleArtifact)(entry.filePath).rules
            : loadJsonRuleFile(entry.filePath, {
                declaredLayer: entry.layer,
                vocabulary: options?.vocabulary,
            }),
    }));
    const ruleIdCounts = new Map();
    for (const file of loaded) {
        const layersInFile = new Set();
        for (const rule of file.rules) {
            if (file.declaredLayer && rule.layer !== file.declaredLayer) {
                throw new RuleSetLoadError(`Rule "${rule.ruleId}" in ${file.filePath} has layer "${rule.layer}" but manifest declares "${file.declaredLayer}"`);
            }
            if (!layerOrder.includes(rule.layer)) {
                throw new RuleSetLoadError(`Rule "${rule.ruleId}" has unsupported layer "${String(rule.layer)}"`);
            }
            layersInFile.add(rule.layer);
            ruleIdCounts.set(rule.ruleId, (ruleIdCounts.get(rule.ruleId) ?? 0) + 1);
        }
        if (layersInFile.size === 1) {
            file.resolvedLayer = [...layersInFile][0];
        }
    }
    const duplicateRuleIds = [...ruleIdCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([ruleId]) => ruleId)
        .sort();
    if (duplicateRuleIds.length > 0) {
        throw new RuleSetLoadError(`Duplicate ruleId(s) detected: ${duplicateRuleIds.join(', ')}`);
    }
    return {
        entries: loaded,
        duplicateRuleIds,
    };
}
var rule_validation_2 = require("./rule-validation");
Object.defineProperty(exports, "RuleFileLoadError", { enumerable: true, get: function () { return rule_validation_2.RuleFileLoadError; } });
Object.defineProperty(exports, "validateJsonRuleArray", { enumerable: true, get: function () { return rule_validation_2.validateJsonRuleArray; } });

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HaGeneratedRuleArtifactError = void 0;
exports.loadHaDerivedGeneratedRuleArtifact = loadHaDerivedGeneratedRuleArtifact;
const fs = require('node:fs');
const rule_validation_1 = require("../../compiler/rule-validation");
class HaGeneratedRuleArtifactError extends Error {
    constructor(message, filePath) {
        super(message);
        this.filePath = filePath;
        this.name = 'HaGeneratedRuleArtifactError';
    }
}
exports.HaGeneratedRuleArtifactError = HaGeneratedRuleArtifactError;
function isObject(value) {
    return typeof value === 'object' && value !== null;
}
function validateTopLevelShape(parsed, filePath) {
    if (!isObject(parsed)) {
        throw new HaGeneratedRuleArtifactError('Generated HA rule artifact must be an object', filePath);
    }
    if (parsed.schemaVersion !== 'ha-derived-rules/v1') {
        throw new HaGeneratedRuleArtifactError(`Unsupported HA rule artifact schemaVersion: ${String(parsed.schemaVersion)}`, filePath);
    }
    if (!isObject(parsed.source)) {
        throw new HaGeneratedRuleArtifactError('Generated HA rule artifact is missing source metadata', filePath);
    }
    if (parsed.source.upstream !== 'home-assistant' || parsed.source.component !== 'zwave_js') {
        throw new HaGeneratedRuleArtifactError('Generated HA rule artifact source must be home-assistant/zwave_js', filePath);
    }
    if (typeof parsed.source.generatedAt !== 'string' || parsed.source.generatedAt.length === 0) {
        throw new HaGeneratedRuleArtifactError('Generated HA rule artifact source.generatedAt must be a non-empty string', filePath);
    }
}
function loadHaDerivedGeneratedRuleArtifact(filePath) {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown parse/read error';
        throw new HaGeneratedRuleArtifactError(`Failed to read or parse generated HA rule artifact: ${message}`, filePath);
    }
    validateTopLevelShape(parsed, filePath);
    let rules;
    try {
        rules = (0, rule_validation_1.validateJsonRuleArray)(parsed.rules, filePath);
    }
    catch (error) {
        if (error instanceof rule_validation_1.RuleFileLoadError) {
            throw new HaGeneratedRuleArtifactError(error.message, filePath);
        }
        throw error;
    }
    // Enforce ha-derived layer for generated artifacts in v1.
    for (const rule of rules) {
        if (rule.layer !== 'ha-derived') {
            throw new HaGeneratedRuleArtifactError(`Generated HA rule artifact contains non-ha-derived rule: ${rule.ruleId} (${rule.layer})`, filePath);
        }
    }
    return {
        schemaVersion: 'ha-derived-rules/v1',
        source: {
            upstream: 'home-assistant',
            component: 'zwave_js',
            generatedAt: parsed.source.generatedAt,
            sourceRef: typeof parsed.source.sourceRef === 'string' ? parsed.source.sourceRef : undefined,
        },
        rules,
    };
}

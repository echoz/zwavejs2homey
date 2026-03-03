"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompiledHomeyProfilesArtifactError = exports.COMPILED_HOMEY_PROFILES_ARTIFACT_V1 = void 0;
exports.assertCompiledHomeyProfilesArtifactV1 = assertCompiledHomeyProfilesArtifactV1;
exports.createCompiledHomeyProfilesArtifactV1 = createCompiledHomeyProfilesArtifactV1;
exports.COMPILED_HOMEY_PROFILES_ARTIFACT_V1 = 'compiled-homey-profiles/v1';
class CompiledHomeyProfilesArtifactError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CompiledHomeyProfilesArtifactError';
    }
}
exports.CompiledHomeyProfilesArtifactError = CompiledHomeyProfilesArtifactError;
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isRuleLayer(value) {
    return value === 'ha-derived' || value === 'project-product' || value === 'project-generic';
}
function assertCompiledHomeyProfilesArtifactV1(input) {
    if (!isObject(input))
        throw new CompiledHomeyProfilesArtifactError('artifact must be an object');
    if (input.schemaVersion !== exports.COMPILED_HOMEY_PROFILES_ARTIFACT_V1) {
        throw new CompiledHomeyProfilesArtifactError(`schemaVersion must be ${exports.COMPILED_HOMEY_PROFILES_ARTIFACT_V1}`);
    }
    if (typeof input.generatedAt !== 'string' || input.generatedAt.length === 0) {
        throw new CompiledHomeyProfilesArtifactError('generatedAt must be a non-empty string');
    }
    if (!isObject(input.source)) {
        throw new CompiledHomeyProfilesArtifactError('source must be an object');
    }
    if (input.source.manifestFile !== undefined && typeof input.source.manifestFile !== 'string') {
        throw new CompiledHomeyProfilesArtifactError('source.manifestFile must be a string');
    }
    if (input.source.rulesFiles !== undefined &&
        (!Array.isArray(input.source.rulesFiles) ||
            input.source.rulesFiles.some((item) => typeof item !== 'string'))) {
        throw new CompiledHomeyProfilesArtifactError('source.rulesFiles must be an array of strings');
    }
    if (input.source.catalogFile !== undefined && typeof input.source.catalogFile !== 'string') {
        throw new CompiledHomeyProfilesArtifactError('source.catalogFile must be a string');
    }
    if (input.source.buildProfile !== undefined &&
        input.source.buildProfile !== 'default-manifest' &&
        input.source.buildProfile !== 'manifest-file' &&
        input.source.buildProfile !== 'rules-files') {
        throw new CompiledHomeyProfilesArtifactError('source.buildProfile must be default-manifest, manifest-file, or rules-files');
    }
    if (input.source.pipelineFingerprint !== undefined &&
        typeof input.source.pipelineFingerprint !== 'string') {
        throw new CompiledHomeyProfilesArtifactError('source.pipelineFingerprint must be a string');
    }
    if (input.source.ruleSources !== undefined) {
        if (!Array.isArray(input.source.ruleSources)) {
            throw new CompiledHomeyProfilesArtifactError('source.ruleSources must be an array');
        }
        for (let i = 0; i < input.source.ruleSources.length; i += 1) {
            const source = input.source.ruleSources[i];
            if (!isObject(source)) {
                throw new CompiledHomeyProfilesArtifactError(`source.ruleSources[${i}] must be an object`);
            }
            if (typeof source.filePath !== 'string' || source.filePath.length === 0) {
                throw new CompiledHomeyProfilesArtifactError(`source.ruleSources[${i}].filePath must be a non-empty string`);
            }
            if (typeof source.ruleCount !== 'number' || !Number.isInteger(source.ruleCount)) {
                throw new CompiledHomeyProfilesArtifactError(`source.ruleSources[${i}].ruleCount must be an integer`);
            }
            if (source.declaredLayer !== undefined && !isRuleLayer(source.declaredLayer)) {
                throw new CompiledHomeyProfilesArtifactError(`source.ruleSources[${i}].declaredLayer is invalid`);
            }
            if (source.resolvedLayer !== undefined && !isRuleLayer(source.resolvedLayer)) {
                throw new CompiledHomeyProfilesArtifactError(`source.ruleSources[${i}].resolvedLayer is invalid`);
            }
        }
    }
    if (!Array.isArray(input.entries)) {
        throw new CompiledHomeyProfilesArtifactError('entries must be an array');
    }
    for (let i = 0; i < input.entries.length; i += 1) {
        const entry = input.entries[i];
        if (!isObject(entry)) {
            throw new CompiledHomeyProfilesArtifactError(`entries[${i}] must be an object`);
        }
        if (!isObject(entry.device) || typeof entry.device.deviceKey !== 'string') {
            throw new CompiledHomeyProfilesArtifactError(`entries[${i}].device.deviceKey is required`);
        }
        if (!isObject(entry.compiled) ||
            !isObject(entry.compiled.profile) ||
            !isObject(entry.compiled.report)) {
            throw new CompiledHomeyProfilesArtifactError(`entries[${i}].compiled must include profile and report objects`);
        }
    }
}
function createCompiledHomeyProfilesArtifactV1(entries, source, now = new Date()) {
    return {
        schemaVersion: exports.COMPILED_HOMEY_PROFILES_ARTIFACT_V1,
        generatedAt: now.toISOString(),
        source,
        entries,
    };
}

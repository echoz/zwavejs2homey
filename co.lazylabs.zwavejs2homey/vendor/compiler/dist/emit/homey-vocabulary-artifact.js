"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomeyVocabularyArtifactError = exports.HOMEY_VOCABULARY_ARTIFACT_V1 = void 0;
exports.assertHomeyVocabularyArtifactV1 = assertHomeyVocabularyArtifactV1;
exports.createHomeyVocabularyArtifactV1 = createHomeyVocabularyArtifactV1;
exports.loadHomeyVocabularyArtifact = loadHomeyVocabularyArtifact;
exports.createHomeyVocabularyLookupV1 = createHomeyVocabularyLookupV1;
const node_fs_1 = __importDefault(require("node:fs"));
exports.HOMEY_VOCABULARY_ARTIFACT_V1 = 'homey-vocabulary/v1';
class HomeyVocabularyArtifactError extends Error {
    constructor(message) {
        super(message);
        this.name = 'HomeyVocabularyArtifactError';
    }
}
exports.HomeyVocabularyArtifactError = HomeyVocabularyArtifactError;
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertSourceRef(value, fieldPath) {
    if (!isObject(value)) {
        throw new HomeyVocabularyArtifactError(`${fieldPath} must be an object`);
    }
    if (value.source !== 'homey-lib-system' && value.source !== 'homey-compose-custom') {
        throw new HomeyVocabularyArtifactError(`${fieldPath}.source must be "homey-lib-system" or "homey-compose-custom"`);
    }
    if (typeof value.sourceRef !== 'string' || value.sourceRef.length === 0) {
        throw new HomeyVocabularyArtifactError(`${fieldPath}.sourceRef must be a non-empty string`);
    }
}
function assertEntry(value, fieldPath) {
    if (!isObject(value)) {
        throw new HomeyVocabularyArtifactError(`${fieldPath} must be an object`);
    }
    if (typeof value.id !== 'string' || value.id.length === 0) {
        throw new HomeyVocabularyArtifactError(`${fieldPath}.id must be a non-empty string`);
    }
    if (!Array.isArray(value.sources) || value.sources.length === 0) {
        throw new HomeyVocabularyArtifactError(`${fieldPath}.sources must be a non-empty array`);
    }
    value.sources.forEach((source, index) => {
        assertSourceRef(source, `${fieldPath}.sources[${index}]`);
    });
}
function normalizeEntry(entry) {
    const seenSources = new Set();
    const sources = entry.sources
        .filter((source) => {
        const key = `${source.source}|${source.sourceRef}`;
        if (seenSources.has(key))
            return false;
        seenSources.add(key);
        return true;
    })
        .sort((a, b) => a.source === b.source
        ? a.sourceRef.localeCompare(b.sourceRef)
        : a.source.localeCompare(b.source));
    return {
        id: entry.id,
        sources,
    };
}
function normalizeEntries(entries) {
    return entries.map((entry) => normalizeEntry(entry)).sort((a, b) => a.id.localeCompare(b.id));
}
function assertHomeyVocabularyArtifactV1(input) {
    if (!isObject(input)) {
        throw new HomeyVocabularyArtifactError('artifact must be an object');
    }
    if (input.schemaVersion !== exports.HOMEY_VOCABULARY_ARTIFACT_V1) {
        throw new HomeyVocabularyArtifactError(`schemaVersion must be ${exports.HOMEY_VOCABULARY_ARTIFACT_V1}`);
    }
    if (typeof input.generatedAt !== 'string' || input.generatedAt.length === 0) {
        throw new HomeyVocabularyArtifactError('generatedAt must be a non-empty string');
    }
    if (!isObject(input.source)) {
        throw new HomeyVocabularyArtifactError('source must be an object');
    }
    if (input.source.homeyLibVersion !== undefined &&
        typeof input.source.homeyLibVersion !== 'string') {
        throw new HomeyVocabularyArtifactError('source.homeyLibVersion must be a string');
    }
    if (input.source.homeyLibRoot !== undefined && typeof input.source.homeyLibRoot !== 'string') {
        throw new HomeyVocabularyArtifactError('source.homeyLibRoot must be a string');
    }
    if (input.source.composeCapabilitiesDir !== undefined &&
        typeof input.source.composeCapabilitiesDir !== 'string') {
        throw new HomeyVocabularyArtifactError('source.composeCapabilitiesDir must be a string');
    }
    if (!Array.isArray(input.homeyClasses)) {
        throw new HomeyVocabularyArtifactError('homeyClasses must be an array');
    }
    if (!Array.isArray(input.capabilityIds)) {
        throw new HomeyVocabularyArtifactError('capabilityIds must be an array');
    }
    input.homeyClasses.forEach((entry, index) => assertEntry(entry, `homeyClasses[${index}]`));
    input.capabilityIds.forEach((entry, index) => assertEntry(entry, `capabilityIds[${index}]`));
}
function createHomeyVocabularyArtifactV1(entries, source, now = new Date()) {
    return {
        schemaVersion: exports.HOMEY_VOCABULARY_ARTIFACT_V1,
        generatedAt: now.toISOString(),
        source,
        homeyClasses: normalizeEntries(entries.homeyClasses),
        capabilityIds: normalizeEntries(entries.capabilityIds),
    };
}
function loadHomeyVocabularyArtifact(filePath) {
    const parsed = JSON.parse(node_fs_1.default.readFileSync(filePath, 'utf8'));
    assertHomeyVocabularyArtifactV1(parsed);
    return parsed;
}
function createHomeyVocabularyLookupV1(artifact) {
    return {
        homeyClasses: new Set(artifact.homeyClasses.map((entry) => entry.id)),
        capabilityIds: new Set(artifact.capabilityIds.map((entry) => entry.id)),
    };
}

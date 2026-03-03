"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomeyAuthoringVocabularyArtifactError = exports.HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1 = void 0;
exports.assertHomeyAuthoringVocabularyArtifactV1 = assertHomeyAuthoringVocabularyArtifactV1;
exports.createHomeyAuthoringVocabularyArtifactV1 = createHomeyAuthoringVocabularyArtifactV1;
exports.loadHomeyAuthoringVocabularyArtifact = loadHomeyAuthoringVocabularyArtifact;
exports.createHomeyAuthoringVocabularyLookupV1 = createHomeyAuthoringVocabularyLookupV1;
const node_fs_1 = __importDefault(require("node:fs"));
exports.HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1 = 'homey-authoring-vocabulary/v1';
class HomeyAuthoringVocabularyArtifactError extends Error {
    constructor(message) {
        super(message);
        this.name = 'HomeyAuthoringVocabularyArtifactError';
    }
}
exports.HomeyAuthoringVocabularyArtifactError = HomeyAuthoringVocabularyArtifactError;
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertSourceRef(value, fieldPath) {
    if (!isObject(value)) {
        throw new HomeyAuthoringVocabularyArtifactError(`${fieldPath} must be an object`);
    }
    if (value.source !== 'homey-lib-system' && value.source !== 'homey-compose-custom') {
        throw new HomeyAuthoringVocabularyArtifactError(`${fieldPath}.source must be "homey-lib-system" or "homey-compose-custom"`);
    }
    if (typeof value.sourceRef !== 'string' || value.sourceRef.length === 0) {
        throw new HomeyAuthoringVocabularyArtifactError(`${fieldPath}.sourceRef must be a non-empty string`);
    }
}
function assertEntry(value, fieldPath) {
    if (!isObject(value)) {
        throw new HomeyAuthoringVocabularyArtifactError(`${fieldPath} must be an object`);
    }
    if (typeof value.id !== 'string' || value.id.length === 0) {
        throw new HomeyAuthoringVocabularyArtifactError(`${fieldPath}.id must be a non-empty string`);
    }
    if (!Array.isArray(value.sources) || value.sources.length === 0) {
        throw new HomeyAuthoringVocabularyArtifactError(`${fieldPath}.sources must be a non-empty array`);
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
function normalizeAuthoringEntries(entries) {
    return entries.map((entry) => normalizeEntry(entry)).sort((a, b) => a.id.localeCompare(b.id));
}
function assertHomeyAuthoringVocabularyArtifactV1(input) {
    if (!isObject(input)) {
        throw new HomeyAuthoringVocabularyArtifactError('artifact must be an object');
    }
    if (input.schemaVersion !== exports.HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1) {
        throw new HomeyAuthoringVocabularyArtifactError(`schemaVersion must be ${exports.HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1}`);
    }
    if (typeof input.generatedAt !== 'string' || input.generatedAt.length === 0) {
        throw new HomeyAuthoringVocabularyArtifactError('generatedAt must be a non-empty string');
    }
    if (!isObject(input.source)) {
        throw new HomeyAuthoringVocabularyArtifactError('source must be an object');
    }
    if (input.source.homeyLibVersion !== undefined &&
        typeof input.source.homeyLibVersion !== 'string') {
        throw new HomeyAuthoringVocabularyArtifactError('source.homeyLibVersion must be a string');
    }
    if (input.source.homeyLibRoot !== undefined && typeof input.source.homeyLibRoot !== 'string') {
        throw new HomeyAuthoringVocabularyArtifactError('source.homeyLibRoot must be a string');
    }
    if (input.source.composeCapabilitiesDir !== undefined &&
        typeof input.source.composeCapabilitiesDir !== 'string') {
        throw new HomeyAuthoringVocabularyArtifactError('source.composeCapabilitiesDir must be a string');
    }
    if (!Array.isArray(input.homeyClasses)) {
        throw new HomeyAuthoringVocabularyArtifactError('homeyClasses must be an array');
    }
    if (!Array.isArray(input.capabilityIds)) {
        throw new HomeyAuthoringVocabularyArtifactError('capabilityIds must be an array');
    }
    input.homeyClasses.forEach((entry, index) => assertEntry(entry, `homeyClasses[${index}]`));
    input.capabilityIds.forEach((entry, index) => assertEntry(entry, `capabilityIds[${index}]`));
}
function createHomeyAuthoringVocabularyArtifactV1(entries, source, now = new Date()) {
    return {
        schemaVersion: exports.HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1,
        generatedAt: now.toISOString(),
        source,
        homeyClasses: normalizeAuthoringEntries(entries.homeyClasses),
        capabilityIds: normalizeAuthoringEntries(entries.capabilityIds),
    };
}
function loadHomeyAuthoringVocabularyArtifact(filePath) {
    const parsed = JSON.parse(node_fs_1.default.readFileSync(filePath, 'utf8'));
    assertHomeyAuthoringVocabularyArtifactV1(parsed);
    return parsed;
}
function createHomeyAuthoringVocabularyLookupV1(artifact) {
    return {
        homeyClasses: new Set(artifact.homeyClasses.map((entry) => entry.id)),
        capabilityIds: new Set(artifact.capabilityIds.map((entry) => entry.id)),
    };
}

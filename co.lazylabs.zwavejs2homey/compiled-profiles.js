"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_COMPILED_PROFILES_RELATIVE_PATH = exports.COMPILED_PROFILES_PATH_SETTINGS_KEY = void 0;
exports.resolveCompiledProfilesArtifactPath = resolveCompiledProfilesArtifactPath;
exports.tryLoadCompiledProfilesRuntimeFromFile = tryLoadCompiledProfilesRuntimeFromFile;
exports.parseZwjsIdentityId = parseZwjsIdentityId;
exports.buildNodeResolverSelector = buildNodeResolverSelector;
exports.resolveCompiledProfileEntryFromRuntime = resolveCompiledProfileEntryFromRuntime;
exports.resolveNodeProfileClassification = resolveNodeProfileClassification;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const compiler_1 = require("@zwavejs2homey/compiler");
exports.COMPILED_PROFILES_PATH_SETTINGS_KEY = 'compiled_profiles_file';
exports.DEFAULT_COMPILED_PROFILES_RELATIVE_PATH = './assets/compiled/compiled-homey-profiles.v1.json';
function toErrorMessage(error) {
    if (error instanceof Error && typeof error.message === 'string')
        return error.message;
    return String(error);
}
function resolveCompiledProfilesArtifactPath(appDirname, settingsValue) {
    let fromSettings = null;
    if (typeof settingsValue === 'string' && settingsValue.trim().length > 0) {
        fromSettings = settingsValue.trim();
    }
    if (!fromSettings) {
        return node_path_1.default.resolve(appDirname, exports.DEFAULT_COMPILED_PROFILES_RELATIVE_PATH);
    }
    return node_path_1.default.isAbsolute(fromSettings) ? fromSettings : node_path_1.default.resolve(appDirname, fromSettings);
}
function toDuplicateSummary(index) {
    return {
        productTriple: index.duplicates.productTriple.length,
        nodeId: index.duplicates.nodeId.length,
        deviceKey: index.duplicates.deviceKey.length,
    };
}
function createCompiledProfilesRuntimeStatus(sourcePath) {
    return {
        sourcePath,
        loaded: false,
        generatedAt: null,
        pipelineFingerprint: null,
        entryCount: 0,
        duplicateKeys: {
            productTriple: 0,
            nodeId: 0,
            deviceKey: 0,
        },
        errorMessage: null,
    };
}
async function tryLoadCompiledProfilesRuntimeFromFile(sourcePath) {
    const baseStatus = createCompiledProfilesRuntimeStatus(sourcePath);
    try {
        const raw = await promises_1.default.readFile(sourcePath, 'utf8');
        const parsed = JSON.parse(raw);
        (0, compiler_1.assertCompiledHomeyProfilesArtifactV1)(parsed);
        const artifact = parsed;
        const index = (0, compiler_1.buildCompiledProfileResolverIndexV1)(artifact);
        return {
            artifact,
            index,
            status: {
                sourcePath: baseStatus.sourcePath,
                loaded: true,
                generatedAt: artifact.generatedAt,
                pipelineFingerprint: typeof artifact.source?.pipelineFingerprint === 'string'
                    ? artifact.source.pipelineFingerprint
                    : null,
                entryCount: artifact.entries.length,
                duplicateKeys: toDuplicateSummary(index),
                errorMessage: null,
            },
        };
    }
    catch (error) {
        return {
            artifact: undefined,
            index: undefined,
            status: {
                sourcePath: baseStatus.sourcePath,
                loaded: false,
                generatedAt: null,
                pipelineFingerprint: null,
                entryCount: 0,
                duplicateKeys: {
                    productTriple: 0,
                    nodeId: 0,
                    deviceKey: 0,
                },
                errorMessage: toErrorMessage(error),
            },
        };
    }
}
function parseZwjsIdentityId(value) {
    if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) {
        return value;
    }
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return undefined;
    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
        const parsedHex = Number.parseInt(trimmed.slice(2), 16);
        return Number.isInteger(parsedHex) && Number.isFinite(parsedHex) ? parsedHex : undefined;
    }
    if (/^\d+$/.test(trimmed)) {
        const parsedDec = Number.parseInt(trimmed, 10);
        return Number.isInteger(parsedDec) && Number.isFinite(parsedDec) ? parsedDec : undefined;
    }
    return undefined;
}
function buildNodeResolverSelector(nodeContext, nodeState) {
    const state = nodeState && typeof nodeState === 'object' ? nodeState : {};
    return {
        nodeId: nodeContext.nodeId,
        deviceKey: `${nodeContext.bridgeId}:${nodeContext.nodeId}`,
        manufacturerId: parseZwjsIdentityId(state.manufacturerId),
        productType: parseZwjsIdentityId(state.productType),
        productId: parseZwjsIdentityId(state.productId),
    };
}
function resolveCompiledProfileEntryFromRuntime(runtime, selector, options) {
    if (!runtime?.index)
        return { by: 'none' };
    return (0, compiler_1.resolveCompiledProfileEntryFromIndexV1)(runtime.index, selector, options);
}
function resolveNodeProfileClassification(match, runtimeStatus) {
    if (match.by !== 'none' && match.entry) {
        return {
            matchBy: match.by,
            matchKey: match.key ?? null,
            profileId: match.entry.compiled.profile.profileId,
            classification: match.entry.compiled.profile.classification,
            fallbackReason: null,
        };
    }
    return {
        matchBy: 'none',
        matchKey: null,
        profileId: null,
        classification: {
            homeyClass: 'other',
            confidence: 'generic',
            uncurated: true,
        },
        fallbackReason: runtimeStatus?.loaded
            ? 'no_compiled_profile_match'
            : 'compiled_profile_artifact_unavailable',
    };
}

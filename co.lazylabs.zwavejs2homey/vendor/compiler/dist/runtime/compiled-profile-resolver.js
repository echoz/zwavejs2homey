"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCompiledProfileResolverSelector = toCompiledProfileResolverSelector;
exports.compiledProfileProductTripleKey = compiledProfileProductTripleKey;
exports.buildCompiledProfileResolverIndexV1 = buildCompiledProfileResolverIndexV1;
exports.resolveCompiledProfileEntryFromIndexV1 = resolveCompiledProfileEntryFromIndexV1;
exports.resolveCompiledProfileEntryFromArtifactV1 = resolveCompiledProfileEntryFromArtifactV1;
const DEFAULT_MATCH_PRECEDENCE = [
    'product-triple',
    'node-id',
    'device-key',
];
const VALID_MATCH_PRECEDENCE = new Set(DEFAULT_MATCH_PRECEDENCE);
function isFiniteInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}
function countDuplicates(keys) {
    const counts = new Map();
    for (const key of keys)
        counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count }));
}
function dedupeAndValidateMatchPrecedence(precedence) {
    const input = precedence ?? DEFAULT_MATCH_PRECEDENCE;
    const deduped = [];
    for (const item of input) {
        if (!VALID_MATCH_PRECEDENCE.has(item)) {
            throw new Error(`Unsupported compiled profile resolver precedence token: ${String(item)}`);
        }
        if (!deduped.includes(item))
            deduped.push(item);
    }
    if (deduped.length === 0)
        return [...DEFAULT_MATCH_PRECEDENCE];
    return deduped;
}
function toCompiledProfileResolverSelector(device) {
    return {
        deviceKey: typeof device.deviceKey === 'string' && device.deviceKey.length > 0
            ? device.deviceKey
            : undefined,
        nodeId: isFiniteInteger(device.nodeId) ? device.nodeId : undefined,
        manufacturerId: isFiniteInteger(device.manufacturerId) ? device.manufacturerId : undefined,
        productType: isFiniteInteger(device.productType) ? device.productType : undefined,
        productId: isFiniteInteger(device.productId) ? device.productId : undefined,
    };
}
function compiledProfileProductTripleKey(selector) {
    if (!isFiniteInteger(selector.manufacturerId) ||
        !isFiniteInteger(selector.productType) ||
        !isFiniteInteger(selector.productId)) {
        return undefined;
    }
    return `${selector.manufacturerId}:${selector.productType}:${selector.productId}`;
}
function buildCompiledProfileResolverIndexV1(artifact) {
    const byProductTriple = new Map();
    const byNodeId = new Map();
    const byDeviceKey = new Map();
    const productTripleKeys = [];
    const nodeIds = [];
    const deviceKeys = [];
    for (const entry of artifact.entries) {
        const selector = toCompiledProfileResolverSelector(entry.device);
        const triple = compiledProfileProductTripleKey(selector);
        if (triple) {
            productTripleKeys.push(triple);
            if (!byProductTriple.has(triple))
                byProductTriple.set(triple, entry);
        }
        if (isFiniteInteger(selector.nodeId)) {
            nodeIds.push(selector.nodeId);
            if (!byNodeId.has(selector.nodeId))
                byNodeId.set(selector.nodeId, entry);
        }
        if (typeof selector.deviceKey === 'string' && selector.deviceKey.length > 0) {
            deviceKeys.push(selector.deviceKey);
            if (!byDeviceKey.has(selector.deviceKey))
                byDeviceKey.set(selector.deviceKey, entry);
        }
    }
    return {
        byProductTriple,
        byNodeId,
        byDeviceKey,
        duplicates: {
            productTriple: countDuplicates(productTripleKeys).sort((a, b) => a.key.localeCompare(b.key)),
            nodeId: countDuplicates(nodeIds).sort((a, b) => a.key - b.key),
            deviceKey: countDuplicates(deviceKeys).sort((a, b) => a.key.localeCompare(b.key)),
        },
    };
}
function resolveCompiledProfileEntryFromIndexV1(index, selector, options) {
    const precedence = dedupeAndValidateMatchPrecedence(options?.precedence);
    const triple = compiledProfileProductTripleKey(selector);
    for (const candidate of precedence) {
        if (candidate === 'product-triple') {
            if (!triple)
                continue;
            const entry = index.byProductTriple.get(triple);
            if (entry)
                return { entry, by: 'product-triple', key: triple };
            continue;
        }
        if (candidate === 'node-id') {
            if (!isFiniteInteger(selector.nodeId))
                continue;
            const entry = index.byNodeId.get(selector.nodeId);
            if (entry)
                return { entry, by: 'node-id', key: selector.nodeId };
            continue;
        }
        if (candidate === 'device-key') {
            if (typeof selector.deviceKey !== 'string' || selector.deviceKey.length === 0)
                continue;
            const entry = index.byDeviceKey.get(selector.deviceKey);
            if (entry)
                return { entry, by: 'device-key', key: selector.deviceKey };
        }
    }
    return { by: 'none' };
}
function resolveCompiledProfileEntryFromArtifactV1(artifact, selector, options) {
    const index = buildCompiledProfileResolverIndexV1(artifact);
    return resolveCompiledProfileEntryFromIndexV1(index, selector, options);
}

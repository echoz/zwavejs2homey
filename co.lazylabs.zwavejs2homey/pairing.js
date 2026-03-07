"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZWJS_NODE_DEVICE_KIND = exports.ZWJS_BRIDGE_DEVICE_UNIQUE_ID = exports.ZWJS_BRIDGE_DEVICE_KIND = exports.ZWJS_DEFAULT_BRIDGE_ID = void 0;
exports.hasBridgePairDeviceFromData = hasBridgePairDeviceFromData;
exports.collectExistingBridgeIdsFromData = collectExistingBridgeIdsFromData;
exports.pickNextBridgeId = pickNextBridgeId;
exports.createNextBridgePairCandidate = createNextBridgePairCandidate;
exports.createBridgePairCandidate = createBridgePairCandidate;
exports.collectExistingNodeIdsFromData = collectExistingNodeIdsFromData;
exports.buildNodePairCandidates = buildNodePairCandidates;
const pairing_icons_1 = require("./pairing-icons");
exports.ZWJS_DEFAULT_BRIDGE_ID = 'main';
exports.ZWJS_BRIDGE_DEVICE_KIND = 'zwjs-bridge';
exports.ZWJS_BRIDGE_DEVICE_UNIQUE_ID = `${exports.ZWJS_BRIDGE_DEVICE_KIND}-${exports.ZWJS_DEFAULT_BRIDGE_ID}`;
exports.ZWJS_NODE_DEVICE_KIND = 'zwjs-node';
function toTrimmedString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function normalizeLocationKey(value) {
    const normalized = toTrimmedString(value);
    if (!normalized)
        return null;
    return normalized.toLowerCase().replace(/\s+/g, ' ');
}
function buildKnownZoneLocationKeys(knownZoneNames) {
    const keys = new Set();
    if (!Array.isArray(knownZoneNames))
        return keys;
    for (const zoneName of knownZoneNames) {
        const key = normalizeLocationKey(zoneName);
        if (key)
            keys.add(key);
    }
    return keys;
}
function locationMatchesKnownZone(location, knownZoneLocationKeys) {
    const key = normalizeLocationKey(location);
    if (!key)
        return false;
    return knownZoneLocationKeys.has(key);
}
function hasBridgePairDeviceFromData(existingData, expectedBridgeDeviceId = exports.ZWJS_BRIDGE_DEVICE_UNIQUE_ID) {
    return existingData.some((entry) => entry?.id === expectedBridgeDeviceId);
}
function normalizeBridgeIdFromDeviceData(entry) {
    if (!entry)
        return undefined;
    if (typeof entry.bridgeId === 'string' && entry.bridgeId.trim().length > 0) {
        return entry.bridgeId.trim();
    }
    if (typeof entry.id === 'string' && entry.id.startsWith(`${exports.ZWJS_BRIDGE_DEVICE_KIND}-`)) {
        const suffix = entry.id.slice(`${exports.ZWJS_BRIDGE_DEVICE_KIND}-`.length).trim();
        return suffix.length > 0 ? suffix : undefined;
    }
    return undefined;
}
function collectExistingBridgeIdsFromData(existingData, expectedBridgeKind = exports.ZWJS_BRIDGE_DEVICE_KIND) {
    const bridgeIds = new Set();
    for (const entry of existingData) {
        if (!entry)
            continue;
        if (typeof entry.kind === 'string' && entry.kind !== expectedBridgeKind)
            continue;
        const bridgeId = normalizeBridgeIdFromDeviceData(entry);
        if (bridgeId)
            bridgeIds.add(bridgeId);
    }
    return bridgeIds;
}
function pickNextBridgeId(existingBridgeIds) {
    if (!existingBridgeIds.has(exports.ZWJS_DEFAULT_BRIDGE_ID)) {
        return exports.ZWJS_DEFAULT_BRIDGE_ID;
    }
    let index = 2;
    while (existingBridgeIds.has(`bridge-${index}`)) {
        index += 1;
    }
    return `bridge-${index}`;
}
function createNextBridgePairCandidate(existingData, pairIconDriverId = 'bridge') {
    const existingBridgeIds = collectExistingBridgeIdsFromData(existingData);
    const bridgeId = pickNextBridgeId(existingBridgeIds);
    const name = bridgeId === exports.ZWJS_DEFAULT_BRIDGE_ID ? 'ZWJS Bridge' : `ZWJS Bridge (${bridgeId})`;
    return createBridgePairCandidate(bridgeId, name, pairIconDriverId);
}
function createBridgePairCandidate(bridgeId = exports.ZWJS_DEFAULT_BRIDGE_ID, name = 'ZWJS Bridge', pairIconDriverId = 'bridge') {
    return {
        name,
        icon: (0, pairing_icons_1.resolveDriverPairIconForHomeyClass)('bridge', pairIconDriverId),
        data: {
            id: `${exports.ZWJS_BRIDGE_DEVICE_KIND}-${bridgeId}`,
            kind: exports.ZWJS_BRIDGE_DEVICE_KIND,
            bridgeId,
        },
    };
}
function collectExistingNodeIdsFromData(existingData, bridgeId, expectedNodeKind = exports.ZWJS_NODE_DEVICE_KIND) {
    const ids = new Set();
    for (const entry of existingData) {
        if (!entry || entry.kind !== expectedNodeKind || entry.bridgeId !== bridgeId) {
            continue;
        }
        if (typeof entry.nodeId === 'number' && Number.isInteger(entry.nodeId)) {
            ids.add(entry.nodeId);
        }
    }
    return ids;
}
function formatNodePairName(node, knownZoneLocationKeys) {
    const name = toTrimmedString(node.name);
    const product = toTrimmedString(node.product);
    const manufacturer = toTrimmedString(node.manufacturer);
    const location = toTrimmedString(node.location);
    const label = name || product || manufacturer;
    if (!label && !location)
        return String(node.nodeId);
    if (location && !locationMatchesKnownZone(location, knownZoneLocationKeys)) {
        if (label)
            return `${label} - ${location}`;
        return location;
    }
    if (label)
        return `[${node.nodeId}] ${label}`;
    return `[${node.nodeId}] ${location}`;
}
function toInterviewStage(value) {
    if (typeof value === 'string')
        return value;
    if (value != null)
        return String(value);
    return null;
}
function buildNodePairCandidates(nodes, bridgeId, existingNodeIds, nodeKind = exports.ZWJS_NODE_DEVICE_KIND, options = {}) {
    const knownZoneLocationKeys = buildKnownZoneLocationKeys(options.knownZoneNames);
    const pairIconDriverId = typeof options.pairIconDriverId === 'string' && options.pairIconDriverId.trim().length > 0
        ? options.pairIconDriverId.trim()
        : 'node';
    return nodes
        .filter((node) => Number.isInteger(node.nodeId) && node.nodeId > 1)
        .filter((node) => !existingNodeIds.has(node.nodeId))
        .sort((a, b) => a.nodeId - b.nodeId)
        .map((node) => ({
        name: formatNodePairName(node, knownZoneLocationKeys),
        icon: (0, pairing_icons_1.resolveDriverPairIconForHomeyClass)('other', pairIconDriverId),
        data: {
            id: `${bridgeId}:${node.nodeId}`,
            kind: nodeKind,
            bridgeId,
            nodeId: node.nodeId,
        },
        store: {
            ready: node.ready === true,
            manufacturer: node.manufacturer ?? null,
            product: node.product ?? null,
            location: toTrimmedString(node.location),
            locationMatchedZone: locationMatchesKnownZone(node.location, knownZoneLocationKeys),
            interviewStage: toInterviewStage(node.interviewStage),
            inferredHomeyClass: 'other',
        },
    }));
}

'use strict';

const { resolvePairIconForHomeyClass } = require('./pairing-icons');

const ZWJS_DEFAULT_BRIDGE_ID = 'main';
const ZWJS_BRIDGE_DEVICE_KIND = 'zwjs-bridge';
const ZWJS_BRIDGE_DEVICE_UNIQUE_ID = `${ZWJS_BRIDGE_DEVICE_KIND}-${ZWJS_DEFAULT_BRIDGE_ID}`;
const ZWJS_NODE_DEVICE_KIND = 'zwjs-node';

function toTrimmedString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLocationKey(value) {
  const normalized = toTrimmedString(value);
  if (!normalized) return null;
  return normalized.toLowerCase().replace(/\s+/g, ' ');
}

function buildKnownZoneLocationKeys(knownZoneNames) {
  const keys = new Set();
  if (!Array.isArray(knownZoneNames)) return keys;
  for (const zoneName of knownZoneNames) {
    const key = normalizeLocationKey(zoneName);
    if (key) keys.add(key);
  }
  return keys;
}

function locationMatchesKnownZone(location, knownZoneLocationKeys) {
  const key = normalizeLocationKey(location);
  if (!key) return false;
  return knownZoneLocationKeys.has(key);
}

function hasBridgePairDeviceFromData(
  existingData,
  expectedBridgeDeviceId = ZWJS_BRIDGE_DEVICE_UNIQUE_ID,
) {
  return existingData.some((entry) => entry?.id === expectedBridgeDeviceId);
}

function createBridgePairCandidate(bridgeId = ZWJS_DEFAULT_BRIDGE_ID, name = 'ZWJS Bridge') {
  return {
    name,
    icon: resolvePairIconForHomeyClass('bridge'),
    data: {
      id: `${ZWJS_BRIDGE_DEVICE_KIND}-${bridgeId}`,
      kind: ZWJS_BRIDGE_DEVICE_KIND,
      bridgeId,
    },
  };
}

function collectExistingNodeIdsFromData(
  existingData,
  bridgeId,
  expectedNodeKind = ZWJS_NODE_DEVICE_KIND,
) {
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

  if (!label && !location) return String(node.nodeId);

  if (location && !locationMatchesKnownZone(location, knownZoneLocationKeys)) {
    if (label) return `${label} - ${location}`;
    return location;
  }

  if (label) return `[${node.nodeId}] ${label}`;
  return `[${node.nodeId}] ${location}`;
}

function toInterviewStage(value) {
  if (typeof value === 'string') return value;
  if (value != null) return String(value);
  return null;
}

function buildNodePairCandidates(
  nodes,
  bridgeId,
  existingNodeIds,
  nodeKind = ZWJS_NODE_DEVICE_KIND,
  options = {},
) {
  const knownZoneLocationKeys = buildKnownZoneLocationKeys(options.knownZoneNames);

  return nodes
    .filter((node) => Number.isInteger(node.nodeId) && node.nodeId > 1)
    .filter((node) => !existingNodeIds.has(node.nodeId))
    .sort((a, b) => a.nodeId - b.nodeId)
    .map((node) => ({
      name: formatNodePairName(node, knownZoneLocationKeys),
      icon: resolvePairIconForHomeyClass('other'),
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

module.exports = {
  ZWJS_DEFAULT_BRIDGE_ID,
  ZWJS_BRIDGE_DEVICE_KIND,
  ZWJS_BRIDGE_DEVICE_UNIQUE_ID,
  ZWJS_NODE_DEVICE_KIND,
  hasBridgePairDeviceFromData,
  createBridgePairCandidate,
  collectExistingNodeIdsFromData,
  buildNodePairCandidates,
};

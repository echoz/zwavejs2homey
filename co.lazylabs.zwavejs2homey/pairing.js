'use strict';

const ZWJS_DEFAULT_BRIDGE_ID = 'main';
const ZWJS_BRIDGE_DEVICE_KIND = 'zwjs-bridge';
const ZWJS_BRIDGE_DEVICE_UNIQUE_ID = `${ZWJS_BRIDGE_DEVICE_KIND}-${ZWJS_DEFAULT_BRIDGE_ID}`;
const ZWJS_NODE_DEVICE_KIND = 'zwjs-node';

function hasBridgePairDeviceFromData(
  existingData,
  expectedBridgeDeviceId = ZWJS_BRIDGE_DEVICE_UNIQUE_ID,
) {
  return existingData.some((entry) => entry?.id === expectedBridgeDeviceId);
}

function createBridgePairCandidate(bridgeId = ZWJS_DEFAULT_BRIDGE_ID, name = 'ZWJS Bridge') {
  return {
    name,
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

function formatNodePairName(node) {
  const label = node.name || node.product || node.manufacturer || 'ZWJS Node';
  return `[${node.nodeId}] ${label}`;
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
) {
  return nodes
    .filter((node) => Number.isInteger(node.nodeId) && node.nodeId > 1)
    .filter((node) => !existingNodeIds.has(node.nodeId))
    .sort((a, b) => a.nodeId - b.nodeId)
    .map((node) => ({
      name: formatNodePairName(node),
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
        interviewStage: toInterviewStage(node.interviewStage),
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

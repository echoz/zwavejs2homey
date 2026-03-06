import type { CanonicalNodeSummary } from '@zwavejs2homey/core';
import { resolveDriverPairIconForHomeyClass } from './pairing-icons';

export const ZWJS_DEFAULT_BRIDGE_ID = 'main' as const;
export const ZWJS_BRIDGE_DEVICE_KIND = 'zwjs-bridge' as const;
export const ZWJS_BRIDGE_DEVICE_UNIQUE_ID = `${ZWJS_BRIDGE_DEVICE_KIND}-${ZWJS_DEFAULT_BRIDGE_ID}`;
export const ZWJS_NODE_DEVICE_KIND = 'zwjs-node' as const;

export interface BridgePairCandidate {
  name: string;
  icon: string;
  data: {
    id: string;
    kind: string;
    bridgeId: string;
  };
}

export interface ExistingNodeDeviceData {
  kind?: string;
  bridgeId?: string;
  nodeId?: number;
}

export interface NodePairCandidate {
  name: string;
  icon: string;
  data: {
    id: string;
    kind: string;
    bridgeId: string;
    nodeId: number;
  };
  store: {
    ready: boolean;
    manufacturer: string | null;
    product: string | null;
    location: string | null;
    locationMatchedZone: boolean;
    interviewStage: string | null;
    inferredHomeyClass: string;
  };
}

export interface NodePairingBuildOptions {
  knownZoneNames?: ReadonlyArray<string>;
  pairIconDriverId?: string;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLocationKey(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  if (!normalized) return null;
  return normalized.toLowerCase().replace(/\s+/g, ' ');
}

function buildKnownZoneLocationKeys(
  knownZoneNames: ReadonlyArray<string> | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(knownZoneNames)) return keys;
  for (const zoneName of knownZoneNames) {
    const key = normalizeLocationKey(zoneName);
    if (key) keys.add(key);
  }
  return keys;
}

function locationMatchesKnownZone(
  location: unknown,
  knownZoneLocationKeys: ReadonlySet<string>,
): boolean {
  const key = normalizeLocationKey(location);
  if (!key) return false;
  return knownZoneLocationKeys.has(key);
}

export function hasBridgePairDeviceFromData(
  existingData: ReadonlyArray<{ id?: string } | undefined>,
  expectedBridgeDeviceId = ZWJS_BRIDGE_DEVICE_UNIQUE_ID,
): boolean {
  return existingData.some((entry) => entry?.id === expectedBridgeDeviceId);
}

export function createBridgePairCandidate(
  bridgeId = ZWJS_DEFAULT_BRIDGE_ID,
  name = 'ZWJS Bridge',
  pairIconDriverId = 'bridge',
): BridgePairCandidate {
  return {
    name,
    icon: resolveDriverPairIconForHomeyClass('bridge', pairIconDriverId),
    data: {
      id: `${ZWJS_BRIDGE_DEVICE_KIND}-${bridgeId}`,
      kind: ZWJS_BRIDGE_DEVICE_KIND,
      bridgeId,
    },
  };
}

export function collectExistingNodeIdsFromData(
  existingData: ReadonlyArray<ExistingNodeDeviceData | undefined>,
  bridgeId: string,
  expectedNodeKind = ZWJS_NODE_DEVICE_KIND,
): Set<number> {
  const ids = new Set<number>();
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

function formatNodePairName(
  node: Pick<CanonicalNodeSummary, 'name' | 'product' | 'manufacturer' | 'location' | 'nodeId'>,
  knownZoneLocationKeys: ReadonlySet<string>,
): string {
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

function toInterviewStage(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value != null) return String(value);
  return null;
}

export function buildNodePairCandidates(
  nodes: ReadonlyArray<CanonicalNodeSummary>,
  bridgeId: string,
  existingNodeIds: ReadonlySet<number>,
  nodeKind = ZWJS_NODE_DEVICE_KIND,
  options: NodePairingBuildOptions = {},
): NodePairCandidate[] {
  const knownZoneLocationKeys = buildKnownZoneLocationKeys(options.knownZoneNames);
  const pairIconDriverId =
    typeof options.pairIconDriverId === 'string' && options.pairIconDriverId.trim().length > 0
      ? options.pairIconDriverId.trim()
      : 'node';

  return nodes
    .filter((node) => Number.isInteger(node.nodeId) && node.nodeId > 1)
    .filter((node) => !existingNodeIds.has(node.nodeId))
    .sort((a, b) => a.nodeId - b.nodeId)
    .map((node) => ({
      name: formatNodePairName(node, knownZoneLocationKeys),
      icon: resolveDriverPairIconForHomeyClass('other', pairIconDriverId),
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

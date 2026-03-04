import type { CanonicalNodeSummary } from '@zwavejs2homey/core';

export const ZWJS_DEFAULT_BRIDGE_ID: 'main';
export const ZWJS_BRIDGE_DEVICE_KIND: 'zwjs-bridge';
export const ZWJS_BRIDGE_DEVICE_UNIQUE_ID: string;
export const ZWJS_NODE_DEVICE_KIND: 'zwjs-node';

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
}

export function hasBridgePairDeviceFromData(
  existingData: ReadonlyArray<{ id?: string } | undefined>,
  expectedBridgeDeviceId?: string,
): boolean;

export function createBridgePairCandidate(bridgeId?: string, name?: string): BridgePairCandidate;

export function collectExistingNodeIdsFromData(
  existingData: ReadonlyArray<ExistingNodeDeviceData | undefined>,
  bridgeId: string,
  expectedNodeKind?: string,
): Set<number>;

export function buildNodePairCandidates(
  nodes: ReadonlyArray<CanonicalNodeSummary>,
  bridgeId: string,
  existingNodeIds: ReadonlySet<number>,
  nodeKind?: string,
  options?: NodePairingBuildOptions,
): NodePairCandidate[];

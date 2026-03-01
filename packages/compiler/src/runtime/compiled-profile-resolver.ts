import type {
  CompiledHomeyProfilesArtifactEntryV1,
  CompiledHomeyProfilesArtifactV1,
} from '../emit/compiled-profiles-artifact';
import type { NormalizedZwaveDeviceFacts } from '../models/zwave-facts';

export type CompiledProfileResolverMatchKind = 'product-triple' | 'node-id' | 'device-key' | 'none';

export interface CompiledProfileResolverSelector {
  deviceKey?: string;
  nodeId?: number;
  manufacturerId?: number;
  productType?: number;
  productId?: number;
}

export interface CompiledProfileResolverIndexV1 {
  byProductTriple: ReadonlyMap<string, CompiledHomeyProfilesArtifactEntryV1>;
  byNodeId: ReadonlyMap<number, CompiledHomeyProfilesArtifactEntryV1>;
  byDeviceKey: ReadonlyMap<string, CompiledHomeyProfilesArtifactEntryV1>;
  duplicates: {
    productTriple: ReadonlyArray<{ key: string; count: number }>;
    nodeId: ReadonlyArray<{ key: number; count: number }>;
    deviceKey: ReadonlyArray<{ key: string; count: number }>;
  };
}

export interface ResolveCompiledProfileEntryOptionsV1 {
  precedence?: ReadonlyArray<Exclude<CompiledProfileResolverMatchKind, 'none'>>;
}

export interface CompiledProfileResolverMatchV1 {
  entry?: CompiledHomeyProfilesArtifactEntryV1;
  by: CompiledProfileResolverMatchKind;
  key?: string | number;
}

const DEFAULT_MATCH_PRECEDENCE: ReadonlyArray<Exclude<CompiledProfileResolverMatchKind, 'none'>> = [
  'product-triple',
  'node-id',
  'device-key',
];
const VALID_MATCH_PRECEDENCE = new Set<Exclude<CompiledProfileResolverMatchKind, 'none'>>(
  DEFAULT_MATCH_PRECEDENCE,
);

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function countDuplicates<K>(keys: Iterable<K>): Array<{ key: K; count: number }> {
  const counts = new Map<K, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function dedupeAndValidateMatchPrecedence(
  precedence: ResolveCompiledProfileEntryOptionsV1['precedence'],
): Array<Exclude<CompiledProfileResolverMatchKind, 'none'>> {
  const input = precedence ?? DEFAULT_MATCH_PRECEDENCE;
  const deduped: Array<Exclude<CompiledProfileResolverMatchKind, 'none'>> = [];
  for (const item of input) {
    if (!VALID_MATCH_PRECEDENCE.has(item)) {
      throw new Error(`Unsupported compiled profile resolver precedence token: ${String(item)}`);
    }
    if (!deduped.includes(item)) deduped.push(item);
  }
  if (deduped.length === 0) return [...DEFAULT_MATCH_PRECEDENCE];
  return deduped;
}

export function toCompiledProfileResolverSelector(
  device: Pick<
    NormalizedZwaveDeviceFacts,
    'deviceKey' | 'nodeId' | 'manufacturerId' | 'productType' | 'productId'
  >,
): CompiledProfileResolverSelector {
  return {
    deviceKey:
      typeof device.deviceKey === 'string' && device.deviceKey.length > 0
        ? device.deviceKey
        : undefined,
    nodeId: isFiniteInteger(device.nodeId) ? device.nodeId : undefined,
    manufacturerId: isFiniteInteger(device.manufacturerId) ? device.manufacturerId : undefined,
    productType: isFiniteInteger(device.productType) ? device.productType : undefined,
    productId: isFiniteInteger(device.productId) ? device.productId : undefined,
  };
}

export function compiledProfileProductTripleKey(
  selector:
    | CompiledProfileResolverSelector
    | Pick<
        CompiledHomeyProfilesArtifactEntryV1['device'],
        'manufacturerId' | 'productType' | 'productId'
      >,
): string | undefined {
  if (
    !isFiniteInteger(selector.manufacturerId) ||
    !isFiniteInteger(selector.productType) ||
    !isFiniteInteger(selector.productId)
  ) {
    return undefined;
  }
  return `${selector.manufacturerId}:${selector.productType}:${selector.productId}`;
}

export function buildCompiledProfileResolverIndexV1(
  artifact: CompiledHomeyProfilesArtifactV1,
): CompiledProfileResolverIndexV1 {
  const byProductTriple = new Map<string, CompiledHomeyProfilesArtifactEntryV1>();
  const byNodeId = new Map<number, CompiledHomeyProfilesArtifactEntryV1>();
  const byDeviceKey = new Map<string, CompiledHomeyProfilesArtifactEntryV1>();
  const productTripleKeys: string[] = [];
  const nodeIds: number[] = [];
  const deviceKeys: string[] = [];

  for (const entry of artifact.entries) {
    const selector = toCompiledProfileResolverSelector(entry.device);
    const triple = compiledProfileProductTripleKey(selector);
    if (triple) {
      productTripleKeys.push(triple);
      if (!byProductTriple.has(triple)) byProductTriple.set(triple, entry);
    }
    if (isFiniteInteger(selector.nodeId)) {
      nodeIds.push(selector.nodeId);
      if (!byNodeId.has(selector.nodeId)) byNodeId.set(selector.nodeId, entry);
    }
    if (typeof selector.deviceKey === 'string' && selector.deviceKey.length > 0) {
      deviceKeys.push(selector.deviceKey);
      if (!byDeviceKey.has(selector.deviceKey)) byDeviceKey.set(selector.deviceKey, entry);
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

export function resolveCompiledProfileEntryFromIndexV1(
  index: CompiledProfileResolverIndexV1,
  selector: CompiledProfileResolverSelector,
  options?: ResolveCompiledProfileEntryOptionsV1,
): CompiledProfileResolverMatchV1 {
  const precedence = dedupeAndValidateMatchPrecedence(options?.precedence);
  const triple = compiledProfileProductTripleKey(selector);

  for (const candidate of precedence) {
    if (candidate === 'product-triple') {
      if (!triple) continue;
      const entry = index.byProductTriple.get(triple);
      if (entry) return { entry, by: 'product-triple', key: triple };
      continue;
    }
    if (candidate === 'node-id') {
      if (!isFiniteInteger(selector.nodeId)) continue;
      const entry = index.byNodeId.get(selector.nodeId);
      if (entry) return { entry, by: 'node-id', key: selector.nodeId };
      continue;
    }
    if (candidate === 'device-key') {
      if (typeof selector.deviceKey !== 'string' || selector.deviceKey.length === 0) continue;
      const entry = index.byDeviceKey.get(selector.deviceKey);
      if (entry) return { entry, by: 'device-key', key: selector.deviceKey };
    }
  }

  return { by: 'none' };
}

export function resolveCompiledProfileEntryFromArtifactV1(
  artifact: CompiledHomeyProfilesArtifactV1,
  selector: CompiledProfileResolverSelector,
  options?: ResolveCompiledProfileEntryOptionsV1,
): CompiledProfileResolverMatchV1 {
  const index = buildCompiledProfileResolverIndexV1(artifact);
  return resolveCompiledProfileEntryFromIndexV1(index, selector, options);
}

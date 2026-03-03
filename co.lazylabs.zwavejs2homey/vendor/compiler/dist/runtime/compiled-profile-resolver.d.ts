import type { CompiledHomeyProfilesArtifactEntryV1, CompiledHomeyProfilesArtifactV1 } from '../emit/compiled-profiles-artifact';
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
        productTriple: ReadonlyArray<{
            key: string;
            count: number;
        }>;
        nodeId: ReadonlyArray<{
            key: number;
            count: number;
        }>;
        deviceKey: ReadonlyArray<{
            key: string;
            count: number;
        }>;
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
export declare function toCompiledProfileResolverSelector(device: Pick<NormalizedZwaveDeviceFacts, 'deviceKey' | 'nodeId' | 'manufacturerId' | 'productType' | 'productId'>): CompiledProfileResolverSelector;
export declare function compiledProfileProductTripleKey(selector: CompiledProfileResolverSelector | Pick<CompiledHomeyProfilesArtifactEntryV1['device'], 'manufacturerId' | 'productType' | 'productId'>): string | undefined;
export declare function buildCompiledProfileResolverIndexV1(artifact: CompiledHomeyProfilesArtifactV1): CompiledProfileResolverIndexV1;
export declare function resolveCompiledProfileEntryFromIndexV1(index: CompiledProfileResolverIndexV1, selector: CompiledProfileResolverSelector, options?: ResolveCompiledProfileEntryOptionsV1): CompiledProfileResolverMatchV1;
export declare function resolveCompiledProfileEntryFromArtifactV1(artifact: CompiledHomeyProfilesArtifactV1, selector: CompiledProfileResolverSelector, options?: ResolveCompiledProfileEntryOptionsV1): CompiledProfileResolverMatchV1;

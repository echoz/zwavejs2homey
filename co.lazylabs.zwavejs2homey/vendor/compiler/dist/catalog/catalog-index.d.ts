import type { CatalogDeviceRecordV1, CatalogDevicesArtifactV1 } from './catalog-device-artifact';
export interface CatalogDeviceLookupKey {
    manufacturerId: number;
    productType: number;
    productId: number;
}
export interface CatalogIndexBuildResult {
    byCatalogId: Map<string, CatalogDeviceRecordV1>;
    byProductTriple: Map<string, CatalogDeviceRecordV1>;
    report: {
        deviceCount: number;
        productTripleIndexed: number;
        productTripleConflicts: number;
    };
}
export declare function catalogProductTripleKey(input: CatalogDeviceLookupKey): string;
export declare function buildCatalogIndexV1(artifact: CatalogDevicesArtifactV1): CatalogIndexBuildResult;
export declare function findCatalogDeviceByCatalogId(index: Pick<CatalogIndexBuildResult, 'byCatalogId'>, catalogId: string): CatalogDeviceRecordV1 | undefined;
export declare function findCatalogDeviceByProductTriple(index: Pick<CatalogIndexBuildResult, 'byProductTriple'>, lookup: CatalogDeviceLookupKey): CatalogDeviceRecordV1 | undefined;

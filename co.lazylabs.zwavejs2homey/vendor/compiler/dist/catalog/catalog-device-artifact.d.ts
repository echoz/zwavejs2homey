export interface CatalogDeviceRecordV1 {
    catalogId: string;
    manufacturerId?: number;
    productType?: number;
    productId?: number;
    label?: string;
    sources: Array<{
        source: string;
        sourceId?: string;
        confidence?: 'high' | 'medium' | 'low';
    }>;
}
export interface CatalogDevicesArtifactV1 {
    schemaVersion: 'catalog-devices/v1';
    source: {
        generatedAt: string;
        sourceRef: string;
    };
    devices: CatalogDeviceRecordV1[];
}
export declare class CatalogDeviceArtifactError extends Error {
    constructor(message: string);
}
export declare function assertCatalogDevicesArtifactV1(input: unknown): asserts input is CatalogDevicesArtifactV1;
export declare function loadCatalogDevicesArtifact(filePath: string): CatalogDevicesArtifactV1;

import type { CatalogDeviceRecordV1, CatalogDevicesArtifactV1 } from './catalog-device-artifact';
export interface ZwjsInspectNodeDetailCatalogSource {
    nodeId?: number;
    state?: {
        name?: string;
        manufacturerId?: number | string;
        productType?: number | string;
        productId?: number | string;
        product?: string;
        deviceConfig?: {
            label?: string;
            manufacturer?: string;
        };
    };
}
export declare class ZwjsInspectCatalogSourceError extends Error {
    constructor(message: string);
}
export declare function catalogDeviceRecordFromZwjsInspectNodeDetail(input: unknown): CatalogDeviceRecordV1;
export declare function catalogArtifactFromZwjsInspectNodeDetail(input: unknown, options?: {
    sourceRef: string;
    generatedAt?: string;
}): CatalogDevicesArtifactV1;
export declare function loadCatalogArtifactFromZwjsInspectNodeDetailFile(filePath: string): CatalogDevicesArtifactV1;

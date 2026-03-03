import type { CatalogDevicesArtifactV1 } from './catalog-device-artifact';
export interface NormalizeCatalogOptions {
    sourceRef?: string;
    generatedAt?: string;
    conflictMode?: 'warn' | 'error';
}
export interface NormalizeCatalogReport {
    inputDevices: number;
    outputDevices: number;
    mergedDuplicates: number;
    conflictsResolved: number;
    conflictsByField: Partial<Record<'label' | 'manufacturerId' | 'productType' | 'productId', number>>;
}
export interface NormalizeCatalogResult {
    artifact: CatalogDevicesArtifactV1;
    report: NormalizeCatalogReport;
}
export declare class CatalogNormalizeConflictError extends Error {
    constructor(message: string);
}
export declare function normalizeCatalogDevicesArtifactV1(artifact: CatalogDevicesArtifactV1, options?: NormalizeCatalogOptions): NormalizeCatalogResult;

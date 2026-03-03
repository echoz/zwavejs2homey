import type { CatalogDevicesArtifactV1 } from './catalog-device-artifact';
export interface CatalogDeviceDiff {
    catalogId: string;
    change: 'added' | 'removed' | 'changed';
    labelChanged?: boolean;
    identifiersChanged?: Array<'manufacturerId' | 'productType' | 'productId'>;
    sourceNamesAdded?: string[];
    sourceNamesRemoved?: string[];
}
export interface DiffCatalogReport {
    fromDevices: number;
    toDevices: number;
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
}
export interface DiffCatalogResult {
    report: DiffCatalogReport;
    diffs: CatalogDeviceDiff[];
}
export declare function diffCatalogDevicesArtifactsV1(fromArtifact: CatalogDevicesArtifactV1, toArtifact: CatalogDevicesArtifactV1): DiffCatalogResult;

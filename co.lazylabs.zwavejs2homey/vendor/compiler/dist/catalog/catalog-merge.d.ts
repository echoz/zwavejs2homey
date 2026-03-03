import type { CatalogDevicesArtifactV1 } from './catalog-device-artifact';
import { type NormalizeCatalogOptions, type NormalizeCatalogReport } from './catalog-normalize';
export interface MergeCatalogOptions extends NormalizeCatalogOptions {
}
export interface MergeCatalogReport extends NormalizeCatalogReport {
    inputArtifacts: number;
}
export interface MergeCatalogResult {
    artifact: CatalogDevicesArtifactV1;
    report: MergeCatalogReport;
}
export declare function mergeCatalogDevicesArtifactsV1(artifacts: CatalogDevicesArtifactV1[], options?: MergeCatalogOptions): MergeCatalogResult;

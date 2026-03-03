import type { CatalogDeviceRecordV1 } from '../catalog/catalog-device-artifact';
import { type CatalogIndexBuildResult } from '../catalog/catalog-index';
import type { CompiledHomeyProfilePlan, ProvenanceRecord } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts } from '../models/zwave-facts';
import type { MappingRule } from '../rules/types';
import { type CompileDeviceOptions, type CompileDeviceResult } from './compile-device';
export interface CompileProfilePlanOptions {
    profileId?: string;
    homeyClass?: string;
    driverTemplateId?: string;
    confidence?: CompiledHomeyProfilePlan['classification']['confidence'];
    uncurated?: boolean;
    provenance?: Partial<ProvenanceRecord>;
    catalogArtifact?: {
        schemaVersion: 'catalog-devices/v1';
        source: {
            generatedAt: string;
            sourceRef: string;
        };
        devices: CatalogDeviceRecordV1[];
    };
    catalogIndex?: CatalogIndexBuildResult;
    reportMode?: CompileDeviceOptions['reportMode'];
}
export interface CompileProfilePlanCatalogLookup {
    matched: boolean;
    by: 'product-triple' | 'none';
    catalogId?: string;
    label?: string;
}
export declare function compileProfilePlan(device: NormalizedZwaveDeviceFacts, rules: MappingRule[], options?: CompileProfilePlanOptions): {
    profile: CompiledHomeyProfilePlan;
    report: CompileDeviceResult['report'];
    catalogLookup?: CompileProfilePlanCatalogLookup;
};

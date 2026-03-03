import type { HaDerivedGeneratedRuleArtifactV1 } from './generated-rule-artifact';
export declare class HaMockTranslationError extends Error {
    constructor(message: string);
}
export interface HaMockDiscoveryInputV1 {
    schemaVersion: 'ha-mock-discovery/v1';
    source: {
        generatedAt: string;
        sourceRef: string;
    };
    definitions: HaMockDiscoveryDefinitionV1[];
}
export interface HaMockDiscoveryDefinitionV1 {
    id: string;
    sourceRef: string;
    device?: {
        manufacturerId?: number;
        productType?: number;
        productId?: number;
        firmwareVersionRange?: {
            min?: string;
            max?: string;
        };
        deviceClassGeneric?: string[];
        deviceClassSpecific?: string[];
    };
    match: {
        commandClass: number;
        endpoint?: number;
        property: string | number;
        propertyKey?: string | number | null | Array<string | number | null>;
        metadataType?: string;
        readable?: boolean;
        writeable?: boolean;
    };
    constraints?: {
        requiredValues?: Array<{
            commandClass: number;
            endpoint?: number;
            property: string | number;
            propertyKey?: string | number | null | Array<string | number | null>;
        }>;
        absentValues?: Array<{
            commandClass: number;
            endpoint?: number;
            property: string | number;
            propertyKey?: string | number | null | Array<string | number | null>;
        }>;
    };
    output: {
        homeyClass?: string;
        driverTemplateId?: string;
        capabilityId?: string;
        assumedState?: boolean;
        allowMulti?: boolean;
        entityRegistryEnabledDefault?: boolean;
    };
}
export interface HaMockTranslationReport {
    translated: number;
    skipped: number;
    unsupported: Array<{
        id: string;
        reason: HaMockUnsupportedReason;
    }>;
    sourceRefs: string[];
}
export interface HaMockTranslationResult {
    artifact: HaDerivedGeneratedRuleArtifactV1;
    report: HaMockTranslationReport;
}
export type HaMockUnsupportedReason = 'unsupported-output-shape' | 'unsupported-match-field' | 'no-supported-output';
export declare function translateHaMockDiscoveryToGeneratedArtifact(input: unknown): HaMockTranslationResult;

import type { HaMockTranslationResult } from './translate-mock-discovery';
export declare class HaExtractedTranslationError extends Error {
    constructor(message: string);
}
export interface HaExtractedDiscoveryInputV1 {
    schemaVersion: 'ha-extracted-discovery/v1';
    source: {
        generatedAt: string;
        sourceRef: string;
    };
    entries: HaExtractedDiscoveryEntryV1[];
}
export interface HaExtractedDiscoveryEntryV1 {
    id: string;
    sourceRef: string;
    semantics?: {
        allowMulti?: boolean;
        assumedState?: boolean;
        entityRegistryEnabledDefault?: boolean;
    };
    deviceMatch?: {
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
    valueMatch: {
        commandClass: number;
        endpoint?: number;
        property: string | number;
        propertyKey?: string | number | null | Array<string | number | null>;
        metadata?: {
            type?: string;
            readable?: boolean;
            writeable?: boolean;
        };
        [key: string]: unknown;
    };
    companions?: {
        requiredValues?: Array<{
            commandClass: number;
            endpoint?: number;
            property: string | number;
            propertyKey?: string | number | null | Array<string | number | null>;
            [key: string]: unknown;
        }>;
        absentValues?: Array<{
            commandClass: number;
            endpoint?: number;
            property: string | number;
            propertyKey?: string | number | null | Array<string | number | null>;
            [key: string]: unknown;
        }>;
        [key: string]: unknown;
    };
    output: {
        homeyClass?: string;
        driverTemplateId?: string;
        capabilityId?: string;
        [key: string]: unknown;
    };
}
export declare function assertHaExtractedDiscoveryInputV1(input: unknown): asserts input is HaExtractedDiscoveryInputV1;
export declare function translateHaExtractedDiscoveryToGeneratedArtifact(input: unknown): HaMockTranslationResult;

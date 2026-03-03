import type { CompileProfilePlanFromFilesResult } from '../compiler/compile-profile-plan-from-files';
import type { RuleLayer } from '../rules/types';
export declare const COMPILED_HOMEY_PROFILES_ARTIFACT_V1: "compiled-homey-profiles/v1";
export interface CompiledHomeyProfilesArtifactEntryV1 {
    device: {
        deviceKey: string;
        nodeId?: number;
        manufacturerId?: number;
        productType?: number;
        productId?: number;
        firmwareVersion?: string;
    };
    compiled: CompileProfilePlanFromFilesResult;
}
export interface CompiledHomeyProfilesArtifactV1 {
    schemaVersion: typeof COMPILED_HOMEY_PROFILES_ARTIFACT_V1;
    generatedAt: string;
    source: {
        manifestFile?: string;
        rulesFiles?: string[];
        catalogFile?: string;
        buildProfile?: 'default-manifest' | 'manifest-file' | 'rules-files';
        pipelineFingerprint?: string;
        ruleSources?: Array<{
            filePath: string;
            ruleCount: number;
            declaredLayer?: RuleLayer;
            resolvedLayer?: RuleLayer;
        }>;
    };
    entries: CompiledHomeyProfilesArtifactEntryV1[];
}
export declare class CompiledHomeyProfilesArtifactError extends Error {
    constructor(message: string);
}
export declare function assertCompiledHomeyProfilesArtifactV1(input: unknown): asserts input is CompiledHomeyProfilesArtifactV1;
export declare function createCompiledHomeyProfilesArtifactV1(entries: CompiledHomeyProfilesArtifactEntryV1[], source: CompiledHomeyProfilesArtifactV1['source'], now?: Date): CompiledHomeyProfilesArtifactV1;

import type { HaExtractedDiscoveryInputV1 } from './translate-extracted-discovery';
export declare class HaExtractedDiscoveryArtifactError extends Error {
    readonly filePath: string;
    constructor(message: string, filePath: string);
}
export declare function loadHaExtractedDiscoveryArtifact(filePath: string): HaExtractedDiscoveryInputV1;

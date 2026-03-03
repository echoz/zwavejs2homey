export declare const HOMEY_VOCABULARY_ARTIFACT_V1: "homey-vocabulary/v1";
export type HomeyVocabularySourceKind = 'homey-lib-system' | 'homey-compose-custom';
export interface HomeyVocabularySourceRefV1 {
    source: HomeyVocabularySourceKind;
    sourceRef: string;
}
export interface HomeyVocabularyEntryV1 {
    id: string;
    sources: HomeyVocabularySourceRefV1[];
}
export interface HomeyVocabularyArtifactV1 {
    schemaVersion: typeof HOMEY_VOCABULARY_ARTIFACT_V1;
    generatedAt: string;
    source: {
        homeyLibVersion?: string;
        homeyLibRoot?: string;
        composeCapabilitiesDir?: string;
    };
    homeyClasses: HomeyVocabularyEntryV1[];
    capabilityIds: HomeyVocabularyEntryV1[];
}
export interface HomeyVocabularyLookupV1 {
    homeyClasses: ReadonlySet<string>;
    capabilityIds: ReadonlySet<string>;
}
export declare class HomeyVocabularyArtifactError extends Error {
    constructor(message: string);
}
export declare function assertHomeyVocabularyArtifactV1(input: unknown): asserts input is HomeyVocabularyArtifactV1;
export declare function createHomeyVocabularyArtifactV1(entries: {
    homeyClasses: HomeyVocabularyEntryV1[];
    capabilityIds: HomeyVocabularyEntryV1[];
}, source: HomeyVocabularyArtifactV1['source'], now?: Date): HomeyVocabularyArtifactV1;
export declare function loadHomeyVocabularyArtifact(filePath: string): HomeyVocabularyArtifactV1;
export declare function createHomeyVocabularyLookupV1(artifact: HomeyVocabularyArtifactV1): HomeyVocabularyLookupV1;

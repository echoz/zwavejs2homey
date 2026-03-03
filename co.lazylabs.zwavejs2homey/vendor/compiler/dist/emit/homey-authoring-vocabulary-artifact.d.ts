export declare const HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1: "homey-authoring-vocabulary/v1";
export type HomeyAuthoringVocabularySourceKind = 'homey-lib-system' | 'homey-compose-custom';
export interface HomeyAuthoringVocabularySourceRefV1 {
    source: HomeyAuthoringVocabularySourceKind;
    sourceRef: string;
}
export interface HomeyAuthoringVocabularyEntryV1 {
    id: string;
    sources: HomeyAuthoringVocabularySourceRefV1[];
}
export interface HomeyAuthoringVocabularyArtifactV1 {
    schemaVersion: typeof HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1;
    generatedAt: string;
    source: {
        homeyLibVersion?: string;
        homeyLibRoot?: string;
        composeCapabilitiesDir?: string;
    };
    homeyClasses: HomeyAuthoringVocabularyEntryV1[];
    capabilityIds: HomeyAuthoringVocabularyEntryV1[];
}
export interface HomeyAuthoringVocabularyLookupV1 {
    homeyClasses: ReadonlySet<string>;
    capabilityIds: ReadonlySet<string>;
}
export declare class HomeyAuthoringVocabularyArtifactError extends Error {
    constructor(message: string);
}
export declare function assertHomeyAuthoringVocabularyArtifactV1(input: unknown): asserts input is HomeyAuthoringVocabularyArtifactV1;
export declare function createHomeyAuthoringVocabularyArtifactV1(entries: {
    homeyClasses: HomeyAuthoringVocabularyEntryV1[];
    capabilityIds: HomeyAuthoringVocabularyEntryV1[];
}, source: HomeyAuthoringVocabularyArtifactV1['source'], now?: Date): HomeyAuthoringVocabularyArtifactV1;
export declare function loadHomeyAuthoringVocabularyArtifact(filePath: string): HomeyAuthoringVocabularyArtifactV1;
export declare function createHomeyAuthoringVocabularyLookupV1(artifact: HomeyAuthoringVocabularyArtifactV1): HomeyAuthoringVocabularyLookupV1;

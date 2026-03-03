import type { MappingRule } from '../../rules/types';
export interface HaDerivedGeneratedRuleArtifactV1 {
    schemaVersion: 'ha-derived-rules/v1';
    source: {
        upstream: 'home-assistant';
        component: 'zwave_js';
        generatedAt: string;
        sourceRef?: string;
    };
    rules: MappingRule[];
}
export declare class HaGeneratedRuleArtifactError extends Error {
    readonly filePath: string;
    constructor(message: string, filePath: string);
}
export declare function loadHaDerivedGeneratedRuleArtifact(filePath: string): HaDerivedGeneratedRuleArtifactV1;

import type { MappingRule } from '../rules/types';
import { type RuleValidationOptions } from './rule-validation';
export declare class RuleSetLoadError extends Error {
    constructor(message: string);
}
export interface RuleSetManifestEntry {
    filePath: string;
    layer?: MappingRule['layer'];
    kind?: 'rules-json' | 'ha-derived-generated';
}
export interface LoadedRuleFile {
    filePath: string;
    rules: MappingRule[];
}
export interface LoadedRuleSetManifest {
    entries: Array<LoadedRuleFile & {
        declaredLayer?: MappingRule['layer'];
        resolvedLayer?: MappingRule['layer'];
    }>;
    duplicateRuleIds: string[];
}
export declare function loadJsonRuleFile(filePath: string, options?: RuleValidationOptions): MappingRule[];
export declare function loadJsonRuleFiles(filePaths: string[]): LoadedRuleFile[];
export declare function loadJsonRuleSetManifest(entries: RuleSetManifestEntry[]): LoadedRuleSetManifest;
export declare function loadJsonRuleSetManifestWithOptions(entries: RuleSetManifestEntry[], options?: RuleValidationOptions): LoadedRuleSetManifest;
export { RuleFileLoadError, validateJsonRuleArray } from './rule-validation';

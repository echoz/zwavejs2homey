import type { MappingRule } from '../rules/types';
export declare class RuleFileLoadError extends Error {
    readonly filePath: string;
    constructor(message: string, filePath: string);
}
export interface RuleValidationVocabulary {
    homeyClasses?: ReadonlySet<string>;
    capabilityIds?: ReadonlySet<string>;
}
export interface RuleValidationOptions {
    declaredLayer?: MappingRule['layer'];
    vocabulary?: RuleValidationVocabulary;
}
export declare function validateJsonRuleArray(value: unknown, filePath: string, options?: RuleValidationOptions): MappingRule[];
export declare function validateJsonRuleArrayWithOptions(value: unknown, filePath: string, options?: RuleValidationOptions): MappingRule[];

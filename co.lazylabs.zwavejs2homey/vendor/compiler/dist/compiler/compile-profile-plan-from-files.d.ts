import type { NormalizedZwaveDeviceFacts } from '../models/zwave-facts';
import type { CompileProfilePlanOptions } from './compile-profile-plan';
import { compileProfilePlan } from './compile-profile-plan';
import { type LoadedRuleSetManifest, type RuleSetManifestEntry } from './rule-loader';
export interface RuleSourceMetadata {
    filePath: string;
    ruleCount: number;
    ruleIds: readonly string[];
}
export interface CompileProfilePlanFromFilesResult {
    profile: ReturnType<typeof compileProfilePlan>['profile'];
    report: ReturnType<typeof compileProfilePlan>['report'] & {
        profileOutcome: 'curated' | 'ha-derived' | 'generic' | 'empty';
        byRule: Array<{
            ruleId: string;
            layer: string;
            applied: number;
            unmatched: number;
            actionTypes: Record<string, number>;
        }>;
        bySuppressedSlot: Array<{
            slot: string;
            layer: string;
            ruleId: string;
            count: number;
        }>;
        curationCandidates: {
            likelyNeedsReview: boolean;
            reasons: string[];
        };
        catalogContext?: {
            knownCatalogDevice: boolean;
            catalogId?: string;
            label?: string;
            matchRef?: string;
        };
        unknownDeviceReport?: {
            kind: 'known-catalog' | 'unknown-catalog' | 'no-catalog';
            diagnosticDeviceKey: string;
            profileOutcome: 'curated' | 'ha-derived' | 'generic' | 'empty';
            matchRef?: string;
            label?: string;
            reasons: string[];
        };
        diagnosticDeviceKey: string;
    };
    ruleSources: readonly RuleSourceMetadata[];
    classificationProvenance?: {
        layer?: string;
        ruleId?: string;
        action?: string;
        reason?: string;
    };
    catalogLookup?: {
        matched: boolean;
        by: 'product-triple' | 'none';
        catalogId?: string;
        label?: string;
    };
}
export declare function compileProfilePlanFromRuleFiles(device: NormalizedZwaveDeviceFacts, ruleFilePaths: string[], options?: CompileProfilePlanOptions): CompileProfilePlanFromFilesResult;
export declare function compileProfilePlanFromLoadedRuleSetManifest(device: NormalizedZwaveDeviceFacts, loaded: LoadedRuleSetManifest, options?: CompileProfilePlanOptions): CompileProfilePlanFromFilesResult;
export declare function compileProfilePlanFromRuleSetManifest(device: NormalizedZwaveDeviceFacts, manifestEntries: RuleSetManifestEntry[], options?: CompileProfilePlanOptions): CompileProfilePlanFromFilesResult;
export declare function compileProfilePlanFromRuleFilesWithCatalog(device: NormalizedZwaveDeviceFacts, ruleFilePaths: string[], catalogFilePath: string, options?: Omit<CompileProfilePlanOptions, 'catalogArtifact'>): CompileProfilePlanFromFilesResult;

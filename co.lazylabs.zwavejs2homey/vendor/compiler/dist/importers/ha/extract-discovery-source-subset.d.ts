import type { HaExtractedDiscoveryInputV1 } from './translate-extracted-discovery';
export type HaSourceSubsetUnsupportedReason = 'unsupported-platform' | 'unsupported-primary-value-alias' | 'unsupported-primary-value-inline' | 'unsupported-primary-value-shape' | 'unsupported-primary-value' | 'unsupported-companion-alias' | 'unsupported-companion-inline' | 'unsupported-companion-shape' | 'missing-required-fields' | 'unsupported-companion-value' | 'parse-error';
export interface HaSourceSubsetUnsupportedItem {
    sourceRef: string;
    reason: HaSourceSubsetUnsupportedReason;
    detail: string;
}
export interface HaSourceSubsetExtractReport {
    scannedSchemas: number;
    translated: number;
    skipped: number;
    unsupported: HaSourceSubsetUnsupportedItem[];
    unsupportedByReason: Partial<Record<HaSourceSubsetUnsupportedReason, number>>;
}
export interface HaSourceSubsetExtractResult {
    artifact: HaExtractedDiscoveryInputV1;
    report: HaSourceSubsetExtractReport;
}
export declare function extractHaDiscoverySubsetFromSource(sourceText: string, sourceRefBase: string): HaSourceSubsetExtractResult;
export declare function extractHaDiscoverySubsetFromFile(filePath: string): HaSourceSubsetExtractResult;

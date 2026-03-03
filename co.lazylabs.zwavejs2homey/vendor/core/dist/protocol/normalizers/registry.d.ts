import type { ZwjsProtocolAdapter } from './types';
export interface AdapterSelection {
    adapter: ZwjsProtocolAdapter;
    match: 'exact' | 'family' | 'fallback';
}
export declare function selectAdapter(version?: string): AdapterSelection;
//# sourceMappingURL=registry.d.ts.map
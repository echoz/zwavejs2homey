import type { ZwjsProtocolAdapter } from './types';
import { DefaultZwjsFamilyNormalizer } from './family-default';
import { FallbackNormalizer } from './fallback';

export interface AdapterSelection {
  adapter: ZwjsProtocolAdapter;
  match: 'exact' | 'family' | 'fallback';
}

const ADAPTERS: ZwjsProtocolAdapter[] = [new DefaultZwjsFamilyNormalizer()];
const FALLBACK = new FallbackNormalizer();

export function selectAdapter(version?: string): AdapterSelection {
  for (const adapter of ADAPTERS) {
    if (adapter.canHandleVersion(version)) {
      return { adapter, match: version ? 'family' : 'fallback' };
    }
  }
  return { adapter: FALLBACK, match: 'fallback' };
}

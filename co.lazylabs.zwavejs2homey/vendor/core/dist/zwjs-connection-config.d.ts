import type { ZwjsClientConfig } from './client/types';
export declare const ZWJS_CONNECTION_SETTINGS_KEY = "zwjs_connection";
export interface ResolvedZwjsConnectionConfig {
    source: 'default' | 'settings';
    clientConfig: Pick<ZwjsClientConfig, 'url' | 'auth'>;
    warnings: string[];
}
export declare function resolveZwjsConnectionConfig(rawSettings: unknown, defaults?: {
    url?: string;
}): ResolvedZwjsConnectionConfig;
//# sourceMappingURL=zwjs-connection-config.d.ts.map
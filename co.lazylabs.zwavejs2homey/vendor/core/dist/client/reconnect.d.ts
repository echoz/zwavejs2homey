import type { ReconnectPolicy } from './types';
export declare const DEFAULT_RECONNECT_POLICY: ReconnectPolicy;
export declare function mergeReconnectPolicy(policy?: Partial<ReconnectPolicy>): ReconnectPolicy;
export declare function computeReconnectDelayMs(attempt: number, policy: ReconnectPolicy): number;
//# sourceMappingURL=reconnect.d.ts.map
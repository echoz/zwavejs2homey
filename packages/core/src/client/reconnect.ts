import type { ReconnectPolicy } from './types';

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  enabled: true,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  multiplier: 2,
  jitterRatio: 0.2,
};

export function mergeReconnectPolicy(policy?: Partial<ReconnectPolicy>): ReconnectPolicy {
  return { ...DEFAULT_RECONNECT_POLICY, ...policy };
}

export function computeReconnectDelayMs(attempt: number, policy: ReconnectPolicy): number {
  const base = Math.min(
    policy.maxDelayMs,
    policy.initialDelayMs * Math.pow(policy.multiplier, Math.max(0, attempt - 1)),
  );
  const jitterSpan = Math.round(base * policy.jitterRatio);
  if (jitterSpan <= 0) return base;
  const offset = Math.floor(Math.random() * (jitterSpan * 2 + 1)) - jitterSpan;
  return Math.max(0, base + offset);
}

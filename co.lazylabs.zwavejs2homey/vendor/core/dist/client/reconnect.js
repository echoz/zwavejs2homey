"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RECONNECT_POLICY = void 0;
exports.mergeReconnectPolicy = mergeReconnectPolicy;
exports.computeReconnectDelayMs = computeReconnectDelayMs;
exports.DEFAULT_RECONNECT_POLICY = {
    enabled: true,
    initialDelayMs: 500,
    maxDelayMs: 10_000,
    multiplier: 2,
    jitterRatio: 0.2,
};
function mergeReconnectPolicy(policy) {
    return { ...exports.DEFAULT_RECONNECT_POLICY, ...policy };
}
function computeReconnectDelayMs(attempt, policy) {
    const base = Math.min(policy.maxDelayMs, policy.initialDelayMs * Math.pow(policy.multiplier, Math.max(0, attempt - 1)));
    const jitterSpan = Math.round(base * policy.jitterRatio);
    if (jitterSpan <= 0)
        return base;
    const offset = Math.floor(Math.random() * (jitterSpan * 2 + 1)) - jitterSpan;
    return Math.max(0, base + offset);
}

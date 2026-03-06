"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBridgeSession = createBridgeSession;
function normalizeBridgeId(value, fallback) {
    if (typeof value !== 'string')
        return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}
function createBridgeSession(bridgeId) {
    const normalizedBridgeId = normalizeBridgeId(bridgeId, 'main');
    let zwjsClient;
    return {
        bridgeId: normalizedBridgeId,
        getZwjsClient: () => zwjsClient,
        setZwjsClient: (nextClient) => {
            zwjsClient = nextClient;
        },
        getZwjsStatus: () => zwjsClient?.getStatus(),
    };
}

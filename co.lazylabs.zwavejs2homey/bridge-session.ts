import type { ZwjsClient } from '@zwavejs2homey/core';

export interface BridgeSessionRuntimeState {
  bridgeId: string;
  getZwjsClient: () => ZwjsClient | undefined;
  setZwjsClient: (client: ZwjsClient | undefined) => void;
  getZwjsStatus: () => ReturnType<ZwjsClient['getStatus']> | undefined;
}

function normalizeBridgeId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function createBridgeSession(bridgeId: string): BridgeSessionRuntimeState {
  const normalizedBridgeId = normalizeBridgeId(bridgeId, 'main');
  let zwjsClient: ZwjsClient | undefined;
  return {
    bridgeId: normalizedBridgeId,
    getZwjsClient: () => zwjsClient,
    setZwjsClient: (nextClient: ZwjsClient | undefined) => {
      zwjsClient = nextClient;
    },
    getZwjsStatus: () => zwjsClient?.getStatus(),
  };
}

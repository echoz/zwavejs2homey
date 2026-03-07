import Homey from 'homey';
import type { ZwjsClient } from '@zwavejs2homey/core';

interface BridgeSessionLike {
  bridgeId?: string;
  getZwjsClient?: () => ZwjsClient | undefined;
}

interface AppRuntimeAccess {
  getBridgeSession?: (bridgeId?: string) => BridgeSessionLike | undefined;
  getZwjsClient?: (bridgeId?: string) => ZwjsClient | undefined;
  getBridgeId?: () => string;
  configureBridgeConnection?: (options: {
    bridgeId: string;
    settings?: unknown;
    reason?: string;
  }) => Promise<unknown>;
  removeBridgeConnection?: (options: { bridgeId: string; reason?: string }) => Promise<unknown>;
  getNodeRuntimeDiagnostics?: (options?: { homeyDeviceId?: string; bridgeId?: string }) => Promise<{
    generatedAt: string;
    bridgeId: string;
    zwjs: {
      available: boolean;
      transportConnected: boolean;
      lifecycle: string;
      versionReceived: boolean | null;
      initialized: boolean | null;
      listening: boolean | null;
      authenticated: boolean | null;
      serverVersion: string | null;
      adapterFamily: string | null;
      reconnectAttempt: number | null;
      connectedAt: string | null;
      lastMessageAt: string | null;
    };
    compiledProfiles: {
      loaded: boolean;
      sourcePath: string;
      generatedAt: string | null;
      pipelineFingerprint: string | null;
      entryCount: number;
      errorMessage: string | null;
    };
    curation: {
      loaded: boolean;
      source: string;
      entryCount: number;
      errorMessage: string | null;
    };
    nodes: Array<{
      curation: {
        entryPresent: boolean;
      };
      recommendation: {
        available: boolean;
        backfillNeeded: boolean;
      };
      mapping: {
        inboundSkipped: number;
        outboundSkipped: number;
      };
    }>;
  }>;
  getRecommendationActionQueue?: (options?: {
    homeyDeviceId?: string;
    bridgeId?: string;
    includeNoAction?: boolean;
  }) => Promise<unknown>;
  executeRecommendationAction?: (options: {
    homeyDeviceId: string;
    action?: 'auto' | 'backfill-marker' | 'adopt-recommended-baseline' | 'none';
  }) => Promise<unknown>;
  executeRecommendationActions?: (options?: {
    homeyDeviceId?: string;
    bridgeId?: string;
    includeNoAction?: boolean;
  }) => Promise<unknown>;
}

module.exports = class BridgeDevice extends Homey.Device {
  private static toBooleanOption(options: unknown, key: string): boolean | null {
    if (!options || typeof options !== 'object') return null;
    const value = (options as Record<string, unknown>)[key];
    if (typeof value === 'undefined') return null;
    return typeof value === 'boolean' ? value : null;
  }

  private static toStringOption(options: unknown, key: string): string | null {
    if (!options || typeof options !== 'object') return null;
    const value = (options as Record<string, unknown>)[key];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private static toActionOption(
    options: unknown,
  ): 'auto' | 'backfill-marker' | 'adopt-recommended-baseline' | 'none' | null {
    const value = BridgeDevice.toStringOption(options, 'action');
    if (!value) return null;
    if (value === 'auto') return value;
    if (value === 'backfill-marker') return value;
    if (value === 'adopt-recommended-baseline') return value;
    if (value === 'none') return value;
    return null;
  }

  private getRuntimeApp(): AppRuntimeAccess {
    return this.homey.app as AppRuntimeAccess;
  }

  private resolveDeviceBridgeId(app: AppRuntimeAccess): string {
    const data = this.getData() as { bridgeId?: unknown } | undefined;
    const dataBridgeId =
      typeof data?.bridgeId === 'string' && data.bridgeId.trim().length > 0
        ? data.bridgeId.trim()
        : null;
    return dataBridgeId ?? app.getBridgeId?.() ?? 'main';
  }

  private resolveBridgeRuntime(app: AppRuntimeAccess): {
    bridgeId: string;
    client: ZwjsClient | undefined;
  } {
    const bridgeId = this.resolveDeviceBridgeId(app);
    const session = app.getBridgeSession?.(bridgeId);
    const client = session?.getZwjsClient?.() ?? app.getZwjsClient?.(bridgeId);
    return { bridgeId, client };
  }

  private async refreshRuntimeDiagnostics(reason: string): Promise<void> {
    const app = this.getRuntimeApp();
    const bridgeId = this.resolveDeviceBridgeId(app);
    const diagnostics = await app.getNodeRuntimeDiagnostics?.({ bridgeId });
    if (!diagnostics) return;

    let recommendationAvailableCount = 0;
    let recommendationBackfillCount = 0;
    let curationEntryCount = 0;
    let inboundSkipped = 0;
    let outboundSkipped = 0;
    for (const node of diagnostics.nodes) {
      if (node.recommendation.available) recommendationAvailableCount += 1;
      if (node.recommendation.backfillNeeded) recommendationBackfillCount += 1;
      if (node.curation.entryPresent) curationEntryCount += 1;
      inboundSkipped += node.mapping.inboundSkipped;
      outboundSkipped += node.mapping.outboundSkipped;
    }

    await this.setStoreValue('runtimeDiagnostics', {
      refreshedAt: new Date().toISOString(),
      reason,
      generatedAt: diagnostics.generatedAt,
      bridgeId,
      zwjs: diagnostics.zwjs,
      compiledProfiles: {
        loaded: diagnostics.compiledProfiles.loaded,
        sourcePath: diagnostics.compiledProfiles.sourcePath,
        generatedAt: diagnostics.compiledProfiles.generatedAt,
        pipelineFingerprint: diagnostics.compiledProfiles.pipelineFingerprint,
        entryCount: diagnostics.compiledProfiles.entryCount,
        errorMessage: diagnostics.compiledProfiles.errorMessage,
      },
      curation: {
        loaded: diagnostics.curation.loaded,
        source: diagnostics.curation.source,
        entryCount: diagnostics.curation.entryCount,
        errorMessage: diagnostics.curation.errorMessage,
      },
      nodeSummary: {
        total: diagnostics.nodes.length,
        curationEntryCount,
        recommendationAvailableCount,
        recommendationBackfillCount,
        inboundSkipped,
        outboundSkipped,
      },
    });
  }

  async getRuntimeDiagnostics(options?: { homeyDeviceId?: string }) {
    const app = this.getRuntimeApp();
    const homeyDeviceId = BridgeDevice.toStringOption(options, 'homeyDeviceId');
    const bridgeId = this.resolveDeviceBridgeId(app);
    return app.getNodeRuntimeDiagnostics?.({
      homeyDeviceId: homeyDeviceId ?? undefined,
      bridgeId,
    });
  }

  async getRecommendationActionQueue(options?: {
    homeyDeviceId?: string;
    includeNoAction?: boolean;
  }) {
    const app = this.getRuntimeApp();
    const homeyDeviceId = BridgeDevice.toStringOption(options, 'homeyDeviceId');
    const includeNoAction = BridgeDevice.toBooleanOption(options, 'includeNoAction');
    const bridgeId = this.resolveDeviceBridgeId(app);
    return app.getRecommendationActionQueue?.({
      homeyDeviceId: homeyDeviceId ?? undefined,
      bridgeId,
      includeNoAction: includeNoAction === true,
    });
  }

  async executeRecommendationAction(options: { homeyDeviceId: string; action?: string }) {
    const app = this.getRuntimeApp();
    const homeyDeviceId = BridgeDevice.toStringOption(options, 'homeyDeviceId');
    if (!homeyDeviceId) {
      throw new Error('Invalid homeyDeviceId for recommendation action');
    }
    const action = BridgeDevice.toActionOption(options);
    if (typeof options.action !== 'undefined' && !action) {
      throw new Error('Invalid recommendation action');
    }
    const result = await app.executeRecommendationAction?.({
      homeyDeviceId,
      action: action ?? undefined,
    });
    await this.refreshRuntimeDiagnostics('recommendation-action-executed');
    return result;
  }

  async executeRecommendationActions(options?: {
    homeyDeviceId?: string;
    includeNoAction?: boolean;
  }) {
    const app = this.getRuntimeApp();
    const homeyDeviceId = BridgeDevice.toStringOption(options, 'homeyDeviceId');
    const includeNoAction = BridgeDevice.toBooleanOption(options, 'includeNoAction');
    const bridgeId = this.resolveDeviceBridgeId(app);
    const result = await app.executeRecommendationActions?.({
      homeyDeviceId: homeyDeviceId ?? undefined,
      bridgeId,
      includeNoAction: includeNoAction === true,
    });
    await this.refreshRuntimeDiagnostics('recommendation-actions-executed');
    return result;
  }

  async onInit() {
    const app = this.getRuntimeApp();
    const bridgeId = this.resolveDeviceBridgeId(app);
    await app.configureBridgeConnection?.({
      bridgeId,
      settings: this.getSettings(),
      reason: 'bridge-device-init',
    });
    const runtime = this.resolveBridgeRuntime(app);
    const status = runtime.client?.getStatus();
    this.log('BridgeDevice initialized', {
      bridgeId,
      transportConnected: status?.transportConnected === true,
      lifecycle: status?.lifecycle ?? 'stopped',
    });
    await this.refreshRuntimeDiagnostics('init');
  }

  async onRuntimeDiagnosticsRefresh(reason = 'runtime-refresh') {
    await this.refreshRuntimeDiagnostics(reason);
  }

  async onAdded() {
    this.log('BridgeDevice paired');
  }

  async onSettings({
    oldSettings: _oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('BridgeDevice settings changed', { changedKeys });
    const app = this.getRuntimeApp();
    const bridgeId = this.resolveDeviceBridgeId(app);
    await app.configureBridgeConnection?.({
      bridgeId,
      settings: newSettings,
      reason: 'bridge-device-settings-changed',
    });
    await this.refreshRuntimeDiagnostics('bridge-settings-changed');
  }

  async onRenamed(newName: string) {
    this.log('BridgeDevice renamed', { newName });
  }

  async onDeleted() {
    const app = this.getRuntimeApp();
    const bridgeId = this.resolveDeviceBridgeId(app);
    await app.removeBridgeConnection?.({
      bridgeId,
      reason: 'bridge-device-deleted',
    });
    this.log('BridgeDevice deleted', { bridgeId });
  }
};

import Homey from 'homey';
import type { ZwjsClient } from '@zwavejs2homey/core';

interface AppRuntimeAccess {
  getZwjsClient?: () => ZwjsClient | undefined;
  getBridgeId?: () => string;
  getNodeRuntimeDiagnostics?: () => Promise<{
    generatedAt: string;
    bridgeId: string;
    zwjs: {
      available: boolean;
      transportConnected: boolean;
      lifecycle: string;
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
}

module.exports = class BridgeDevice extends Homey.Device {
  private async refreshRuntimeDiagnostics(reason: string): Promise<void> {
    const app = this.homey.app as AppRuntimeAccess;
    const diagnostics = await app.getNodeRuntimeDiagnostics?.();
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
      bridgeId: diagnostics.bridgeId,
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

  async onInit() {
    const app = this.homey.app as AppRuntimeAccess;
    const bridgeId = app.getBridgeId?.() ?? 'unknown';
    const status = app.getZwjsClient?.()?.getStatus();
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
    newSettings: _newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('BridgeDevice settings changed', { changedKeys });
  }

  async onRenamed(newName: string) {
    this.log('BridgeDevice renamed', { newName });
  }

  async onDeleted() {
    this.log('BridgeDevice deleted');
  }
};

import Homey from 'homey';
import {
  createBridgePairCandidate,
  hasBridgePairDeviceFromData,
  ZWJS_DEFAULT_BRIDGE_ID,
} from '../../pairing';

interface AppRuntimeAccess {
  getZwjsClient?: () =>
    | {
        getStatus?: () => {
          transportConnected?: boolean;
          lifecycle?: string;
          serverVersion?: string | null;
          adapterFamily?: string | null;
        };
        getNodeList?: () => Promise<{
          nodes?: Array<{
            nodeId?: unknown;
          }>;
        }>;
      }
    | undefined;
  getNodeRuntimeDiagnostics?: (options?: { homeyDeviceId?: string }) => Promise<{
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
      homeyDeviceId: string | null;
      nodeId: number | null;
      node: {
        manufacturerId: number | null;
        productType: number | null;
        productId: number | null;
        manufacturer: string | null;
        product: string | null;
        location: string | null;
        interviewStage: string | null;
        status: string | null;
        firmwareVersion: string | null;
        ready: boolean | null;
        isFailed: boolean | null;
      };
      sync: {
        syncedAt: string | null;
        syncReason: string | null;
      };
      curation: {
        loaded: boolean;
        source: string | null;
        error: string | null;
        entryPresent: boolean;
        appliedActions: number;
        skippedActions: number;
        errorCount: number;
      };
      profile: {
        matchBy: string | null;
        matchKey: string | null;
        profileId: string | null;
        fallbackReason: string | null;
        homeyClass: string | null;
        confidence: string | null;
        uncurated: boolean;
      };
      profileAttribution?: {
        confidenceCode: string | null;
        confidenceLabel: string;
        sourceCode: string;
        sourceLabel: string;
        summary: string;
        curationEntryPresent: boolean;
      };
      recommendation: {
        available: boolean;
        reason: string | null;
        reasonLabel: string | null;
        backfillNeeded: boolean;
      };
      mapping: {
        verticalSliceApplied: boolean;
        capabilityCount: number;
        inboundConfigured: number;
        inboundEnabled: number;
        inboundSkipped: number;
        outboundConfigured: number;
        outboundEnabled: number;
        outboundSkipped: number;
        skipReasons: Record<string, number>;
      };
    }>;
  }>;
}

interface RepairSessionLike {
  setHandler: (event: string, handler: (payload?: unknown) => Promise<unknown>) => void;
}

interface PairSessionLike {
  setHandler: (event: string, handler: (payload?: unknown) => Promise<unknown>) => void;
}

interface HomeyBridgeDeviceData {
  id?: string;
  bridgeId?: string;
}

module.exports = class BridgeDriver extends Homey.Driver {
  async onInit() {
    this.log('BridgeDriver initialized');
  }

  private hasBridgeDeviceAlreadyPaired(): boolean {
    const existingData = this.getDevices().map(
      (device) => device.getData() as { id?: string } | undefined,
    );
    return hasBridgePairDeviceFromData(existingData);
  }

  async onPairListDevices() {
    if (this.hasBridgeDeviceAlreadyPaired()) {
      this.log('Bridge device already paired, returning empty pair list');
      return [];
    }

    return [createBridgePairCandidate()];
  }

  async onPair(session: PairSessionLike) {
    session.setHandler('next_steps:get_status', async () => {
      return this.loadNextStepsStatus();
    });
  }

  private async loadNextStepsStatus(): Promise<{
    generatedAt: string;
    bridgeId: string;
    zwjs: {
      available: boolean;
      transportConnected: boolean;
      lifecycle: string;
      serverVersion: string | null;
      adapterFamily: string | null;
    };
    discoveredNodes: number | null;
    importedNodes: number | null;
    pendingImportNodes: number | null;
    warnings: string[];
  }> {
    const app = this.homey.app as AppRuntimeAccess;
    const client = app.getZwjsClient?.();
    const status = client?.getStatus?.();
    const zwjs = {
      available: Boolean(client),
      transportConnected: status?.transportConnected === true,
      lifecycle: typeof status?.lifecycle === 'string' ? status.lifecycle : 'stopped',
      serverVersion:
        typeof status?.serverVersion === 'string' && status.serverVersion.trim().length > 0
          ? status.serverVersion.trim()
          : null,
      adapterFamily:
        typeof status?.adapterFamily === 'string' && status.adapterFamily.trim().length > 0
          ? status.adapterFamily.trim()
          : null,
    };

    let discoveredNodes: number | null = null;
    let importedNodes: number | null = null;
    let bridgeId: string = ZWJS_DEFAULT_BRIDGE_ID;
    const warnings: string[] = [];

    if (client?.getNodeList) {
      try {
        const nodeList = await client.getNodeList();
        const nodes = Array.isArray(nodeList?.nodes) ? nodeList.nodes : [];
        discoveredNodes = nodes.filter((node) => {
          const nodeId = node?.nodeId;
          return typeof nodeId === 'number' && Number.isInteger(nodeId) && nodeId > 1;
        }).length;
      } catch (error) {
        this.error('Failed to load node list for bridge next steps status', { error });
        warnings.push('Unable to load node discovery status from ZWJS.');
      }
    } else {
      warnings.push('ZWJS client is unavailable; configure zwjs_connection.url in app settings.');
    }

    if (app.getNodeRuntimeDiagnostics) {
      try {
        const diagnostics = await app.getNodeRuntimeDiagnostics();
        if (
          diagnostics &&
          typeof diagnostics.bridgeId === 'string' &&
          diagnostics.bridgeId.trim().length > 0
        ) {
          bridgeId = diagnostics.bridgeId.trim();
        }
        importedNodes = Array.isArray(diagnostics.nodes) ? diagnostics.nodes.length : 0;
      } catch (error) {
        this.error('Failed to load imported node count for bridge next steps status', { error });
        warnings.push('Unable to read imported node count from runtime diagnostics.');
      }
    } else {
      warnings.push('Runtime diagnostics are not ready yet.');
    }

    let pendingImportNodes: number | null = null;
    if (typeof discoveredNodes === 'number' && typeof importedNodes === 'number') {
      pendingImportNodes = Math.max(discoveredNodes - importedNodes, 0);
    }

    if (!zwjs.transportConnected) {
      warnings.push('ZWJS transport is not connected; node import list may be empty.');
    }

    return {
      generatedAt: new Date().toISOString(),
      bridgeId,
      zwjs,
      discoveredNodes,
      importedNodes,
      pendingImportNodes,
      warnings,
    };
  }

  private describeProfileConfidenceLabel(confidence: unknown): string {
    const normalized = typeof confidence === 'string' ? confidence.trim().toLowerCase() : '';
    if (normalized === 'curated') return 'Project rule match';
    if (normalized === 'ha-derived') return 'Home Assistant-derived rule match';
    if (normalized === 'generic') return 'Generic fallback rule';
    return 'Unknown rule match level';
  }

  private normalizeProfileAttribution(node: {
    profileAttribution?: {
      confidenceCode: string | null;
      confidenceLabel: string;
      sourceCode: string;
      sourceLabel: string;
      summary: string;
      curationEntryPresent: boolean;
    };
    profile: {
      profileId: string | null;
      confidence: string | null;
      fallbackReason: string | null;
    };
    curation: {
      entryPresent: boolean;
    };
  }): {
    confidenceCode: string | null;
    confidenceLabel: string;
    sourceCode: string;
    sourceLabel: string;
    summary: string;
    curationEntryPresent: boolean;
  } {
    if (node.profileAttribution && typeof node.profileAttribution === 'object') {
      return node.profileAttribution;
    }

    const confidenceCode = node.profile.confidence ?? null;
    const confidenceLabel = this.describeProfileConfidenceLabel(confidenceCode);
    const sourceCode =
      node.profile.profileId || node.profile.fallbackReason
        ? node.curation.entryPresent
          ? 'compiled+curation-override'
          : 'compiled-only'
        : 'unresolved';
    const sourceLabel =
      sourceCode === 'compiled+curation-override'
        ? 'Compiled profile + device override'
        : sourceCode === 'compiled-only'
          ? 'Compiled profile only'
          : 'Profile resolution pending';
    const summary =
      sourceCode === 'compiled+curation-override'
        ? `${confidenceLabel}; device override present`
        : sourceCode === 'compiled-only'
          ? `${confidenceLabel}; no device override`
          : 'Profile resolution is pending; runtime defaults are active';

    return {
      confidenceCode,
      confidenceLabel,
      sourceCode,
      sourceLabel,
      summary,
      curationEntryPresent: node.curation.entryPresent,
    };
  }

  async onRepair(session: RepairSessionLike, device: Homey.Device) {
    const app = this.homey.app as AppRuntimeAccess;
    const loadSnapshot = async (): Promise<unknown> => {
      if (!app.getNodeRuntimeDiagnostics) {
        throw new Error('Bridge Tools unavailable: app runtime diagnostics API is not ready.');
      }
      const diagnostics = await app.getNodeRuntimeDiagnostics();
      const nodeSummary = {
        total: diagnostics.nodes.length,
        profileResolvedCount: 0,
        profilePendingCount: 0,
        readyCount: 0,
        failedCount: 0,
        curationEntryCount: 0,
        curationAppliedActions: 0,
        curationSkippedActions: 0,
        curationErrorCount: 0,
        recommendationAvailableCount: 0,
        recommendationBackfillCount: 0,
        capabilityCount: 0,
        inboundSkipped: 0,
        outboundSkipped: 0,
        skipReasons: {} as Record<string, number>,
      };
      const nodes = diagnostics.nodes.map((node) => {
        const nodeState =
          node.node && typeof node.node === 'object'
            ? node.node
            : {
                manufacturerId: null,
                productType: null,
                productId: null,
                manufacturer: null,
                product: null,
                location: null,
                interviewStage: null,
                status: null,
                firmwareVersion: null,
                ready: null,
                isFailed: null,
              };
        const sync =
          node.sync && typeof node.sync === 'object'
            ? node.sync
            : {
                syncedAt: null,
                syncReason: null,
              };
        const curation = {
          loaded: node.curation.loaded === true,
          source: node.curation.source ?? null,
          error: node.curation.error ?? null,
          entryPresent: node.curation.entryPresent === true,
          appliedActions: Number.isInteger(node.curation.appliedActions)
            ? node.curation.appliedActions
            : 0,
          skippedActions: Number.isInteger(node.curation.skippedActions)
            ? node.curation.skippedActions
            : 0,
          errorCount: Number.isInteger(node.curation.errorCount) ? node.curation.errorCount : 0,
        };
        const profile = {
          matchBy: node.profile.matchBy ?? null,
          matchKey: node.profile.matchKey ?? null,
          profileId: node.profile.profileId ?? null,
          fallbackReason: node.profile.fallbackReason ?? null,
          homeyClass: node.profile.homeyClass ?? null,
          confidence: node.profile.confidence ?? null,
          uncurated: node.profile.uncurated === true,
        };
        const skipReasons =
          node.mapping.skipReasons && typeof node.mapping.skipReasons === 'object'
            ? node.mapping.skipReasons
            : {};
        const mapping = {
          verticalSliceApplied: node.mapping.verticalSliceApplied === true,
          capabilityCount: Number.isInteger(node.mapping.capabilityCount)
            ? node.mapping.capabilityCount
            : 0,
          inboundConfigured: Number.isInteger(node.mapping.inboundConfigured)
            ? node.mapping.inboundConfigured
            : 0,
          inboundEnabled: Number.isInteger(node.mapping.inboundEnabled)
            ? node.mapping.inboundEnabled
            : 0,
          outboundConfigured: Number.isInteger(node.mapping.outboundConfigured)
            ? node.mapping.outboundConfigured
            : 0,
          outboundEnabled: Number.isInteger(node.mapping.outboundEnabled)
            ? node.mapping.outboundEnabled
            : 0,
          skipReasons,
        };

        if (profile.profileId || profile.fallbackReason) nodeSummary.profileResolvedCount += 1;
        else nodeSummary.profilePendingCount += 1;
        if (nodeState.ready === true) nodeSummary.readyCount += 1;
        if (nodeState.isFailed === true) nodeSummary.failedCount += 1;
        if (curation.entryPresent) nodeSummary.curationEntryCount += 1;
        nodeSummary.curationAppliedActions += curation.appliedActions;
        nodeSummary.curationSkippedActions += curation.skippedActions;
        nodeSummary.curationErrorCount += curation.errorCount;
        if (node.recommendation.available) nodeSummary.recommendationAvailableCount += 1;
        if (node.recommendation.backfillNeeded) nodeSummary.recommendationBackfillCount += 1;
        nodeSummary.capabilityCount += mapping.capabilityCount;
        const inboundSkipped = Math.max(mapping.inboundConfigured - mapping.inboundEnabled, 0);
        const outboundSkipped = Math.max(mapping.outboundConfigured - mapping.outboundEnabled, 0);
        nodeSummary.inboundSkipped += inboundSkipped;
        nodeSummary.outboundSkipped += outboundSkipped;
        for (const [reason, count] of Object.entries(mapping.skipReasons)) {
          if (typeof count !== 'number' || count <= 0) continue;
          nodeSummary.skipReasons[reason] = (nodeSummary.skipReasons[reason] ?? 0) + count;
        }
        return {
          homeyDeviceId: node.homeyDeviceId,
          nodeId: node.nodeId,
          node: nodeState,
          sync,
          curation,
          profile,
          profileAttribution: this.normalizeProfileAttribution(node),
          recommendation: {
            available: node.recommendation.available,
            reason: node.recommendation.reason,
            reasonLabel: node.recommendation.reasonLabel ?? null,
            backfillNeeded: node.recommendation.backfillNeeded,
          },
          mapping: {
            verticalSliceApplied: mapping.verticalSliceApplied,
            capabilityCount: mapping.capabilityCount,
            inboundConfigured: mapping.inboundConfigured,
            inboundEnabled: mapping.inboundEnabled,
            inboundSkipped,
            outboundConfigured: mapping.outboundConfigured,
            outboundEnabled: mapping.outboundEnabled,
            outboundSkipped,
            skipReasons: mapping.skipReasons,
          },
        };
      });

      const data = device.getData() as HomeyBridgeDeviceData | undefined;
      const homeyDeviceId =
        typeof data?.id === 'string' && data.id.trim().length > 0 ? data.id.trim() : null;
      const bridgeId =
        typeof data?.bridgeId === 'string' && data.bridgeId.trim().length > 0
          ? data.bridgeId.trim()
          : diagnostics.bridgeId;

      return {
        schemaVersion: 'bridge-device-tools/v1',
        generatedAt: new Date().toISOString(),
        device: {
          homeyDeviceId,
          bridgeId,
        },
        runtime: {
          zwjs: diagnostics.zwjs,
          compiledProfiles: diagnostics.compiledProfiles,
          curation: diagnostics.curation,
        },
        nodeSummary,
        nodes,
      };
    };

    session.setHandler('bridge_tools:get_snapshot', async () => loadSnapshot());
    session.setHandler('bridge_tools:refresh', async () => loadSnapshot());
  }
};

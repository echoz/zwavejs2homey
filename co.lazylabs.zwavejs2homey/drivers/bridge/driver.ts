import Homey from 'homey';
import { createBridgePairCandidate, hasBridgePairDeviceFromData } from '../../pairing';

interface AppRuntimeAccess {
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
      curation: {
        entryPresent: boolean;
      };
      profile: {
        profileId: string | null;
        homeyClass: string | null;
        confidence: string | null;
        fallbackReason: string | null;
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
        reasonLabel?: string | null;
        backfillNeeded: boolean;
      };
      mapping: {
        inboundConfigured: number;
        inboundEnabled: number;
        outboundConfigured: number;
        outboundEnabled: number;
      };
    }>;
  }>;
}

interface RepairSessionLike {
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
        curationEntryCount: 0,
        recommendationAvailableCount: 0,
        recommendationBackfillCount: 0,
        inboundSkipped: 0,
        outboundSkipped: 0,
      };
      const nodes = diagnostics.nodes.map((node) => {
        if (node.curation.entryPresent) nodeSummary.curationEntryCount += 1;
        if (node.recommendation.available) nodeSummary.recommendationAvailableCount += 1;
        if (node.recommendation.backfillNeeded) nodeSummary.recommendationBackfillCount += 1;
        const inboundSkipped = Math.max(
          node.mapping.inboundConfigured - node.mapping.inboundEnabled,
          0,
        );
        const outboundSkipped = Math.max(
          node.mapping.outboundConfigured - node.mapping.outboundEnabled,
          0,
        );
        nodeSummary.inboundSkipped += inboundSkipped;
        nodeSummary.outboundSkipped += outboundSkipped;
        return {
          homeyDeviceId: node.homeyDeviceId,
          nodeId: node.nodeId,
          curation: node.curation,
          profile: node.profile,
          profileAttribution: this.normalizeProfileAttribution(node),
          recommendation: node.recommendation,
          mapping: {
            inboundConfigured: node.mapping.inboundConfigured,
            inboundEnabled: node.mapping.inboundEnabled,
            outboundConfigured: node.mapping.outboundConfigured,
            outboundEnabled: node.mapping.outboundEnabled,
            inboundSkipped,
            outboundSkipped,
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

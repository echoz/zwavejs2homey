import Homey from 'homey';
import { createNextBridgePairCandidate, ZWJS_DEFAULT_BRIDGE_ID } from '../../pairing';

interface BridgeSessionLike {
  bridgeId?: string;
  getZwjsClient?: () =>
    | {
        getStatus?: () => {
          transportConnected?: boolean;
          lifecycle?: string;
          versionReceived?: boolean | null;
          initialized?: boolean | null;
          listening?: boolean | null;
          authenticated?: boolean | null;
          serverVersion?: string | null;
          adapterFamily?: string | null;
          reconnectAttempt?: number | null;
        };
        getNodeList?: () => Promise<{
          nodes?: Array<{
            nodeId?: unknown;
            name?: unknown;
          }>;
        }>;
      }
    | undefined;
}

interface AppRuntimeAccess {
  getBridgeSession?: (bridgeId?: string) => BridgeSessionLike | undefined;
  listBridgeSessions?: () => BridgeSessionLike[];
  getBridgeId?: () => string;
  getZwjsClient?: (bridgeId?: string) =>
    | {
        getStatus?: () => {
          transportConnected?: boolean;
          lifecycle?: string;
          versionReceived?: boolean | null;
          initialized?: boolean | null;
          listening?: boolean | null;
          authenticated?: boolean | null;
          serverVersion?: string | null;
          adapterFamily?: string | null;
          reconnectAttempt?: number | null;
        };
        getNodeList?: () => Promise<{
          nodes?: Array<{
            nodeId?: unknown;
            name?: unknown;
          }>;
        }>;
      }
    | undefined;
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
      homeyDeviceId: string | null;
      bridgeId?: string | null;
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
  private static readonly PAIR_HANDLER_TIMEOUT_MS = 5000;

  private static readonly REPAIR_HANDLER_TIMEOUT_MS = 15000;

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    context: string,
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`${context} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      return (await Promise.race([promise, timeoutPromise])) as T;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private registerTimedSessionHandler(
    session: PairSessionLike | RepairSessionLike,
    event: string,
    timeoutMs: number,
    context: string,
    handler: (payload?: unknown) => Promise<unknown>,
  ): void {
    session.setHandler(event, async (...args: unknown[]) => {
      const payload = args[0];
      const maybeCallback = args[1];
      const run = () => this.withTimeout(handler(payload), timeoutMs, `${context} (${event})`);

      if (typeof maybeCallback === 'function') {
        const callback = maybeCallback as (error: unknown, result?: unknown) => void;
        try {
          const result = await run();
          callback(null, result);
        } catch (error) {
          callback(error);
        }
        return;
      }

      return run();
    });
  }

  private toSerializablePairPayload<T>(value: T, context: string): T {
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch (error) {
      this.error('Failed to serialize pairing payload', { context, error });
      throw error;
    }
  }

  async onPair(session: PairSessionLike) {
    this.log('Bridge pair session started');
    this.registerTimedSessionHandler(
      session,
      'list_devices',
      BridgeDriver.PAIR_HANDLER_TIMEOUT_MS,
      'bridge pair list',
      async () => {
        this.log('Bridge pair list requested (session handler)');
        return this.onPairListDevices();
      },
    );
    this.log('Bridge pair handler registered', { event: 'list_devices' });
  }

  async onInit() {
    this.log('BridgeDriver initialized');
    const driverPrototypeMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(this) as object,
    ).sort();
    const manifestPairViews =
      this.homey.manifest?.drivers?.find(
        (driver: { id?: unknown } | undefined) => driver && driver.id === 'bridge',
      )?.pair ?? [];
    this.log('BridgeDriver runtime pairing shape', {
      hasOnPairListDevices:
        typeof (this as unknown as { onPairListDevices?: unknown }).onPairListDevices ===
        'function',
      prototypeMethods: driverPrototypeMethods,
      pairViews: Array.isArray(manifestPairViews)
        ? manifestPairViews.map((view) => ({
            id: view?.id,
            template: view?.template,
            next: view?.navigation?.next,
            singular: view?.options?.singular === true,
          }))
        : [],
    });
  }

  async onPairListDevices() {
    this.log('Bridge pair list requested');
    try {
      const existingData = this.getDevices().map(
        (device) =>
          device.getData() as
            | {
                id?: string;
                kind?: string;
                bridgeId?: string;
              }
            | undefined,
      );
      const candidate = createNextBridgePairCandidate(existingData, 'bridge');
      // Keep bridge template payload minimal to avoid list view runtime quirks.
      const candidates = [
        {
          name: candidate.name,
          data: candidate.data,
        },
      ];
      const payload = this.toSerializablePairPayload(candidates, 'bridge:onPairListDevices');
      this.log('Bridge pair list response ready (onPairListDevices hook)', {
        candidates: payload.length,
      });
      return payload;
    } catch (error) {
      this.error('Bridge pair list generation failed; returning fallback candidate', { error });
      const candidate = createNextBridgePairCandidate([], 'bridge');
      return [
        {
          name: candidate.name,
          data: candidate.data,
        },
      ];
    }
  }

  private resolveBridgeRuntime(app: AppRuntimeAccess): {
    bridgeId: string;
    client:
      | {
          getStatus?: () => {
            transportConnected?: boolean;
            lifecycle?: string;
            versionReceived?: boolean | null;
            initialized?: boolean | null;
            listening?: boolean | null;
            authenticated?: boolean | null;
            serverVersion?: string | null;
            adapterFamily?: string | null;
            reconnectAttempt?: number | null;
            connectedAt?: string | null;
            lastMessageAt?: string | null;
          };
          getNodeList?: () => Promise<{
            nodes?: Array<{
              nodeId?: unknown;
              name?: unknown;
            }>;
          }>;
        }
      | undefined;
  } {
    const preferredSession = app.getBridgeSession?.();
    const sessions = app.listBridgeSessions?.() ?? [];
    const connectedSession = sessions.find(
      (session) => session.getZwjsClient?.()?.getStatus?.().transportConnected === true,
    );
    const sessionWithClient = sessions.find((session) => Boolean(session.getZwjsClient?.()));
    const session =
      connectedSession ??
      sessionWithClient ??
      preferredSession ??
      app.getBridgeSession?.(ZWJS_DEFAULT_BRIDGE_ID);
    const bridgeId =
      (typeof session?.bridgeId === 'string' && session.bridgeId.trim().length > 0
        ? session.bridgeId.trim()
        : undefined) ??
      app.getBridgeId?.() ??
      ZWJS_DEFAULT_BRIDGE_ID;
    const client = session?.getZwjsClient?.() ?? app.getZwjsClient?.(bridgeId);
    return { bridgeId, client };
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
      versionReceived: boolean | null;
      initialized: boolean | null;
      listening: boolean | null;
      authenticated: boolean | null;
      reconnectAttempt: number | null;
      connectedAt: string | null;
      lastMessageAt: string | null;
    };
    discoveredNodes: number | null;
    importedNodes: number | null;
    pendingImportNodes: number | null;
    importedNodeDetails: Array<{
      homeyDeviceId: string | null;
      bridgeId: string;
      nodeId: number | null;
      name: string | null;
      manufacturer: string | null;
      product: string | null;
      location: string | null;
      status: string | null;
      profileHomeyClass: string | null;
      profileId: string | null;
      profileMatch: string | null;
      recommendationAction: string;
      recommendationReason: string | null;
      profileSource: string | null;
      ruleMatch: string | null;
    }>;
    actionNeededNodes: number;
    backfillNeededNodes: number;
    compiledOnlyNodes: number;
    overrideNodes: number;
    unresolvedNodes: number;
    warnings: string[];
  }> {
    const app = this.homey.app as AppRuntimeAccess;
    const runtime = this.resolveBridgeRuntime(app);
    const client = runtime.client;
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
      versionReceived: typeof status?.versionReceived === 'boolean' ? status.versionReceived : null,
      initialized: typeof status?.initialized === 'boolean' ? status.initialized : null,
      listening: typeof status?.listening === 'boolean' ? status.listening : null,
      authenticated: typeof status?.authenticated === 'boolean' ? status.authenticated : null,
      reconnectAttempt:
        typeof status?.reconnectAttempt === 'number' && Number.isFinite(status.reconnectAttempt)
          ? Math.max(0, Math.trunc(status.reconnectAttempt))
          : null,
      connectedAt:
        typeof status?.connectedAt === 'string' && status.connectedAt.trim().length > 0
          ? status.connectedAt.trim()
          : null,
      lastMessageAt:
        typeof status?.lastMessageAt === 'string' && status.lastMessageAt.trim().length > 0
          ? status.lastMessageAt.trim()
          : null,
    };

    let discoveredNodes: number | null = null;
    const discoveredNodeNames = new Map<number, string>();
    let importedNodes: number | null = null;
    let importedNodeDetails: Array<{
      homeyDeviceId: string | null;
      bridgeId: string;
      nodeId: number | null;
      name: string | null;
      manufacturer: string | null;
      product: string | null;
      location: string | null;
      status: string | null;
      profileHomeyClass: string | null;
      profileId: string | null;
      profileMatch: string | null;
      recommendationAction: string;
      recommendationReason: string | null;
      profileSource: string | null;
      ruleMatch: string | null;
    }> = [];
    let actionNeededNodes = 0;
    let backfillNeededNodes = 0;
    let compiledOnlyNodes = 0;
    let overrideNodes = 0;
    let unresolvedNodes = 0;
    let bridgeId: string = runtime.bridgeId;
    const warnings: string[] = [];

    if (client?.getNodeList) {
      try {
        const nodeList = await client.getNodeList();
        const nodes = Array.isArray(nodeList?.nodes) ? nodeList.nodes : [];
        discoveredNodes = nodes.filter((node) => {
          const nodeId = node?.nodeId;
          if (
            typeof node?.name === 'string' &&
            typeof nodeId === 'number' &&
            Number.isInteger(nodeId)
          ) {
            const trimmedName = node.name.trim();
            if (trimmedName.length > 0) {
              discoveredNodeNames.set(nodeId, trimmedName);
            }
          }
          return typeof nodeId === 'number' && Number.isInteger(nodeId) && nodeId > 1;
        }).length;
      } catch (error) {
        this.error('Failed to load node list for bridge next steps status', { error });
        warnings.push('Unable to load node discovery status from ZWJS.');
      }
    } else {
      warnings.push('No bridge connection is configured. Configure this bridge device settings.');
    }

    if (app.getNodeRuntimeDiagnostics) {
      try {
        const diagnostics = await app.getNodeRuntimeDiagnostics({ bridgeId });
        if (
          diagnostics &&
          typeof diagnostics.bridgeId === 'string' &&
          diagnostics.bridgeId.trim().length > 0
        ) {
          bridgeId = diagnostics.bridgeId.trim();
        }
        if (Array.isArray(diagnostics.nodes)) {
          importedNodeDetails = diagnostics.nodes
            .filter((node) => {
              const nodeBridgeId = this.normalizeStringOrNull(node.bridgeId);
              if (!nodeBridgeId) return true;
              return nodeBridgeId === bridgeId;
            })
            .map((node) => {
              const nodeId =
                typeof node.nodeId === 'number' && Number.isInteger(node.nodeId)
                  ? node.nodeId
                  : null;
              return {
                homeyDeviceId: this.normalizeStringOrNull(node.homeyDeviceId),
                bridgeId: this.normalizeStringOrNull(node.bridgeId) ?? bridgeId,
                nodeId,
                name: nodeId !== null ? (discoveredNodeNames.get(nodeId) ?? null) : null,
                manufacturer: this.normalizeStringOrNull(node.node?.manufacturer),
                product: this.normalizeStringOrNull(node.node?.product),
                location: this.normalizeStringOrNull(node.node?.location),
                status: this.normalizeStringOrNull(node.node?.status),
                profileHomeyClass: this.normalizeStringOrNull(node.profile?.homeyClass),
                profileId: this.normalizeStringOrNull(node.profile?.profileId),
                profileMatch: this.toProfileMatchSummary(node.profile),
                ruleMatch:
                  node.profileAttribution && typeof node.profileAttribution === 'object'
                    ? this.normalizeStringOrNull(node.profileAttribution.confidenceLabel)
                    : null,
                profileSource:
                  node.profileAttribution && typeof node.profileAttribution === 'object'
                    ? this.normalizeStringOrNull(node.profileAttribution.sourceLabel)
                    : null,
                recommendationAction: this.toRecommendationAction(node.recommendation),
                recommendationReason: this.normalizeStringOrNull(node.recommendation?.reasonLabel),
              };
            })
            .sort((left, right) => {
              if (left.nodeId !== null && right.nodeId !== null && left.nodeId !== right.nodeId) {
                return left.nodeId - right.nodeId;
              }
              if (left.nodeId !== null && right.nodeId === null) return -1;
              if (left.nodeId === null && right.nodeId !== null) return 1;
              const leftId = left.homeyDeviceId ?? '';
              const rightId = right.homeyDeviceId ?? '';
              return leftId.localeCompare(rightId);
            });
          for (const node of diagnostics.nodes) {
            const recommendation =
              node.recommendation && typeof node.recommendation === 'object'
                ? node.recommendation
                : null;
            if (recommendation?.backfillNeeded === true) {
              actionNeededNodes += 1;
              backfillNeededNodes += 1;
            } else if (recommendation?.available === true) {
              actionNeededNodes += 1;
            }

            const attribution =
              node.profileAttribution && typeof node.profileAttribution === 'object'
                ? node.profileAttribution
                : null;
            let sourceCode =
              attribution && typeof attribution.sourceCode === 'string'
                ? attribution.sourceCode
                : null;
            if (!sourceCode) {
              const hasProfile =
                node.profile &&
                typeof node.profile === 'object' &&
                (this.normalizeStringOrNull(node.profile.profileId) ||
                  this.normalizeStringOrNull(node.profile.fallbackReason));
              const hasOverride =
                node.curation &&
                typeof node.curation === 'object' &&
                node.curation.entryPresent === true;
              if (hasProfile) {
                sourceCode = hasOverride ? 'compiled+curation-override' : 'compiled-only';
              } else {
                sourceCode = 'unresolved';
              }
            }
            if (sourceCode === 'compiled+curation-override') overrideNodes += 1;
            else if (sourceCode === 'compiled-only') compiledOnlyNodes += 1;
            else unresolvedNodes += 1;
          }
          importedNodes = importedNodeDetails.length;
        } else {
          importedNodes = 0;
        }
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
    if (actionNeededNodes > 0) {
      warnings.push(`${actionNeededNodes} imported node(s) currently require runtime action.`);
    }
    if (unresolvedNodes > 0) {
      warnings.push(`${unresolvedNodes} imported node(s) have unresolved profile attribution.`);
    }
    if (typeof zwjs.reconnectAttempt === 'number' && zwjs.reconnectAttempt > 0) {
      warnings.push(`ZWJS reconnect attempts observed (${zwjs.reconnectAttempt}).`);
    }

    return {
      generatedAt: new Date().toISOString(),
      bridgeId,
      zwjs,
      discoveredNodes,
      importedNodes,
      pendingImportNodes,
      importedNodeDetails,
      actionNeededNodes,
      backfillNeededNodes,
      compiledOnlyNodes,
      overrideNodes,
      unresolvedNodes,
      warnings,
    };
  }

  private normalizeStringOrNull(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toProfileMatchSummary(profile: {
    matchBy: string | null;
    matchKey: string | null;
  }): string | null {
    const matchBy = this.normalizeStringOrNull(profile.matchBy);
    const matchKey = this.normalizeStringOrNull(profile.matchKey);
    if (!matchBy && !matchKey) return null;
    return `${matchBy ?? 'n/a'} / ${matchKey ?? 'n/a'}`;
  }

  private toRecommendationAction(recommendation: {
    available: boolean;
    backfillNeeded: boolean;
  }): string {
    if (recommendation.backfillNeeded) return 'backfill-marker';
    if (recommendation.available) return 'adopt-recommended-baseline';
    return 'none';
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
    const data = device.getData() as HomeyBridgeDeviceData | undefined;
    const homeyDeviceId =
      typeof data?.id === 'string' && data.id.trim().length > 0 ? data.id.trim() : null;
    const bridgeIdFilter =
      typeof data?.bridgeId === 'string' && data.bridgeId.trim().length > 0
        ? data.bridgeId.trim()
        : undefined;

    const loadSnapshot = async (): Promise<unknown> => {
      if (!app.getNodeRuntimeDiagnostics) {
        throw new Error('Bridge Tools unavailable: app runtime diagnostics API is not ready.');
      }
      const diagnostics = await app.getNodeRuntimeDiagnostics({
        bridgeId: bridgeIdFilter,
      });
      const nodeSummary = {
        total: diagnostics.nodes.length,
        profileResolvedCount: 0,
        profilePendingCount: 0,
        profileSourceCompiledOnlyCount: 0,
        profileSourceOverrideCount: 0,
        profileSourceUnresolvedCount: 0,
        confidenceCuratedCount: 0,
        confidenceHaDerivedCount: 0,
        confidenceGenericCount: 0,
        confidenceUnknownCount: 0,
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
        const profileAttribution = this.normalizeProfileAttribution(node);
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
        if (profileAttribution.sourceCode === 'compiled+curation-override') {
          nodeSummary.profileSourceOverrideCount += 1;
        } else if (profileAttribution.sourceCode === 'compiled-only') {
          nodeSummary.profileSourceCompiledOnlyCount += 1;
        } else {
          nodeSummary.profileSourceUnresolvedCount += 1;
        }
        if (profileAttribution.confidenceCode === 'curated') {
          nodeSummary.confidenceCuratedCount += 1;
        } else if (profileAttribution.confidenceCode === 'ha-derived') {
          nodeSummary.confidenceHaDerivedCount += 1;
        } else if (profileAttribution.confidenceCode === 'generic') {
          nodeSummary.confidenceGenericCount += 1;
        } else {
          nodeSummary.confidenceUnknownCount += 1;
        }
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
          profileAttribution,
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

      const bridgeId = bridgeIdFilter ?? diagnostics.bridgeId;

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

    this.registerTimedSessionHandler(
      session,
      'bridge_tools:get_snapshot',
      BridgeDriver.REPAIR_HANDLER_TIMEOUT_MS,
      'bridge repair handler',
      async () => loadSnapshot(),
    );
    this.registerTimedSessionHandler(
      session,
      'bridge_tools:refresh',
      BridgeDriver.REPAIR_HANDLER_TIMEOUT_MS,
      'bridge repair handler',
      async () => loadSnapshot(),
    );
  }
};

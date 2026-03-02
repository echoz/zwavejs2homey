'use strict';

import Homey from 'homey';
import {
  createZwjsClient,
  type ClientLogger,
  type ZwjsClient,
  type ZwjsClientEvent,
  resolveZwjsConnectionConfig,
  ZWJS_COMMAND_NODE_SET_VALUE,
  ZWJS_CONNECTION_SETTINGS_KEY,
} from '@zwavejs2homey/core';
import type {
  CompiledProfileResolverMatchV1,
  CompiledProfileResolverSelector,
  ResolveCompiledProfileEntryOptionsV1,
} from '@zwavejs2homey/compiler';
import type { CompiledProfilesRuntime, CompiledProfilesRuntimeStatus } from './compiled-profiles';
import {
  COMPILED_PROFILES_PATH_SETTINGS_KEY,
  resolveCompiledProfileEntryFromRuntime,
  resolveCompiledProfilesArtifactPath,
  tryLoadCompiledProfilesRuntimeFromFile,
} from './compiled-profiles';
import type { HomeyCurationEntryV1, HomeyCurationRuntimeStatusV1 } from './curation';
import {
  BASELINE_MARKER_PROJECTION_VERSION,
  CURATION_SETTINGS_KEY,
  loadCurationRuntimeFromSettings,
  removeCurationEntryV1,
  resolveCurationEntryFromRuntime,
  upsertCurationBaselineMarkerV1,
} from './curation';
import { ZWJS_DEFAULT_BRIDGE_ID } from './pairing';

interface NodeRuntimeDiagnosticsEntry {
  homeyDeviceId: string | null;
  bridgeId: string | null;
  nodeId: number | null;
  sync: {
    syncedAt: string | null;
    syncReason: string | null;
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
  curation: {
    loaded: boolean;
    source: string | null;
    error: string | null;
    entryPresent: boolean;
    appliedActions: number;
    skippedActions: number;
    errorCount: number;
  };
  recommendation: {
    available: boolean;
    reason: string | null;
    backfillNeeded: boolean;
    projectionVersion: string | null;
    currentBaselineHash: string | null;
    storedBaselineHash: string | null;
    currentPipelineFingerprint: string | null;
    storedPipelineFingerprint: string | null;
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
}

type RecommendationActionKindV1 = 'backfill-marker' | 'adopt-recommended-baseline' | 'none';

interface RecommendationActionQueueItemV1 {
  homeyDeviceId: string | null;
  nodeId: number | null;
  profileId: string | null;
  action: RecommendationActionKindV1;
  reason: string;
  recommendationAvailable: boolean;
  recommendationBackfillNeeded: boolean;
  recommendationProjectionVersion: string | null;
  currentBaselineHash: string | null;
  storedBaselineHash: string | null;
  currentPipelineFingerprint: string | null;
}

module.exports = class Zwavejs2HomeyApp extends Homey.App {
  private zwjsClient?: ZwjsClient;
  private readonly bridgeId = ZWJS_DEFAULT_BRIDGE_ID;
  private compiledProfilesRuntime?: CompiledProfilesRuntime;
  private curationRuntime = loadCurationRuntimeFromSettings(undefined);

  private readonly clientLogger: ClientLogger = {
    info: (msg: string, meta?: unknown) => this.log(msg, meta),
    warn: (msg: string, meta?: unknown) => this.error(msg, meta),
    error: (msg: string, meta?: unknown) => this.error(msg, meta),
  };

  private settingsSetListener?: (key: string) => void;

  private settingsUnsetListener?: (key: string) => void;

  private lifecycleQueue: Promise<void> = Promise.resolve();

  private shuttingDown = false;

  private static readonly NODE_EVENT_REFRESH_TYPES = new Set<string>([
    'zwjs.event.node.interview-completed',
    'zwjs.event.node.value-added',
    'zwjs.event.node.metadata-updated',
  ]);

  private static toStringOrNull(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private static toNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return null;
  }

  private static toBooleanOrDefault(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private static toRecommendationActionPriority(action: RecommendationActionKindV1): number {
    if (action === 'backfill-marker') return 0;
    if (action === 'adopt-recommended-baseline') return 1;
    return 2;
  }

  private static summarizeMappingDiagnostics(profileResolution: Record<string, unknown>): {
    capabilityCount: number;
    inboundConfigured: number;
    inboundEnabled: number;
    outboundConfigured: number;
    outboundEnabled: number;
    skipReasons: Record<string, number>;
  } {
    const diagnostics = Array.isArray(profileResolution.mappingDiagnostics)
      ? profileResolution.mappingDiagnostics
      : [];
    let inboundConfigured = 0;
    let inboundEnabled = 0;
    let outboundConfigured = 0;
    let outboundEnabled = 0;
    const skipReasons: Record<string, number> = {};

    for (const item of diagnostics) {
      if (!item || typeof item !== 'object') continue;
      const diagnostic = item as {
        inbound?: { configured?: boolean; enabled?: boolean; reason?: unknown };
        outbound?: { configured?: boolean; enabled?: boolean; reason?: unknown };
      };

      if (diagnostic.inbound?.configured === true) inboundConfigured += 1;
      if (diagnostic.inbound?.enabled === true) inboundEnabled += 1;
      if (diagnostic.outbound?.configured === true) outboundConfigured += 1;
      if (diagnostic.outbound?.enabled === true) outboundEnabled += 1;

      const inboundReason = Zwavejs2HomeyApp.toStringOrNull(diagnostic.inbound?.reason);
      if (inboundReason) {
        skipReasons[inboundReason] = (skipReasons[inboundReason] ?? 0) + 1;
      }
      const outboundReason = Zwavejs2HomeyApp.toStringOrNull(diagnostic.outbound?.reason);
      if (outboundReason) {
        skipReasons[outboundReason] = (skipReasons[outboundReason] ?? 0) + 1;
      }
    }

    return {
      capabilityCount: diagnostics.length,
      inboundConfigured,
      inboundEnabled,
      outboundConfigured,
      outboundEnabled,
      skipReasons,
    };
  }

  private normalizeNodeDiagnosticsEntry(
    profileResolution: Record<string, unknown>,
    deviceData: { id?: unknown; bridgeId?: unknown; nodeId?: unknown } | undefined,
  ): NodeRuntimeDiagnosticsEntry {
    const mappingSummary = Zwavejs2HomeyApp.summarizeMappingDiagnostics(profileResolution);
    let classification: Record<string, unknown> | undefined;
    if (profileResolution.classification && typeof profileResolution.classification === 'object') {
      classification = profileResolution.classification as Record<string, unknown>;
    }
    let curationReport: Record<string, unknown> | undefined;
    if (profileResolution.curationReport && typeof profileResolution.curationReport === 'object') {
      curationReport = profileResolution.curationReport as Record<string, unknown>;
    }
    let curationSummary: Record<string, unknown> | undefined;
    if (curationReport?.summary && typeof curationReport.summary === 'object') {
      curationSummary = curationReport.summary as Record<string, unknown>;
    }

    let homeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(profileResolution.homeyDeviceId);
    if (homeyDeviceId === null) {
      homeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(deviceData?.id);
    }
    const bridgeId = Zwavejs2HomeyApp.toStringOrNull(deviceData?.bridgeId);
    let nodeId = Zwavejs2HomeyApp.toNumberOrNull(deviceData?.nodeId);
    if (nodeId === null) {
      let selectorNodeId: unknown;
      if (profileResolution.selector && typeof profileResolution.selector === 'object') {
        selectorNodeId = (profileResolution.selector as Record<string, unknown>).nodeId;
      }
      nodeId = Zwavejs2HomeyApp.toNumberOrNull(selectorNodeId);
    }
    return {
      homeyDeviceId,
      bridgeId,
      nodeId,
      sync: {
        syncedAt: Zwavejs2HomeyApp.toStringOrNull(profileResolution.syncedAt),
        syncReason: Zwavejs2HomeyApp.toStringOrNull(profileResolution.syncReason),
      },
      profile: {
        matchBy: Zwavejs2HomeyApp.toStringOrNull(profileResolution.matchBy),
        matchKey: Zwavejs2HomeyApp.toStringOrNull(profileResolution.matchKey),
        profileId: Zwavejs2HomeyApp.toStringOrNull(profileResolution.profileId),
        fallbackReason: Zwavejs2HomeyApp.toStringOrNull(profileResolution.fallbackReason),
        homeyClass: Zwavejs2HomeyApp.toStringOrNull(classification?.homeyClass),
        confidence: Zwavejs2HomeyApp.toStringOrNull(classification?.confidence),
        uncurated: Zwavejs2HomeyApp.toBooleanOrDefault(classification?.uncurated, true),
      },
      curation: {
        loaded: Zwavejs2HomeyApp.toBooleanOrDefault(profileResolution.curationLoaded),
        source: Zwavejs2HomeyApp.toStringOrNull(profileResolution.curationSource),
        error: Zwavejs2HomeyApp.toStringOrNull(profileResolution.curationError),
        entryPresent: Zwavejs2HomeyApp.toBooleanOrDefault(profileResolution.curationEntryPresent),
        appliedActions: Zwavejs2HomeyApp.toNumberOrNull(curationSummary?.applied) ?? 0,
        skippedActions: Zwavejs2HomeyApp.toNumberOrNull(curationSummary?.skipped) ?? 0,
        errorCount: Zwavejs2HomeyApp.toNumberOrNull(curationSummary?.errors) ?? 0,
      },
      recommendation: {
        available: Zwavejs2HomeyApp.toBooleanOrDefault(profileResolution.recommendationAvailable),
        reason: Zwavejs2HomeyApp.toStringOrNull(profileResolution.recommendationReason),
        backfillNeeded: Zwavejs2HomeyApp.toBooleanOrDefault(
          profileResolution.recommendationBackfillNeeded,
        ),
        projectionVersion: Zwavejs2HomeyApp.toStringOrNull(
          profileResolution.recommendationProjectionVersion,
        ),
        currentBaselineHash: Zwavejs2HomeyApp.toStringOrNull(profileResolution.currentBaselineHash),
        storedBaselineHash: Zwavejs2HomeyApp.toStringOrNull(profileResolution.storedBaselineHash),
        currentPipelineFingerprint: Zwavejs2HomeyApp.toStringOrNull(
          profileResolution.currentBaselinePipelineFingerprint,
        ),
        storedPipelineFingerprint: Zwavejs2HomeyApp.toStringOrNull(
          profileResolution.storedBaselinePipelineFingerprint,
        ),
      },
      mapping: {
        verticalSliceApplied: Zwavejs2HomeyApp.toBooleanOrDefault(
          profileResolution.verticalSliceApplied,
        ),
        capabilityCount: mappingSummary.capabilityCount,
        inboundConfigured: mappingSummary.inboundConfigured,
        inboundEnabled: mappingSummary.inboundEnabled,
        inboundSkipped: mappingSummary.inboundConfigured - mappingSummary.inboundEnabled,
        outboundConfigured: mappingSummary.outboundConfigured,
        outboundEnabled: mappingSummary.outboundEnabled,
        outboundSkipped: mappingSummary.outboundConfigured - mappingSummary.outboundEnabled,
        skipReasons: mappingSummary.skipReasons,
      },
    };
  }

  private toRecommendationActionQueueItem(
    node: NodeRuntimeDiagnosticsEntry,
  ): RecommendationActionQueueItemV1 {
    let action: RecommendationActionKindV1 = 'none';
    if (!node.homeyDeviceId) {
      action = 'none';
    } else if (node.recommendation.backfillNeeded) {
      action = 'backfill-marker';
    } else if (node.recommendation.available) {
      action = 'adopt-recommended-baseline';
    }

    let reason = node.recommendation.reason ?? 'none';
    if (action === 'none' && !node.homeyDeviceId) {
      reason = 'missing-homey-device-id';
    }

    return {
      homeyDeviceId: node.homeyDeviceId,
      nodeId: node.nodeId,
      profileId: node.profile.profileId,
      action,
      reason,
      recommendationAvailable: node.recommendation.available,
      recommendationBackfillNeeded: node.recommendation.backfillNeeded,
      recommendationProjectionVersion: node.recommendation.projectionVersion,
      currentBaselineHash: node.recommendation.currentBaselineHash,
      storedBaselineHash: node.recommendation.storedBaselineHash,
      currentPipelineFingerprint: node.recommendation.currentPipelineFingerprint,
    };
  }

  private enqueueLifecycle(work: () => Promise<void>): Promise<void> {
    this.lifecycleQueue = this.lifecycleQueue.then(work).catch((error: unknown) => {
      this.error('ZWJS lifecycle operation failed', error);
    });
    return this.lifecycleQueue;
  }

  private async stopZwjsClient(reason: string): Promise<void> {
    if (!this.zwjsClient) return;
    this.log(`Stopping ZWJS client (${reason})`);
    await this.zwjsClient.stop();
    this.zwjsClient = undefined;
  }

  private async startZwjsClient(reason: string): Promise<void> {
    const resolved = resolveZwjsConnectionConfig(
      this.homey.settings.get(ZWJS_CONNECTION_SETTINGS_KEY),
    );
    for (const warning of resolved.warnings) {
      this.error('ZWJS config warning', warning);
    }

    this.log(
      `Starting ZWJS client (${reason}) from ${resolved.source}: ${resolved.clientConfig.url}`,
    );
    const nextClient = createZwjsClient({
      url: resolved.clientConfig.url,
      auth: resolved.clientConfig.auth,
      logger: this.clientLogger,
      mutationPolicy: {
        enabled: true,
        requireAllowList: true,
        allowCommands: [ZWJS_COMMAND_NODE_SET_VALUE],
      },
    });
    nextClient.onEvent((event: ZwjsClientEvent) => {
      this.log('zwjs event', event.type);
      const refreshNodeId = this.getRuntimeRefreshNodeIdFromEvent(event);
      if (refreshNodeId === undefined || this.shuttingDown) {
        return;
      }
      this.enqueueLifecycle(async () => {
        await this.refreshNodeRuntimeMappingsForNode(
          refreshNodeId,
          `event:${event.type}:node-${refreshNodeId}`,
        );
        await this.refreshBridgeRuntimeDiagnostics(`event:${event.type}:node-${refreshNodeId}`);
      }).catch((error: unknown) => {
        this.error('Failed to refresh node runtime mappings from event', {
          eventType: event.type,
          nodeId: refreshNodeId,
          error,
        });
      });
    });
    await nextClient.start();
    this.zwjsClient = nextClient;
    this.log('zwjs status', this.zwjsClient.getStatus());
  }

  private async loadCompiledProfilesRuntime(reason: string): Promise<void> {
    const sourcePath = resolveCompiledProfilesArtifactPath(
      __dirname,
      this.homey.settings.get(COMPILED_PROFILES_PATH_SETTINGS_KEY),
    );
    const runtime = await tryLoadCompiledProfilesRuntimeFromFile(sourcePath);
    this.compiledProfilesRuntime = runtime;
    if (runtime.status.loaded) {
      this.log('Compiled profiles loaded', {
        reason,
        sourcePath,
        entryCount: runtime.status.entryCount,
        pipelineFingerprint: runtime.status.pipelineFingerprint,
        duplicateKeys: runtime.status.duplicateKeys,
      });
      return;
    }

    this.error('Compiled profiles unavailable; node profile fallback mode is active', {
      reason,
      sourcePath,
      errorMessage: runtime.status.errorMessage,
    });
  }

  private async reloadZwjsClient(reason: string): Promise<void> {
    await this.stopZwjsClient(`${reason}:reload`);
    await this.startZwjsClient(reason);
  }

  private loadCurationRuntime(reason: string): void {
    const runtime = loadCurationRuntimeFromSettings(this.homey.settings.get(CURATION_SETTINGS_KEY));
    this.curationRuntime = runtime;
    if (runtime.status.loaded) {
      this.log('Curation settings loaded', {
        reason,
        source: runtime.status.source,
        entryCount: runtime.status.entryCount,
      });
      return;
    }
    this.error('Curation settings invalid; curation is disabled until fixed', {
      reason,
      source: runtime.status.source,
      errorMessage: runtime.status.errorMessage,
      settingsKey: CURATION_SETTINGS_KEY,
    });
  }

  private async refreshNodeRuntimeMappings(reason: string): Promise<void> {
    try {
      const nodeDriver = this.homey.drivers.getDriver('node');
      const devices = nodeDriver.getDevices() as Array<{
        onRuntimeMappingsRefresh?: (refreshReason: string) => Promise<void>;
      }>;
      this.log('Refreshing node runtime mappings', {
        reason,
        devices: devices.length,
      });
      for (const device of devices) {
        if (typeof device.onRuntimeMappingsRefresh === 'function') {
          await device.onRuntimeMappingsRefresh(reason);
        }
      }
    } catch (error) {
      this.error('Failed to refresh node runtime mappings', { reason, error });
    }
  }

  private async refreshBridgeRuntimeDiagnostics(reason: string): Promise<void> {
    try {
      const bridgeDriver = this.homey.drivers.getDriver('bridge');
      const devices = bridgeDriver.getDevices() as Array<{
        onRuntimeDiagnosticsRefresh?: (refreshReason: string) => Promise<void>;
      }>;
      this.log('Refreshing bridge runtime diagnostics', {
        reason,
        devices: devices.length,
      });
      for (const device of devices) {
        if (typeof device.onRuntimeDiagnosticsRefresh === 'function') {
          await device.onRuntimeDiagnosticsRefresh(reason);
        }
      }
    } catch (error) {
      this.error('Failed to refresh bridge runtime diagnostics', { reason, error });
    }
  }

  private getRuntimeRefreshNodeIdFromEvent(event: ZwjsClientEvent): number | undefined {
    if (!Zwavejs2HomeyApp.NODE_EVENT_REFRESH_TYPES.has(event.type)) {
      return undefined;
    }
    if (!('event' in event)) {
      return undefined;
    }
    const payload = event.event as { nodeId?: unknown } | undefined;
    if (!payload || typeof payload.nodeId !== 'number' || !Number.isFinite(payload.nodeId)) {
      return undefined;
    }
    return payload.nodeId;
  }

  private async refreshNodeRuntimeMappingsForNode(nodeId: number, reason: string): Promise<void> {
    try {
      const nodeDriver = this.homey.drivers.getDriver('node');
      const devices = nodeDriver.getDevices() as Array<{
        getData?: () => { bridgeId?: string; nodeId?: number } | undefined;
        onRuntimeMappingsRefresh?: (refreshReason: string) => Promise<void>;
      }>;

      let refreshed = 0;
      for (const device of devices) {
        const data = device.getData?.();
        if (!data || typeof data.nodeId !== 'number' || data.nodeId !== nodeId) {
          continue;
        }
        if (data.bridgeId && data.bridgeId !== this.bridgeId) {
          continue;
        }
        if (typeof device.onRuntimeMappingsRefresh === 'function') {
          await device.onRuntimeMappingsRefresh(reason);
          refreshed += 1;
        }
      }
      this.log('Refreshed node runtime mappings for node', {
        reason,
        nodeId,
        refreshed,
      });
    } catch (error) {
      this.error('Failed targeted node runtime mapping refresh', { nodeId, reason, error });
    }
  }

  private onSettingsChanged = (key: string): void => {
    if (this.shuttingDown) return;
    if (
      ![
        ZWJS_CONNECTION_SETTINGS_KEY,
        COMPILED_PROFILES_PATH_SETTINGS_KEY,
        CURATION_SETTINGS_KEY,
      ].includes(key)
    ) {
      return;
    }

    this.enqueueLifecycle(async () => {
      if (key === ZWJS_CONNECTION_SETTINGS_KEY) {
        await this.reloadZwjsClient('settings-updated');
        await this.refreshNodeRuntimeMappings('zwjs-connection-updated');
        await this.refreshBridgeRuntimeDiagnostics('zwjs-connection-updated');
      } else if (key === COMPILED_PROFILES_PATH_SETTINGS_KEY) {
        await this.loadCompiledProfilesRuntime('settings-updated');
        await this.refreshNodeRuntimeMappings('compiled-profiles-updated');
        await this.refreshBridgeRuntimeDiagnostics('compiled-profiles-updated');
      } else if (key === CURATION_SETTINGS_KEY) {
        this.loadCurationRuntime('settings-updated');
        await this.refreshNodeRuntimeMappings('curation-updated');
        await this.refreshBridgeRuntimeDiagnostics('curation-updated');
      }
    }).catch((error: unknown) => {
      this.error('Failed to apply settings update', { key, error });
    });
  };

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.settingsSetListener = (key: string) => this.onSettingsChanged(key);
    this.settingsUnsetListener = (key: string) => this.onSettingsChanged(key);
    this.homey.settings.on('set', this.settingsSetListener);
    this.homey.settings.on('unset', this.settingsUnsetListener);
    await this.enqueueLifecycle(async () => {
      await this.loadCompiledProfilesRuntime('startup');
      this.loadCurationRuntime('startup');
      await this.startZwjsClient('startup');
      await this.refreshNodeRuntimeMappings('startup');
      await this.refreshBridgeRuntimeDiagnostics('startup');
    });

    this.log('zwavejs2homey initialized');
  }

  async onUninit() {
    this.shuttingDown = true;
    if (this.settingsSetListener) {
      this.homey.settings.removeListener('set', this.settingsSetListener);
      this.settingsSetListener = undefined;
    }
    if (this.settingsUnsetListener) {
      this.homey.settings.removeListener('unset', this.settingsUnsetListener);
      this.settingsUnsetListener = undefined;
    }
    await this.enqueueLifecycle(async () => {
      await this.stopZwjsClient('shutdown');
    });
  }

  getZwjsClient(): ZwjsClient | undefined {
    return this.zwjsClient;
  }

  getBridgeId(): string {
    return this.bridgeId;
  }

  getCompiledProfilesStatus(): CompiledProfilesRuntimeStatus {
    if (this.compiledProfilesRuntime?.status) return this.compiledProfilesRuntime.status;
    const sourcePath = resolveCompiledProfilesArtifactPath(
      __dirname,
      this.homey.settings.get(COMPILED_PROFILES_PATH_SETTINGS_KEY),
    );
    return {
      sourcePath,
      loaded: false,
      generatedAt: null,
      pipelineFingerprint: null,
      entryCount: 0,
      duplicateKeys: {
        productTriple: 0,
        nodeId: 0,
        deviceKey: 0,
      },
      errorMessage: 'Compiled profile runtime not loaded',
    };
  }

  resolveCompiledProfileEntry(
    selector: CompiledProfileResolverSelector,
    options?: ResolveCompiledProfileEntryOptionsV1,
  ): CompiledProfileResolverMatchV1 {
    return resolveCompiledProfileEntryFromRuntime(this.compiledProfilesRuntime, selector, options);
  }

  getCurationStatus(): HomeyCurationRuntimeStatusV1 {
    return this.curationRuntime.status;
  }

  resolveCurationEntry(homeyDeviceId: string): HomeyCurationEntryV1 | undefined {
    return resolveCurationEntryFromRuntime(this.curationRuntime, homeyDeviceId);
  }

  async getNodeRuntimeDiagnostics(options?: { homeyDeviceId?: string }): Promise<{
    generatedAt: string;
    bridgeId: string;
    zwjs: {
      available: boolean;
      transportConnected: boolean;
      lifecycle: string;
    };
    compiledProfiles: CompiledProfilesRuntimeStatus;
    curation: HomeyCurationRuntimeStatusV1;
    nodes: NodeRuntimeDiagnosticsEntry[];
  }> {
    const nodeDriver = this.homey.drivers.getDriver('node');
    const devices = nodeDriver.getDevices() as Array<{
      getData?: () => { id?: unknown; bridgeId?: unknown; nodeId?: unknown } | undefined;
      getStoreValue?: (key: string) => Promise<unknown>;
    }>;
    const filterHomeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(options?.homeyDeviceId);
    const nodeDiagnostics: NodeRuntimeDiagnosticsEntry[] = [];

    for (const device of devices) {
      try {
        const profileResolution = await device.getStoreValue?.('profileResolution');
        if (!profileResolution || typeof profileResolution !== 'object') continue;
        const diagnosticsEntry = this.normalizeNodeDiagnosticsEntry(
          profileResolution as Record<string, unknown>,
          device.getData?.(),
        );
        if (filterHomeyDeviceId && diagnosticsEntry.homeyDeviceId !== filterHomeyDeviceId) {
          continue;
        }
        nodeDiagnostics.push(diagnosticsEntry);
      } catch (error) {
        this.error('Failed to read node diagnostics', { error });
      }
    }

    nodeDiagnostics.sort((a, b) => {
      const nodeA = Zwavejs2HomeyApp.toNumberOrNull(a.nodeId);
      const nodeB = Zwavejs2HomeyApp.toNumberOrNull(b.nodeId);
      if (nodeA !== null && nodeB !== null && nodeA !== nodeB) {
        return nodeA - nodeB;
      }
      if (nodeA !== null && nodeB === null) return -1;
      if (nodeA === null && nodeB !== null) return 1;
      const idA = Zwavejs2HomeyApp.toStringOrNull(a.homeyDeviceId) ?? '';
      const idB = Zwavejs2HomeyApp.toStringOrNull(b.homeyDeviceId) ?? '';
      return idA.localeCompare(idB);
    });

    const clientStatus = this.zwjsClient?.getStatus();
    return {
      generatedAt: new Date().toISOString(),
      bridgeId: this.bridgeId,
      zwjs: {
        available: Boolean(this.zwjsClient),
        transportConnected: clientStatus?.transportConnected === true,
        lifecycle: clientStatus?.lifecycle ?? 'stopped',
      },
      compiledProfiles: this.getCompiledProfilesStatus(),
      curation: this.getCurationStatus(),
      nodes: nodeDiagnostics,
    };
  }

  async getRecommendationActionQueue(options?: {
    homeyDeviceId?: string;
    includeNoAction?: boolean;
  }): Promise<{
    generatedAt: string;
    total: number;
    actionable: number;
    items: RecommendationActionQueueItemV1[];
  }> {
    const diagnostics = await this.getNodeRuntimeDiagnostics({
      homeyDeviceId: options?.homeyDeviceId,
    });
    const includeNoAction = options?.includeNoAction === true;
    const queueItems = diagnostics.nodes.map((node) => this.toRecommendationActionQueueItem(node));
    const items = includeNoAction
      ? queueItems
      : queueItems.filter((item) => item.action !== 'none');

    items.sort((a, b) => {
      const priorityA = Zwavejs2HomeyApp.toRecommendationActionPriority(a.action);
      const priorityB = Zwavejs2HomeyApp.toRecommendationActionPriority(b.action);
      if (priorityA !== priorityB) return priorityA - priorityB;
      const nodeA = a.nodeId ?? Number.MAX_SAFE_INTEGER;
      const nodeB = b.nodeId ?? Number.MAX_SAFE_INTEGER;
      if (nodeA !== nodeB) return nodeA - nodeB;
      const idA = a.homeyDeviceId ?? '';
      const idB = b.homeyDeviceId ?? '';
      return idA.localeCompare(idB);
    });

    return {
      generatedAt: new Date().toISOString(),
      total: queueItems.length,
      actionable: queueItems.filter((item) => item.action !== 'none').length,
      items,
    };
  }

  async backfillMissingCurationBaselineMarkers(options?: { homeyDeviceId?: string }): Promise<{
    updated: number;
    createdEntries: number;
    skipped: number;
    items: Array<{
      homeyDeviceId: string | null;
      action: RecommendationActionKindV1;
      updated: boolean;
      createdEntry: boolean;
      reason: string;
    }>;
  }> {
    const queue = await this.getRecommendationActionQueue({
      homeyDeviceId: options?.homeyDeviceId,
      includeNoAction: true,
    });

    const items = [];
    let nextDocument = this.curationRuntime.document;
    let updated = 0;
    let createdEntries = 0;

    for (const item of queue.items) {
      if (item.action !== 'backfill-marker') {
        items.push({
          homeyDeviceId: item.homeyDeviceId,
          action: item.action,
          updated: false,
          createdEntry: false,
          reason: 'action-not-backfill',
        });
        continue;
      }
      if (!item.homeyDeviceId) {
        items.push({
          homeyDeviceId: null,
          action: item.action,
          updated: false,
          createdEntry: false,
          reason: 'missing-homey-device-id',
        });
        continue;
      }
      if (!item.currentBaselineHash) {
        items.push({
          homeyDeviceId: item.homeyDeviceId,
          action: item.action,
          updated: false,
          createdEntry: false,
          reason: 'baseline-marker-unavailable',
        });
        continue;
      }

      const nowIso = new Date().toISOString();
      const baselineMarker: {
        projectionVersion: string;
        baselineProfileHash: string;
        updatedAt: string;
        pipelineFingerprint?: string;
      } = {
        projectionVersion:
          item.recommendationProjectionVersion ?? BASELINE_MARKER_PROJECTION_VERSION,
        baselineProfileHash: item.currentBaselineHash,
        updatedAt: nowIso,
      };
      if (item.currentPipelineFingerprint) {
        baselineMarker.pipelineFingerprint = item.currentPipelineFingerprint;
      }
      const mutation = upsertCurationBaselineMarkerV1(
        nextDocument,
        item.homeyDeviceId,
        baselineMarker,
        { now: nowIso },
      );
      nextDocument = mutation.document;
      updated += 1;
      if (mutation.createdEntry) createdEntries += 1;
      items.push({
        homeyDeviceId: item.homeyDeviceId,
        action: item.action,
        updated: true,
        createdEntry: mutation.createdEntry,
        reason: mutation.createdEntry ? 'created-entry-and-backfilled-marker' : 'backfilled-marker',
      });
    }

    if (updated > 0) {
      this.homey.settings.set(CURATION_SETTINGS_KEY, nextDocument);
      await this.lifecycleQueue;
    }

    return {
      updated,
      createdEntries,
      skipped: items.length - updated,
      items,
    };
  }

  async backfillCurationBaselineMarker(homeyDeviceId: string): Promise<{
    updated: boolean;
    createdEntry: boolean;
    reason: string;
  }> {
    const normalizedHomeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(homeyDeviceId);
    if (!normalizedHomeyDeviceId) {
      return {
        updated: false,
        createdEntry: false,
        reason: 'invalid-homey-device-id',
      };
    }

    const diagnostics = await this.getNodeRuntimeDiagnostics({
      homeyDeviceId: normalizedHomeyDeviceId,
    });
    const node = diagnostics.nodes[0];
    if (!node) {
      return {
        updated: false,
        createdEntry: false,
        reason: 'node-not-found',
      };
    }
    if (!node.recommendation.currentBaselineHash) {
      return {
        updated: false,
        createdEntry: false,
        reason: 'baseline-marker-unavailable',
      };
    }

    const nowIso = new Date().toISOString();
    const baselineMarker: {
      projectionVersion: string;
      baselineProfileHash: string;
      updatedAt: string;
      pipelineFingerprint?: string;
    } = {
      projectionVersion:
        node.recommendation.projectionVersion ?? BASELINE_MARKER_PROJECTION_VERSION,
      baselineProfileHash: node.recommendation.currentBaselineHash,
      updatedAt: nowIso,
    };
    if (node.recommendation.currentPipelineFingerprint) {
      baselineMarker.pipelineFingerprint = node.recommendation.currentPipelineFingerprint;
    }
    const mutation = upsertCurationBaselineMarkerV1(
      this.curationRuntime.document,
      normalizedHomeyDeviceId,
      baselineMarker,
      { now: nowIso },
    );
    this.homey.settings.set(CURATION_SETTINGS_KEY, mutation.document);
    await this.lifecycleQueue;
    return {
      updated: true,
      createdEntry: mutation.createdEntry,
      reason: mutation.createdEntry ? 'created-entry-and-backfilled-marker' : 'backfilled-marker',
    };
  }

  async adoptRecommendedBaseline(homeyDeviceId: string): Promise<{
    adopted: boolean;
    reason: string;
  }> {
    const normalizedHomeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(homeyDeviceId);
    if (!normalizedHomeyDeviceId) {
      return {
        adopted: false,
        reason: 'invalid-homey-device-id',
      };
    }

    const diagnostics = await this.getNodeRuntimeDiagnostics({
      homeyDeviceId: normalizedHomeyDeviceId,
    });
    const node = diagnostics.nodes[0];
    if (!node) {
      return {
        adopted: false,
        reason: 'node-not-found',
      };
    }
    if (node.recommendation.backfillNeeded) {
      return {
        adopted: false,
        reason: 'marker-backfill-required',
      };
    }
    if (!node.recommendation.available) {
      return {
        adopted: false,
        reason: 'recommendation-unavailable',
      };
    }

    const mutation = removeCurationEntryV1(this.curationRuntime.document, normalizedHomeyDeviceId);
    if (!mutation.removed) {
      return {
        adopted: false,
        reason: 'curation-entry-missing',
      };
    }
    this.homey.settings.set(CURATION_SETTINGS_KEY, mutation.document);
    await this.lifecycleQueue;
    return {
      adopted: true,
      reason: 'adopted-and-removed-curation-entry',
    };
  }
};

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
import { createBridgeSession, type BridgeSessionRuntimeState } from './bridge-session';
import {
  createProfileExtensionRegistry,
  PROFILE_EXTENSION_CONTRACTS_V1,
  type ProfileExtensionContractV1,
  type ProfileExtensionMatchContextV1,
  type ProfileExtensionMatchExplanationV1,
} from './profile-extension';

interface ZwjsDiagnosticsStatusV1 {
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
}

interface BridgeDiagnosticsRefreshStatusV1 {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  lastReason: string | null;
}

interface NodeStateSnapshotV1 {
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
}

type ProfileConfidenceCodeV1 = 'curated' | 'ha-derived' | 'generic';

type ProfileSourceCodeV1 = 'compiled-only' | 'compiled+curation-override' | 'unresolved';

interface ProfileAttributionV1 {
  confidenceCode: ProfileConfidenceCodeV1 | null;
  confidenceLabel: string;
  sourceCode: ProfileSourceCodeV1;
  sourceLabel: string;
  summary: string;
  curationEntryPresent: boolean;
}

interface NodeRuntimeDiagnosticsEntry {
  homeyDeviceId: string | null;
  bridgeId: string | null;
  nodeId: number | null;
  node: NodeStateSnapshotV1;
  sync: {
    syncedAt: string | null;
    syncReason: string | null;
  };
  profile: {
    matchBy: string | null;
    matchKey: string | null;
    profileId: string | null;
    driverTemplateId: string | null;
    fallbackReason: string | null;
    homeyClass: string | null;
    confidence: string | null;
    uncurated: boolean;
  };
  profileAttribution: ProfileAttributionV1;
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
    reasonLabel: string | null;
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

type RecommendationActionSelectionV1 = RecommendationActionKindV1 | 'auto';

interface RecommendationActionExecutionResultV1 {
  homeyDeviceId: string | null;
  requestedAction: RecommendationActionSelectionV1;
  selectedAction: RecommendationActionKindV1;
  executed: boolean;
  reason: string;
  createdEntry?: boolean;
  latestReason?: string;
  stateChanged?: boolean;
}

interface RuntimeNodeDeviceLike {
  getData?: () => { id?: unknown; bridgeId?: unknown; nodeId?: unknown } | undefined;
  getStoreValue?: (key: string) => Promise<unknown>;
}

interface RuntimeBridgeDeviceLike {
  getData?: () => { id?: unknown; bridgeId?: unknown } | undefined;
  getSettings?: () => Record<string, unknown> | undefined;
  getName?: () => string;
}

interface NodeDeviceToolsSnapshotV1 {
  schemaVersion: 'node-device-tools/v1';
  generatedAt: string;
  device: {
    homeyDeviceId: string;
    bridgeId: string | null;
    nodeId: number | null;
  };
  runtime: {
    zwjs: ZwjsDiagnosticsStatusV1;
    compiledProfiles: CompiledProfilesRuntimeStatus;
    curation: HomeyCurationRuntimeStatusV1;
  };
  node: NodeStateSnapshotV1;
  sync: NodeRuntimeDiagnosticsEntry['sync'];
  profile: NodeRuntimeDiagnosticsEntry['profile'];
  profileAttribution: NodeRuntimeDiagnosticsEntry['profileAttribution'];
  mapping: NodeRuntimeDiagnosticsEntry['mapping'];
  curation: NodeRuntimeDiagnosticsEntry['curation'];
  recommendation: {
    available: boolean;
    reason: string | null;
    reasonLabel: string | null;
    backfillNeeded: boolean;
    suggestedAction: RecommendationActionKindV1;
    actionable: boolean;
  };
  profileReference: {
    projectionVersion: string | null;
    currentBaselineHash: string | null;
    storedBaselineHash: string | null;
    currentPipelineFingerprint: string | null;
    storedPipelineFingerprint: string | null;
  };
  ui: {
    readOnly: true;
    actionsEnabled: false;
  };
}

module.exports = class Zwavejs2HomeyApp extends Homey.App {
  private readonly defaultBridgeId = ZWJS_DEFAULT_BRIDGE_ID;
  private readonly bridgeSessions = new Map<string, BridgeSessionRuntimeState>([
    [ZWJS_DEFAULT_BRIDGE_ID, createBridgeSession(ZWJS_DEFAULT_BRIDGE_ID)],
  ]);
  private readonly bridgeDiagnosticsRefreshStatusById = new Map<
    string,
    BridgeDiagnosticsRefreshStatusV1
  >();
  private preferredBridgeId: string = ZWJS_DEFAULT_BRIDGE_ID;
  private compiledProfilesRuntime?: CompiledProfilesRuntime;
  private curationRuntime = loadCurationRuntimeFromSettings(undefined);
  private readonly profileExtensionRegistry = createProfileExtensionRegistry(
    PROFILE_EXTENSION_CONTRACTS_V1,
  );

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

  private static readonly RECOMMENDATION_REASON_LABELS: Record<string, string> = {
    'baseline-hash-changed': 'Compiled profile changed for this device.',
    'marker-missing-backfill': 'Profile reference metadata is missing for this curated device.',
    'baseline-hash-unchanged': 'Current curated profile still matches the compiled baseline.',
    'profile-resolution-not-ready': 'Runtime mapping has not been generated for this device yet.',
    'no-curation-entry': 'No curation exists yet for this device.',
    'missing-homey-device-id': 'Device identifier is unavailable in runtime diagnostics.',
    none: 'No recommendation is available.',
  };

  private static readonly DRIVER_READY_RETRY_MS = 25;

  private static readonly DRIVER_READY_TIMEOUT_MS = 15000;

  private static toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }
    const normalized = Zwavejs2HomeyApp.toStringOrNull(error);
    return normalized ?? 'Unknown runtime error';
  }

  private static wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static isDriverNotInitializedError(error: unknown, driverId: string): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message;
    return (
      message === `Driver Not Initialized: ${driverId}` ||
      message.startsWith('Driver Not Initialized:')
    );
  }

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

  private static normalizeProfileConfidenceCode(value: unknown): ProfileConfidenceCodeV1 | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'curated') return 'curated';
    if (normalized === 'ha-derived') return 'ha-derived';
    if (normalized === 'generic') return 'generic';
    return null;
  }

  private static describeProfileConfidenceCode(code: ProfileConfidenceCodeV1 | null): string {
    if (code === 'curated') return 'Project rule match';
    if (code === 'ha-derived') return 'Home Assistant-derived rule match';
    if (code === 'generic') return 'Generic fallback rule';
    return 'Unknown rule match level';
  }

  private static describeProfileSourceCode(code: ProfileSourceCodeV1): string {
    if (code === 'compiled+curation-override') return 'Compiled profile + device override';
    if (code === 'compiled-only') return 'Compiled profile only';
    return 'Profile resolution pending';
  }

  private static describeRecommendationReason(reasonCode: string | null): string | null {
    if (!reasonCode) return null;
    return Zwavejs2HomeyApp.RECOMMENDATION_REASON_LABELS[reasonCode] ?? reasonCode;
  }

  private static buildProfileAttribution(options: {
    confidenceCode: ProfileConfidenceCodeV1 | null;
    curationEntryPresent: boolean;
    profileId: string | null;
    fallbackReason: string | null;
  }): ProfileAttributionV1 {
    const confidenceLabel = Zwavejs2HomeyApp.describeProfileConfidenceCode(options.confidenceCode);
    const sourceCode: ProfileSourceCodeV1 =
      options.profileId || options.fallbackReason
        ? options.curationEntryPresent
          ? 'compiled+curation-override'
          : 'compiled-only'
        : 'unresolved';
    const sourceLabel = Zwavejs2HomeyApp.describeProfileSourceCode(sourceCode);
    const summary =
      sourceCode === 'compiled+curation-override'
        ? `${confidenceLabel}; device override present`
        : sourceCode === 'compiled-only'
          ? `${confidenceLabel}; no device override`
          : 'Profile resolution is pending; runtime defaults are active';
    return {
      confidenceCode: options.confidenceCode,
      confidenceLabel,
      sourceCode,
      sourceLabel,
      summary,
      curationEntryPresent: options.curationEntryPresent,
    };
  }

  private static parseNumericIdentityOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
      const parsedHex = Number.parseInt(trimmed.slice(2), 16);
      return Number.isInteger(parsedHex) && Number.isFinite(parsedHex) ? parsedHex : null;
    }
    if (/^\d+$/.test(trimmed)) {
      const parsedDec = Number.parseInt(trimmed, 10);
      return Number.isInteger(parsedDec) && Number.isFinite(parsedDec) ? parsedDec : null;
    }
    return null;
  }

  private static normalizeNodeStateSnapshot(
    profileResolution: Record<string, unknown>,
  ): NodeStateSnapshotV1 {
    let nodeState: Record<string, unknown> | undefined;
    if (profileResolution.nodeState && typeof profileResolution.nodeState === 'object') {
      nodeState = profileResolution.nodeState as Record<string, unknown>;
    }
    return {
      manufacturerId: Zwavejs2HomeyApp.parseNumericIdentityOrNull(nodeState?.manufacturerId),
      productType: Zwavejs2HomeyApp.parseNumericIdentityOrNull(nodeState?.productType),
      productId: Zwavejs2HomeyApp.parseNumericIdentityOrNull(nodeState?.productId),
      manufacturer: Zwavejs2HomeyApp.toStringOrNull(nodeState?.manufacturer),
      product: Zwavejs2HomeyApp.toStringOrNull(nodeState?.product),
      location: Zwavejs2HomeyApp.toStringOrNull(nodeState?.location),
      interviewStage: Zwavejs2HomeyApp.toStringOrNull(nodeState?.interviewStage),
      status: Zwavejs2HomeyApp.toStringOrNull(nodeState?.status),
      firmwareVersion: Zwavejs2HomeyApp.toStringOrNull(nodeState?.firmwareVersion),
      ready: typeof nodeState?.ready === 'boolean' ? nodeState.ready : null,
      isFailed: typeof nodeState?.isFailed === 'boolean' ? nodeState.isFailed : null,
    };
  }

  private getOrCreateBridgeSession(bridgeId: string): BridgeSessionRuntimeState {
    const existing = this.bridgeSessions.get(bridgeId);
    if (existing) return existing;
    const session = createBridgeSession(bridgeId);
    this.bridgeSessions.set(bridgeId, session);
    return session;
  }

  private resolveBridgeId(input: unknown): string {
    return Zwavejs2HomeyApp.toStringOrNull(input) ?? this.defaultBridgeId;
  }

  private getDefaultBridgeSession(): BridgeSessionRuntimeState {
    return this.getOrCreateBridgeSession(this.resolveBridgeId(this.preferredBridgeId));
  }

  private normalizeZwjsDiagnosticsStatus(bridgeId?: string): ZwjsDiagnosticsStatusV1 {
    const session = this.getOrCreateBridgeSession(this.resolveBridgeId(bridgeId));
    const status = session.getZwjsStatus();
    return {
      available: Boolean(session.getZwjsClient()),
      transportConnected: status?.transportConnected === true,
      lifecycle: status?.lifecycle ?? 'stopped',
      versionReceived: typeof status?.versionReceived === 'boolean' ? status.versionReceived : null,
      initialized: typeof status?.initialized === 'boolean' ? status.initialized : null,
      listening: typeof status?.listening === 'boolean' ? status.listening : null,
      authenticated: typeof status?.authenticated === 'boolean' ? status.authenticated : null,
      serverVersion: Zwavejs2HomeyApp.toStringOrNull(status?.serverVersion),
      adapterFamily: Zwavejs2HomeyApp.toStringOrNull(status?.adapterFamily),
      reconnectAttempt: Zwavejs2HomeyApp.toNumberOrNull(status?.reconnectAttempt),
      connectedAt: Zwavejs2HomeyApp.toStringOrNull(status?.connectedAt),
      lastMessageAt: Zwavejs2HomeyApp.toStringOrNull(status?.lastMessageAt),
    };
  }

  private getBridgeDiagnosticsRefreshStatus(bridgeId?: string): BridgeDiagnosticsRefreshStatusV1 {
    const normalizedBridgeId = this.resolveBridgeId(bridgeId);
    const existing = this.bridgeDiagnosticsRefreshStatusById.get(normalizedBridgeId);
    if (existing) {
      return {
        lastSuccessAt: existing.lastSuccessAt,
        lastFailureAt: existing.lastFailureAt,
        lastFailureReason: existing.lastFailureReason,
        lastReason: existing.lastReason,
      };
    }
    return {
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureReason: null,
      lastReason: null,
    };
  }

  private markBridgeDiagnosticsRefreshSuccess(bridgeId: string, reason: string): void {
    const normalizedBridgeId = this.resolveBridgeId(bridgeId);
    this.bridgeDiagnosticsRefreshStatusById.set(normalizedBridgeId, {
      lastSuccessAt: new Date().toISOString(),
      lastFailureAt: null,
      lastFailureReason: null,
      lastReason: Zwavejs2HomeyApp.toStringOrNull(reason),
    });
  }

  private markBridgeDiagnosticsRefreshFailure(
    bridgeId: string,
    reason: string,
    error: unknown,
  ): void {
    const normalizedBridgeId = this.resolveBridgeId(bridgeId);
    const status = this.getBridgeDiagnosticsRefreshStatus(normalizedBridgeId);
    this.bridgeDiagnosticsRefreshStatusById.set(normalizedBridgeId, {
      lastSuccessAt: status.lastSuccessAt,
      lastFailureAt: new Date().toISOString(),
      lastFailureReason: Zwavejs2HomeyApp.toErrorMessage(error),
      lastReason: Zwavejs2HomeyApp.toStringOrNull(reason),
    });
  }

  private static toRecommendationActionPriority(action: RecommendationActionKindV1): number {
    if (action === 'backfill-marker') return 0;
    if (action === 'adopt-recommended-baseline') return 1;
    return 2;
  }

  private static toRecommendationActionSelection(
    value: unknown,
  ): RecommendationActionSelectionV1 | null {
    if (typeof value === 'undefined') return 'auto';
    if (value === 'auto') return value;
    if (value === 'backfill-marker') return value;
    if (value === 'adopt-recommended-baseline') return value;
    if (value === 'none') return value;
    return null;
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
    const node = Zwavejs2HomeyApp.normalizeNodeStateSnapshot(profileResolution);
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
    const profileId = Zwavejs2HomeyApp.toStringOrNull(profileResolution.profileId);
    const fallbackReason = Zwavejs2HomeyApp.toStringOrNull(profileResolution.fallbackReason);
    const confidenceCode = Zwavejs2HomeyApp.normalizeProfileConfidenceCode(
      classification?.confidence,
    );
    const curationEntryPresent = Zwavejs2HomeyApp.toBooleanOrDefault(
      profileResolution.curationEntryPresent,
    );
    const recommendationReason = Zwavejs2HomeyApp.toStringOrNull(
      profileResolution.recommendationReason,
    );
    return {
      homeyDeviceId,
      bridgeId,
      nodeId,
      node,
      sync: {
        syncedAt: Zwavejs2HomeyApp.toStringOrNull(profileResolution.syncedAt),
        syncReason: Zwavejs2HomeyApp.toStringOrNull(profileResolution.syncReason),
      },
      profile: {
        matchBy: Zwavejs2HomeyApp.toStringOrNull(profileResolution.matchBy),
        matchKey: Zwavejs2HomeyApp.toStringOrNull(profileResolution.matchKey),
        profileId,
        driverTemplateId: Zwavejs2HomeyApp.toStringOrNull(classification?.driverTemplateId),
        fallbackReason,
        homeyClass: Zwavejs2HomeyApp.toStringOrNull(classification?.homeyClass),
        confidence: confidenceCode,
        uncurated: Zwavejs2HomeyApp.toBooleanOrDefault(classification?.uncurated, true),
      },
      profileAttribution: Zwavejs2HomeyApp.buildProfileAttribution({
        confidenceCode,
        curationEntryPresent,
        profileId,
        fallbackReason,
      }),
      curation: {
        loaded: Zwavejs2HomeyApp.toBooleanOrDefault(profileResolution.curationLoaded),
        source: Zwavejs2HomeyApp.toStringOrNull(profileResolution.curationSource),
        error: Zwavejs2HomeyApp.toStringOrNull(profileResolution.curationError),
        entryPresent: curationEntryPresent,
        appliedActions: Zwavejs2HomeyApp.toNumberOrNull(curationSummary?.applied) ?? 0,
        skippedActions: Zwavejs2HomeyApp.toNumberOrNull(curationSummary?.skipped) ?? 0,
        errorCount: Zwavejs2HomeyApp.toNumberOrNull(curationSummary?.errors) ?? 0,
      },
      recommendation: {
        available: Zwavejs2HomeyApp.toBooleanOrDefault(profileResolution.recommendationAvailable),
        reason: recommendationReason,
        reasonLabel: Zwavejs2HomeyApp.describeRecommendationReason(recommendationReason),
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

  private createPendingNodeDiagnosticsEntry(
    deviceData: { id?: unknown; bridgeId?: unknown; nodeId?: unknown } | undefined,
  ): NodeRuntimeDiagnosticsEntry {
    return {
      homeyDeviceId: Zwavejs2HomeyApp.toStringOrNull(deviceData?.id),
      bridgeId: Zwavejs2HomeyApp.toStringOrNull(deviceData?.bridgeId),
      nodeId: Zwavejs2HomeyApp.toNumberOrNull(deviceData?.nodeId),
      node: {
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
      },
      sync: {
        syncedAt: null,
        syncReason: null,
      },
      profile: {
        matchBy: null,
        matchKey: null,
        profileId: null,
        driverTemplateId: null,
        fallbackReason: 'profile-resolution-not-ready',
        homeyClass: null,
        confidence: null,
        uncurated: true,
      },
      profileAttribution: Zwavejs2HomeyApp.buildProfileAttribution({
        confidenceCode: null,
        curationEntryPresent: false,
        profileId: null,
        fallbackReason: null,
      }),
      curation: {
        loaded: this.curationRuntime.status.loaded,
        source: this.curationRuntime.status.source,
        error: this.curationRuntime.status.errorMessage,
        entryPresent: false,
        appliedActions: 0,
        skippedActions: 0,
        errorCount: 0,
      },
      recommendation: {
        available: false,
        reason: 'profile-resolution-not-ready',
        reasonLabel: Zwavejs2HomeyApp.describeRecommendationReason('profile-resolution-not-ready'),
        backfillNeeded: false,
        projectionVersion: null,
        currentBaselineHash: null,
        storedBaselineHash: null,
        currentPipelineFingerprint: null,
        storedPipelineFingerprint: null,
      },
      mapping: {
        verticalSliceApplied: false,
        capabilityCount: 0,
        inboundConfigured: 0,
        inboundEnabled: 0,
        inboundSkipped: 0,
        outboundConfigured: 0,
        outboundEnabled: 0,
        outboundSkipped: 0,
        skipReasons: {},
      },
    };
  }

  private async getNodeDriverDevices(reason: string): Promise<RuntimeNodeDeviceLike[]> {
    const nodeDriver = await this.getDriverWhenReady<{
      getDevices: () => RuntimeNodeDeviceLike[];
    }>('node', reason);
    if (!nodeDriver) return [];
    return nodeDriver.getDevices() as RuntimeNodeDeviceLike[];
  }

  private async getBridgeDriverDevices(reason: string): Promise<RuntimeBridgeDeviceLike[]> {
    const bridgeDriver = await this.getDriverWhenReady<{
      getDevices: () => RuntimeBridgeDeviceLike[];
    }>('bridge', reason);
    if (!bridgeDriver) return [];
    return bridgeDriver.getDevices() as RuntimeBridgeDeviceLike[];
  }

  private resolveBridgeIdFromBridgeDeviceData(
    data: { id?: unknown; bridgeId?: unknown } | undefined,
  ): string | null {
    const bridgeIdFromData = Zwavejs2HomeyApp.toStringOrNull(data?.bridgeId);
    if (bridgeIdFromData) return bridgeIdFromData;
    const id = Zwavejs2HomeyApp.toStringOrNull(data?.id);
    if (!id) return null;
    if (!id.startsWith('zwjs-bridge-')) return null;
    const suffix = id.slice('zwjs-bridge-'.length).trim();
    return suffix.length > 0 ? suffix : null;
  }

  private resolveBridgeIdFromNodeDeviceData(data: { bridgeId?: unknown } | undefined): string {
    return Zwavejs2HomeyApp.toStringOrNull(data?.bridgeId) ?? this.resolveBridgeId(undefined);
  }

  private findNodeDeviceByHomeyDeviceId(
    homeyDeviceId: string,
    devices: RuntimeNodeDeviceLike[],
  ): RuntimeNodeDeviceLike | undefined {
    return devices.find((device) => {
      const data = device.getData?.();
      return Zwavejs2HomeyApp.toStringOrNull(data?.id) === homeyDeviceId;
    });
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

  private async stopBridgeClient(bridgeId: string, reason: string): Promise<void> {
    const session = this.getOrCreateBridgeSession(this.resolveBridgeId(bridgeId));
    const client = session.getZwjsClient();
    if (!client) return;
    this.log(`Stopping ZWJS client (${reason})`, { bridgeId: session.bridgeId });
    session.setZwjsClient(undefined);
    try {
      await client.stop();
    } catch (error) {
      this.error('Failed to stop ZWJS client', { bridgeId: session.bridgeId, reason, error });
    }
  }

  private async stopZwjsClient(reason: string): Promise<void> {
    await this.stopBridgeClient(this.defaultBridgeId, reason);
  }

  private static hasConfiguredZwjsUrl(rawSettings: unknown): boolean {
    if (typeof rawSettings === 'string') {
      const candidate = rawSettings.trim();
      if (!candidate) return false;
      try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
      } catch {
        return false;
      }
    }

    if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
      return false;
    }

    const urlValue = (rawSettings as Record<string, unknown>).url;
    if (typeof urlValue !== 'string') return false;
    const candidate = urlValue.trim();
    if (!candidate) return false;
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    } catch {
      return false;
    }
  }

  private async startBridgeClient(
    bridgeId: string,
    rawConnectionSettings: unknown,
    reason: string,
  ): Promise<boolean> {
    const session = this.getOrCreateBridgeSession(this.resolveBridgeId(bridgeId));
    if (!Zwavejs2HomeyApp.hasConfiguredZwjsUrl(rawConnectionSettings)) {
      this.log(`Skipping ZWJS client start (${reason}): no URL configured`, {
        bridgeId: session.bridgeId,
      });
      return false;
    }

    const resolved = resolveZwjsConnectionConfig(rawConnectionSettings);
    for (const warning of resolved.warnings) {
      this.error('ZWJS config warning', { bridgeId: session.bridgeId, warning });
    }

    this.log(
      `Starting ZWJS client (${reason}) from ${resolved.source}: ${resolved.clientConfig.url}`,
      { bridgeId: session.bridgeId },
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
    const sessionBridgeId = session.bridgeId;
    nextClient.onEvent((event: ZwjsClientEvent) => {
      // Ignore events from stale clients after a reconnect swaps the active session client.
      if (this.getOrCreateBridgeSession(sessionBridgeId).getZwjsClient() !== nextClient) {
        return;
      }
      this.log('zwjs event', { bridgeId: sessionBridgeId, type: event.type });
      const refreshNodeId = this.getRuntimeRefreshNodeIdFromEvent(event);
      if (refreshNodeId === undefined || this.shuttingDown) {
        return;
      }
      this.enqueueLifecycle(async () => {
        await this.refreshNodeRuntimeMappingsForNode(
          sessionBridgeId,
          refreshNodeId,
          `event:${event.type}:bridge-${sessionBridgeId}:node-${refreshNodeId}`,
        );
        await this.refreshBridgeRuntimeDiagnostics(
          `event:${event.type}:bridge-${sessionBridgeId}:node-${refreshNodeId}`,
        );
      }).catch((error: unknown) => {
        this.error('Failed to refresh node runtime mappings from event', {
          bridgeId: sessionBridgeId,
          eventType: event.type,
          nodeId: refreshNodeId,
          error,
        });
      });
    });
    await nextClient.start();
    session.setZwjsClient(nextClient);
    this.preferredBridgeId = session.bridgeId;
    this.log('zwjs status', { bridgeId: session.bridgeId, ...(session.getZwjsStatus() ?? {}) });
    return true;
  }

  private async startZwjsClient(reason: string): Promise<void> {
    const rawConnectionSettings = this.homey.settings.get(ZWJS_CONNECTION_SETTINGS_KEY);
    await this.startBridgeClient(this.defaultBridgeId, rawConnectionSettings, reason);
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

  private async reloadBridgeClient(
    bridgeId: string,
    rawConnectionSettings: unknown,
    reason: string,
  ): Promise<void> {
    await this.stopBridgeClient(bridgeId, `${reason}:reload`);
    await this.startBridgeClient(bridgeId, rawConnectionSettings, reason);
  }

  private async reloadZwjsClient(reason: string): Promise<void> {
    const rawConnectionSettings = this.homey.settings.get(ZWJS_CONNECTION_SETTINGS_KEY);
    await this.reloadBridgeClient(this.defaultBridgeId, rawConnectionSettings, reason);
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
      const nodeDriver = await this.getDriverWhenReady<{
        getDevices: () => Array<{
          onRuntimeMappingsRefresh?: (refreshReason: string) => Promise<void>;
        }>;
      }>('node', `refreshNodeRuntimeMappings:${reason}`);
      if (!nodeDriver) return;
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
      const bridgeDriver = await this.getDriverWhenReady<{
        getDevices: () => Array<{
          getData?: () => { id?: unknown; bridgeId?: unknown } | undefined;
          onRuntimeDiagnosticsRefresh?: (refreshReason: string) => Promise<void>;
        }>;
      }>('bridge', `refreshBridgeRuntimeDiagnostics:${reason}`);
      if (!bridgeDriver) return;
      const devices = bridgeDriver.getDevices() as Array<{
        getData?: () => { id?: unknown; bridgeId?: unknown } | undefined;
        onRuntimeDiagnosticsRefresh?: (refreshReason: string) => Promise<void>;
      }>;
      this.log('Refreshing bridge runtime diagnostics', {
        reason,
        devices: devices.length,
      });
      let refreshError: unknown;
      for (const device of devices) {
        const bridgeId =
          this.resolveBridgeIdFromBridgeDeviceData(device.getData?.()) ??
          this.resolveBridgeId(undefined);
        if (typeof device.onRuntimeDiagnosticsRefresh === 'function') {
          try {
            await device.onRuntimeDiagnosticsRefresh(reason);
            this.markBridgeDiagnosticsRefreshSuccess(bridgeId, reason);
          } catch (error) {
            if (!refreshError) refreshError = error;
            this.markBridgeDiagnosticsRefreshFailure(bridgeId, reason, error);
            this.error('Failed bridge runtime diagnostics refresh for bridge device', {
              bridgeId,
              reason,
              error,
            });
          }
          continue;
        }
        this.markBridgeDiagnosticsRefreshFailure(
          bridgeId,
          reason,
          new Error('Bridge device missing onRuntimeDiagnosticsRefresh handler'),
        );
      }
      if (refreshError) {
        throw refreshError;
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

  private async refreshNodeRuntimeMappingsForNode(
    bridgeId: string,
    nodeId: number,
    reason: string,
  ): Promise<void> {
    try {
      const nodeDriver = await this.getDriverWhenReady<{
        getDevices: () => Array<{
          getData?: () => { bridgeId?: string; nodeId?: number } | undefined;
          onRuntimeMappingsRefresh?: (refreshReason: string) => Promise<void>;
        }>;
      }>('node', `refreshNodeRuntimeMappingsForNode:${reason}`);
      if (!nodeDriver) return;
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
        if (data.bridgeId && data.bridgeId !== bridgeId) {
          continue;
        }
        if (typeof device.onRuntimeMappingsRefresh === 'function') {
          await device.onRuntimeMappingsRefresh(reason);
          refreshed += 1;
        }
      }
      this.log('Refreshed node runtime mappings for node', {
        bridgeId,
        reason,
        nodeId,
        refreshed,
      });
    } catch (error) {
      this.error('Failed targeted node runtime mapping refresh', {
        bridgeId,
        nodeId,
        reason,
        error,
      });
    }
  }

  private async getDriverWhenReady<TDriver>(
    driverId: string,
    reason: string,
  ): Promise<TDriver | undefined> {
    const startedAt = Date.now();
    const timeoutAt = startedAt + Zwavejs2HomeyApp.DRIVER_READY_TIMEOUT_MS;
    let attempts = 0;
    while (!this.shuttingDown) {
      attempts += 1;
      try {
        return this.homey.drivers.getDriver(driverId) as TDriver;
      } catch (error) {
        if (!Zwavejs2HomeyApp.isDriverNotInitializedError(error, driverId)) {
          throw error;
        }
        if (Date.now() >= timeoutAt) {
          this.log('Driver still not initialized; skipping this refresh cycle', {
            driverId,
            reason,
            attempts,
            waitedMs: Date.now() - startedAt,
          });
          return undefined;
        }
        await Zwavejs2HomeyApp.wait(Zwavejs2HomeyApp.DRIVER_READY_RETRY_MS);
      }
    }
    return undefined;
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
      for (const [bridgeId] of this.bridgeSessions) {
        if (bridgeId === this.defaultBridgeId) continue;
        await this.stopBridgeClient(bridgeId, 'shutdown');
      }
    });
  }

  getZwjsClient(bridgeId?: string): ZwjsClient | undefined {
    const session = this.getBridgeSession(bridgeId);
    return session?.getZwjsClient();
  }

  getBridgeId(): string {
    return this.resolveBridgeId(this.preferredBridgeId);
  }

  getBridgeSession(bridgeId?: string): BridgeSessionRuntimeState | undefined {
    const normalizedBridgeId = this.resolveBridgeId(bridgeId ?? this.preferredBridgeId);
    return this.bridgeSessions.get(normalizedBridgeId);
  }

  listBridgeSessions(): BridgeSessionRuntimeState[] {
    return [...this.bridgeSessions.values()];
  }

  private resolveBridgeConnectionSettingsFromDeviceSettings(rawSettings: unknown):
    | {
        url: string;
        auth: { type: 'none' } | { type: 'bearer'; token: string };
      }
    | undefined {
    if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
      return undefined;
    }
    const settings = rawSettings as Record<string, unknown>;
    const url = Zwavejs2HomeyApp.toStringOrNull(settings.zwjs_url);
    if (!url) return undefined;
    const authType = Zwavejs2HomeyApp.toStringOrNull(settings.zwjs_auth_type) ?? 'none';
    const token = Zwavejs2HomeyApp.toStringOrNull(settings.zwjs_auth_token);
    if (authType === 'bearer' && token) {
      return {
        url,
        auth: { type: 'bearer', token },
      };
    }
    return {
      url,
      auth: { type: 'none' },
    };
  }

  async configureBridgeConnection(options: {
    bridgeId: string;
    settings?: unknown;
    reason?: string;
  }): Promise<{ bridgeId: string; configured: boolean; connected: boolean }> {
    const bridgeId = this.resolveBridgeId(options.bridgeId);
    const reason = options.reason ?? 'bridge-configure';
    const connectionSettings = this.resolveBridgeConnectionSettingsFromDeviceSettings(
      options.settings,
    );

    this.preferredBridgeId = bridgeId;
    await this.enqueueLifecycle(async () => {
      if (connectionSettings) {
        await this.reloadBridgeClient(bridgeId, connectionSettings, `${reason}:device-settings`);
      } else {
        await this.stopBridgeClient(bridgeId, `${reason}:no-url`);
      }
      await this.refreshNodeRuntimeMappings(`bridge-config-updated:${bridgeId}`);
      await this.refreshBridgeRuntimeDiagnostics(`bridge-config-updated:${bridgeId}`);
    });

    const connected =
      this.getBridgeSession(bridgeId)?.getZwjsStatus?.()?.transportConnected === true;
    return {
      bridgeId,
      configured: Boolean(connectionSettings),
      connected,
    };
  }

  async removeBridgeConnection(options: { bridgeId: string; reason?: string }): Promise<void> {
    const bridgeId = this.resolveBridgeId(options.bridgeId);
    const reason = options.reason ?? 'bridge-remove';
    await this.enqueueLifecycle(async () => {
      await this.stopBridgeClient(bridgeId, reason);
      if (bridgeId !== this.defaultBridgeId) {
        this.bridgeSessions.delete(bridgeId);
        this.bridgeDiagnosticsRefreshStatusById.delete(bridgeId);
      }
      if (this.preferredBridgeId === bridgeId) {
        this.preferredBridgeId = this.defaultBridgeId;
      }
      await this.refreshNodeRuntimeMappings(`bridge-removed:${bridgeId}`);
      await this.refreshBridgeRuntimeDiagnostics(`bridge-removed:${bridgeId}`);
    });
  }

  async deleteNodeDevicesForBridge(options: { bridgeId: string; reason?: string }): Promise<{
    bridgeId: string;
    requested: number;
    deleted: number;
    failed: number;
    errors: Array<{ homeyDeviceId: string; error: string }>;
  }> {
    const bridgeId = this.resolveBridgeId(options.bridgeId);
    const reason = options.reason ?? 'bridge-device-deleted';
    const nodeDevices = await this.getNodeDriverDevices(`deleteNodeDevicesForBridge:${reason}`);
    const targetHomeyDeviceIds = new Set<string>();
    for (const nodeDevice of nodeDevices) {
      const data = nodeDevice.getData?.();
      const nodeBridgeId = this.resolveBridgeIdFromNodeDeviceData(data);
      if (nodeBridgeId !== bridgeId) continue;
      const homeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(data?.id);
      if (!homeyDeviceId) continue;
      targetHomeyDeviceIds.add(homeyDeviceId);
    }

    const deleteApi =
      this.homey.api && typeof this.homey.api.delete === 'function'
        ? this.homey.api.delete.bind(this.homey.api)
        : null;
    if (!deleteApi) {
      throw new Error('Homey Manager API is unavailable for cascading node deletes');
    }

    const errors: Array<{ homeyDeviceId: string; error: string }> = [];
    let deleted = 0;
    for (const homeyDeviceId of targetHomeyDeviceIds) {
      try {
        await deleteApi(`/manager/devices/device/${encodeURIComponent(homeyDeviceId)}`);
        deleted += 1;
      } catch (error) {
        const errorMessage = Zwavejs2HomeyApp.toErrorMessage(error);
        errors.push({
          homeyDeviceId,
          error: errorMessage,
        });
        this.error('Failed cascading node delete for bridge', {
          bridgeId,
          homeyDeviceId,
          reason,
          error,
        });
      }
    }

    const result = {
      bridgeId,
      requested: targetHomeyDeviceIds.size,
      deleted,
      failed: errors.length,
      errors,
    };
    this.log('Completed cascading node delete for bridge', {
      bridgeId,
      reason,
      requested: result.requested,
      deleted: result.deleted,
      failed: result.failed,
    });
    return result;
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

  async getNodeRuntimeDiagnostics(options?: {
    homeyDeviceId?: string;
    bridgeId?: string;
  }): Promise<{
    generatedAt: string;
    bridgeId: string;
    diagnosticsRefresh: BridgeDiagnosticsRefreshStatusV1;
    zwjs: ZwjsDiagnosticsStatusV1;
    compiledProfiles: CompiledProfilesRuntimeStatus;
    curation: HomeyCurationRuntimeStatusV1;
    nodes: NodeRuntimeDiagnosticsEntry[];
  }> {
    const devices = await this.getNodeDriverDevices('getNodeRuntimeDiagnostics');
    const filterHomeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(options?.homeyDeviceId);
    const filterBridgeId = Zwavejs2HomeyApp.toStringOrNull(options?.bridgeId);
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
        if (
          filterBridgeId &&
          (!diagnosticsEntry.bridgeId || diagnosticsEntry.bridgeId !== filterBridgeId)
        ) {
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

    const diagnosticsBridgeId =
      filterBridgeId ??
      Zwavejs2HomeyApp.toStringOrNull(
        filterHomeyDeviceId
          ? nodeDiagnostics.find((entry) => entry.homeyDeviceId === filterHomeyDeviceId)?.bridgeId
          : null,
      ) ??
      this.getBridgeId();

    return {
      generatedAt: new Date().toISOString(),
      bridgeId: diagnosticsBridgeId,
      diagnosticsRefresh: this.getBridgeDiagnosticsRefreshStatus(diagnosticsBridgeId),
      zwjs: this.normalizeZwjsDiagnosticsStatus(diagnosticsBridgeId),
      compiledProfiles: this.getCompiledProfilesStatus(),
      curation: this.getCurationStatus(),
      nodes: nodeDiagnostics,
    };
  }

  async getBridgeRuntimeInventory(): Promise<{
    generatedAt: string;
    bridges: Array<{
      bridgeId: string;
      homeyDeviceId: string | null;
      name: string | null;
      configured: boolean;
      settings: {
        url: string | null;
        authType: 'none' | 'bearer';
      };
      runtime: ZwjsDiagnosticsStatusV1;
      diagnosticsRefresh: BridgeDiagnosticsRefreshStatusV1;
      importedNodeCount: number;
    }>;
  }> {
    const bridgeDevices = await this.getBridgeDriverDevices('getBridgeRuntimeInventory');
    const nodeDevices = await this.getNodeDriverDevices('getBridgeRuntimeInventory:nodes');
    const importedNodeCountByBridgeId = new Map<string, number>();

    for (const nodeDevice of nodeDevices) {
      const data = nodeDevice.getData?.();
      const bridgeId =
        Zwavejs2HomeyApp.toStringOrNull(data?.bridgeId) ?? this.resolveBridgeId(undefined);
      importedNodeCountByBridgeId.set(
        bridgeId,
        (importedNodeCountByBridgeId.get(bridgeId) ?? 0) + 1,
      );
    }

    const bridges = bridgeDevices
      .map((bridgeDevice) => {
        const data = bridgeDevice.getData?.();
        const bridgeId =
          this.resolveBridgeIdFromBridgeDeviceData(data) ?? this.resolveBridgeId(undefined);
        const settings = bridgeDevice.getSettings?.();
        const url = Zwavejs2HomeyApp.toStringOrNull(settings?.zwjs_url);
        const authType: 'none' | 'bearer' =
          settings?.zwjs_auth_type === 'bearer' ? 'bearer' : 'none';

        return {
          bridgeId,
          homeyDeviceId: Zwavejs2HomeyApp.toStringOrNull(data?.id),
          name: Zwavejs2HomeyApp.toStringOrNull(
            bridgeDevice.getName && typeof bridgeDevice.getName === 'function'
              ? bridgeDevice.getName()
              : null,
          ),
          configured: Boolean(url),
          settings: {
            url,
            authType,
          },
          runtime: this.normalizeZwjsDiagnosticsStatus(bridgeId),
          diagnosticsRefresh: this.getBridgeDiagnosticsRefreshStatus(bridgeId),
          importedNodeCount: importedNodeCountByBridgeId.get(bridgeId) ?? 0,
        };
      })
      .sort((left, right) => left.bridgeId.localeCompare(right.bridgeId));

    return {
      generatedAt: new Date().toISOString(),
      bridges,
    };
  }

  async getNodeDeviceToolsSnapshot(options: {
    homeyDeviceId: string;
  }): Promise<NodeDeviceToolsSnapshotV1> {
    const homeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(options?.homeyDeviceId);
    if (!homeyDeviceId) {
      throw new Error('Invalid homeyDeviceId for node device tools snapshot');
    }

    const devices = await this.getNodeDriverDevices('getNodeDeviceToolsSnapshot');
    const device = this.findNodeDeviceByHomeyDeviceId(homeyDeviceId, devices);
    if (!device) {
      throw new Error(`Node device not found for homeyDeviceId: ${homeyDeviceId}`);
    }

    const deviceData = device.getData?.();
    const profileResolution = await device.getStoreValue?.('profileResolution');
    let diagnosticsEntry: NodeRuntimeDiagnosticsEntry;
    if (profileResolution && typeof profileResolution === 'object') {
      diagnosticsEntry = this.normalizeNodeDiagnosticsEntry(
        profileResolution as Record<string, unknown>,
        deviceData,
      );
    } else {
      diagnosticsEntry = this.createPendingNodeDiagnosticsEntry(deviceData);
    }

    const recommendation = this.toRecommendationActionQueueItem(diagnosticsEntry);
    return {
      schemaVersion: 'node-device-tools/v1',
      generatedAt: new Date().toISOString(),
      device: {
        homeyDeviceId,
        bridgeId: diagnosticsEntry.bridgeId,
        nodeId: diagnosticsEntry.nodeId,
      },
      runtime: {
        zwjs: this.normalizeZwjsDiagnosticsStatus(diagnosticsEntry.bridgeId ?? undefined),
        compiledProfiles: this.getCompiledProfilesStatus(),
        curation: this.getCurationStatus(),
      },
      node: diagnosticsEntry.node,
      sync: diagnosticsEntry.sync,
      profile: diagnosticsEntry.profile,
      profileAttribution: diagnosticsEntry.profileAttribution,
      mapping: diagnosticsEntry.mapping,
      curation: diagnosticsEntry.curation,
      recommendation: {
        available: diagnosticsEntry.recommendation.available,
        reason: diagnosticsEntry.recommendation.reason,
        reasonLabel: diagnosticsEntry.recommendation.reasonLabel,
        backfillNeeded: diagnosticsEntry.recommendation.backfillNeeded,
        suggestedAction: recommendation.action,
        actionable: recommendation.action !== 'none',
      },
      profileReference: {
        projectionVersion: diagnosticsEntry.recommendation.projectionVersion,
        currentBaselineHash: diagnosticsEntry.recommendation.currentBaselineHash,
        storedBaselineHash: diagnosticsEntry.recommendation.storedBaselineHash,
        currentPipelineFingerprint: diagnosticsEntry.recommendation.currentPipelineFingerprint,
        storedPipelineFingerprint: diagnosticsEntry.recommendation.storedPipelineFingerprint,
      },
      ui: {
        readOnly: true,
        actionsEnabled: false,
      },
    };
  }

  private static toProfileExtensionMatchContext(
    node: NodeRuntimeDiagnosticsEntry,
  ): ProfileExtensionMatchContextV1 {
    return {
      profileId: node.profile.profileId,
      driverTemplateId: node.profile.driverTemplateId,
      homeyClass: node.profile.homeyClass,
    };
  }

  async getProfileExtensionInventory(options?: {
    homeyDeviceId?: string;
    bridgeId?: string;
    includeUnmatched?: boolean;
  }): Promise<{
    schemaVersion: 'homey-profile-extension-runtime/v1';
    generatedAt: string;
    filters: {
      homeyDeviceId: string | null;
      bridgeId: string | null;
      includeUnmatched: boolean;
    };
    summary: {
      registeredExtensions: number;
      scannedNodes: number;
      matchedNodes: number;
      matchedExtensionsTotal: number;
    };
    registered: Array<{
      extensionId: string;
      title: string;
      description: string;
      match: ProfileExtensionContractV1['match'];
      readSectionCount: number;
      actionCount: number;
    }>;
    nodes: Array<{
      homeyDeviceId: string | null;
      bridgeId: string | null;
      nodeId: number | null;
      context: ProfileExtensionMatchContextV1;
      matched: Array<{
        extensionId: string;
        title: string;
        description: string;
      }>;
      explain: ProfileExtensionMatchExplanationV1[];
    }>;
  }> {
    const filterHomeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(options?.homeyDeviceId);
    const filterBridgeId = Zwavejs2HomeyApp.toStringOrNull(options?.bridgeId);
    const includeUnmatched = options?.includeUnmatched === true;
    const diagnostics = await this.getNodeRuntimeDiagnostics({
      homeyDeviceId: filterHomeyDeviceId ?? undefined,
      bridgeId: filterBridgeId ?? undefined,
    });

    const registered = this.profileExtensionRegistry.list().map((entry) => ({
      extensionId: entry.extensionId,
      title: entry.title,
      description: entry.description,
      match: entry.match,
      readSectionCount: entry.read.sections.length,
      actionCount: entry.actions.length,
    }));

    const nodes = diagnostics.nodes
      .map((node) => {
        const context = Zwavejs2HomeyApp.toProfileExtensionMatchContext(node);
        const explain = this.profileExtensionRegistry.explain(context);
        const matched = explain
          .filter((entry) => entry.matched)
          .map((entry) => {
            const contract = this.profileExtensionRegistry.get(entry.extensionId);
            if (!contract) return null;
            return {
              extensionId: contract.extensionId,
              title: contract.title,
              description: contract.description,
            };
          })
          .filter((entry): entry is { extensionId: string; title: string; description: string } =>
            Boolean(entry),
          );
        if (!includeUnmatched && matched.length === 0) return null;
        return {
          homeyDeviceId: node.homeyDeviceId,
          bridgeId: node.bridgeId,
          nodeId: node.nodeId,
          context,
          matched,
          explain,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          homeyDeviceId: string | null;
          bridgeId: string | null;
          nodeId: number | null;
          context: ProfileExtensionMatchContextV1;
          matched: Array<{
            extensionId: string;
            title: string;
            description: string;
          }>;
          explain: ProfileExtensionMatchExplanationV1[];
        } => Boolean(entry),
      );

    const matchedExtensionsTotal = nodes.reduce((sum, entry) => sum + entry.matched.length, 0);

    return {
      schemaVersion: 'homey-profile-extension-runtime/v1',
      generatedAt: new Date().toISOString(),
      filters: {
        homeyDeviceId: filterHomeyDeviceId,
        bridgeId: filterBridgeId,
        includeUnmatched,
      },
      summary: {
        registeredExtensions: registered.length,
        scannedNodes: diagnostics.nodes.length,
        matchedNodes: nodes.filter((entry) => entry.matched.length > 0).length,
        matchedExtensionsTotal,
      },
      registered,
      nodes,
    };
  }

  async getProfileExtensionRead(options: { homeyDeviceId: string; extensionId: string }): Promise<{
    schemaVersion: 'homey-profile-extension-read/v1';
    generatedAt: string;
    device: {
      homeyDeviceId: string;
      bridgeId: string | null;
      nodeId: number | null;
    };
    context: ProfileExtensionMatchContextV1;
    extension: {
      extensionId: string;
      title: string;
      description: string;
      matched: boolean;
      matchReason: ProfileExtensionMatchExplanationV1['reason'];
      readSections: ProfileExtensionContractV1['read']['sections'];
      actions: ProfileExtensionContractV1['actions'];
    };
    read: {
      supported: boolean;
      implemented: boolean;
      reason: string;
      sections: unknown[];
    };
    diagnostics: {
      profileAttribution: ProfileAttributionV1;
      fallbackReason: string | null;
    };
  }> {
    const homeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(options?.homeyDeviceId);
    if (!homeyDeviceId) {
      throw new Error('Invalid homeyDeviceId for profile extension read');
    }
    const extensionId = Zwavejs2HomeyApp.toStringOrNull(options?.extensionId);
    if (!extensionId) {
      throw new Error('Invalid extensionId for profile extension read');
    }

    const diagnostics = await this.getNodeRuntimeDiagnostics({ homeyDeviceId });
    const node = diagnostics.nodes.find((entry) => entry.homeyDeviceId === homeyDeviceId);
    if (!node) {
      throw new Error(`Node runtime diagnostics not found for homeyDeviceId: ${homeyDeviceId}`);
    }

    const contract = this.profileExtensionRegistry.get(extensionId);
    if (!contract) {
      throw new Error(`Profile extension is not registered: ${extensionId}`);
    }

    const context = Zwavejs2HomeyApp.toProfileExtensionMatchContext(node);
    const explanation = this.profileExtensionRegistry.explainMatch(extensionId, context);

    const readReason = explanation.matched ? 'read-handler-not-implemented' : explanation.reason;

    return {
      schemaVersion: 'homey-profile-extension-read/v1',
      generatedAt: new Date().toISOString(),
      device: {
        homeyDeviceId,
        bridgeId: node.bridgeId,
        nodeId: node.nodeId,
      },
      context,
      extension: {
        extensionId: contract.extensionId,
        title: contract.title,
        description: contract.description,
        matched: explanation.matched,
        matchReason: explanation.reason,
        readSections: contract.read.sections,
        actions: contract.actions,
      },
      read: {
        supported: explanation.matched,
        implemented: false,
        reason: readReason,
        sections: [],
      },
      diagnostics: {
        profileAttribution: node.profileAttribution,
        fallbackReason: node.profile.fallbackReason,
      },
    };
  }

  async getRecommendationActionQueue(options?: {
    homeyDeviceId?: string;
    bridgeId?: string;
    includeNoAction?: boolean;
  }): Promise<{
    generatedAt: string;
    total: number;
    actionable: number;
    items: RecommendationActionQueueItemV1[];
  }> {
    const diagnostics = await this.getNodeRuntimeDiagnostics({
      homeyDeviceId: options?.homeyDeviceId,
      bridgeId: options?.bridgeId,
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

  async getRuntimeSupportBundle(options?: {
    homeyDeviceId?: string;
    bridgeId?: string;
    includeNoAction?: boolean;
  }): Promise<{
    schemaVersion: 'homey-runtime-support-bundle/v1';
    generatedAt: string;
    filters: {
      homeyDeviceId: string | null;
      bridgeId: string | null;
      includeNoAction: boolean;
    };
    summary: {
      nodeCount: number;
      recommendationTotal: number;
      actionableRecommendations: number;
      zwjsConnected: boolean;
      compiledProfilesLoaded: boolean;
      curationLoaded: boolean;
    };
    diagnostics: {
      generatedAt: string;
      bridgeId: string;
      zwjs: ZwjsDiagnosticsStatusV1;
      compiledProfiles: CompiledProfilesRuntimeStatus;
      curation: HomeyCurationRuntimeStatusV1;
      nodes: NodeRuntimeDiagnosticsEntry[];
    };
    recommendations: {
      generatedAt: string;
      total: number;
      actionable: number;
      items: RecommendationActionQueueItemV1[];
    };
  }> {
    const homeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(options?.homeyDeviceId);
    const bridgeId = Zwavejs2HomeyApp.toStringOrNull(options?.bridgeId);
    const includeNoAction = options?.includeNoAction === true;

    const diagnostics = await this.getNodeRuntimeDiagnostics({
      homeyDeviceId: homeyDeviceId ?? undefined,
      bridgeId: bridgeId ?? undefined,
    });
    const recommendations = await this.getRecommendationActionQueue({
      homeyDeviceId: homeyDeviceId ?? undefined,
      bridgeId: bridgeId ?? undefined,
      includeNoAction,
    });

    return {
      schemaVersion: 'homey-runtime-support-bundle/v1',
      generatedAt: new Date().toISOString(),
      filters: {
        homeyDeviceId,
        bridgeId,
        includeNoAction,
      },
      summary: {
        nodeCount: diagnostics.nodes.length,
        recommendationTotal: recommendations.total,
        actionableRecommendations: recommendations.actionable,
        zwjsConnected: diagnostics.zwjs.transportConnected === true,
        compiledProfilesLoaded: diagnostics.compiledProfiles.loaded === true,
        curationLoaded: diagnostics.curation.loaded === true,
      },
      diagnostics,
      recommendations,
    };
  }

  async executeRecommendationAction(options: {
    homeyDeviceId: string;
    action?: RecommendationActionSelectionV1;
  }): Promise<RecommendationActionExecutionResultV1> {
    const requestedAction = Zwavejs2HomeyApp.toRecommendationActionSelection(options.action);
    if (!requestedAction) {
      return {
        homeyDeviceId: Zwavejs2HomeyApp.toStringOrNull(options.homeyDeviceId),
        requestedAction: 'auto',
        selectedAction: 'none',
        executed: false,
        reason: 'invalid-action-selection',
      };
    }
    const normalizedHomeyDeviceId = Zwavejs2HomeyApp.toStringOrNull(options.homeyDeviceId);
    if (!normalizedHomeyDeviceId) {
      return {
        homeyDeviceId: null,
        requestedAction,
        selectedAction: 'none',
        executed: false,
        reason: 'invalid-homey-device-id',
      };
    }

    const queue = await this.getRecommendationActionQueue({
      homeyDeviceId: normalizedHomeyDeviceId,
      includeNoAction: true,
    });
    const item = queue.items.find((entry) => entry.homeyDeviceId === normalizedHomeyDeviceId);
    if (!item) {
      return {
        homeyDeviceId: normalizedHomeyDeviceId,
        requestedAction,
        selectedAction: 'none',
        executed: false,
        reason: 'node-not-found',
      };
    }

    if (requestedAction !== 'auto' && requestedAction !== item.action) {
      return {
        homeyDeviceId: normalizedHomeyDeviceId,
        requestedAction,
        selectedAction: item.action,
        executed: false,
        reason: 'action-mismatch',
        latestReason: item.reason,
      };
    }

    if (item.action === 'none') {
      return {
        homeyDeviceId: normalizedHomeyDeviceId,
        requestedAction,
        selectedAction: 'none',
        executed: false,
        reason: item.reason,
        latestReason: item.reason,
      };
    }

    const resolveFailedExecution = async (
      attemptedAction: RecommendationActionKindV1,
      executionReason: string,
      createdEntry?: boolean,
    ): Promise<RecommendationActionExecutionResultV1> => {
      const latestQueue = await this.getRecommendationActionQueue({
        homeyDeviceId: normalizedHomeyDeviceId,
        includeNoAction: true,
      });
      const latestItem = latestQueue.items.find(
        (entry) => entry.homeyDeviceId === normalizedHomeyDeviceId,
      );
      if (!latestItem) {
        return {
          homeyDeviceId: normalizedHomeyDeviceId,
          requestedAction,
          selectedAction: attemptedAction,
          executed: false,
          reason: executionReason,
          createdEntry,
        };
      }

      const stateChanged = latestItem.action !== attemptedAction;
      return {
        homeyDeviceId: normalizedHomeyDeviceId,
        requestedAction,
        selectedAction: stateChanged ? latestItem.action : attemptedAction,
        executed: false,
        reason: stateChanged ? 'action-state-changed' : executionReason,
        createdEntry,
        latestReason: latestItem.reason,
        stateChanged,
      };
    };

    if (item.action === 'backfill-marker') {
      const result = await this.backfillCurationBaselineMarker(normalizedHomeyDeviceId);
      if (!result.updated) {
        return resolveFailedExecution('backfill-marker', result.reason, result.createdEntry);
      }
      return {
        homeyDeviceId: normalizedHomeyDeviceId,
        requestedAction,
        selectedAction: 'backfill-marker',
        executed: true,
        reason: result.reason,
        createdEntry: result.createdEntry,
      };
    }

    const result = await this.adoptRecommendedBaseline(normalizedHomeyDeviceId);
    if (!result.adopted) {
      return resolveFailedExecution('adopt-recommended-baseline', result.reason);
    }
    return {
      homeyDeviceId: normalizedHomeyDeviceId,
      requestedAction,
      selectedAction: 'adopt-recommended-baseline',
      executed: true,
      reason: result.reason,
    };
  }

  async executeRecommendationActions(options?: {
    homeyDeviceId?: string;
    bridgeId?: string;
    includeNoAction?: boolean;
  }): Promise<{
    total: number;
    executed: number;
    skipped: number;
    results: RecommendationActionExecutionResultV1[];
  }> {
    const queue = await this.getRecommendationActionQueue({
      homeyDeviceId: options?.homeyDeviceId,
      bridgeId: options?.bridgeId,
      includeNoAction: true,
    });
    const includeNoAction = options?.includeNoAction === true;
    const results: RecommendationActionExecutionResultV1[] = [];

    for (const item of queue.items) {
      if (!includeNoAction && item.action === 'none') continue;

      if (item.homeyDeviceId) {
        const executionResult = await this.executeRecommendationAction({
          homeyDeviceId: item.homeyDeviceId,
          action: item.action,
        });
        results.push(executionResult);
        continue;
      }

      results.push({
        homeyDeviceId: item.homeyDeviceId,
        requestedAction: 'none',
        selectedAction: item.action,
        executed: false,
        reason: item.reason,
      });
    }

    const executed = results.filter((entry) => entry.executed).length;
    return {
      total: results.length,
      executed,
      skipped: results.length - executed,
      results,
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

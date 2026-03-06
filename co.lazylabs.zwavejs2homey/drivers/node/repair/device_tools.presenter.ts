interface DeviceToolsPresenterRoot {
  Zwjs2HomeyUi?: {
    deviceToolsPresenter?: DeviceToolsPresenter;
  };
}

type StatusTone = 'neutral' | 'ok' | 'warn' | 'error';

interface KvRow {
  key: string;
  value: string;
  valueClass?: string;
}

interface RecommendationContent {
  badgeLabel: string;
  badgeTone: 'ok' | 'warn' | 'danger';
  reasonText: string;
  detailText: string;
}

interface DeviceToolsViewModel {
  loading: boolean;
  actionInFlight: boolean;
  error: string | null;
  statusTone: StatusTone;
  statusLine: string;
  subtitle: string;
  zwjsNodeRows: KvRow[];
  adapterRows: KvRow[];
  recommendation: RecommendationContent;
  profileRefRows: KvRow[];
  mappingSkipRows: KvRow[];
  runtimeContextRows: KvRow[];
  curationRows: KvRow[];
  decisionRows: KvRow[];
  latestActionRows: KvRow[];
  backfillDisabled: boolean;
  adoptDisabled: boolean;
  actionHint: string;
}

interface DeviceToolsState {
  loading: boolean;
  actionInFlight: boolean;
  snapshot: any | null;
  latestActionResult: any | null;
  error: string | null;
  statusMessage: string | null;
  statusTone: StatusTone;
}

type DeviceToolsEvent =
  | { type: 'load_start' }
  | { type: 'load_success'; snapshot: any }
  | { type: 'load_error'; message: string }
  | { type: 'action_start' }
  | {
      type: 'action_success';
      snapshot: any;
      actionResult: any;
      summary: { message: string; tone: StatusTone };
    }
  | { type: 'action_error'; message: string };

interface DeviceToolsPresenter {
  createInitialState: () => DeviceToolsState;
  reduce: (state: DeviceToolsState, event: DeviceToolsEvent) => DeviceToolsState;
  buildViewModel: (state: DeviceToolsState) => DeviceToolsViewModel;
  describeActionResult: (actionResult: any, snapshot: any) => { message: string; tone: StatusTone };
}

const recommendationReasonFallbackLabels: Record<string, string> = {
  'baseline-hash-changed': 'Compiled profile changed for this device.',
  'marker-missing-backfill': 'Profile reference metadata is missing for this curated device.',
  'baseline-hash-unchanged': 'Current curated profile still matches the compiled baseline.',
  'profile-resolution-not-ready': 'Runtime mapping has not been generated for this device yet.',
  'no-curation-entry': 'No curation exists yet for this device.',
  'missing-homey-device-id': 'Device identifier is unavailable in runtime diagnostics.',
  none: 'No recommendation is available.',
};

const actionReasonLabels: Record<string, string> = {
  'action-mismatch': 'That action is no longer applicable for this device. Refresh and retry.',
  'action-state-changed':
    'Recommendation state changed while this action was running. Review latest state and retry if needed.',
  'invalid-action-selection': 'Invalid action selection.',
  'invalid-homey-device-id': 'This device ID is invalid.',
  'node-not-found': 'The device could not be found.',
  'recommendation-unavailable': 'No recommendation is available for this device.',
  'marker-backfill-required':
    'Profile reference metadata must be backfilled before adopting this update.',
  'baseline-marker-unavailable':
    'Unable to resolve current profile reference metadata for this device.',
  'curation-entry-missing':
    'No curation entry exists for this device, so there is nothing to adopt.',
  'baseline-hash-unchanged': 'No update is needed. Device profile is already aligned.',
  'no-curation-entry': 'No curation entry exists for this device.',
  'profile-resolution-not-ready': 'Runtime mapping is not ready yet for this device.',
  'missing-homey-device-id': 'Device identifier is unavailable in runtime diagnostics.',
  none: 'No action was required.',
};

function formatIso(ts: unknown): string {
  if (!ts) return 'n/a';
  const date = new Date(String(ts));
  if (Number.isNaN(date.getTime())) return String(ts);
  return date.toLocaleString();
}

function formatIsoOrNull(ts: unknown): string | null {
  if (!ts) return null;
  const date = new Date(String(ts));
  if (Number.isNaN(date.getTime())) return String(ts);
  return date.toLocaleString();
}

function toSafeText(value: unknown): string {
  if (value === null || typeof value === 'undefined' || value === '') return 'n/a';
  return String(value);
}

function recommendationReasonLabel(reasonCode: unknown, reasonLabel: unknown): string | null {
  if (typeof reasonLabel === 'string' && reasonLabel.trim().length > 0) {
    return reasonLabel.trim();
  }
  if (!reasonCode) return null;
  const normalized = String(reasonCode);
  return recommendationReasonFallbackLabels[normalized] || normalized;
}

function toReasonDetail(code: unknown, labels: Record<string, string>): string {
  if (!code) return 'n/a';
  const normalized = String(code);
  const label = labels[normalized];
  if (!label || label === normalized) return normalized;
  return `${label} (${normalized})`;
}

function toRecommendationReasonDetail(reasonCode: unknown, reasonLabel: unknown): string {
  if (!reasonCode) return 'n/a';
  const normalized = String(reasonCode);
  const label = recommendationReasonLabel(normalized, reasonLabel);
  if (!label || label === normalized) return normalized;
  return `${label} (${normalized})`;
}

function buildNodeStatusSummary(nodeState: any): string {
  const parts: string[] = [];
  if (typeof nodeState?.isFailed === 'boolean') {
    parts.push(nodeState.isFailed ? 'Failed' : 'Healthy');
  }
  if (typeof nodeState?.ready === 'boolean') {
    parts.push(nodeState.ready ? 'Ready' : 'Not Ready');
  }
  if (typeof nodeState?.interviewStage === 'string' && nodeState.interviewStage.trim()) {
    parts.push(`Interview: ${nodeState.interviewStage.trim()}`);
  }
  if (typeof nodeState?.status === 'string' && nodeState.status.trim()) {
    parts.push(`State: ${nodeState.status.trim()}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'n/a';
}

function describeConfidence(confidence: unknown): string {
  const normalized = typeof confidence === 'string' ? confidence.trim().toLowerCase() : '';
  if (normalized === 'curated') return 'Project rule match';
  if (normalized === 'ha-derived') return 'Home Assistant-derived rule match';
  if (normalized === 'generic') return 'Generic fallback rule';
  if (normalized.length > 0) return normalized;
  return 'n/a';
}

function describeProfileSourceCode(sourceCode: unknown, curationEntryPresent: boolean): string {
  if (sourceCode === 'compiled+curation-override') return 'Compiled profile + device override';
  if (sourceCode === 'compiled-only') return 'Compiled profile only';
  if (curationEntryPresent) return 'Compiled profile + device override';
  return 'Compiled profile only (no device override)';
}

function describeInferencePolicy(profile: any, profileAttribution: any): string {
  const fallbackReason =
    profile && typeof profile.fallbackReason === 'string'
      ? profile.fallbackReason.trim().toLowerCase()
      : '';
  const profileId =
    profile && typeof profile.profileId === 'string' ? profile.profileId.trim() : '';
  const sourceCode =
    profileAttribution && typeof profileAttribution.sourceCode === 'string'
      ? profileAttribution.sourceCode.trim().toLowerCase()
      : '';
  const sourceLabel =
    profileAttribution && typeof profileAttribution.sourceLabel === 'string'
      ? profileAttribution.sourceLabel.trim().toLowerCase()
      : '';
  const curationEntryPresent =
    profileAttribution && typeof profileAttribution.curationEntryPresent === 'boolean'
      ? profileAttribution.curationEntryPresent
      : null;
  const hasResolvedProfileSignal = profileId.length > 0 || fallbackReason.length > 0;
  const effectiveSourceCode =
    sourceCode.length > 0
      ? sourceCode
      : sourceLabel.includes('compiled profile + device override')
        ? 'compiled+curation-override'
        : sourceLabel.includes('compiled profile only')
          ? 'compiled-only'
          : hasResolvedProfileSignal
            ? curationEntryPresent === true
              ? 'compiled+curation-override'
              : 'compiled-only'
            : '';

  if (fallbackReason === 'no_compiled_profile_match') {
    return 'Compiled-only policy: no profile match; safe fallback (class other, no mappings).';
  }
  if (fallbackReason === 'compiled_profile_artifact_unavailable') {
    return 'Compiled-only policy: artifact unavailable; safe fallback (class other, no mappings).';
  }
  if (effectiveSourceCode === 'compiled+curation-override') {
    return 'Compiled-only policy: resolved from compiled profile, then device override applied.';
  }
  if (effectiveSourceCode === 'compiled-only') {
    return 'Compiled-only policy: resolved from compiled profile; no runtime generic inference.';
  }
  return 'Compiled-only policy: profile resolution pending.';
}

function isMissingValue(value: unknown): boolean {
  if (value === null || typeof value === 'undefined') return true;
  if (typeof value === 'string' && value.trim().length === 0) return true;
  return false;
}

function buildProductTriple(nodeState: any): string | null {
  const parts = [nodeState?.manufacturerId, nodeState?.productType, nodeState?.productId];
  if (parts.every((value) => isMissingValue(value))) return null;
  return parts.map((value) => (isMissingValue(value) ? 'n/a' : String(value))).join(':');
}

function formatBooleanFlag(value: unknown): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'n/a';
}

function mappingSkipReasonRows(skipReasons: unknown): Array<[string, unknown, string?]> {
  if (!skipReasons || typeof skipReasons !== 'object') {
    return [['Skip Reasons', 'None']];
  }
  const entries = Object.entries(skipReasons as Record<string, unknown>)
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .sort((left, right) => (right[1] as number) - (left[1] as number));
  if (entries.length === 0) {
    return [['Skip Reasons', 'None']];
  }
  return entries.map(([reason, count]) => [reason, count, 'mono']);
}

function toNonNegativeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value > 0 ? Math.trunc(value) : 0;
}

function buildCurationStatusSummary(curation: any): { status: string; summary: string } {
  const loaded = curation && curation.loaded === true;
  const applied = toNonNegativeCount(curation && curation.appliedActions);
  const skipped = toNonNegativeCount(curation && curation.skippedActions);
  const errors = toNonNegativeCount(curation && curation.errorCount);
  const hasEntry = curation && curation.entryPresent === true;
  if (!loaded) {
    return {
      status: 'Unavailable',
      summary: 'Curation runtime is unavailable.',
    };
  }
  if (errors > 0) {
    return {
      status: 'Error',
      summary: `${errors} error(s), ${applied} applied, ${skipped} skipped.`,
    };
  }
  if (applied > 0) {
    return {
      status: 'Applied',
      summary: `${applied} action(s) applied, ${skipped} skipped.`,
    };
  }
  if (skipped > 0) {
    return {
      status: 'Skipped',
      summary: `${skipped} action(s) skipped, no applied actions.`,
    };
  }
  if (hasEntry) {
    return {
      status: 'No Change',
      summary: 'Device override exists but produced no changes in this sync.',
    };
  }
  return {
    status: 'No Override',
    summary: 'Compiled profile is active without a device-specific override.',
  };
}

function buildNodeSnapshotWarnings(snapshot: any): string[] {
  const warnings: string[] = [];
  if (!snapshot || !snapshot.runtime || !snapshot.runtime.zwjs) {
    warnings.push('Runtime diagnostics are incomplete.');
    return warnings;
  }
  if (snapshot.runtime.zwjs.available !== true) {
    warnings.push('Bridge connection is not configured.');
    return warnings;
  }
  if (snapshot.runtime.zwjs.transportConnected !== true) {
    warnings.push('Bridge transport is disconnected.');
  }
  if (!snapshot.runtime.compiledProfiles || snapshot.runtime.compiledProfiles.loaded !== true) {
    warnings.push('Compiled profiles are unavailable.');
  }
  if (!snapshot.runtime.curation || snapshot.runtime.curation.loaded !== true) {
    warnings.push('Curation runtime is unavailable.');
  }
  if (snapshot.recommendation && snapshot.recommendation.actionable === true) {
    warnings.push('Device has a pending recommendation.');
  }
  return warnings;
}

function toKvRows(
  rows: Array<[string, unknown, string?]>,
  options?: { omitEmpty?: boolean },
): KvRow[] {
  const omitEmpty = options && options.omitEmpty === true;
  const normalizedRows = omitEmpty ? rows.filter((row) => !isMissingValue(row[1])) : rows;
  if (normalizedRows.length === 0) {
    return [{ key: 'Details', value: 'No data available.' }];
  }
  return normalizedRows.map((row) => ({
    key: row[0],
    value: toSafeText(row[1]),
    valueClass: row[2] ? row[2] : undefined,
  }));
}

function recommendationBadge(snapshot: any): { label: string; tone: 'ok' | 'warn' | 'danger' } {
  if (!snapshot?.recommendation?.actionable) {
    return { label: 'No Action Needed', tone: 'ok' };
  }
  if (snapshot.recommendation.suggestedAction === 'backfill-marker') {
    return { label: 'Profile Reference Missing', tone: 'warn' };
  }
  return { label: 'Profile Update Available', tone: 'danger' };
}

(function attachDeviceToolsPresenter(
  root: DeviceToolsPresenterRoot | undefined,
  factory: () => DeviceToolsPresenter,
) {
  const presenter = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = presenter;
  }
  const nextRoot = root || {};
  nextRoot.Zwjs2HomeyUi = nextRoot.Zwjs2HomeyUi || {};
  nextRoot.Zwjs2HomeyUi.deviceToolsPresenter = presenter;
})(
  typeof window !== 'undefined'
    ? (window as unknown as DeviceToolsPresenterRoot)
    : typeof global !== 'undefined'
      ? (global as unknown as DeviceToolsPresenterRoot)
      : ({} as DeviceToolsPresenterRoot),
  function createDeviceToolsPresenter(): DeviceToolsPresenter {
    function createInitialState(): DeviceToolsState {
      return {
        loading: false,
        actionInFlight: false,
        snapshot: null,
        latestActionResult: null,
        error: null,
        statusMessage: null,
        statusTone: 'neutral',
      };
    }

    function reduce(state: DeviceToolsState, event: DeviceToolsEvent): DeviceToolsState {
      if (!event || typeof event !== 'object') return state;
      if (event.type === 'load_start') {
        return {
          ...state,
          loading: true,
          error: null,
          statusMessage: null,
          statusTone: 'neutral',
        };
      }
      if (event.type === 'load_success') {
        const warnings = buildNodeSnapshotWarnings(event.snapshot);
        return {
          ...state,
          loading: false,
          snapshot: event.snapshot,
          error: null,
          statusMessage:
            warnings.length > 0
              ? warnings[0]
              : `Last updated ${formatIso(event.snapshot?.generatedAt)}`,
          statusTone: warnings.length > 0 ? 'warn' : 'ok',
        };
      }
      if (event.type === 'load_error') {
        return {
          ...state,
          loading: false,
          error: event.message || 'Failed to load snapshot.',
          statusMessage: null,
          statusTone: 'error',
        };
      }
      if (event.type === 'action_start') {
        return {
          ...state,
          actionInFlight: true,
          error: null,
          statusMessage: 'Applying action...',
          statusTone: 'neutral',
        };
      }
      if (event.type === 'action_success') {
        return {
          ...state,
          actionInFlight: false,
          snapshot: event.snapshot,
          latestActionResult: event.actionResult,
          statusMessage: event.summary.message,
          statusTone: event.summary.tone,
          error: null,
        };
      }
      if (event.type === 'action_error') {
        return {
          ...state,
          actionInFlight: false,
          error: event.message || 'Action failed.',
          statusMessage: null,
          statusTone: 'error',
        };
      }
      return state;
    }

    function describeActionResult(
      actionResult: any,
      snapshot: any,
    ): { message: string; tone: StatusTone } {
      if (!actionResult || typeof actionResult !== 'object') {
        return { message: 'Action completed.', tone: 'ok' };
      }
      if (actionResult.executed === true) {
        if (actionResult.selectedAction === 'backfill-marker') {
          return {
            message: 'Backfill completed. Profile Reference metadata has been updated.',
            tone: 'ok',
          };
        }
        if (actionResult.selectedAction === 'adopt-recommended-baseline') {
          return {
            message: 'Profile update adopted for this device.',
            tone: 'ok',
          };
        }
        return { message: 'Action completed.', tone: 'ok' };
      }
      const reason =
        actionResult.reason && typeof actionResult.reason === 'string'
          ? actionResult.reason
          : 'action-not-executed';
      if (reason === 'action-state-changed') {
        const latestReasonCode =
          actionResult.latestReason && typeof actionResult.latestReason === 'string'
            ? actionResult.latestReason
            : null;
        if (latestReasonCode) {
          const snapshotReasonLabel =
            snapshot &&
            snapshot.recommendation &&
            snapshot.recommendation.reason === latestReasonCode
              ? snapshot.recommendation.reasonLabel
              : null;
          const latestReasonLabel = recommendationReasonLabel(
            latestReasonCode,
            snapshotReasonLabel,
          );
          const latestReasonSummary =
            actionReasonLabels[latestReasonCode] || latestReasonLabel || latestReasonCode;
          return {
            message: `Action state changed while applying update. Latest state: ${latestReasonSummary}`,
            tone: 'warn',
          };
        }
      }
      return {
        message: actionReasonLabels[reason] || `Action not executed: ${reason}`,
        tone: 'warn',
      };
    }

    function buildViewModel(state: DeviceToolsState): DeviceToolsViewModel {
      if (!state.snapshot) {
        return {
          loading: state.loading,
          actionInFlight: state.actionInFlight,
          error: state.error,
          statusTone: state.statusTone,
          statusLine: state.statusMessage || (state.loading ? 'Loading snapshot...' : 'Idle'),
          subtitle: state.loading ? 'Loading device context...' : 'No device data available.',
          zwjsNodeRows: [],
          adapterRows: [],
          recommendation: {
            badgeLabel: 'No Action Needed',
            badgeTone: 'ok',
            reasonText: 'No recommendation data available.',
            detailText:
              'Rule match indicates which rule tier classified this node. Profile source shows compiled-only vs device-override resolution.',
          },
          profileRefRows: [],
          mappingSkipRows: [],
          runtimeContextRows: [],
          curationRows: [],
          decisionRows: [],
          latestActionRows: [],
          backfillDisabled: true,
          adoptDisabled: true,
          actionHint: 'No action context available.',
        };
      }

      const snapshot = state.snapshot;
      const isBusy = state.loading || state.actionInFlight;
      const canBackfill =
        snapshot.recommendation.actionable &&
        snapshot.recommendation.suggestedAction === 'backfill-marker';
      const canAdopt =
        snapshot.recommendation.actionable &&
        snapshot.recommendation.suggestedAction === 'adopt-recommended-baseline';
      const runtimeZwjs = snapshot.runtime && snapshot.runtime.zwjs ? snapshot.runtime.zwjs : {};
      const nodeState = snapshot.node || {};
      const productTriple = buildProductTriple(nodeState);
      const zwjsConnection = `${toSafeText(runtimeZwjs.lifecycle)} / ${
        runtimeZwjs.transportConnected === true ? 'connected' : 'disconnected'
      }`;
      const nodeStatus = buildNodeStatusSummary(nodeState);
      const profileAttribution =
        snapshot.profileAttribution && typeof snapshot.profileAttribution === 'object'
          ? snapshot.profileAttribution
          : null;
      const confidenceSummary = profileAttribution
        ? toSafeText(profileAttribution.confidenceLabel)
        : describeConfidence(snapshot.profile.confidence);
      const profileSourceSummary = profileAttribution
        ? toSafeText(profileAttribution.sourceLabel)
        : describeProfileSourceCode(
            snapshot.profile && snapshot.profile.sourceCode,
            snapshot.curation && snapshot.curation.entryPresent === true,
          );
      const inferencePolicySummary = describeInferencePolicy(snapshot.profile, profileAttribution);
      const curationStatusSummary = buildCurationStatusSummary(snapshot.curation);
      const overrideSummary = profileAttribution
        ? profileAttribution.curationEntryPresent === true
          ? 'Present'
          : 'None'
        : snapshot.curation && snapshot.curation.entryPresent === true
          ? 'Present'
          : 'None';
      const deviceLabel =
        snapshot.device.nodeId !== null ? `Node ${snapshot.device.nodeId}` : 'Node';
      const recommendationBadgeView = recommendationBadge(snapshot);

      const latestActionRows =
        state.latestActionResult && typeof state.latestActionResult === 'object'
          ? (() => {
              const result = state.latestActionResult;
              const latestReasonLabel =
                result.latestReason &&
                snapshot.recommendation &&
                snapshot.recommendation.reason === result.latestReason
                  ? snapshot.recommendation.reasonLabel
                  : null;
              return toKvRows([
                ['Executed', result.executed === true ? 'Yes' : 'No'],
                ['Requested Action', result.requestedAction],
                ['Selected Action', result.selectedAction],
                ['Reason', toReasonDetail(result.reason, actionReasonLabels)],
                [
                  'Latest State',
                  toRecommendationReasonDetail(result.latestReason, latestReasonLabel),
                ],
                ['State Changed', result.stateChanged === true ? 'Yes' : 'No'],
              ]);
            })()
          : toKvRows([['Latest Action', 'No action executed in this session yet.']]);

      let actionHint =
        'No action is required right now. This device is already aligned with its profile state.';
      if (canBackfill) {
        actionHint = 'Profile reference metadata is missing. You can backfill marker metadata now.';
      } else if (canAdopt) {
        actionHint = 'A compiled profile update is available. You can adopt it for this device.';
      }

      const statusLine = state.statusMessage
        ? state.statusMessage
        : state.loading
          ? 'Refreshing device snapshot...'
          : state.actionInFlight
            ? 'Applying action...'
            : `Last updated ${formatIso(snapshot.generatedAt)}`;

      return {
        loading: state.loading,
        actionInFlight: state.actionInFlight,
        error: state.error,
        statusTone: state.statusTone,
        statusLine,
        subtitle: `${deviceLabel} · ${snapshot.device.homeyDeviceId}`,
        zwjsNodeRows: toKvRows(
          [
            ['Manufacturer', nodeState.manufacturer],
            ['Product', nodeState.product],
            ['Product Triple', productTriple, 'mono'],
            ['Location', nodeState.location],
            ['Firmware', nodeState.firmwareVersion],
            ['Ready', formatBooleanFlag(nodeState.ready)],
            ['Failed', formatBooleanFlag(nodeState.isFailed)],
            ['Node Status', nodeStatus],
            ['ZWJS', zwjsConnection],
            ['ZWJS Server', runtimeZwjs.serverVersion],
          ],
          { omitEmpty: true },
        ),
        adapterRows: toKvRows(
          [
            ['Device Class', snapshot.profile.homeyClass],
            ['Rule Match', confidenceSummary],
            ['Profile Source', profileSourceSummary],
            ['Inference Policy', inferencePolicySummary],
            ['Device Override', overrideSummary],
            ['Curation Status', curationStatusSummary.status],
            ['Curation Summary', curationStatusSummary.summary],
            ['Curation Entry', snapshot.curation.entryPresent ? 'Present' : 'Missing'],
            ['Curation Source', snapshot.curation.source],
            ['Profile ID', snapshot.profile.profileId, 'mono'],
            [
              'Match',
              `${toSafeText(snapshot.profile.matchBy)} / ${toSafeText(snapshot.profile.matchKey)}`,
            ],
            ['Profile Fallback', snapshot.profile.fallbackReason],
            ['Uncurated', formatBooleanFlag(snapshot.profile.uncurated)],
            ['Mapped Capabilities', snapshot.mapping.capabilityCount],
            ['Vertical Slice', formatBooleanFlag(snapshot.mapping.verticalSliceApplied)],
            [
              'Inbound Mapping',
              `${snapshot.mapping.inboundEnabled}/${snapshot.mapping.inboundConfigured} enabled (${snapshot.mapping.inboundSkipped} skipped)`,
            ],
            [
              'Outbound Mapping',
              `${snapshot.mapping.outboundEnabled}/${snapshot.mapping.outboundConfigured} enabled (${snapshot.mapping.outboundSkipped} skipped)`,
            ],
          ],
          { omitEmpty: true },
        ),
        recommendation: {
          badgeLabel: recommendationBadgeView.label,
          badgeTone: recommendationBadgeView.tone,
          reasonText:
            recommendationReasonLabel(
              snapshot.recommendation.reason,
              snapshot.recommendation.reasonLabel,
            ) || 'No recommendation data available.',
          detailText:
            'Rule match indicates which rule tier classified this node. Profile source shows compiled-only vs device-override resolution.',
        },
        profileRefRows: toKvRows(
          [
            ['Projection', snapshot.profileReference.projectionVersion],
            ['Current Hash', snapshot.profileReference.currentBaselineHash, 'mono'],
            ['Stored Hash', snapshot.profileReference.storedBaselineHash, 'mono'],
            ['Current Fingerprint', snapshot.profileReference.currentPipelineFingerprint, 'mono'],
            ['Stored Fingerprint', snapshot.profileReference.storedPipelineFingerprint, 'mono'],
          ],
          { omitEmpty: true },
        ),
        mappingSkipRows: toKvRows(mappingSkipReasonRows(snapshot.mapping.skipReasons), {
          omitEmpty: false,
        }),
        runtimeContextRows: toKvRows(
          [
            ['Sync Reason', snapshot.sync ? snapshot.sync.syncReason : null],
            ['Profile Synced At', formatIsoOrNull(snapshot.sync ? snapshot.sync.syncedAt : null)],
            ['Runtime Generated At', formatIsoOrNull(snapshot.generatedAt)],
            ['ZWJS Last Message', formatIsoOrNull(runtimeZwjs.lastMessageAt)],
            ['ZWJS Connected At', formatIsoOrNull(runtimeZwjs.connectedAt)],
            ['Curation Error', snapshot.curation.error],
          ],
          { omitEmpty: true },
        ),
        curationRows: toKvRows(
          [
            ['Loaded', formatBooleanFlag(snapshot.curation.loaded)],
            ['Entry Present', formatBooleanFlag(snapshot.curation.entryPresent)],
            ['Applied Actions', snapshot.curation.appliedActions],
            ['Skipped Actions', snapshot.curation.skippedActions],
            ['Error Count', snapshot.curation.errorCount],
            ['Source', snapshot.curation.source],
            ['Error', snapshot.curation.error],
          ],
          { omitEmpty: false },
        ),
        decisionRows: toKvRows(
          [
            [
              'Reason',
              toRecommendationReasonDetail(
                snapshot.recommendation.reason,
                snapshot.recommendation.reasonLabel,
              ),
            ],
            ['Reason Code', snapshot.recommendation.reason, 'mono'],
            ['Suggested Action', snapshot.recommendation.suggestedAction],
            ['Actionable', snapshot.recommendation.actionable ? 'Yes' : 'No'],
            ['Fallback Reason', snapshot.profile.fallbackReason],
            ['Product Triple', productTriple, 'mono'],
            ['Rule Profile ID', snapshot.profile.profileId, 'mono'],
            [
              'Rule Match',
              `${toSafeText(snapshot.profile.matchBy)} / ${toSafeText(snapshot.profile.matchKey)}`,
            ],
            ['Rule Source', profileSourceSummary],
          ],
          { omitEmpty: true },
        ),
        latestActionRows,
        backfillDisabled: isBusy || !canBackfill,
        adoptDisabled: isBusy || !canAdopt,
        actionHint,
      };
    }

    return {
      createInitialState,
      reduce,
      buildViewModel,
      describeActionResult,
    };
  },
);

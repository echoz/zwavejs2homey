interface ConnectionPill {
  label: string;
  tone: 'ok' | 'warn' | 'error';
}

interface RecommendationViewModel {
  label: string;
  tone: 'ok' | 'warn' | 'danger';
  reason: string;
}

interface ImportedRow {
  nodeId: string;
  name: string;
  bridgeId: string;
  manufacturer: string;
  product: string;
  location: string;
  status: string;
  profileClass: string;
  profileId: string;
  profileMatch: string;
  profileSource: string;
  ruleMatch: string;
  fallbackReason: string;
  recommendation: RecommendationViewModel;
}

interface ImportStatusRecord {
  bridgeId?: unknown;
  importedNodes?: unknown;
  pendingImportNodes?: unknown;
  discoveredNodes?: unknown;
  generatedAt?: unknown;
  warnings?: unknown;
  importedNodeDetails?: unknown;
  zwjs?: {
    available?: unknown;
    transportConnected?: unknown;
    lifecycle?: unknown;
    serverVersion?: unknown;
    adapterFamily?: unknown;
    reconnectAttempt?: unknown;
    versionReceived?: unknown;
    initialized?: unknown;
    listening?: unknown;
    authenticated?: unknown;
    connectedAt?: unknown;
    lastMessageAt?: unknown;
  };
  actionNeededNodes?: unknown;
  backfillNeededNodes?: unknown;
  compiledOnlyNodes?: unknown;
  overrideNodes?: unknown;
  unresolvedNodes?: unknown;
  confidenceCuratedNodes?: unknown;
  confidenceHaDerivedNodes?: unknown;
  confidenceGenericNodes?: unknown;
  confidenceUnknownNodes?: unknown;
}

interface StatusRow {
  key: string;
  value: string | ConnectionPill;
  kind: 'text' | 'pill';
}

interface PresenterState {
  loading: boolean;
  status: ImportStatusRecord | null;
  error: string | null;
}

type PresenterEvent =
  | { type: 'load_start' }
  | { type: 'load_success'; status?: ImportStatusRecord | null }
  | { type: 'load_error'; message?: string }
  | { type: string; [key: string]: unknown };

interface PresenterViewModel {
  refreshDisabled: boolean;
  statusRows: StatusRow[];
  warnings: string[];
  guidanceTitle: string;
  guidanceSteps: string[];
  importedRows: ImportedRow[];
  importedMeta: string;
  importedEmpty: string;
  hasImportedRows: boolean;
  statusLine: string;
}

interface ImportSummaryPresenter {
  createInitialState: () => PresenterState;
  reduce: (state: PresenterState, event: PresenterEvent) => PresenterState;
  buildViewModel: (state: PresenterState) => PresenterViewModel;
}

interface UiRoot {
  Zwjs2HomeyUi?: {
    importSummaryPresenter?: ImportSummaryPresenter;
  };
}

(function attachImportSummaryPresenter(
  root: UiRoot | undefined,
  factory: () => ImportSummaryPresenter,
) {
  const presenter = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = presenter;
  }
  const nextRoot = root || {};
  nextRoot.Zwjs2HomeyUi = nextRoot.Zwjs2HomeyUi || {};
  nextRoot.Zwjs2HomeyUi.importSummaryPresenter = presenter;
})(
  typeof window !== 'undefined'
    ? (window as unknown as UiRoot)
    : typeof global !== 'undefined'
      ? (global as unknown as UiRoot)
      : ({} as UiRoot),
  function createPresenter() {
    function asText(value: unknown): string {
      if (value === null || typeof value === 'undefined' || value === '') return 'n/a';
      return String(value);
    }

    function toTimeText(value: unknown): string {
      if (!value) return 'n/a';
      const parsed = new Date(String(value));
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleString();
    }

    function connectionPill(status: ImportStatusRecord | null): ConnectionPill {
      if (!status || !status.zwjs || status.zwjs.available !== true) {
        return { label: 'Unavailable', tone: 'error' };
      }
      if (status.zwjs.transportConnected === true) {
        return { label: 'Connected', tone: 'ok' };
      }
      return { label: 'Disconnected', tone: 'warn' };
    }

    function importStatusLabel(status: ImportStatusRecord | null): string {
      if (!status || !status.zwjs || status.zwjs.available !== true) {
        return 'Bridge Not Configured';
      }
      if (status.zwjs.transportConnected !== true) {
        return 'Bridge Disconnected';
      }
      if (typeof status.pendingImportNodes === 'number' && status.pendingImportNodes > 0) {
        return `Ready to Import (${status.pendingImportNodes} pending)`;
      }
      if (typeof status.importedNodes === 'number' && status.importedNodes > 0) {
        return 'Imported and Up to Date';
      }
      if (status.discoveredNodes === 0) {
        return 'No Discoverable Nodes';
      }
      return 'Status Unknown';
    }

    function recommendationTone(action: unknown): RecommendationViewModel['tone'] {
      if (action === 'backfill-marker') return 'warn';
      if (action === 'adopt-recommended-baseline') return 'danger';
      return 'ok';
    }

    function recommendationLabel(action: unknown): string {
      if (action === 'backfill-marker') return 'Backfill Marker';
      if (action === 'adopt-recommended-baseline') return 'Adopt Update';
      return 'No Action';
    }

    function toImportedRows(status: ImportStatusRecord | null): ImportedRow[] {
      const entries = Array.isArray(status?.importedNodeDetails)
        ? (status.importedNodeDetails as ReadonlyArray<Record<string, unknown>>)
        : [];
      return entries.map((entry) => ({
        nodeId: asText(entry.nodeId),
        name: asText(entry.name),
        bridgeId: asText(entry.bridgeId),
        manufacturer: asText(entry.manufacturer),
        product: asText(entry.product),
        location: asText(entry.location),
        status: asText(entry.status),
        profileClass: asText(entry.profileHomeyClass),
        profileId: asText(entry.profileId),
        profileMatch: asText(entry.profileMatch),
        profileSource: asText(entry.profileSource),
        ruleMatch: asText(entry.ruleMatch),
        fallbackReason: asText(entry.fallbackReason),
        recommendation: {
          label: recommendationLabel(entry.recommendationAction),
          tone: recommendationTone(entry.recommendationAction),
          reason: asText(entry.recommendationReason),
        },
      }));
    }

    function createInitialState(): PresenterState {
      return {
        loading: false,
        status: null,
        error: null,
      };
    }

    function toErrorMessage(value: unknown): string {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
      return 'Failed to load status.';
    }

    function reduce(state: PresenterState, event: PresenterEvent): PresenterState {
      if (!event || typeof event !== 'object') return state;
      if (event.type === 'load_start') {
        return {
          loading: true,
          status: state.status,
          error: null,
        };
      }
      if (event.type === 'load_success') {
        return {
          loading: false,
          status: event.status || null,
          error: null,
        };
      }
      if (event.type === 'load_error') {
        return {
          loading: false,
          status: null,
          error: toErrorMessage(event.message),
        };
      }
      return state;
    }

    function buildViewModel(state: PresenterState): PresenterViewModel {
      const fallbackStatusLine = state.loading
        ? 'Loading status...'
        : state.error || 'Status unavailable.';
      if (!state.status) {
        return {
          refreshDisabled: state.loading,
          statusRows: [],
          warnings: [],
          guidanceTitle: 'Waiting for import status',
          guidanceSteps: ['Use Refresh Status to retry once runtime diagnostics are available.'],
          importedRows: [],
          importedMeta: 'Waiting for import summary…',
          importedEmpty: 'No nodes imported yet for this bridge.',
          hasImportedRows: false,
          statusLine: fallbackStatusLine,
        };
      }

      const status = state.status as ImportStatusRecord;
      const importedRows = toImportedRows(status);
      const warnings = Array.isArray(status.warnings)
        ? status.warnings.map((item) => asText(item))
        : [];
      const importedCount =
        typeof status.importedNodes === 'number' && status.importedNodes >= 0
          ? status.importedNodes
          : importedRows.length;
      const pendingCount =
        typeof status.pendingImportNodes === 'number' && status.pendingImportNodes >= 0
          ? status.pendingImportNodes
          : null;
      const actionNeededCount =
        typeof status.actionNeededNodes === 'number' && status.actionNeededNodes >= 0
          ? status.actionNeededNodes
          : 0;
      const unresolvedCount =
        typeof status.unresolvedNodes === 'number' && status.unresolvedNodes >= 0
          ? status.unresolvedNodes
          : 0;
      const bridgeLabel = asText(status.bridgeId);
      const hasImportedRows = importedRows.length > 0;
      const guidanceSteps: string[] = [];
      let guidanceTitle = 'Import follow-up';
      if (!status.zwjs || status.zwjs.available !== true) {
        guidanceTitle = 'Bridge configuration required';
        guidanceSteps.push('Open bridge device settings and set WebSocket URL.');
        guidanceSteps.push('Return and press Refresh Status.');
      } else if (status.zwjs.transportConnected !== true) {
        guidanceTitle = 'Bridge is disconnected';
        guidanceSteps.push('Confirm zwave-js-server is running and reachable.');
        guidanceSteps.push('Press Refresh Status when bridge connectivity recovers.');
      } else {
        if (pendingCount !== null && pendingCount > 0) {
          guidanceSteps.push(
            `Import remaining ${pendingCount} node(s) from Add Device -> ZWJS Node.`,
          );
        } else if (status.discoveredNodes === 0) {
          guidanceSteps.push('No discoverable nodes reported yet from ZWJS.');
        } else {
          guidanceSteps.push('All discovered nodes are currently imported.');
        }
        if (actionNeededCount > 0) {
          guidanceSteps.push(
            `Open Bridge Tools to review ${actionNeededCount} runtime recommendation(s).`,
          );
        }
        if (unresolvedCount > 0) {
          guidanceSteps.push(
            `Review ${unresolvedCount} node(s) with unresolved profile attribution in Bridge Tools.`,
          );
        }
      }
      guidanceSteps.push('Press Done when finished with this pairing step.');

      return {
        refreshDisabled: state.loading,
        statusRows: [
          { key: 'Import Status', value: importStatusLabel(status), kind: 'text' },
          { key: 'Bridge', value: asText(status.bridgeId), kind: 'text' },
          { key: 'ZWJS', value: connectionPill(status), kind: 'pill' },
          { key: 'Lifecycle', value: asText(status.zwjs && status.zwjs.lifecycle), kind: 'text' },
          {
            key: 'ZWJS Server',
            value: asText(status.zwjs && status.zwjs.serverVersion),
            kind: 'text',
          },
          {
            key: 'Adapter Family',
            value: asText(status.zwjs && status.zwjs.adapterFamily),
            kind: 'text',
          },
          {
            key: 'Reconnect Attempts',
            value: asText(status.zwjs && status.zwjs.reconnectAttempt),
            kind: 'text',
          },
          {
            key: 'Version Received',
            value: asText(status.zwjs && status.zwjs.versionReceived),
            kind: 'text',
          },
          {
            key: 'Initialized',
            value: asText(status.zwjs && status.zwjs.initialized),
            kind: 'text',
          },
          { key: 'Listening', value: asText(status.zwjs && status.zwjs.listening), kind: 'text' },
          {
            key: 'Authenticated',
            value: asText(status.zwjs && status.zwjs.authenticated),
            kind: 'text',
          },
          { key: 'Discovered Nodes', value: asText(status.discoveredNodes), kind: 'text' },
          { key: 'Imported Nodes', value: asText(status.importedNodes), kind: 'text' },
          { key: 'Pending Import', value: asText(status.pendingImportNodes), kind: 'text' },
          { key: 'Action Needed', value: asText(status.actionNeededNodes), kind: 'text' },
          { key: 'Backfill Needed', value: asText(status.backfillNeededNodes), kind: 'text' },
          { key: 'Compiled Only', value: asText(status.compiledOnlyNodes), kind: 'text' },
          { key: 'With Override', value: asText(status.overrideNodes), kind: 'text' },
          { key: 'Unresolved Source', value: asText(status.unresolvedNodes), kind: 'text' },
          {
            key: 'Rule Match: Project',
            value: asText(status.confidenceCuratedNodes),
            kind: 'text',
          },
          {
            key: 'Rule Match: HA Derived',
            value: asText(status.confidenceHaDerivedNodes),
            kind: 'text',
          },
          {
            key: 'Rule Match: Generic',
            value: asText(status.confidenceGenericNodes),
            kind: 'text',
          },
          {
            key: 'Rule Match: Unknown',
            value: asText(status.confidenceUnknownNodes),
            kind: 'text',
          },
          { key: 'Updated', value: toTimeText(status.generatedAt), kind: 'text' },
        ],
        warnings,
        guidanceTitle,
        guidanceSteps,
        importedRows,
        importedMeta: hasImportedRows
          ? `Showing ${importedRows.length} imported node(s) on bridge ${bridgeLabel}.`
          : `Imported ${importedCount} node(s) on bridge ${bridgeLabel}.`,
        importedEmpty:
          importedCount > 0
            ? 'Imported nodes exist but detailed diagnostics are unavailable in this session.'
            : 'No nodes imported yet for this bridge.',
        hasImportedRows,
        statusLine: state.error || `Status loaded at ${toTimeText(status.generatedAt)}.`,
      };
    }

    return {
      createInitialState,
      reduce,
      buildViewModel,
    };
  },
);

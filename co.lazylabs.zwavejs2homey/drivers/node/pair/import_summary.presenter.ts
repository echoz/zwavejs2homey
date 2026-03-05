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
  };
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
      const bridgeLabel = asText(status.bridgeId);
      const hasImportedRows = importedRows.length > 0;

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
          { key: 'Discovered Nodes', value: asText(status.discoveredNodes), kind: 'text' },
          { key: 'Imported Nodes', value: asText(status.importedNodes), kind: 'text' },
          { key: 'Pending Import', value: asText(status.pendingImportNodes), kind: 'text' },
          { key: 'Updated', value: toTimeText(status.generatedAt), kind: 'text' },
        ],
        warnings,
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

(function attachImportSummaryPresenter(root, factory) {
  const presenter = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = presenter;
  }
  const nextRoot = root || {};
  nextRoot.Zwjs2HomeyUi = nextRoot.Zwjs2HomeyUi || {};
  nextRoot.Zwjs2HomeyUi.importSummaryPresenter = presenter;
})(
  typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this,
  function createPresenter() {
    function asText(value) {
      if (value === null || typeof value === 'undefined' || value === '') return 'n/a';
      return String(value);
    }

    function toTimeText(value) {
      if (!value) return 'n/a';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleString();
    }

    function connectionPill(status) {
      if (!status || !status.zwjs || status.zwjs.available !== true) {
        return { label: 'Unavailable', tone: 'error' };
      }
      if (status.zwjs.transportConnected === true) {
        return { label: 'Connected', tone: 'ok' };
      }
      return { label: 'Disconnected', tone: 'warn' };
    }

    function importStatusLabel(status) {
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

    function recommendationTone(action) {
      if (action === 'backfill-marker') return 'warn';
      if (action === 'adopt-recommended-baseline') return 'danger';
      return 'ok';
    }

    function recommendationLabel(action) {
      if (action === 'backfill-marker') return 'Backfill Marker';
      if (action === 'adopt-recommended-baseline') return 'Adopt Update';
      return 'No Action';
    }

    function toImportedRows(status) {
      const entries = Array.isArray(status && status.importedNodeDetails)
        ? status.importedNodeDetails
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

    function createInitialState() {
      return {
        loading: false,
        status: null,
        error: null,
      };
    }

    function reduce(state, event) {
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
          error: event.message || 'Failed to load status.',
        };
      }
      return state;
    }

    function buildViewModel(state) {
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

      const status = state.status;
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

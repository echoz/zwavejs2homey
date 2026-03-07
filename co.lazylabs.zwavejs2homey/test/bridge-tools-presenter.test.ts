const test = require('node:test');
const assert = require('node:assert/strict');

const presenter = require('../drivers/bridge/repair/bridge_tools.presenter.js');

function rowValue(rows, key) {
  const row = Array.isArray(rows) ? rows.find((item) => item && item.key === key) : null;
  return row ? row.value : undefined;
}

function createSnapshot() {
  return {
    generatedAt: '2026-03-05T00:00:00.000Z',
    device: {
      bridgeId: 'main',
      homeyDeviceId: 'bridge-device-1',
    },
    runtime: {
      zwjs: {
        available: true,
        transportConnected: true,
        lifecycle: 'connected',
        versionReceived: true,
        initialized: true,
        listening: true,
        authenticated: null,
        reconnectAttempt: 2,
        serverVersion: '3.4.0',
        adapterFamily: 'zwjs-default',
        lastMessageAt: '2026-03-05T00:00:00.000Z',
        connectedAt: '2026-03-05T00:00:00.000Z',
      },
      compiledProfiles: {
        loaded: true,
        entryCount: 2,
        pipelineFingerprint: 'abc123',
        generatedAt: '2026-03-05T00:00:00.000Z',
        sourcePath: '/tmp/compiled.json',
        errorMessage: null,
      },
      curation: {
        loaded: true,
        entryCount: 1,
        source: 'settings',
        errorMessage: null,
      },
      diagnosticsRefresh: {
        lastSuccessAt: '2026-03-05T00:01:00.000Z',
        lastFailureAt: null,
        lastFailureReason: null,
        lastReason: 'zwjs-connection-updated',
      },
    },
    nodeSummary: {
      total: 2,
      profileResolvedCount: 2,
      profilePendingCount: 0,
      profileSourceCompiledOnlyCount: 1,
      profileSourceOverrideCount: 1,
      profileSourceUnresolvedCount: 0,
      confidenceCuratedCount: 1,
      confidenceHaDerivedCount: 1,
      confidenceGenericCount: 0,
      confidenceUnknownCount: 0,
      readyCount: 2,
      failedCount: 0,
      curationEntryCount: 1,
      curationAppliedActions: 1,
      curationSkippedActions: 0,
      curationErrorCount: 0,
      recommendationAvailableCount: 1,
      recommendationBackfillCount: 0,
      capabilityCount: 3,
      inboundSkipped: 0,
      outboundSkipped: 0,
      skipReasons: {
        unsupported_value_type: 3,
      },
    },
    nodes: [
      {
        nodeId: 12,
        homeyDeviceId: 'node-12',
        node: {
          manufacturer: 'Leviton',
          product: 'DZ6HD',
          location: 'Study',
          ready: true,
          isFailed: false,
          interviewStage: 'Complete',
          status: 'Alive',
        },
        profile: {
          profileId: 'product-triple:29:12801:1',
          homeyClass: 'light',
          confidence: 'curated',
          matchBy: 'product-triple',
          matchKey: '29:12801:1',
          fallbackReason: null,
        },
        profileAttribution: {
          confidenceLabel: 'Project rule match',
          sourceLabel: 'Compiled profile only',
        },
        curation: {
          loaded: true,
          entryPresent: false,
          appliedActions: 0,
          skippedActions: 0,
          errorCount: 0,
        },
        recommendation: {
          available: true,
          backfillNeeded: false,
          reason: 'baseline-hash-changed',
          reasonLabel: 'Compiled profile changed for this device.',
        },
        mapping: {
          inboundEnabled: 1,
          inboundConfigured: 1,
          outboundEnabled: 1,
          outboundConfigured: 1,
          capabilityCount: 2,
          verticalSliceApplied: true,
          skipReasons: {},
        },
      },
      {
        nodeId: 5,
        homeyDeviceId: 'node-5',
        node: {
          manufacturer: 'Zooz',
          product: 'ZEN15',
          location: null,
          ready: true,
          isFailed: false,
          interviewStage: 'Complete',
          status: 'Alive',
        },
        profile: {
          profileId: 'product-triple:634:1234:1',
          homeyClass: 'socket',
          confidence: 'ha-derived',
          matchBy: 'product-triple',
          matchKey: '634:1234:1',
          fallbackReason: null,
        },
        curation: {
          loaded: true,
          entryPresent: true,
          appliedActions: 1,
          skippedActions: 0,
          errorCount: 0,
        },
        recommendation: {
          available: false,
          backfillNeeded: false,
          reason: 'none',
          reasonLabel: 'No recommendation is available.',
        },
        mapping: {
          inboundEnabled: 1,
          inboundConfigured: 1,
          outboundEnabled: 1,
          outboundConfigured: 1,
          capabilityCount: 1,
          verticalSliceApplied: false,
          skipReasons: {
            unsupported_value_type: 1,
          },
        },
      },
    ],
  };
}

test('bridge tools presenter builds filtered action-needed view by default', () => {
  const initial = presenter.createInitialState();
  const loaded = presenter.reduce(initial, {
    type: 'load_success',
    snapshot: createSnapshot(),
  });

  assert.equal(loaded.loading, false);
  assert.equal(loaded.tone, 'warn');
  assert.match(loaded.status, /Last updated/);

  const vm = presenter.buildViewModel(loaded);
  assert.equal(vm.filterActionLabel, 'Action Needed (1)');
  assert.equal(vm.filterAllLabel, 'All (2)');
  assert.equal(vm.nodes.length, 1);
  assert.equal(vm.nodes[0].nodeLabel, 'Node 12');
  assert.equal(vm.nodes[0].recommendationTone, 'danger');
  assert.equal(vm.nodesMeta, 'Showing 1 of 2 imported nodes that require action.');
  assert.equal(rowValue(vm.runtimeRows, 'Reconnect Attempts'), '2');
  assert.equal(rowValue(vm.runtimeRows, 'Diagnostics Refresh'), 'Healthy');
  assert.notEqual(rowValue(vm.summaryRows, 'Diagnostics Last Success'), 'n/a');
  assert.equal(rowValue(vm.summaryRows, 'Diagnostics Failure Reason'), 'n/a');
  assert.equal(
    rowValue(vm.runtimeRows, 'Inference Policy'),
    'Compiled profiles only + safe fallback (no runtime generic inference)',
  );
  assert.equal(rowValue(vm.summaryRows, 'Compiled Only'), '1');
  assert.equal(rowValue(vm.summaryRows, 'With Override'), '1');
  assert.equal(rowValue(vm.summaryRows, 'Top Skip Reasons'), 'unsupported_value_type:3');
  assert.equal(vm.status.includes('reconnect attempts observed (2).'), true);
});

test('bridge tools presenter surfaces diagnostics refresh failure state', () => {
  const snapshot = createSnapshot();
  snapshot.runtime.diagnosticsRefresh = {
    lastSuccessAt: '2026-03-05T00:01:00.000Z',
    lastFailureAt: '2026-03-05T00:02:00.000Z',
    lastFailureReason: 'Driver Not Initialized: bridge',
    lastReason: 'startup',
  };
  const loaded = presenter.reduce(presenter.createInitialState(), {
    type: 'load_success',
    snapshot,
  });
  const vm = presenter.buildViewModel(loaded);
  assert.equal(rowValue(vm.runtimeRows, 'Diagnostics Refresh'), 'Failed');
  assert.equal(
    rowValue(vm.runtimeAdvancedRows, 'Diagnostics Last Failure Reason'),
    'Driver Not Initialized: bridge',
  );
});

test('bridge tools presenter supports filter switching to all nodes', () => {
  const loaded = presenter.reduce(presenter.createInitialState(), {
    type: 'load_success',
    snapshot: createSnapshot(),
  });
  const withAll = presenter.reduce(loaded, {
    type: 'set_filter',
    filterMode: 'all',
  });

  const vm = presenter.buildViewModel(withAll);
  assert.equal(vm.nodes.length, 2);
  assert.equal(vm.nodesMeta, 'Showing all 2 imported nodes.');
});

test('bridge tools presenter handles load errors', () => {
  const errored = presenter.reduce(presenter.createInitialState(), {
    type: 'load_error',
    message: 'boom',
  });

  assert.equal(errored.loading, false);
  assert.equal(errored.tone, 'error');
  assert.equal(errored.error, 'boom');

  const vm = presenter.buildViewModel(errored);
  assert.equal(vm.error, 'boom');
  assert.equal(vm.nodes.length, 0);
  assert.equal(vm.nodesEmptyMessage, 'No imported node devices found.');
});

const test = require('node:test');
const assert = require('node:assert/strict');

const presenter = require('../drivers/node/repair/device_tools.presenter.js');

function rowValue(rows, key) {
  const row = Array.isArray(rows) ? rows.find((item) => item && item.key === key) : null;
  return row ? row.value : undefined;
}

function createSnapshot(overrides = {}) {
  const base = {
    generatedAt: '2026-03-06T12:00:00.000Z',
    device: {
      nodeId: 12,
      homeyDeviceId: 'node-12-homey',
    },
    runtime: {
      zwjs: {
        available: true,
        transportConnected: true,
        lifecycle: 'connected',
        serverVersion: '3.4.0',
        lastMessageAt: '2026-03-06T12:00:00.000Z',
        connectedAt: '2026-03-06T11:59:00.000Z',
      },
      compiledProfiles: {
        loaded: true,
      },
      curation: {
        loaded: true,
      },
    },
    node: {
      manufacturer: 'Leviton',
      product: 'DZ6HD',
      manufacturerId: 29,
      productType: 12801,
      productId: 1,
      location: 'Study',
      firmwareVersion: '1.20',
      ready: true,
      isFailed: false,
      interviewStage: 'Complete',
      status: 'Alive',
    },
    profile: {
      homeyClass: 'light',
      profileId: 'product-triple:29:12801:1',
      matchBy: 'product-triple',
      matchKey: '29:12801:1',
      fallbackReason: null,
      uncurated: false,
      confidence: 'curated',
    },
    profileAttribution: {
      confidenceLabel: 'Project rule match',
      sourceLabel: 'Compiled profile only',
      curationEntryPresent: false,
    },
    curation: {
      loaded: true,
      entryPresent: false,
      appliedActions: 0,
      skippedActions: 0,
      errorCount: 0,
      source: 'settings',
      error: null,
    },
    mapping: {
      capabilityCount: 2,
      verticalSliceApplied: true,
      inboundEnabled: 1,
      inboundConfigured: 1,
      inboundSkipped: 0,
      outboundEnabled: 1,
      outboundConfigured: 1,
      outboundSkipped: 0,
      skipReasons: {
        unsupported_value_type: 2,
      },
    },
    recommendation: {
      actionable: true,
      suggestedAction: 'adopt-recommended-baseline',
      reason: 'baseline-hash-changed',
      reasonLabel: 'Compiled profile changed for this device.',
    },
    profileReference: {
      projectionVersion: 'v1',
      currentBaselineHash: 'hash-current',
      storedBaselineHash: 'hash-old',
      currentPipelineFingerprint: 'fp-current',
      storedPipelineFingerprint: 'fp-old',
    },
    sync: {
      syncReason: 'init',
      syncedAt: '2026-03-06T11:59:30.000Z',
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

test('device tools presenter exposes actionable adopt recommendation state', () => {
  const loaded = presenter.reduce(presenter.createInitialState(), {
    type: 'load_success',
    snapshot: createSnapshot(),
  });

  const viewModel = presenter.buildViewModel(loaded);
  assert.equal(viewModel.subtitle, 'Node 12 · node-12-homey');
  assert.equal(viewModel.recommendation.badgeLabel, 'Profile Update Available');
  assert.equal(viewModel.recommendation.badgeTone, 'danger');
  assert.equal(viewModel.backfillDisabled, true);
  assert.equal(viewModel.adoptDisabled, false);
  assert.match(viewModel.actionHint, /compiled profile update is available/i);
  assert.equal(rowValue(viewModel.zwjsNodeRows, 'Product Triple'), '29:12801:1');
  assert.equal(rowValue(viewModel.adapterRows, 'Rule Match'), 'Project rule match');
  assert.equal(
    rowValue(viewModel.adapterRows, 'Inference Policy'),
    'Compiled-only policy: resolved from compiled profile; no runtime generic inference.',
  );
});

test('device tools presenter warns when transport is disconnected', () => {
  const loaded = presenter.reduce(presenter.createInitialState(), {
    type: 'load_success',
    snapshot: createSnapshot({
      runtime: {
        zwjs: {
          available: true,
          transportConnected: false,
          lifecycle: 'disconnected',
        },
        compiledProfiles: { loaded: true },
        curation: { loaded: true },
      },
      recommendation: {
        actionable: false,
        suggestedAction: 'none',
        reason: 'none',
        reasonLabel: 'No recommendation is available.',
      },
    }),
  });

  assert.equal(loaded.statusTone, 'warn');
  assert.equal(loaded.statusMessage, 'Bridge transport is disconnected.');

  const viewModel = presenter.buildViewModel(loaded);
  assert.equal(viewModel.recommendation.badgeLabel, 'No Action Needed');
  assert.equal(viewModel.adoptDisabled, true);
  assert.equal(viewModel.backfillDisabled, true);
});

test('device tools presenter derives action-state-changed summary from latest reason', () => {
  const snapshot = createSnapshot();
  const summary = presenter.describeActionResult(
    {
      executed: false,
      reason: 'action-state-changed',
      latestReason: 'baseline-hash-unchanged',
    },
    snapshot,
  );

  assert.equal(summary.tone, 'warn');
  assert.match(summary.message, /action state changed/i);
  assert.match(summary.message, /no update is needed/i);
});

test('device tools presenter explains safe fallback behavior for unmatched profiles', () => {
  const loaded = presenter.reduce(presenter.createInitialState(), {
    type: 'load_success',
    snapshot: createSnapshot({
      profile: {
        homeyClass: 'other',
        profileId: null,
        matchBy: 'none',
        matchKey: null,
        fallbackReason: 'no_compiled_profile_match',
        uncurated: true,
        confidence: 'generic',
      },
      profileAttribution: {
        confidenceLabel: 'Generic fallback rule',
        sourceCode: 'compiled-only',
        sourceLabel: 'Compiled profile only',
        curationEntryPresent: false,
      },
      recommendation: {
        actionable: false,
        suggestedAction: 'none',
        reason: 'none',
        reasonLabel: 'No recommendation is available.',
      },
    }),
  });

  const viewModel = presenter.buildViewModel(loaded);
  assert.equal(
    rowValue(viewModel.adapterRows, 'Inference Policy'),
    'Compiled-only policy: no profile match; safe fallback (class other, no mappings).',
  );
});

test('device tools presenter infers compiled-only policy for legacy snapshots without attribution', () => {
  const loaded = presenter.reduce(presenter.createInitialState(), {
    type: 'load_success',
    snapshot: createSnapshot({
      profileAttribution: null,
      profile: {
        homeyClass: 'light',
        profileId: 'product-triple:29:12801:1',
        matchBy: 'product-triple',
        matchKey: '29:12801:1',
        fallbackReason: null,
        uncurated: false,
        confidence: 'curated',
      },
      recommendation: {
        actionable: false,
        suggestedAction: 'none',
        reason: 'none',
        reasonLabel: 'No recommendation is available.',
      },
    }),
  });

  const viewModel = presenter.buildViewModel(loaded);
  assert.equal(
    rowValue(viewModel.adapterRows, 'Inference Policy'),
    'Compiled-only policy: resolved from compiled profile; no runtime generic inference.',
  );
});

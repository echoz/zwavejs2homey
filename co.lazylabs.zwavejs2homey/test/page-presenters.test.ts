const test = require('node:test');
const assert = require('node:assert/strict');

const settingsPresenter = require('../settings/settings.presenter.js');
const bridgeConfigPresenter = require('../drivers/bridge/pair/bridge_config.presenter.js');
const bridgeNextStepsPresenter = require('../drivers/bridge/pair/next_steps.presenter.js');
const nodeImportSummaryPresenter = require('../drivers/node/pair/import_summary.presenter.js');

function rowValue(viewModel, key) {
  const row = Array.isArray(viewModel.rows)
    ? viewModel.rows.find((item) => item && item.key === key)
    : null;
  return row ? row.value : undefined;
}

function statusRowValue(viewModel, key) {
  const row = Array.isArray(viewModel.statusRows)
    ? viewModel.statusRows.find((item) => item && item.key === key)
    : null;
  return row ? row.value : undefined;
}

test('settings presenter normalizes and validates connection settings', () => {
  const normalized = settingsPresenter.normalizeLoadedSettings(null);
  assert.equal(normalized.url, settingsPresenter.DEFAULT_URL);
  assert.equal(normalized.authType, 'none');
  assert.equal(normalized.token, '');

  const normalizedBearer = settingsPresenter.normalizeLoadedSettings({
    url: '  ws://192.168.1.15:3000 ',
    auth: {
      type: 'bearer',
      token: '  abc123  ',
    },
  });
  assert.deepEqual(normalizedBearer, {
    url: 'ws://192.168.1.15:3000',
    authType: 'bearer',
    token: 'abc123',
  });

  assert.deepEqual(
    settingsPresenter.validateSettingsInput({
      url: 'ws://localhost:3000',
      authType: 'none',
      token: '',
    }),
    {
      payload: {
        url: 'ws://localhost:3000',
        auth: { type: 'none' },
      },
    },
  );

  assert.deepEqual(
    settingsPresenter.validateSettingsInput({
      url: 'wss://example.com/zwave',
      authType: 'bearer',
      token: 'token-1',
    }),
    {
      payload: {
        url: 'wss://example.com/zwave',
        auth: {
          type: 'bearer',
          token: 'token-1',
        },
      },
    },
  );

  assert.equal(
    settingsPresenter.validateSettingsInput({
      url: 'http://example.com',
      authType: 'none',
      token: '',
    }).error,
    'URL must start with ws:// or wss://.',
  );

  assert.equal(
    settingsPresenter.validateSettingsInput({
      url: 'ws://localhost:3000',
      authType: 'bearer',
      token: '',
    }).error,
    'Bearer token is required when authentication is bearer.',
  );
});

test('settings presenter parses runtime diagnostics and builds warning-aware view model', () => {
  assert.deepEqual(
    settingsPresenter.parseRuntimeResponse({ ok: true, data: { bridgeId: 'main' } }),
    {
      data: { bridgeId: 'main' },
    },
  );
  assert.equal(
    settingsPresenter.parseRuntimeResponse({ ok: false, error: { message: 'boom' } }).error,
    'boom',
  );
  assert.equal(
    settingsPresenter.parseRuntimeResponse({ ok: false }).error,
    'Runtime diagnostics response is missing expected fields.',
  );

  const runtimeData = {
    bridgeId: 'main',
    generatedAt: '2026-03-03T12:00:00.000Z',
    zwjs: {
      available: true,
      transportConnected: false,
      lifecycle: 'disconnected',
      serverVersion: '1.0.0',
    },
    compiledProfiles: {
      loaded: false,
    },
    curation: {
      loaded: false,
    },
    nodes: [
      {
        recommendation: {
          available: true,
          backfillNeeded: false,
        },
      },
      {
        recommendation: {
          available: false,
          backfillNeeded: true,
        },
      },
      {},
    ],
  };

  const viewModel = settingsPresenter.buildRuntimeViewModel(runtimeData);
  assert.equal(rowValue(viewModel, 'Runtime Status'), 'Bridge Disconnected');
  assert.equal(rowValue(viewModel, 'Imported Nodes'), '3');
  assert.equal(rowValue(viewModel, 'Action Needed'), '2');
  assert.equal(rowValue(viewModel, 'Profile Updates'), '1');
  assert.equal(rowValue(viewModel, 'Backfill Needed'), '1');
  assert.equal(rowValue(viewModel, 'Compiled Profiles'), 'Missing');
  assert.equal(rowValue(viewModel, 'Curation'), 'Unavailable');
  assert.equal(viewModel.warningCount, 3);
  assert.deepEqual(viewModel.warnings, [
    'ZWJS transport is disconnected. Pair/import may return empty results.',
    'Compiled profiles are not loaded. Runtime matching may fall back.',
    'Curation runtime failed to load. Device overrides may be unavailable.',
  ]);
  assert.equal(viewModel.runtimeHint, '2 imported node(s) need attention in Bridge Tools.');
});

test('settings presenter parses and exports support bundles with optional redaction', () => {
  assert.deepEqual(
    settingsPresenter.parseSupportBundleResponse({
      ok: true,
      data: { schemaVersion: 'homey-runtime-support-bundle/v1' },
    }),
    {
      data: { schemaVersion: 'homey-runtime-support-bundle/v1' },
    },
  );
  assert.equal(
    settingsPresenter.parseSupportBundleResponse({ ok: false, error: { message: 'bundle-failed' } })
      .error,
    'bundle-failed',
  );
  assert.equal(
    settingsPresenter.parseSupportBundleResponse({ ok: false }).error,
    'Support bundle response is missing expected fields.',
  );

  const bundle = {
    generatedAt: '2026-03-06T18:30:48.000Z',
    source: {
      baseUrl: 'http://homey/api/app/co.lazylabs.zwavejs2homey',
      homeyDeviceId: 'main:12',
    },
    diagnostics: {
      node: {
        name: 'Kitchen Dimmer',
        location: 'Kitchen',
      },
    },
  };

  const rawExport = settingsPresenter.buildSupportBundleExport(bundle, { redact: false });
  assert.equal(rawExport.redacted, false);
  assert.equal(rawExport.fileName, 'zwjs2homey-support-bundle-20260306-183048.json');
  const rawPayload = JSON.parse(rawExport.content);
  assert.equal(rawPayload.source.baseUrl, 'http://homey/api/app/co.lazylabs.zwavejs2homey');
  assert.equal(rawPayload.diagnostics.node.name, 'Kitchen Dimmer');

  const redactedExport = settingsPresenter.buildSupportBundleExport(bundle, { redact: true });
  assert.equal(redactedExport.redacted, true);
  const redactedPayload = JSON.parse(redactedExport.content);
  assert.equal(redactedPayload.source.baseUrl, '<redacted>');
  assert.equal(redactedPayload.source.homeyDeviceId, '<redacted>');
  assert.equal(redactedPayload.diagnostics.node.name, '<redacted>');
  assert.equal(redactedPayload.diagnostics.node.location, '<redacted>');
});

test('bridge config presenter validates payload and reflects paired context', () => {
  const initial = bridgeConfigPresenter.createInitialState();
  assert.equal(initial.loading, false);
  assert.equal(initial.context, null);

  const loading = bridgeConfigPresenter.reduce(initial, { type: 'load_start' });
  assert.equal(loading.loading, true);

  const loaded = bridgeConfigPresenter.reduce(loading, {
    type: 'load_success',
    context: {
      bridgeId: 'bridge-2',
      homeyDeviceId: 'zwjs-bridge-bridge-2',
      name: 'ZWJS Bridge (bridge-2)',
      paired: true,
      settings: {
        url: 'ws://192.168.1.15:3000',
        authType: 'bearer',
        token: 'abc123',
        tokenConfigured: true,
      },
    },
  });
  const viewModel = bridgeConfigPresenter.buildViewModel(loaded);
  assert.equal(viewModel.bridgeId, 'bridge-2');
  assert.equal(viewModel.paired, true);
  assert.equal(viewModel.url, 'ws://192.168.1.15:3000');
  assert.equal(viewModel.authType, 'bearer');
  assert.equal(viewModel.tokenConfigured, true);
  assert.equal(viewModel.saveDisabled, false);

  assert.deepEqual(
    bridgeConfigPresenter.validateInput({
      bridgeId: 'bridge-2',
      url: 'ws://192.168.1.15:3000',
      authType: 'none',
      token: '',
    }),
    {
      payload: {
        bridgeId: 'bridge-2',
        url: 'ws://192.168.1.15:3000',
        authType: 'none',
      },
    },
  );

  assert.equal(
    bridgeConfigPresenter.validateInput({
      bridgeId: 'bridge-2',
      url: 'http://192.168.1.15:3000',
      authType: 'none',
    }).error,
    'URL must start with ws:// or wss://.',
  );
  assert.equal(
    bridgeConfigPresenter.validateInput({
      bridgeId: 'bridge-2',
      url: 'ws://192.168.1.15:3000',
      authType: 'bearer',
      token: '',
    }).error,
    'Bearer token is required when auth type is bearer.',
  );
});

function runPairPresenterContract(name, presenter) {
  test(`${name} presenter transitions load state and builds imported node table rows`, () => {
    const initial = presenter.createInitialState();
    assert.equal(initial.loading, false);
    assert.equal(initial.status, null);
    assert.equal(initial.error, null);

    const loading = presenter.reduce(initial, { type: 'load_start' });
    assert.equal(loading.loading, true);
    assert.equal(loading.error, null);

    const failed = presenter.reduce(loading, { type: 'load_error', message: 'network down' });
    assert.equal(failed.loading, false);
    assert.equal(failed.status, null);
    assert.equal(failed.error, 'network down');

    const failedView = presenter.buildViewModel(failed);
    assert.equal(failedView.refreshDisabled, false);
    assert.equal(failedView.statusRows.length, 0);
    assert.equal(failedView.statusLine, 'network down');

    const status = {
      bridgeId: 'main',
      importedNodes: 1,
      pendingImportNodes: 2,
      discoveredNodes: 3,
      generatedAt: '2026-03-03T12:00:00.000Z',
      warnings: ['transport disconnected'],
      zwjs: {
        available: true,
        transportConnected: true,
        lifecycle: 'connected',
        serverVersion: '3.4.0',
        adapterFamily: 'zwjs-default',
        reconnectAttempt: 1,
        versionReceived: true,
        initialized: true,
        listening: true,
        authenticated: null,
      },
      actionNeededNodes: 1,
      backfillNeededNodes: 0,
      compiledOnlyNodes: 1,
      overrideNodes: 0,
      unresolvedNodes: 0,
      confidenceCuratedNodes: 1,
      confidenceHaDerivedNodes: 0,
      confidenceGenericNodes: 0,
      confidenceUnknownNodes: 0,
      importedNodeDetails: [
        {
          bridgeId: 'main',
          nodeId: 12,
          name: 'Kitchen Dimmer',
          manufacturer: 'Leviton',
          product: 'DZ6HD',
          location: 'Kitchen',
          status: 'Alive',
          profileHomeyClass: 'light',
          profileId: 'product-triple:29:12801:1',
          profileMatch: 'product-triple',
          profileSource: 'Compiled profile only',
          ruleMatch: 'Project rule match',
          fallbackReason: null,
          recommendationAction: 'adopt-recommended-baseline',
          recommendationReason: 'compiled profile changed',
        },
      ],
    };

    const loaded = presenter.reduce(initial, { type: 'load_success', status });
    const viewModel = presenter.buildViewModel(loaded);
    assert.equal(viewModel.refreshDisabled, false);
    assert.equal(statusRowValue(viewModel, 'Import Status'), 'Ready to Import (2 pending)');

    const zwjsRow = statusRowValue(viewModel, 'ZWJS');
    assert.deepEqual(zwjsRow, {
      label: 'Connected',
      tone: 'ok',
    });
    assert.equal(statusRowValue(viewModel, 'Action Needed'), '1');
    assert.equal(statusRowValue(viewModel, 'Compiled Only'), '1');
    assert.equal(statusRowValue(viewModel, 'Reconnect Attempts'), '1');
    if (name === 'node import_summary') {
      assert.equal(statusRowValue(viewModel, 'Rule Match: Project'), '1');
    }

    assert.equal(viewModel.importedRows.length, 1);
    assert.equal(viewModel.importedRows[0].nodeId, '12');
    assert.equal(viewModel.importedRows[0].profileClass, 'light');
    assert.equal(viewModel.importedRows[0].profileSource, 'Compiled profile only');
    assert.equal(viewModel.importedRows[0].ruleMatch, 'Project rule match');
    if (name === 'node import_summary') {
      assert.equal(viewModel.importedRows[0].fallbackReason, 'n/a');
    }
    assert.equal(viewModel.importedRows[0].recommendation.label, 'Adopt Update');
    assert.equal(viewModel.importedRows[0].recommendation.tone, 'danger');
    assert.equal(Array.isArray(viewModel.guidanceSteps), true);
    assert.equal(viewModel.guidanceSteps.length > 0, true);
    assert.equal(typeof viewModel.guidanceTitle, 'string');
    assert.equal(viewModel.hasImportedRows, true);
    assert.match(viewModel.importedMeta, /Showing 1 imported node\(s\) on bridge main\./);
    assert.match(viewModel.statusLine, /Status loaded at /);
  });
}

runPairPresenterContract('bridge next_steps', bridgeNextStepsPresenter);
runPairPresenterContract('node import_summary', nodeImportSummaryPresenter);

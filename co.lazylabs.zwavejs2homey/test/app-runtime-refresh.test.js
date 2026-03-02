const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const EventEmitter = require('node:events');

class FakeSettings extends EventEmitter {
  constructor() {
    super();
    this.values = new Map();
  }

  get(key) {
    return this.values.get(key);
  }

  set(key, value) {
    this.values.set(key, value);
    this.emit('set', key);
  }

  unset(key) {
    this.values.delete(key);
    this.emit('unset', key);
  }
}

class FakeDriversManager {
  constructor(nodeDevices, bridgeDevices = []) {
    this.nodeDevices = nodeDevices;
    this.bridgeDevices = bridgeDevices;
  }

  getDriver(driverId) {
    if (driverId === 'node') {
      return {
        getDevices: () => this.nodeDevices,
      };
    }
    if (driverId === 'bridge') {
      return {
        getDevices: () => this.bridgeDevices,
      };
    }
    throw new Error(`Unknown driver: ${driverId}`);
  }
}

class FakeHomeyApp {
  constructor() {
    this.homey = {
      settings: new FakeSettings(),
      drivers: new FakeDriversManager([]),
    };
    this.logs = [];
    this.errors = [];
  }

  log(message, meta) {
    this.logs.push({ message, meta });
  }

  error(message, meta) {
    this.errors.push({ message, meta });
  }
}

function createMockCoreModule() {
  const mockClient = {
    startCalls: 0,
    stopCalls: 0,
    listeners: [],
    async start() {
      this.startCalls += 1;
    },
    async stop() {
      this.stopCalls += 1;
    },
    getStatus() {
      return {
        transportConnected: true,
        lifecycle: 'started',
      };
    },
    onEvent(listener) {
      this.listeners.push(listener);
      return () => {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) this.listeners.splice(index, 1);
      };
    },
    emitEvent(event) {
      for (const listener of [...this.listeners]) {
        listener(event);
      }
    },
  };

  return {
    mockClient,
    module: {
      ZWJS_CONNECTION_SETTINGS_KEY: 'zwjs_connection',
      ZWJS_COMMAND_NODE_SET_VALUE: 'node.set_value',
      resolveZwjsConnectionConfig: () => ({
        source: 'default',
        warnings: [],
        clientConfig: { url: 'ws://127.0.0.1:3000', auth: undefined },
      }),
      createZwjsClient: () => mockClient,
    },
  };
}

function createMockCompiledProfilesModule() {
  return {
    COMPILED_PROFILES_PATH_SETTINGS_KEY: 'compiled_profiles_file',
    resolveCompiledProfilesArtifactPath: () => '/tmp/mock-compiled-profiles.json',
    tryLoadCompiledProfilesRuntimeFromFile: async (sourcePath) => ({
      artifact: undefined,
      index: undefined,
      status: {
        sourcePath,
        loaded: true,
        generatedAt: '2026-03-01T00:00:00.000Z',
        pipelineFingerprint: 'pipeline-fingerprint-1',
        entryCount: 0,
        duplicateKeys: {
          productTriple: 0,
          nodeId: 0,
          deviceKey: 0,
        },
        errorMessage: null,
      },
    }),
    resolveCompiledProfileEntryFromRuntime: () => ({ by: 'none' }),
  };
}

function createNodeDiagnosticsDevice({ id, bridgeId = 'main', nodeId, profileResolution }) {
  return {
    getData: () => ({ id, bridgeId, nodeId }),
    async getStoreValue(key) {
      if (key !== 'profileResolution') return undefined;
      return profileResolution;
    },
  };
}

function createCurationDocument(entries) {
  return {
    schemaVersion: 'homey-curation/v1',
    updatedAt: '2026-03-01T00:00:00.000Z',
    entries,
  };
}

function loadAppClass(nodeDevices, bridgeDevices = []) {
  const modulePath = path.resolve(__dirname, '../.homeybuild/app.js');
  const originalLoad = Module._load;
  const coreMock = createMockCoreModule();
  const compiledProfilesMock = createMockCompiledProfilesModule();

  Module._load = function patchedModuleLoad(request, parent, isMain) {
    if (request === 'homey') {
      return { App: FakeHomeyApp };
    }
    if (request === '@zwavejs2homey/core') {
      return coreMock.module;
    }
    if (
      request === './compiled-profiles' &&
      parent &&
      typeof parent.filename === 'string' &&
      parent.filename.endsWith(`${path.sep}.homeybuild${path.sep}app.js`)
    ) {
      return compiledProfilesMock;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[modulePath];
    const AppClass = require(modulePath);
    const app = new AppClass();
    app.homey.drivers = new FakeDriversManager(nodeDevices, bridgeDevices);
    return {
      app,
      coreMock,
      compiledProfilesMock,
    };
  } finally {
    Module._load = originalLoad;
  }
}

async function flushEventQueue() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('app refreshes node runtime mappings on startup and settings changes', async () => {
  const refreshCalls = [];
  const nodeDevices = [
    {
      async onRuntimeMappingsRefresh(reason) {
        refreshCalls.push(reason);
      },
    },
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();
  assert.deepEqual(refreshCalls, ['startup']);

  app.homey.settings.set('compiled_profiles_file', '/tmp/next-compiled.json');
  await flushEventQueue();
  assert.equal(refreshCalls.includes('compiled-profiles-updated'), true);

  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
  await flushEventQueue();
  assert.equal(refreshCalls.includes('zwjs-connection-updated'), true);

  app.homey.settings.set('curation.v1', {
    schemaVersion: 'homey-curation/v1',
    updatedAt: '2026-03-01T00:00:00.000Z',
    entries: {},
  });
  await flushEventQueue();
  assert.equal(refreshCalls.includes('curation-updated'), true);

  await app.onUninit();
});

test('app refreshes bridge runtime diagnostics on startup and settings changes', async () => {
  const bridgeRefreshCalls = [];
  const bridgeDevices = [
    {
      async onRuntimeDiagnosticsRefresh(reason) {
        bridgeRefreshCalls.push(reason);
      },
    },
  ];

  const { app } = loadAppClass([], bridgeDevices);
  await app.onInit();
  assert.deepEqual(bridgeRefreshCalls, ['startup']);

  app.homey.settings.set('compiled_profiles_file', '/tmp/next-compiled.json');
  await flushEventQueue();
  assert.equal(bridgeRefreshCalls.includes('compiled-profiles-updated'), true);

  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
  await flushEventQueue();
  assert.equal(bridgeRefreshCalls.includes('zwjs-connection-updated'), true);

  app.homey.settings.set('curation.v1', {
    schemaVersion: 'homey-curation/v1',
    updatedAt: '2026-03-01T00:00:00.000Z',
    entries: {},
  });
  await flushEventQueue();
  assert.equal(bridgeRefreshCalls.includes('curation-updated'), true);

  await app.onUninit();
});

test('app performs targeted node runtime refresh from node lifecycle events', async () => {
  const node5Calls = [];
  const node8Calls = [];
  const otherBridgeCalls = [];
  const nodeDevices = [
    {
      getData: () => ({ bridgeId: 'main', nodeId: 5 }),
      async onRuntimeMappingsRefresh(reason) {
        node5Calls.push(reason);
      },
    },
    {
      getData: () => ({ bridgeId: 'main', nodeId: 8 }),
      async onRuntimeMappingsRefresh(reason) {
        node8Calls.push(reason);
      },
    },
    {
      getData: () => ({ bridgeId: 'other-bridge', nodeId: 5 }),
      async onRuntimeMappingsRefresh(reason) {
        otherBridgeCalls.push(reason);
      },
    },
  ];

  const { app, coreMock } = loadAppClass(nodeDevices);
  await app.onInit();
  node5Calls.length = 0;
  node8Calls.length = 0;
  otherBridgeCalls.length = 0;

  coreMock.mockClient.emitEvent({
    type: 'zwjs.event.node.metadata-updated',
    event: {
      nodeId: 5,
    },
  });
  await flushEventQueue();
  assert.deepEqual(node5Calls, ['event:zwjs.event.node.metadata-updated:node-5']);
  assert.deepEqual(node8Calls, []);
  assert.deepEqual(otherBridgeCalls, []);

  coreMock.mockClient.emitEvent({
    type: 'zwjs.event.node.value-added',
    event: {
      nodeId: 8,
    },
  });
  await flushEventQueue();
  assert.deepEqual(node8Calls, ['event:zwjs.event.node.value-added:node-8']);

  coreMock.mockClient.emitEvent({
    type: 'zwjs.event.driver.logging',
    event: { message: 'ignore' },
  });
  await flushEventQueue();
  assert.equal(node5Calls.length, 1);
  assert.equal(node8Calls.length, 1);

  await app.onUninit();
});

test('app refreshes bridge diagnostics from targeted node lifecycle events', async () => {
  const bridgeRefreshCalls = [];
  const bridgeDevices = [
    {
      async onRuntimeDiagnosticsRefresh(reason) {
        bridgeRefreshCalls.push(reason);
      },
    },
  ];

  const { app, coreMock } = loadAppClass([], bridgeDevices);
  await app.onInit();
  bridgeRefreshCalls.length = 0;

  coreMock.mockClient.emitEvent({
    type: 'zwjs.event.node.metadata-updated',
    event: {
      nodeId: 5,
    },
  });
  await flushEventQueue();
  assert.deepEqual(bridgeRefreshCalls, ['event:zwjs.event.node.metadata-updated:node-5']);

  coreMock.mockClient.emitEvent({
    type: 'zwjs.event.driver.logging',
    event: { message: 'ignore' },
  });
  await flushEventQueue();
  assert.equal(bridgeRefreshCalls.length, 1);

  await app.onUninit();
});

test('app diagnostics snapshot normalizes recommendation and mapping summary fields', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        syncedAt: '2026-03-02T00:00:00.000Z',
        syncReason: 'startup',
        matchBy: 'product-triple',
        matchKey: '29:66:2',
        profileId: 'profile-main-8',
        fallbackReason: null,
        classification: {
          homeyClass: 'socket',
          confidence: 'curated',
          uncurated: false,
        },
        curationLoaded: true,
        curationSource: 'settings',
        curationError: null,
        curationEntryPresent: true,
        curationReport: {
          summary: {
            applied: 3,
            skipped: 1,
            errors: 0,
          },
        },
        recommendationAvailable: true,
        recommendationReason: 'baseline-hash-changed',
        recommendationBackfillNeeded: false,
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'new-hash',
        storedBaselineHash: 'old-hash',
        currentBaselinePipelineFingerprint: 'pf-new',
        storedBaselinePipelineFingerprint: 'pf-old',
        verticalSliceApplied: true,
        mappingDiagnostics: [
          {
            capabilityId: 'onoff',
            inbound: { configured: true, enabled: true, reason: null },
            outbound: { configured: true, enabled: false, reason: 'outbound_target_not_writeable' },
          },
          {
            capabilityId: 'measure_power',
            inbound: { configured: true, enabled: false, reason: 'inbound_selector_not_defined' },
            outbound: { configured: false, enabled: false, reason: null },
          },
        ],
      },
    }),
    createNodeDiagnosticsDevice({
      id: 'main:5',
      nodeId: 5,
      profileResolution: {
        syncedAt: '2026-03-02T00:00:00.000Z',
        syncReason: 'startup',
        matchBy: 'product-triple',
        profileId: 'profile-main-5',
        classification: {
          homeyClass: 'light',
          confidence: 'curated',
          uncurated: false,
        },
        curationLoaded: true,
        curationSource: 'settings',
        curationEntryPresent: false,
        recommendationAvailable: false,
        recommendationReason: 'no-curation-entry',
        recommendationBackfillNeeded: false,
        verticalSliceApplied: true,
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();
  const snapshot = await app.getNodeRuntimeDiagnostics();

  assert.equal(snapshot.bridgeId, 'main');
  assert.equal(snapshot.zwjs.available, true);
  assert.equal(snapshot.compiledProfiles.loaded, true);
  assert.equal(snapshot.curation.loaded, true);
  assert.equal(snapshot.nodes.length, 2);
  assert.equal(snapshot.nodes[0].nodeId, 5);
  assert.equal(snapshot.nodes[1].nodeId, 8);

  const node8 = snapshot.nodes.find((entry) => entry.homeyDeviceId === 'main:8');
  assert.ok(node8);
  assert.equal(node8.recommendation.available, true);
  assert.equal(node8.recommendation.reason, 'baseline-hash-changed');
  assert.equal(node8.recommendation.currentPipelineFingerprint, 'pf-new');
  assert.equal(node8.curation.appliedActions, 3);
  assert.equal(node8.curation.skippedActions, 1);
  assert.equal(node8.mapping.capabilityCount, 2);
  assert.equal(node8.mapping.inboundConfigured, 2);
  assert.equal(node8.mapping.inboundEnabled, 1);
  assert.equal(node8.mapping.inboundSkipped, 1);
  assert.equal(node8.mapping.outboundConfigured, 1);
  assert.equal(node8.mapping.outboundEnabled, 0);
  assert.equal(node8.mapping.outboundSkipped, 1);
  assert.equal(node8.mapping.skipReasons.inbound_selector_not_defined, 1);
  assert.equal(node8.mapping.skipReasons.outbound_target_not_writeable, 1);

  await app.onUninit();
});

test('app diagnostics snapshot supports homeyDeviceId filtering', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:5',
      nodeId: 5,
      profileResolution: {
        profileId: 'profile-main-5',
        recommendationAvailable: false,
        mappingDiagnostics: [],
      },
    }),
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-main-8',
        recommendationAvailable: true,
        recommendationReason: 'baseline-hash-changed',
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();
  const snapshot = await app.getNodeRuntimeDiagnostics({ homeyDeviceId: 'main:8' });

  assert.equal(snapshot.nodes.length, 1);
  assert.equal(snapshot.nodes[0].homeyDeviceId, 'main:8');
  assert.equal(snapshot.nodes[0].recommendation.available, true);

  await app.onUninit();
});

test('app can backfill curation baseline marker for a node from runtime diagnostics', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-main-8',
        recommendationProjectionVersion: '1',
        recommendationAvailable: false,
        recommendationBackfillNeeded: true,
        currentBaselineHash: 'current-hash-8',
        currentBaselinePipelineFingerprint: 'pf-8',
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();
  const result = await app.backfillCurationBaselineMarker('main:8');
  assert.equal(result.updated, true);
  assert.equal(result.createdEntry, true);
  assert.equal(result.reason, 'created-entry-and-backfilled-marker');

  const settingsValue = app.homey.settings.get('curation.v1');
  assert.equal(settingsValue.entries['main:8'].targetDevice.homeyDeviceId, 'main:8');
  assert.equal(
    settingsValue.entries['main:8'].baselineMarker.baselineProfileHash,
    'current-hash-8',
  );
  assert.equal(settingsValue.entries['main:8'].baselineMarker.pipelineFingerprint, 'pf-8');
  assert.deepEqual(settingsValue.entries['main:8'].overrides, {});

  await app.onUninit();
});

test('app can adopt recommended baseline by removing curation entry', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-main-8',
        recommendationAvailable: true,
        recommendationBackfillNeeded: false,
        recommendationReason: 'baseline-hash-changed',
        currentBaselineHash: 'next-hash-8',
        mappingDiagnostics: [],
      },
    }),
  ];
  const { app } = loadAppClass(nodeDevices);
  app.homey.settings.set(
    'curation.v1',
    createCurationDocument({
      'main:8': {
        targetDevice: { homeyDeviceId: 'main:8' },
        baselineMarker: {
          projectionVersion: '1',
          baselineProfileHash: 'old-hash-8',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        overrides: {
          deviceIdentity: {
            homeyClass: 'socket',
          },
        },
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    }),
  );
  await app.onInit();

  const result = await app.adoptRecommendedBaseline('main:8');
  assert.equal(result.adopted, true);
  assert.equal(result.reason, 'adopted-and-removed-curation-entry');

  const settingsValue = app.homey.settings.get('curation.v1');
  assert.equal(settingsValue.entries['main:8'], undefined);

  await app.onUninit();
});

test('app adopt recommended baseline is blocked when recommendation is unavailable', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-main-8',
        recommendationAvailable: false,
        recommendationBackfillNeeded: false,
        mappingDiagnostics: [],
      },
    }),
  ];
  const { app } = loadAppClass(nodeDevices);
  app.homey.settings.set(
    'curation.v1',
    createCurationDocument({
      'main:8': {
        targetDevice: { homeyDeviceId: 'main:8' },
        baselineMarker: {
          projectionVersion: '1',
          baselineProfileHash: 'old-hash-8',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        overrides: {},
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    }),
  );
  await app.onInit();

  const result = await app.adoptRecommendedBaseline('main:8');
  assert.equal(result.adopted, false);
  assert.equal(result.reason, 'recommendation-unavailable');

  const settingsValue = app.homey.settings.get('curation.v1');
  assert.equal(Boolean(settingsValue.entries['main:8']), true);

  await app.onUninit();
});

test('app recommendation action queue classifies backfill/adopt/no-action nodes', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:12',
      nodeId: 12,
      profileResolution: {
        profileId: 'profile-main-12',
        recommendationBackfillNeeded: true,
        recommendationReason: 'marker-missing-backfill',
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'hash-12',
        mappingDiagnostics: [],
      },
    }),
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-main-8',
        recommendationAvailable: true,
        recommendationReason: 'baseline-hash-changed',
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'hash-8',
        storedBaselineHash: 'old-8',
        mappingDiagnostics: [],
      },
    }),
    createNodeDiagnosticsDevice({
      id: 'main:5',
      nodeId: 5,
      profileResolution: {
        profileId: 'profile-main-5',
        recommendationAvailable: false,
        recommendationBackfillNeeded: false,
        recommendationReason: 'baseline-hash-unchanged',
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();
  const actionableQueue = await app.getRecommendationActionQueue();
  assert.equal(actionableQueue.total, 3);
  assert.equal(actionableQueue.actionable, 2);
  assert.equal(actionableQueue.items.length, 2);
  assert.equal(actionableQueue.items[0].action, 'backfill-marker');
  assert.equal(actionableQueue.items[0].homeyDeviceId, 'main:12');
  assert.equal(actionableQueue.items[1].action, 'adopt-recommended-baseline');
  assert.equal(actionableQueue.items[1].homeyDeviceId, 'main:8');

  const fullQueue = await app.getRecommendationActionQueue({ includeNoAction: true });
  assert.equal(fullQueue.items.length, 3);
  assert.equal(fullQueue.items[2].action, 'none');
  assert.equal(fullQueue.items[2].homeyDeviceId, 'main:5');
  await app.onUninit();
});

test('app can batch-backfill missing baseline markers in one settings update', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:12',
      nodeId: 12,
      profileResolution: {
        profileId: 'profile-main-12',
        recommendationBackfillNeeded: true,
        recommendationReason: 'marker-missing-backfill',
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'hash-12',
        currentBaselinePipelineFingerprint: 'pf-12',
        mappingDiagnostics: [],
      },
    }),
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-main-8',
        recommendationAvailable: true,
        recommendationBackfillNeeded: false,
        recommendationReason: 'baseline-hash-changed',
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'hash-8',
        mappingDiagnostics: [],
      },
    }),
    createNodeDiagnosticsDevice({
      id: 'main:5',
      nodeId: 5,
      profileResolution: {
        profileId: 'profile-main-5',
        recommendationAvailable: false,
        recommendationBackfillNeeded: false,
        recommendationReason: 'baseline-hash-unchanged',
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();
  const result = await app.backfillMissingCurationBaselineMarkers();
  assert.equal(result.updated, 1);
  assert.equal(result.createdEntries, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.items[0].homeyDeviceId, 'main:12');
  assert.equal(result.items[0].updated, true);
  assert.equal(result.items[1].reason, 'action-not-backfill');
  assert.equal(result.items[2].reason, 'action-not-backfill');

  const settingsValue = app.homey.settings.get('curation.v1');
  assert.equal(Boolean(settingsValue.entries['main:12']), true);
  assert.equal(settingsValue.entries['main:12'].baselineMarker.baselineProfileHash, 'hash-12');
  assert.equal(settingsValue.entries['main:12'].baselineMarker.pipelineFingerprint, 'pf-12');
  assert.equal(settingsValue.entries['main:8'], undefined);
  assert.equal(settingsValue.entries['main:5'], undefined);
  await app.onUninit();
});

test('app executeRecommendationAction auto-selects backfill action and applies marker', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:12',
      nodeId: 12,
      profileResolution: {
        profileId: 'profile-main-12',
        recommendationBackfillNeeded: true,
        recommendationReason: 'marker-missing-backfill',
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'hash-12',
        currentBaselinePipelineFingerprint: 'pf-12',
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();

  const result = await app.executeRecommendationAction({
    homeyDeviceId: 'main:12',
  });

  assert.equal(result.requestedAction, 'auto');
  assert.equal(result.selectedAction, 'backfill-marker');
  assert.equal(result.executed, true);
  assert.equal(result.reason, 'created-entry-and-backfilled-marker');
  assert.equal(result.createdEntry, true);

  const settingsValue = app.homey.settings.get('curation.v1');
  assert.equal(settingsValue.entries['main:12'].baselineMarker.baselineProfileHash, 'hash-12');
  assert.equal(settingsValue.entries['main:12'].baselineMarker.pipelineFingerprint, 'pf-12');

  await app.onUninit();
});

test('app executeRecommendationAction rejects explicit action mismatch', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-main-8',
        recommendationAvailable: true,
        recommendationBackfillNeeded: false,
        recommendationReason: 'baseline-hash-changed',
        currentBaselineHash: 'hash-8',
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();

  const result = await app.executeRecommendationAction({
    homeyDeviceId: 'main:8',
    action: 'backfill-marker',
  });

  assert.equal(result.executed, false);
  assert.equal(result.selectedAction, 'adopt-recommended-baseline');
  assert.equal(result.reason, 'action-mismatch');

  await app.onUninit();
});

test('app executeRecommendationAction rejects invalid action selection values', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-main-8',
        recommendationAvailable: true,
        recommendationBackfillNeeded: false,
        recommendationReason: 'baseline-hash-changed',
        currentBaselineHash: 'hash-8',
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();

  const result = await app.executeRecommendationAction({
    homeyDeviceId: 'main:8',
    action: 'bogus-action',
  });

  assert.equal(result.executed, false);
  assert.equal(result.selectedAction, 'none');
  assert.equal(result.reason, 'invalid-action-selection');

  await app.onUninit();
});

test('app executeRecommendationActions processes queue and returns execution summary', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:12',
      nodeId: 12,
      profileResolution: {
        profileId: 'profile-main-12',
        recommendationBackfillNeeded: true,
        recommendationReason: 'marker-missing-backfill',
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'hash-12',
        mappingDiagnostics: [],
      },
    }),
    createNodeDiagnosticsDevice({
      id: 'main:8',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-main-8',
        recommendationAvailable: true,
        recommendationBackfillNeeded: false,
        recommendationReason: 'baseline-hash-changed',
        currentBaselineHash: 'next-hash-8',
        storedBaselineHash: 'old-hash-8',
        mappingDiagnostics: [],
      },
    }),
    createNodeDiagnosticsDevice({
      id: 'main:5',
      nodeId: 5,
      profileResolution: {
        profileId: 'profile-main-5',
        recommendationAvailable: false,
        recommendationBackfillNeeded: false,
        recommendationReason: 'baseline-hash-unchanged',
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  app.homey.settings.set(
    'curation.v1',
    createCurationDocument({
      'main:8': {
        targetDevice: { homeyDeviceId: 'main:8' },
        baselineMarker: {
          projectionVersion: '1',
          baselineProfileHash: 'old-hash-8',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        overrides: {},
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    }),
  );
  await app.onInit();

  const summary = await app.executeRecommendationActions();
  assert.equal(summary.total, 2);
  assert.equal(summary.executed, 2);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.results.length, 2);
  assert.equal(summary.results[0].selectedAction, 'backfill-marker');
  assert.equal(summary.results[1].selectedAction, 'adopt-recommended-baseline');

  const settingsValue = app.homey.settings.get('curation.v1');
  assert.equal(Boolean(settingsValue.entries['main:12']), true);
  assert.equal(settingsValue.entries['main:8'], undefined);
  assert.equal(settingsValue.entries['main:5'], undefined);

  await app.onUninit();
});

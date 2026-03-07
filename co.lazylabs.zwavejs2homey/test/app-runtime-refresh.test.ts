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

class FakeDelayedDriversManager extends FakeDriversManager {
  constructor(nodeDevices, bridgeDevices = [], failCounts = {}) {
    super(nodeDevices, bridgeDevices);
    this.failCounts = {
      node: failCounts.node ?? 0,
      bridge: failCounts.bridge ?? 0,
    };
  }

  getDriver(driverId) {
    if (driverId === 'node' || driverId === 'bridge') {
      const remaining = this.failCounts[driverId] ?? 0;
      if (remaining > 0) {
        this.failCounts[driverId] = remaining - 1;
        throw new Error(`Driver Not Initialized: ${driverId}`);
      }
    }
    return super.getDriver(driverId);
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
  const createdClients = [];
  const totals = {
    startCalls: 0,
    stopCalls: 0,
  };
  let nextClientId = 1;

  function createClient() {
    const client = {
      clientId: `mock-client-${nextClientId}`,
      startCalls: 0,
      stopCalls: 0,
      listeners: [],
      async start() {
        this.startCalls += 1;
        totals.startCalls += 1;
      },
      async stop() {
        this.stopCalls += 1;
        totals.stopCalls += 1;
      },
      getStatus() {
        return {
          transportConnected: true,
          lifecycle: 'started',
          versionReceived: true,
          initialized: true,
          listening: true,
          authenticated: true,
          serverVersion: '3.4.0',
          adapterFamily: 'zwjs-default',
          reconnectAttempt: 0,
          connectedAt: '2026-03-02T12:00:00.000Z',
          lastMessageAt: '2026-03-02T12:00:05.000Z',
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
    nextClientId += 1;
    createdClients.push(client);
    return client;
  }

  return {
    get mockClient() {
      return createdClients[0];
    },
    get latestClient() {
      return createdClients[createdClients.length - 1];
    },
    createdClients,
    totals,
    module: {
      ZWJS_CONNECTION_SETTINGS_KEY: 'zwjs_connection',
      ZWJS_COMMAND_NODE_SET_VALUE: 'node.set_value',
      resolveZwjsConnectionConfig: () => ({
        source: 'default',
        warnings: [],
        clientConfig: { url: 'ws://127.0.0.1:3000', auth: undefined },
      }),
      createZwjsClient: () => createClient(),
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

test('app waits for node and bridge drivers before startup refresh', async () => {
  const refreshCalls = [];
  const bridgeRefreshCalls = [];
  const nodeDevices = [
    {
      async onRuntimeMappingsRefresh(reason) {
        refreshCalls.push(reason);
      },
    },
  ];
  const bridgeDevices = [
    {
      async onRuntimeDiagnosticsRefresh(reason) {
        bridgeRefreshCalls.push(reason);
      },
    },
  ];

  const { app } = loadAppClass(nodeDevices, bridgeDevices);
  app.homey.drivers = new FakeDelayedDriversManager(nodeDevices, bridgeDevices, {
    node: 2,
    bridge: 2,
  });
  await app.onInit();

  assert.deepEqual(refreshCalls, ['startup']);
  assert.deepEqual(bridgeRefreshCalls, ['startup']);
  const startupRaceErrors = app.errors.filter((entry) =>
    /Failed to refresh node runtime mappings|Failed to refresh bridge runtime diagnostics|Driver Not Initialized/.test(
      String(entry.message),
    ),
  );
  assert.equal(startupRaceErrors.length, 0);

  await app.onUninit();
});

test('app diagnostics wait for node driver readiness without throwing', async () => {
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
  ];
  const { app } = loadAppClass(nodeDevices);
  app.homey.drivers = new FakeDelayedDriversManager(nodeDevices, [], { node: 2 });

  const snapshot = await app.getNodeRuntimeDiagnostics();
  assert.equal(snapshot.nodes.length, 1);
  assert.equal(snapshot.nodes[0].homeyDeviceId, 'main:5');
  assert.equal(snapshot.nodes[0].nodeId, 5);
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

test('app does not attempt zwjs connection when zwjs_connection.url is not configured', async () => {
  const { app, coreMock } = loadAppClass([]);
  await app.onInit();

  assert.equal(coreMock.createdClients.length, 0);
  assert.equal(coreMock.totals.startCalls, 0);
  assert.equal(app.getZwjsClient(), undefined);

  await app.onUninit();
  assert.equal(coreMock.totals.stopCalls, 0);
});

test('app starts zwjs client after zwjs_connection.url is configured at runtime', async () => {
  const { app, coreMock } = loadAppClass([]);
  await app.onInit();
  assert.equal(coreMock.totals.startCalls, 0);

  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
  await flushEventQueue();

  assert.equal(coreMock.totals.startCalls, 1);
  assert.ok(app.getZwjsClient());

  await app.onUninit();
  assert.equal(coreMock.totals.stopCalls, 1);
});

test('app reconnect continues after stop failure and swaps bridge-session client', async () => {
  const { app, coreMock } = loadAppClass([]);
  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
  await app.onInit();

  const firstClient = coreMock.latestClient;
  firstClient.stop = async function stopWithFailure() {
    this.stopCalls += 1;
    coreMock.totals.stopCalls += 1;
    throw new Error('simulated stop failure');
  };

  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3002' });
  await flushEventQueue();

  assert.equal(coreMock.createdClients.length, 2);
  assert.equal(coreMock.totals.startCalls, 2);
  assert.equal(coreMock.totals.stopCalls, 1);
  assert.notEqual(coreMock.latestClient, firstClient);
  assert.equal(app.getBridgeSession()?.getZwjsClient(), coreMock.latestClient);
  assert.equal(
    app.errors.some((entry) => entry.message === 'Failed to stop ZWJS client'),
    true,
  );

  await app.onUninit();
  assert.equal(coreMock.totals.stopCalls, 2);
});

test('app exposes a default bridge session seam and keeps client lifecycle scoped to it', async () => {
  const { app, coreMock } = loadAppClass([]);
  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });

  await app.onInit();
  const session = app.getBridgeSession();
  assert.ok(session);
  assert.equal(session.bridgeId, 'main');
  assert.equal(session.getZwjsClient(), app.getZwjsClient());
  assert.equal(coreMock.totals.startCalls, 1);

  await app.onUninit();
  const sessionAfterStop = app.getBridgeSession();
  assert.ok(sessionAfterStop);
  assert.equal(sessionAfterStop.getZwjsClient(), undefined);
  assert.equal(coreMock.totals.stopCalls, 1);
});

test('app remains stable under repeated settings churn across compiled, curation, and zwjs connection updates', async () => {
  const nodeRefreshCalls = [];
  const bridgeRefreshCalls = [];
  const nodeDevices = [
    {
      async onRuntimeMappingsRefresh(reason) {
        nodeRefreshCalls.push(reason);
      },
    },
  ];
  const bridgeDevices = [
    {
      async onRuntimeDiagnosticsRefresh(reason) {
        bridgeRefreshCalls.push(reason);
      },
    },
  ];

  const { app, coreMock } = loadAppClass(nodeDevices, bridgeDevices);
  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
  await app.onInit();

  const cycles = 3;
  for (let index = 0; index < cycles; index += 1) {
    app.homey.settings.set('compiled_profiles_file', `/tmp/compiled-${index}.json`);
    await flushEventQueue();
    app.homey.settings.set('curation.v1', {
      schemaVersion: 'homey-curation/v1',
      updatedAt: `2026-03-0${index + 1}T00:00:00.000Z`,
      entries: {},
    });
    await flushEventQueue();
    app.homey.settings.set('zwjs_connection', {
      url: `ws://127.0.0.1:${3002 + index}`,
    });
    await flushEventQueue();
  }

  const expectedRefreshesPerDriver = 1 + cycles * 3;
  assert.equal(nodeRefreshCalls.length, expectedRefreshesPerDriver);
  assert.equal(bridgeRefreshCalls.length, expectedRefreshesPerDriver);
  assert.equal(
    nodeRefreshCalls.filter((reason) => reason === 'compiled-profiles-updated').length,
    cycles,
  );
  assert.equal(nodeRefreshCalls.filter((reason) => reason === 'curation-updated').length, cycles);
  assert.equal(
    nodeRefreshCalls.filter((reason) => reason === 'zwjs-connection-updated').length,
    cycles,
  );
  assert.equal(
    bridgeRefreshCalls.filter((reason) => reason === 'compiled-profiles-updated').length,
    cycles,
  );
  assert.equal(bridgeRefreshCalls.filter((reason) => reason === 'curation-updated').length, cycles);
  assert.equal(
    bridgeRefreshCalls.filter((reason) => reason === 'zwjs-connection-updated').length,
    cycles,
  );
  assert.equal(coreMock.createdClients.length, 1 + cycles);
  assert.equal(coreMock.totals.startCalls, 1 + cycles);
  assert.equal(coreMock.totals.stopCalls, cycles);
  assert.equal(app.getBridgeSession()?.getZwjsClient(), coreMock.latestClient);

  const lifecycleErrors = app.errors.filter((entry) =>
    /Failed to refresh|ZWJS lifecycle operation failed/.test(String(entry.message)),
  );
  assert.equal(lifecycleErrors.length, 0);

  await app.onUninit();
  assert.equal(coreMock.totals.stopCalls, 1 + cycles);
});

test('app ignores stale bridge-session client events after zwjs reconnect', async () => {
  const nodeRefreshCalls = [];
  const bridgeRefreshCalls = [];
  const nodeDevices = [
    {
      getData: () => ({ bridgeId: 'main', nodeId: 5 }),
      async onRuntimeMappingsRefresh(reason) {
        nodeRefreshCalls.push(reason);
      },
    },
  ];
  const bridgeDevices = [
    {
      async onRuntimeDiagnosticsRefresh(reason) {
        bridgeRefreshCalls.push(reason);
      },
    },
  ];

  const { app, coreMock } = loadAppClass(nodeDevices, bridgeDevices);
  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
  await app.onInit();

  const firstClient = coreMock.latestClient;
  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3002' });
  await flushEventQueue();
  const secondClient = coreMock.latestClient;
  assert.notEqual(secondClient, firstClient);
  assert.equal(app.getBridgeSession()?.getZwjsClient(), secondClient);

  nodeRefreshCalls.length = 0;
  bridgeRefreshCalls.length = 0;

  firstClient.emitEvent({
    type: 'zwjs.event.node.metadata-updated',
    event: { nodeId: 5 },
  });
  await flushEventQueue();
  assert.deepEqual(nodeRefreshCalls, []);
  assert.deepEqual(bridgeRefreshCalls, []);

  secondClient.emitEvent({
    type: 'zwjs.event.node.metadata-updated',
    event: { nodeId: 5 },
  });
  await flushEventQueue();
  assert.deepEqual(nodeRefreshCalls, ['event:zwjs.event.node.metadata-updated:bridge-main:node-5']);
  assert.deepEqual(bridgeRefreshCalls, [
    'event:zwjs.event.node.metadata-updated:bridge-main:node-5',
  ]);

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
  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
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
  assert.deepEqual(node5Calls, ['event:zwjs.event.node.metadata-updated:bridge-main:node-5']);
  assert.deepEqual(node8Calls, []);
  assert.deepEqual(otherBridgeCalls, []);

  coreMock.mockClient.emitEvent({
    type: 'zwjs.event.node.value-added',
    event: {
      nodeId: 8,
    },
  });
  await flushEventQueue();
  assert.deepEqual(node8Calls, ['event:zwjs.event.node.value-added:bridge-main:node-8']);

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
  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
  await app.onInit();
  bridgeRefreshCalls.length = 0;

  coreMock.mockClient.emitEvent({
    type: 'zwjs.event.node.metadata-updated',
    event: {
      nodeId: 5,
    },
  });
  await flushEventQueue();
  assert.deepEqual(bridgeRefreshCalls, [
    'event:zwjs.event.node.metadata-updated:bridge-main:node-5',
  ]);

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
  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
  await app.onInit();
  const snapshot = await app.getNodeRuntimeDiagnostics();

  assert.equal(snapshot.bridgeId, 'main');
  assert.equal(snapshot.zwjs.available, true);
  assert.equal(snapshot.zwjs.serverVersion, '3.4.0');
  assert.equal(snapshot.zwjs.adapterFamily, 'zwjs-default');
  assert.equal(snapshot.zwjs.versionReceived, true);
  assert.equal(snapshot.zwjs.initialized, true);
  assert.equal(snapshot.zwjs.listening, true);
  assert.equal(snapshot.zwjs.authenticated, true);
  assert.equal(snapshot.compiledProfiles.loaded, true);
  assert.equal(snapshot.curation.loaded, true);
  assert.equal(snapshot.nodes.length, 2);
  assert.equal(snapshot.nodes[0].nodeId, 5);
  assert.equal(snapshot.nodes[1].nodeId, 8);

  const node8 = snapshot.nodes.find((entry) => entry.homeyDeviceId === 'main:8');
  assert.ok(node8);
  assert.equal(node8.recommendation.available, true);
  assert.equal(node8.recommendation.reason, 'baseline-hash-changed');
  assert.equal(node8.recommendation.reasonLabel, 'Compiled profile changed for this device.');
  assert.equal(node8.recommendation.currentPipelineFingerprint, 'pf-new');
  assert.equal(node8.profileAttribution.confidenceCode, 'curated');
  assert.equal(node8.profileAttribution.confidenceLabel, 'Project rule match');
  assert.equal(node8.profileAttribution.sourceCode, 'compiled+curation-override');
  assert.equal(node8.profileAttribution.curationEntryPresent, true);
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

test('app diagnostics snapshot supports bridgeId filtering', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:5',
      bridgeId: 'main',
      nodeId: 5,
      profileResolution: {
        profileId: 'profile-main-5',
        recommendationAvailable: false,
        mappingDiagnostics: [],
      },
    }),
    createNodeDiagnosticsDevice({
      id: 'secondary:8',
      bridgeId: 'secondary',
      nodeId: 8,
      profileResolution: {
        profileId: 'profile-secondary-8',
        recommendationAvailable: true,
        recommendationReason: 'baseline-hash-changed',
        mappingDiagnostics: [],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();
  await app.configureBridgeConnection({
    bridgeId: 'secondary',
    settings: { zwjs_url: 'ws://127.0.0.1:3002' },
    reason: 'test-secondary',
  });

  const snapshot = await app.getNodeRuntimeDiagnostics({ bridgeId: 'secondary' });
  assert.equal(snapshot.bridgeId, 'secondary');
  assert.equal(snapshot.zwjs.available, true);
  assert.equal(snapshot.nodes.length, 1);
  assert.equal(snapshot.nodes[0].homeyDeviceId, 'secondary:8');

  await app.onUninit();
});

test('app bridge connection lifecycle can be configured and removed per bridge', async () => {
  const { app, coreMock } = loadAppClass([]);
  await app.onInit();

  assert.equal(coreMock.totals.startCalls, 0);
  assert.equal(coreMock.totals.stopCalls, 0);
  assert.equal(app.getBridgeSession('secondary'), undefined);

  await app.configureBridgeConnection({
    bridgeId: 'secondary',
    settings: { zwjs_url: 'ws://127.0.0.1:3002' },
    reason: 'test-configure',
  });

  assert.equal(coreMock.totals.startCalls, 1);
  assert.equal(Boolean(app.getBridgeSession('secondary')?.getZwjsClient()), true);

  await app.removeBridgeConnection({
    bridgeId: 'secondary',
    reason: 'test-remove',
  });

  assert.equal(coreMock.totals.stopCalls, 1);
  assert.equal(app.getBridgeSession('secondary'), undefined);

  await app.onUninit();
});

test('app node device tools snapshot returns targeted diagnostics payload', async () => {
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
            applied: 4,
            skipped: 1,
            errors: 0,
          },
        },
        nodeState: {
          manufacturerId: 29,
          productType: 66,
          productId: 2,
          manufacturer: 'Leviton',
          product: 'DZ6HD',
          location: 'Study',
          interviewStage: 'Complete',
          status: 'Alive',
          firmwareVersion: '1.2',
          ready: true,
          isFailed: false,
        },
        recommendationAvailable: true,
        recommendationReason: 'baseline-hash-changed',
        recommendationBackfillNeeded: false,
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'next-hash-8',
        storedBaselineHash: 'old-hash-8',
        currentBaselinePipelineFingerprint: 'pf-next',
        storedBaselinePipelineFingerprint: 'pf-old',
        verticalSliceApplied: true,
        mappingDiagnostics: [
          {
            capabilityId: 'onoff',
            inbound: { configured: true, enabled: true, reason: null },
            outbound: { configured: true, enabled: true, reason: null },
          },
          {
            capabilityId: 'measure_power',
            inbound: { configured: true, enabled: false, reason: 'inbound_selector_not_defined' },
            outbound: { configured: true, enabled: false, reason: 'outbound_target_not_writeable' },
          },
        ],
      },
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  app.homey.settings.set('zwjs_connection', { url: 'ws://127.0.0.1:3001' });
  await app.onInit();

  const snapshot = await app.getNodeDeviceToolsSnapshot({ homeyDeviceId: 'main:8' });
  assert.equal(snapshot.schemaVersion, 'node-device-tools/v1');
  assert.equal(snapshot.device.homeyDeviceId, 'main:8');
  assert.equal(snapshot.profile.profileId, 'profile-main-8');
  assert.equal(snapshot.profileAttribution.confidenceCode, 'curated');
  assert.equal(snapshot.profileAttribution.sourceCode, 'compiled+curation-override');
  assert.equal(snapshot.profileAttribution.curationEntryPresent, true);
  assert.equal(snapshot.recommendation.suggestedAction, 'adopt-recommended-baseline');
  assert.equal(snapshot.recommendation.actionable, true);
  assert.equal(snapshot.recommendation.reasonLabel, 'Compiled profile changed for this device.');
  assert.equal(snapshot.sync.syncedAt, '2026-03-02T00:00:00.000Z');
  assert.equal(snapshot.sync.syncReason, 'startup');
  assert.equal(snapshot.node.manufacturerId, 29);
  assert.equal(snapshot.node.productType, 66);
  assert.equal(snapshot.node.productId, 2);
  assert.equal(snapshot.node.manufacturer, 'Leviton');
  assert.equal(snapshot.node.product, 'DZ6HD');
  assert.equal(snapshot.node.location, 'Study');
  assert.equal(snapshot.runtime.zwjs.serverVersion, '3.4.0');
  assert.equal(snapshot.curation.loaded, true);
  assert.equal(snapshot.curation.source, 'settings');
  assert.equal(snapshot.curation.entryPresent, true);
  assert.equal(snapshot.curation.appliedActions, 4);
  assert.equal(snapshot.curation.skippedActions, 1);
  assert.equal(snapshot.mapping.verticalSliceApplied, true);
  assert.equal(snapshot.mapping.capabilityCount, 2);
  assert.equal(snapshot.mapping.inboundConfigured, 2);
  assert.equal(snapshot.mapping.inboundEnabled, 1);
  assert.equal(snapshot.mapping.inboundSkipped, 1);
  assert.equal(snapshot.mapping.outboundConfigured, 2);
  assert.equal(snapshot.mapping.outboundEnabled, 1);
  assert.equal(snapshot.mapping.outboundSkipped, 1);
  assert.equal(snapshot.mapping.skipReasons.inbound_selector_not_defined, 1);
  assert.equal(snapshot.mapping.skipReasons.outbound_target_not_writeable, 1);
  assert.equal(snapshot.profileReference.currentBaselineHash, 'next-hash-8');
  assert.equal(snapshot.profileReference.storedBaselineHash, 'old-hash-8');
  assert.equal(snapshot.ui.readOnly, true);
  assert.equal(snapshot.ui.actionsEnabled, false);

  await app.onUninit();
});

test('app node device tools snapshot supports profile-resolution-pending devices', async () => {
  const nodeDevices = [
    createNodeDiagnosticsDevice({
      id: 'main:21',
      nodeId: 21,
      profileResolution: undefined,
    }),
  ];

  const { app } = loadAppClass(nodeDevices);
  await app.onInit();

  const snapshot = await app.getNodeDeviceToolsSnapshot({ homeyDeviceId: 'main:21' });
  assert.equal(snapshot.profile.fallbackReason, 'profile-resolution-not-ready');
  assert.equal(snapshot.profileAttribution.sourceCode, 'unresolved');
  assert.equal(snapshot.profileAttribution.confidenceCode, null);
  assert.equal(snapshot.recommendation.reason, 'profile-resolution-not-ready');
  assert.equal(
    snapshot.recommendation.reasonLabel,
    'Runtime mapping has not been generated for this device yet.',
  );
  assert.equal(snapshot.recommendation.actionable, false);
  assert.equal(snapshot.profileReference.currentBaselineHash, null);

  await app.onUninit();
});

test('app node device tools snapshot rejects unknown homeyDeviceId', async () => {
  const { app } = loadAppClass([]);
  await app.onInit();

  await assert.rejects(
    () => app.getNodeDeviceToolsSnapshot({ homeyDeviceId: 'main:404' }),
    /Node device not found for homeyDeviceId: main:404/,
  );

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

test('app runtime support bundle aggregates diagnostics and recommendations', async () => {
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
  const bundle = await app.getRuntimeSupportBundle({ includeNoAction: true });
  assert.equal(bundle.schemaVersion, 'homey-runtime-support-bundle/v1');
  assert.equal(bundle.summary.nodeCount, 2);
  assert.equal(bundle.summary.recommendationTotal, 2);
  assert.equal(bundle.summary.actionableRecommendations, 1);
  assert.equal(bundle.summary.compiledProfilesLoaded, true);
  assert.equal(bundle.summary.curationLoaded, true);
  assert.equal(bundle.diagnostics.nodes.length, 2);
  assert.equal(bundle.recommendations.items.length, 2);
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
  assert.equal(result.latestReason, 'baseline-hash-changed');

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

test('app executeRecommendationActions delegates each actionable device through executeRecommendationAction', async () => {
  const { app } = loadAppClass([]);
  await app.onInit();

  app.getRecommendationActionQueue = async () => ({
    generatedAt: '2026-03-03T00:00:00.000Z',
    total: 3,
    actionable: 2,
    items: [
      {
        homeyDeviceId: 'main:12',
        nodeId: 12,
        profileId: 'profile-main-12',
        action: 'backfill-marker',
        reason: 'marker-missing-backfill',
        recommendationAvailable: false,
        recommendationBackfillNeeded: true,
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'hash-12',
        storedBaselineHash: null,
        currentPipelineFingerprint: 'pf-12',
      },
      {
        homeyDeviceId: 'main:8',
        nodeId: 8,
        profileId: 'profile-main-8',
        action: 'adopt-recommended-baseline',
        reason: 'baseline-hash-changed',
        recommendationAvailable: true,
        recommendationBackfillNeeded: false,
        recommendationProjectionVersion: '1',
        currentBaselineHash: 'hash-8-next',
        storedBaselineHash: 'hash-8-old',
        currentPipelineFingerprint: 'pf-8-next',
      },
      {
        homeyDeviceId: null,
        nodeId: null,
        profileId: null,
        action: 'none',
        reason: 'missing-homey-device-id',
        recommendationAvailable: false,
        recommendationBackfillNeeded: false,
        recommendationProjectionVersion: null,
        currentBaselineHash: null,
        storedBaselineHash: null,
        currentPipelineFingerprint: null,
      },
    ],
  });

  const actionCalls = [];
  app.executeRecommendationAction = async (options) => {
    actionCalls.push(options);
    if (options.homeyDeviceId === 'main:12') {
      return {
        homeyDeviceId: 'main:12',
        requestedAction: 'backfill-marker',
        selectedAction: 'backfill-marker',
        executed: true,
        reason: 'backfilled-marker',
        createdEntry: false,
      };
    }
    return {
      homeyDeviceId: 'main:8',
      requestedAction: 'adopt-recommended-baseline',
      selectedAction: 'none',
      executed: false,
      reason: 'action-state-changed',
      latestReason: 'baseline-hash-unchanged',
      stateChanged: true,
    };
  };

  const summary = await app.executeRecommendationActions({ includeNoAction: true });

  assert.deepEqual(actionCalls, [
    { homeyDeviceId: 'main:12', action: 'backfill-marker' },
    { homeyDeviceId: 'main:8', action: 'adopt-recommended-baseline' },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.executed, 1);
  assert.equal(summary.skipped, 2);
  assert.equal(summary.results[0].reason, 'backfilled-marker');
  assert.equal(summary.results[1].reason, 'action-state-changed');
  assert.equal(summary.results[1].latestReason, 'baseline-hash-unchanged');
  assert.equal(summary.results[2].reason, 'missing-homey-device-id');

  await app.onUninit();
});

test('app executeRecommendationAction reports state-changed when action flips during execution', async () => {
  const { app } = loadAppClass([]);
  await app.onInit();

  let queueCallCount = 0;
  app.getRecommendationActionQueue = async () => {
    queueCallCount += 1;
    if (queueCallCount === 1) {
      return {
        generatedAt: '2026-03-03T00:00:00.000Z',
        total: 1,
        actionable: 1,
        items: [
          {
            homeyDeviceId: 'main:8',
            nodeId: 8,
            profileId: 'profile-main-8',
            action: 'adopt-recommended-baseline',
            reason: 'baseline-hash-changed',
            recommendationAvailable: true,
            recommendationBackfillNeeded: false,
            recommendationProjectionVersion: '1',
            currentBaselineHash: 'hash-8-next',
            storedBaselineHash: 'hash-8-old',
            currentPipelineFingerprint: 'pf-next',
          },
        ],
      };
    }
    return {
      generatedAt: '2026-03-03T00:00:01.000Z',
      total: 1,
      actionable: 0,
      items: [
        {
          homeyDeviceId: 'main:8',
          nodeId: 8,
          profileId: 'profile-main-8',
          action: 'none',
          reason: 'baseline-hash-unchanged',
          recommendationAvailable: false,
          recommendationBackfillNeeded: false,
          recommendationProjectionVersion: '1',
          currentBaselineHash: 'hash-8-next',
          storedBaselineHash: 'hash-8-next',
          currentPipelineFingerprint: 'pf-next',
        },
      ],
    };
  };
  app.adoptRecommendedBaseline = async () => ({
    adopted: false,
    reason: 'recommendation-unavailable',
  });

  const result = await app.executeRecommendationAction({
    homeyDeviceId: 'main:8',
    action: 'adopt-recommended-baseline',
  });

  assert.equal(result.executed, false);
  assert.equal(result.selectedAction, 'none');
  assert.equal(result.reason, 'action-state-changed');
  assert.equal(result.latestReason, 'baseline-hash-unchanged');
  assert.equal(result.stateChanged, true);
  assert.equal(queueCallCount, 2);

  await app.onUninit();
});

test('app executeRecommendationAction keeps execution reason when action remains unchanged', async () => {
  const { app } = loadAppClass([]);
  await app.onInit();

  let queueCallCount = 0;
  app.getRecommendationActionQueue = async () => {
    queueCallCount += 1;
    return {
      generatedAt: '2026-03-03T00:00:00.000Z',
      total: 1,
      actionable: 1,
      items: [
        {
          homeyDeviceId: 'main:12',
          nodeId: 12,
          profileId: 'profile-main-12',
          action: 'backfill-marker',
          reason: 'marker-missing-backfill',
          recommendationAvailable: false,
          recommendationBackfillNeeded: true,
          recommendationProjectionVersion: '1',
          currentBaselineHash: 'hash-12',
          storedBaselineHash: null,
          currentPipelineFingerprint: 'pf-12',
        },
      ],
    };
  };
  app.backfillCurationBaselineMarker = async () => ({
    updated: false,
    createdEntry: false,
    reason: 'baseline-marker-unavailable',
  });

  const result = await app.executeRecommendationAction({
    homeyDeviceId: 'main:12',
  });

  assert.equal(result.executed, false);
  assert.equal(result.selectedAction, 'backfill-marker');
  assert.equal(result.reason, 'baseline-marker-unavailable');
  assert.equal(result.latestReason, 'marker-missing-backfill');
  assert.equal(result.stateChanged, false);
  assert.equal(queueCallCount, 2);

  await app.onUninit();
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

class FakeHomeyDriver {
  constructor() {
    this.homey = { app: {} };
    this._devices = [];
  }

  _configureHarness({ app, devices, zones, api } = {}) {
    const nextHomey = { ...this.homey };
    if (typeof app !== 'undefined') nextHomey.app = app;
    if (typeof zones !== 'undefined') nextHomey.zones = zones;
    if (typeof api !== 'undefined') nextHomey.api = api;
    this.homey = nextHomey;
    if (Array.isArray(devices)) this._devices = devices;
  }

  getDevices() {
    return this._devices;
  }

  log() {}

  error() {}
}

class FakeHomeyDevice {
  getData() {
    return {};
  }

  getSettings() {
    return {};
  }

  async setStoreValue() {}

  log() {}

  error() {}
}

function loadClass(modulePathFromBuild) {
  const modulePath = path.resolve(__dirname, modulePathFromBuild);
  const originalLoad = Module._load;
  Module._load = function patchedModuleLoad(request, parent, isMain) {
    if (request === 'homey') {
      return { Driver: FakeHomeyDriver, Device: FakeHomeyDevice };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[modulePath];
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

const BridgeDriver = loadClass('../.homeybuild/drivers/bridge/driver.js');
const NodeDriver = loadClass('../.homeybuild/drivers/node/driver.js');

function createSessionHarness() {
  const handlers = new Map();
  return {
    handlers,
    session: {
      setHandler(event, handler) {
        handlers.set(event, handler);
      },
    },
  };
}

async function invokeWithDeadline(handler, payload, label, timeoutMs = 1000) {
  let deadlineHandle;
  const deadline = new Promise((_, reject) => {
    deadlineHandle = setTimeout(() => {
      reject(new Error(`${label} did not resolve within ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const invocation =
      typeof payload === 'undefined'
        ? Promise.resolve(handler())
        : Promise.resolve(handler(payload));
    return await Promise.race([invocation, deadline]);
  } finally {
    clearTimeout(deadlineHandle);
  }
}

function createBridgeDiagnosticsSnapshot(bridgeId) {
  return {
    generatedAt: '2026-03-06T00:00:00.000Z',
    bridgeId,
    zwjs: {
      available: true,
      transportConnected: true,
      lifecycle: 'connected',
      versionReceived: true,
      initialized: true,
      listening: true,
      authenticated: null,
      serverVersion: '3.4.0',
      adapterFamily: 'zwjs-default',
      reconnectAttempt: null,
      connectedAt: '2026-03-06T00:00:00.000Z',
      lastMessageAt: '2026-03-06T00:00:00.000Z',
    },
    compiledProfiles: {
      loaded: true,
      sourcePath: '/tmp/compiled.json',
      generatedAt: '2026-03-06T00:00:00.000Z',
      pipelineFingerprint: 'pf-1',
      entryCount: 1,
      duplicateKeys: {
        productTriple: 0,
        nodeId: 0,
        deviceKey: 0,
      },
      errorMessage: null,
    },
    curation: {
      loaded: true,
      source: 'settings',
      entryCount: 0,
      errorMessage: null,
    },
    nodes: [],
  };
}

function createNodeDeviceToolsSnapshot(bridgeId, homeyDeviceId) {
  return {
    schemaVersion: 'node-device-tools/v1',
    generatedAt: '2026-03-06T00:00:00.000Z',
    device: {
      homeyDeviceId,
      bridgeId,
      nodeId: 12,
    },
    runtime: {
      zwjs: {
        available: true,
        transportConnected: true,
        lifecycle: 'connected',
      },
      compiledProfiles: { loaded: true },
      curation: { loaded: true },
    },
    node: {},
    sync: { syncedAt: '2026-03-06T00:00:00.000Z', syncReason: 'startup' },
    profile: {},
    profileAttribution: {},
    mapping: {},
    curation: {},
    recommendation: {
      available: false,
      reason: 'none',
      reasonLabel: 'No action required.',
      backfillNeeded: false,
      suggestedAction: 'none',
      actionable: false,
    },
    profileReference: {},
    ui: {
      readOnly: true,
      actionsEnabled: false,
    },
  };
}

test('panel liveness contract: active pair/repair handlers resolve with expected shapes', async () => {
  const bridgeId = 'main';
  const bridgeDeviceData = {
    id: 'zwjs-bridge-main',
    kind: 'zwjs-bridge',
    bridgeId,
  };
  const bridgeSettings = [];

  const bridgeDriver = new BridgeDriver();
  bridgeDriver._configureHarness({
    app: {
      async configureBridgeConnection() {},
      async getNodeRuntimeDiagnostics() {
        return createBridgeDiagnosticsSnapshot(bridgeId);
      },
    },
    devices: [
      {
        getData: () => bridgeDeviceData,
        getName: () => 'ZWJS Bridge (main)',
        getSettings: () => ({
          zwjs_url: 'ws://127.0.0.1:3000',
          zwjs_auth_type: 'none',
          zwjs_auth_token: '',
        }),
        async setSettings(nextSettings) {
          bridgeSettings.push(nextSettings);
        },
      },
    ],
  });

  const nodeDriver = new NodeDriver();
  nodeDriver._configureHarness({
    app: {
      getBridgeSession() {
        return {
          bridgeId,
          getZwjsClient() {
            return {
              async getNodeList() {
                return {
                  nodes: [
                    { nodeId: 1, name: 'Controller' },
                    { nodeId: 12, name: 'Lamp' },
                  ],
                };
              },
            };
          },
        };
      },
      async getNodeDeviceToolsSnapshot({ homeyDeviceId }) {
        return createNodeDeviceToolsSnapshot(bridgeId, homeyDeviceId);
      },
      async executeRecommendationAction() {
        return { ok: true, action: 'none', reason: 'noop' };
      },
    },
    devices: [],
  });

  const bridgePairHarness = createSessionHarness();
  const bridgeRepairHarness = createSessionHarness();
  const nodePairHarness = createSessionHarness();
  const nodeRepairHarness = createSessionHarness();

  await bridgeDriver.onPair(bridgePairHarness.session);
  await bridgeDriver.onRepair(bridgeRepairHarness.session, {
    getData: () => ({ id: 'zwjs-bridge-main', bridgeId }),
  });
  await nodeDriver.onPair(nodePairHarness.session);
  await nodeDriver.onRepair(nodeRepairHarness.session, {
    getData: () => ({ id: 'main:12', bridgeId, nodeId: 12 }),
  });

  const cases = [
    {
      label: 'bridge pair bridge_config:get_context',
      handler: bridgePairHarness.handlers.get('bridge_config:get_context'),
      payload: undefined,
      assertShape(result) {
        assert.equal(typeof result, 'object');
        assert.equal(result.bridgeId, bridgeId);
      },
    },
    {
      label: 'bridge pair bridge_config:save_settings',
      handler: bridgePairHarness.handlers.get('bridge_config:save_settings'),
      payload: {
        bridgeId,
        url: 'ws://127.0.0.1:3000',
        authType: 'none',
        token: '',
      },
      assertShape(result) {
        assert.equal(result.ok, true);
        assert.equal(result.bridgeId, bridgeId);
        assert.equal(result.configured, true);
      },
    },
    {
      label: 'bridge pair list_devices',
      handler: bridgePairHarness.handlers.get('list_devices'),
      payload: undefined,
      assertShape(result) {
        assert.equal(Array.isArray(result), true);
      },
    },
    {
      label: 'bridge repair bridge_tools:get_snapshot',
      handler: bridgeRepairHarness.handlers.get('bridge_tools:get_snapshot'),
      payload: undefined,
      assertShape(result) {
        assert.equal(result.schemaVersion, 'bridge-device-tools/v1');
      },
    },
    {
      label: 'bridge repair bridge_tools:refresh',
      handler: bridgeRepairHarness.handlers.get('bridge_tools:refresh'),
      payload: undefined,
      assertShape(result) {
        assert.equal(result.schemaVersion, 'bridge-device-tools/v1');
      },
    },
    {
      label: 'node pair list_devices',
      handler: nodePairHarness.handlers.get('list_devices'),
      payload: undefined,
      assertShape(result) {
        assert.equal(Array.isArray(result), true);
      },
    },
    {
      label: 'node repair device_tools:get_snapshot',
      handler: nodeRepairHarness.handlers.get('device_tools:get_snapshot'),
      payload: undefined,
      assertShape(result) {
        assert.equal(result.schemaVersion, 'node-device-tools/v1');
      },
    },
    {
      label: 'node repair device_tools:refresh',
      handler: nodeRepairHarness.handlers.get('device_tools:refresh'),
      payload: undefined,
      assertShape(result) {
        assert.equal(result.schemaVersion, 'node-device-tools/v1');
      },
    },
    {
      label: 'node repair device_tools:execute_action',
      handler: nodeRepairHarness.handlers.get('device_tools:execute_action'),
      payload: { action: 'auto' },
      assertShape(result) {
        assert.equal(typeof result, 'object');
        assert.equal(result.snapshot.schemaVersion, 'node-device-tools/v1');
      },
    },
  ];

  for (const testCase of cases) {
    assert.equal(typeof testCase.handler, 'function', `${testCase.label}: handler missing`);
    const result = await invokeWithDeadline(testCase.handler, testCase.payload, testCase.label);
    testCase.assertShape(result);
  }

  assert.equal(bridgeSettings.length > 0, true);
});

test('panel liveness contract: timed handlers reject stalled work', async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = (callback, _delay, ...args) => {
    if (typeof callback === 'function') callback(...args);
    return 0;
  };
  global.clearTimeout = () => {};

  try {
    const bridgeDriver = new BridgeDriver();
    bridgeDriver._configureHarness({ app: {}, devices: [] });
    bridgeDriver.onPairListDevices = async () => new Promise(() => {});
    const bridgePairHarness = createSessionHarness();
    await bridgeDriver.onPair(bridgePairHarness.session);
    await assert.rejects(
      () => bridgePairHarness.handlers.get('list_devices')(),
      /timed out after/i,
    );

    const nodeDriver = new NodeDriver();
    nodeDriver._configureHarness({
      app: {
        async getNodeDeviceToolsSnapshot() {
          return new Promise(() => {});
        },
      },
      devices: [],
    });
    const nodeRepairHarness = createSessionHarness();
    await nodeDriver.onRepair(nodeRepairHarness.session, {
      getData: () => ({ id: 'main:5', bridgeId: 'main', nodeId: 5 }),
    });
    await assert.rejects(
      () => nodeRepairHarness.handlers.get('device_tools:get_snapshot')(),
      /timed out after/i,
    );
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

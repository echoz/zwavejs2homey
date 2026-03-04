const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

class FakeHomeyDriver {
  constructor() {
    this.homey = { app: {} };
    this._devices = [];
    this._logs = [];
  }

  _configureHarness({ app, devices, zones } = {}) {
    const nextHomey = { ...this.homey };
    if (app) nextHomey.app = app;
    if (typeof zones !== 'undefined') nextHomey.zones = zones;
    this.homey = nextHomey;
    if (Array.isArray(devices)) this._devices = devices;
  }

  getDevices() {
    return this._devices;
  }

  _getLogs() {
    return [...this._logs];
  }

  log(message, meta) {
    this._logs.push({ message, meta });
  }
}

class FakeHomeyDevice {
  constructor() {
    this.homey = { app: {} };
    this._logs = [];
    this._store = new Map();
  }

  _configureHarness({ app } = {}) {
    if (app) this.homey = { app };
  }

  _getLogs() {
    return [...this._logs];
  }

  _getStoreValue(key) {
    return this._store.get(key);
  }

  log(message, meta) {
    this._logs.push({ message, meta });
  }

  async setStoreValue(key, value) {
    this._store.set(key, value);
  }
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
const BridgeDevice = loadClass('../.homeybuild/drivers/bridge/device.js');

test('bridge driver returns singleton pair candidate when bridge is unpaired', async () => {
  const driver = new BridgeDriver();
  driver._configureHarness({ devices: [] });

  const candidates = await driver.onPairListDevices();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.data?.id, 'zwjs-bridge-main');
  assert.equal(candidates[0]?.data?.kind, 'zwjs-bridge');
});

test('bridge driver returns no candidates when singleton bridge already exists', async () => {
  const driver = new BridgeDriver();
  driver._configureHarness({
    devices: [
      {
        getData: () => ({ id: 'zwjs-bridge-main' }),
      },
    ],
  });

  const candidates = await driver.onPairListDevices();
  assert.deepEqual(candidates, []);
});

test('node driver throws a clear error when zwjs client is unavailable', async () => {
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      getZwjsClient: () => undefined,
    },
    devices: [],
  });

  await assert.rejects(
    () => driver.onPairListDevices(),
    /ZWJS client unavailable\. Verify bridge connection settings\./,
  );
});

test('node driver returns pair candidates with controller/duplicates filtered out', async () => {
  const client = {
    async getNodeList() {
      return {
        nodes: [
          { nodeId: 1, name: 'Controller' },
          { nodeId: 5, name: 'Plug' },
          { nodeId: 8, product: 'Dimmer' },
        ],
      };
    },
  };
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      getZwjsClient: () => client,
      getBridgeId: () => 'main',
    },
    devices: [
      {
        getData: () => ({
          kind: 'zwjs-node',
          bridgeId: 'main',
          nodeId: 5,
        }),
      },
    ],
  });

  const candidates = await driver.onPairListDevices();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.data?.id, 'main:8');
  assert.equal(candidates[0]?.data?.bridgeId, 'main');
  assert.equal(candidates[0]?.data?.nodeId, 8);
  assert.equal(candidates[0]?.icon, '/pair-icons/other.svg');
  assert.equal(candidates[0]?.store?.inferredHomeyClass, 'other');
});

test('node driver applies class icon inference when compiled profile resolver matches', async () => {
  const client = {
    async getNodeList() {
      return {
        nodes: [{ nodeId: 18, name: 'Dining Light' }],
      };
    },
    async getNodeState(nodeId) {
      assert.equal(nodeId, 18);
      return {
        success: true,
        result: {
          state: {
            manufacturerId: '0x0086',
            productType: '0x0102',
            productId: '0x0064',
          },
        },
      };
    },
  };
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      getZwjsClient: () => client,
      getBridgeId: () => 'main',
      resolveCompiledProfileEntry: () => ({
        by: 'productTriple',
        entry: {
          compiled: {
            profile: {
              classification: {
                homeyClass: 'light',
              },
            },
          },
        },
      }),
    },
    devices: [],
  });

  const candidates = await driver.onPairListDevices();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.icon, '/pair-icons/light.svg');
  assert.equal(candidates[0]?.store?.inferredHomeyClass, 'light');
});

test('node driver includes unmatched location in pair label and drops node id prefix', async () => {
  const client = {
    async getNodeList() {
      return {
        nodes: [{ nodeId: 12, name: 'Wall Dimmer', location: 'Upstairs Hall' }],
      };
    },
  };
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      getZwjsClient: () => client,
      getBridgeId: () => 'main',
    },
    zones: {
      getZones(callback) {
        callback(null, {
          kitchen: { name: 'Kitchen' },
        });
      },
    },
    devices: [],
  });

  const candidates = await driver.onPairListDevices();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.name, 'Wall Dimmer - Upstairs Hall');
  assert.equal(candidates[0]?.store?.location, 'Upstairs Hall');
  assert.equal(candidates[0]?.store?.locationMatchedZone, false);
});

test('node driver keeps id prefix when location maps to a known Homey zone', async () => {
  const client = {
    async getNodeList() {
      return {
        nodes: [{ nodeId: 21, name: 'Kitchen Pendant', location: 'Kitchen' }],
      };
    },
  };
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      getZwjsClient: () => client,
      getBridgeId: () => 'main',
    },
    zones: {
      async getZones() {
        return {
          kitchen: { name: 'Kitchen' },
        };
      },
    },
    devices: [],
  });

  const candidates = await driver.onPairListDevices();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.name, '[21] Kitchen Pendant');
  assert.equal(candidates[0]?.store?.location, 'Kitchen');
  assert.equal(candidates[0]?.store?.locationMatchedZone, true);
});

test('node driver repair session exposes device tools snapshot handlers', async () => {
  const snapshotCalls = [];
  const actionCalls = [];
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      async getNodeDeviceToolsSnapshot(options) {
        snapshotCalls.push(options);
        return {
          schemaVersion: 'node-device-tools/v1',
          device: { homeyDeviceId: options.homeyDeviceId },
        };
      },
      async executeRecommendationAction(options) {
        actionCalls.push(options);
        return {
          executed: true,
          selectedAction: options.action,
        };
      },
    },
    devices: [],
  });

  const handlers = new Map();
  const session = {
    setHandler(event, handler) {
      handlers.set(event, handler);
    },
  };

  await driver.onRepair(session, {
    getData: () => ({ id: 'main:8' }),
  });

  assert.equal(typeof handlers.get('device_tools:get_snapshot'), 'function');
  assert.equal(typeof handlers.get('device_tools:refresh'), 'function');
  assert.equal(typeof handlers.get('device_tools:execute_action'), 'function');
  const first = await handlers.get('device_tools:get_snapshot')();
  const second = await handlers.get('device_tools:refresh')();
  const third = await handlers.get('device_tools:execute_action')({
    action: 'adopt-recommended-baseline',
  });
  const fourth = await handlers.get('device_tools:execute_action')();
  assert.equal(first.schemaVersion, 'node-device-tools/v1');
  assert.equal(second.device.homeyDeviceId, 'main:8');
  assert.equal(third.snapshot.device.homeyDeviceId, 'main:8');
  assert.equal(third.actionResult.selectedAction, 'adopt-recommended-baseline');
  assert.equal(fourth.actionResult.selectedAction, 'auto');
  assert.deepEqual(snapshotCalls, [
    { homeyDeviceId: 'main:8' },
    { homeyDeviceId: 'main:8' },
    { homeyDeviceId: 'main:8' },
    { homeyDeviceId: 'main:8' },
  ]);
  assert.deepEqual(actionCalls, [
    { homeyDeviceId: 'main:8', action: 'adopt-recommended-baseline' },
    { homeyDeviceId: 'main:8', action: 'auto' },
  ]);
});

test('node driver repair handler rejects when node device ID is unavailable', async () => {
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      async getNodeDeviceToolsSnapshot() {
        return { schemaVersion: 'node-device-tools/v1' };
      },
    },
    devices: [],
  });

  const handlers = new Map();
  const session = {
    setHandler(event, handler) {
      handlers.set(event, handler);
    },
  };

  await driver.onRepair(session, {
    getData: () => ({}),
  });

  await assert.rejects(
    () => handlers.get('device_tools:get_snapshot')(),
    /Device Tools unavailable: node device ID is missing\./,
  );
});

test('node driver repair action handler rejects invalid action selection', async () => {
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      async getNodeDeviceToolsSnapshot() {
        return { schemaVersion: 'node-device-tools/v1' };
      },
      async executeRecommendationAction() {
        return { executed: true };
      },
    },
    devices: [],
  });

  const handlers = new Map();
  const session = {
    setHandler(event, handler) {
      handlers.set(event, handler);
    },
  };

  await driver.onRepair(session, {
    getData: () => ({ id: 'main:9' }),
  });

  await assert.rejects(
    () => handlers.get('device_tools:execute_action')({ action: 'invalid-action' }),
    /Invalid Device Tools action selection/,
  );
});

test('node driver repair action handler rejects when recommendation action API is unavailable', async () => {
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      async getNodeDeviceToolsSnapshot() {
        return { schemaVersion: 'node-device-tools/v1' };
      },
    },
    devices: [],
  });

  const handlers = new Map();
  const session = {
    setHandler(event, handler) {
      handlers.set(event, handler);
    },
  };

  await driver.onRepair(session, {
    getData: () => ({ id: 'main:9' }),
  });

  await assert.rejects(
    () => handlers.get('device_tools:execute_action')({ action: 'auto' }),
    /Device Tools unavailable: recommendation action API is not ready\./,
  );
});

test('node driver repair action handler rejects when snapshot API is unavailable', async () => {
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      async executeRecommendationAction() {
        return { executed: true, selectedAction: 'auto' };
      },
    },
    devices: [],
  });

  const handlers = new Map();
  const session = {
    setHandler(event, handler) {
      handlers.set(event, handler);
    },
  };

  await driver.onRepair(session, {
    getData: () => ({ id: 'main:9' }),
  });

  await assert.rejects(
    () => handlers.get('device_tools:execute_action')({ action: 'auto' }),
    /Device Tools unavailable: app runtime snapshot API is not ready\./,
  );
});

test('bridge device init logs bridge status and stores runtime diagnostics snapshot', async () => {
  const device = new BridgeDevice();
  device._configureHarness({
    app: {
      getBridgeId: () => 'main',
      getZwjsClient: () => ({
        getStatus: () => ({
          transportConnected: true,
          lifecycle: 'started',
        }),
      }),
      async getNodeRuntimeDiagnostics() {
        return {
          generatedAt: '2026-03-02T12:00:00.000Z',
          bridgeId: 'main',
          zwjs: {
            available: true,
            transportConnected: true,
            lifecycle: 'started',
          },
          compiledProfiles: {
            loaded: true,
            sourcePath: '/tmp/mock.json',
            generatedAt: '2026-03-01T00:00:00.000Z',
            pipelineFingerprint: 'pf-1',
            entryCount: 3,
            errorMessage: null,
          },
          curation: {
            loaded: true,
            source: 'settings',
            entryCount: 2,
            errorMessage: null,
          },
          nodes: [
            {
              curation: { entryPresent: true },
              recommendation: { available: true, backfillNeeded: false },
              mapping: { inboundSkipped: 1, outboundSkipped: 0 },
            },
            {
              curation: { entryPresent: false },
              recommendation: { available: false, backfillNeeded: true },
              mapping: { inboundSkipped: 0, outboundSkipped: 2 },
            },
          ],
        };
      },
    },
  });

  await device.onInit();
  const logs = device._getLogs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.message, 'BridgeDevice initialized');
  assert.equal(logs[0]?.meta?.bridgeId, 'main');
  assert.equal(logs[0]?.meta?.transportConnected, true);
  assert.equal(logs[0]?.meta?.lifecycle, 'started');

  const diagnostics = device._getStoreValue('runtimeDiagnostics');
  assert.ok(diagnostics);
  assert.equal(diagnostics.reason, 'init');
  assert.equal(diagnostics.nodeSummary.total, 2);
  assert.equal(diagnostics.nodeSummary.curationEntryCount, 1);
  assert.equal(diagnostics.nodeSummary.recommendationAvailableCount, 1);
  assert.equal(diagnostics.nodeSummary.recommendationBackfillCount, 1);
  assert.equal(diagnostics.nodeSummary.inboundSkipped, 1);
  assert.equal(diagnostics.nodeSummary.outboundSkipped, 2);
});

test('bridge device forwards runtime diagnostics and recommendation queue options', async () => {
  const diagnosticsCalls = [];
  const queueCalls = [];
  const diagnosticsResult = { generatedAt: '2026-03-02T12:00:00.000Z', nodes: [] };
  const queueResult = { generatedAt: '2026-03-02T12:01:00.000Z', items: [] };
  const device = new BridgeDevice();
  device._configureHarness({
    app: {
      async getNodeRuntimeDiagnostics(options) {
        diagnosticsCalls.push(options);
        return diagnosticsResult;
      },
      async getRecommendationActionQueue(options) {
        queueCalls.push(options);
        return queueResult;
      },
    },
  });

  const diagnostics = await device.getRuntimeDiagnostics({ homeyDeviceId: '  main:8 ' });
  assert.equal(diagnostics, diagnosticsResult);
  assert.deepEqual(diagnosticsCalls, [{ homeyDeviceId: 'main:8' }]);

  const queue = await device.getRecommendationActionQueue({
    homeyDeviceId: 'main:8',
    includeNoAction: true,
  });
  assert.equal(queue, queueResult);
  assert.deepEqual(queueCalls, [{ homeyDeviceId: 'main:8', includeNoAction: true }]);
});

test('bridge device executes recommendation action and refreshes diagnostics snapshot', async () => {
  const actionCalls = [];
  const diagnosticsCalls = [];
  const device = new BridgeDevice();
  device._configureHarness({
    app: {
      async executeRecommendationAction(options) {
        actionCalls.push(options);
        return {
          executed: true,
          reason: 'backfilled-marker',
          selectedAction: 'backfill-marker',
        };
      },
      async getNodeRuntimeDiagnostics() {
        diagnosticsCalls.push('called');
        return {
          generatedAt: '2026-03-02T12:00:00.000Z',
          bridgeId: 'main',
          zwjs: {
            available: true,
            transportConnected: true,
            lifecycle: 'started',
          },
          compiledProfiles: {
            loaded: true,
            sourcePath: '/tmp/mock.json',
            generatedAt: '2026-03-01T00:00:00.000Z',
            pipelineFingerprint: 'pf-1',
            entryCount: 1,
            errorMessage: null,
          },
          curation: {
            loaded: true,
            source: 'settings',
            entryCount: 1,
            errorMessage: null,
          },
          nodes: [
            {
              curation: { entryPresent: true },
              recommendation: { available: false, backfillNeeded: false },
              mapping: { inboundSkipped: 0, outboundSkipped: 0 },
            },
          ],
        };
      },
    },
  });

  const result = await device.executeRecommendationAction({
    homeyDeviceId: 'main:8',
    action: 'backfill-marker',
  });
  assert.equal(result.executed, true);
  assert.deepEqual(actionCalls, [{ homeyDeviceId: 'main:8', action: 'backfill-marker' }]);
  assert.equal(diagnosticsCalls.length, 1);
  const stored = device._getStoreValue('runtimeDiagnostics');
  assert.equal(stored.reason, 'recommendation-action-executed');
});

test('bridge device validates recommendation action inputs', async () => {
  const device = new BridgeDevice();
  device._configureHarness({
    app: {
      async executeRecommendationAction() {
        throw new Error('should-not-be-called');
      },
      async getNodeRuntimeDiagnostics() {
        throw new Error('should-not-be-called');
      },
    },
  });

  await assert.rejects(
    () => device.executeRecommendationAction({ homeyDeviceId: '  ', action: 'auto' }),
    /Invalid homeyDeviceId for recommendation action/,
  );
  await assert.rejects(
    () => device.executeRecommendationAction({ homeyDeviceId: 'main:8', action: 'invalid-action' }),
    /Invalid recommendation action/,
  );
});

test('bridge device executes recommendation action queue and refreshes diagnostics snapshot', async () => {
  const actionsCalls = [];
  const device = new BridgeDevice();
  device._configureHarness({
    app: {
      async executeRecommendationActions(options) {
        actionsCalls.push(options);
        return { total: 2, executed: 1, skipped: 1, results: [] };
      },
      async getNodeRuntimeDiagnostics() {
        return {
          generatedAt: '2026-03-02T12:00:00.000Z',
          bridgeId: 'main',
          zwjs: {
            available: true,
            transportConnected: true,
            lifecycle: 'started',
          },
          compiledProfiles: {
            loaded: true,
            sourcePath: '/tmp/mock.json',
            generatedAt: '2026-03-01T00:00:00.000Z',
            pipelineFingerprint: 'pf-1',
            entryCount: 1,
            errorMessage: null,
          },
          curation: {
            loaded: true,
            source: 'settings',
            entryCount: 1,
            errorMessage: null,
          },
          nodes: [],
        };
      },
    },
  });

  const result = await device.executeRecommendationActions({
    homeyDeviceId: ' main:8 ',
    includeNoAction: true,
  });
  assert.equal(result.executed, 1);
  assert.deepEqual(actionsCalls, [{ homeyDeviceId: 'main:8', includeNoAction: true }]);
  const stored = device._getStoreValue('runtimeDiagnostics');
  assert.equal(stored.reason, 'recommendation-actions-executed');
});

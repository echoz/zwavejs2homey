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

  _configureHarness({ app, devices } = {}) {
    if (app) this.homey = { app };
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

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

class FakeHomeyDriver {
  constructor() {
    this.homey = { app: {} };
    this._devices = [];
    this._logs = [];
    this._errors = [];
  }

  _configureHarness({ app, devices, zones, api } = {}) {
    const nextHomey = { ...this.homey };
    if (app) nextHomey.app = app;
    if (typeof zones !== 'undefined') nextHomey.zones = zones;
    if (typeof api !== 'undefined') nextHomey.api = api;
    this.homey = nextHomey;
    if (Array.isArray(devices)) this._devices = devices;
  }

  getDevices() {
    return this._devices;
  }

  _getLogs() {
    return [...this._logs];
  }

  _getErrors() {
    return [...this._errors];
  }

  log(message, meta) {
    this._logs.push({ message, meta });
  }

  error(message, meta) {
    this._errors.push({ message, meta });
  }
}

class FakeHomeyDevice {
  constructor() {
    this.homey = { app: {} };
    this._logs = [];
    this._errors = [];
    this._store = new Map();
  }

  _configureHarness({ app } = {}) {
    if (app) this.homey = { app };
  }

  _getLogs() {
    return [...this._logs];
  }

  _getErrors() {
    return [...this._errors];
  }

  _getStoreValue(key) {
    return this._store.get(key);
  }

  log(message, meta) {
    this._logs.push({ message, meta });
  }

  error(message, meta) {
    this._errors.push({ message, meta });
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

test('bridge driver pair session exposes next steps status handler', async () => {
  const driver = new BridgeDriver();
  driver._configureHarness({
    app: {
      getZwjsClient() {
        return {
          getStatus() {
            return {
              transportConnected: true,
              lifecycle: 'connected',
              serverVersion: '3.4.0',
              adapterFamily: 'zwjs-default',
            };
          },
          async getNodeList() {
            return {
              nodes: [{ nodeId: 1 }, { nodeId: 5 }, { nodeId: 8 }],
            };
          },
        };
      },
      async getNodeRuntimeDiagnostics() {
        return {
          bridgeId: 'main',
          nodes: [{ homeyDeviceId: 'main:5' }],
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

  await driver.onPair(session);
  assert.equal(typeof handlers.get('list_devices'), 'function');
  assert.equal(typeof handlers.get('next_steps:get_status'), 'function');
  const candidates = await handlers.get('list_devices')();
  const status = await handlers.get('next_steps:get_status')();
  assert.equal(Array.isArray(candidates), true);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.data?.id, 'zwjs-bridge-main');
  assert.equal(status.bridgeId, 'main');
  assert.equal(status.zwjs.available, true);
  assert.equal(status.zwjs.transportConnected, true);
  assert.equal(status.discoveredNodes, 2);
  assert.equal(status.importedNodes, 1);
  assert.equal(status.pendingImportNodes, 1);
  assert.deepEqual(status.warnings, []);
});

test('bridge driver next steps status includes warnings when runtime is unavailable', async () => {
  const driver = new BridgeDriver();
  driver._configureHarness({
    app: {},
    devices: [],
  });

  const handlers = new Map();
  const session = {
    setHandler(event, handler) {
      handlers.set(event, handler);
    },
  };

  await driver.onPair(session);
  const status = await handlers.get('next_steps:get_status')();
  assert.equal(status.zwjs.available, false);
  assert.equal(status.discoveredNodes, null);
  assert.equal(status.importedNodes, null);
  assert.equal(status.pendingImportNodes, null);
  assert.equal(Array.isArray(status.warnings), true);
  assert.equal(status.warnings.length >= 2, true);
});

test('bridge driver repair session exposes bridge tools snapshot handlers', async () => {
  const diagnosticsCalls = [];
  const driver = new BridgeDriver();
  driver._configureHarness({
    app: {
      async getNodeRuntimeDiagnostics() {
        diagnosticsCalls.push('called');
        return {
          generatedAt: '2026-03-04T10:00:00.000Z',
          bridgeId: 'main',
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
            connectedAt: '2026-03-04T09:59:00.000Z',
            lastMessageAt: '2026-03-04T10:00:00.000Z',
          },
          compiledProfiles: {
            loaded: true,
            sourcePath: '/tmp/compiled.json',
            generatedAt: '2026-03-04T09:50:00.000Z',
            pipelineFingerprint: 'pf-1',
            entryCount: 12,
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
              homeyDeviceId: 'main:8',
              nodeId: 8,
              node: {
                manufacturerId: 29,
                productType: 66,
                productId: 2,
                manufacturer: 'Leviton',
                product: 'DZ6HD',
                location: 'Study',
                interviewStage: 'Complete',
                status: 'Alive',
                firmwareVersion: '1.1',
                ready: true,
                isFailed: false,
              },
              sync: {
                syncedAt: '2026-03-04T10:00:00.000Z',
                syncReason: 'startup',
              },
              curation: {
                loaded: true,
                source: 'settings',
                error: null,
                entryPresent: true,
                appliedActions: 3,
                skippedActions: 1,
                errorCount: 0,
              },
              profile: {
                matchBy: 'product-triple',
                matchKey: '29:66:2',
                profileId: 'product-triple:29:66:2',
                fallbackReason: null,
                homeyClass: 'socket',
                confidence: 'curated',
                uncurated: false,
              },
              profileAttribution: {
                confidenceCode: 'curated',
                confidenceLabel: 'Project rule match',
                sourceCode: 'compiled+curation-override',
                sourceLabel: 'Compiled profile + device override',
                summary: 'Project rule match; device override present',
                curationEntryPresent: true,
              },
              recommendation: {
                available: true,
                reason: 'baseline-hash-changed',
                reasonLabel: 'Compiled profile changed for this device.',
                backfillNeeded: false,
              },
              mapping: {
                verticalSliceApplied: true,
                capabilityCount: 2,
                inboundConfigured: 2,
                inboundEnabled: 1,
                outboundConfigured: 2,
                outboundEnabled: 2,
                inboundSkipped: 1,
                outboundSkipped: 0,
                skipReasons: {
                  inbound_selector_not_defined: 1,
                },
              },
            },
          ],
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
    getData: () => ({ id: 'zwjs-bridge-main', bridgeId: 'main' }),
  });

  assert.equal(typeof handlers.get('bridge_tools:get_snapshot'), 'function');
  assert.equal(typeof handlers.get('bridge_tools:refresh'), 'function');
  const first = await handlers.get('bridge_tools:get_snapshot')();
  const second = await handlers.get('bridge_tools:refresh')();
  assert.equal(first.schemaVersion, 'bridge-device-tools/v1');
  assert.equal(first.device.homeyDeviceId, 'zwjs-bridge-main');
  assert.equal(first.nodeSummary.total, 1);
  assert.equal(first.nodeSummary.profileResolvedCount, 1);
  assert.equal(first.nodeSummary.profilePendingCount, 0);
  assert.equal(first.nodeSummary.readyCount, 1);
  assert.equal(first.nodeSummary.failedCount, 0);
  assert.equal(first.nodeSummary.curationEntryCount, 1);
  assert.equal(first.nodeSummary.curationAppliedActions, 3);
  assert.equal(first.nodeSummary.curationSkippedActions, 1);
  assert.equal(first.nodeSummary.curationErrorCount, 0);
  assert.equal(first.nodeSummary.recommendationAvailableCount, 1);
  assert.equal(first.nodeSummary.capabilityCount, 2);
  assert.equal(first.nodeSummary.inboundSkipped, 1);
  assert.equal(first.nodeSummary.skipReasons.inbound_selector_not_defined, 1);
  assert.equal(first.nodes[0].profileAttribution.confidenceCode, 'curated');
  assert.equal(first.nodes[0].profileAttribution.sourceCode, 'compiled+curation-override');
  assert.equal(first.nodes[0].node.manufacturer, 'Leviton');
  assert.equal(first.nodes[0].sync.syncReason, 'startup');
  assert.equal(first.nodes[0].mapping.capabilityCount, 2);
  assert.equal(second.runtime.zwjs.serverVersion, '3.4.0');
  assert.equal(diagnosticsCalls.length, 2);
});

test('bridge driver repair handler rejects when diagnostics API is unavailable', async () => {
  const driver = new BridgeDriver();
  driver._configureHarness({
    app: {},
    devices: [],
  });

  const handlers = new Map();
  const session = {
    setHandler(event, handler) {
      handlers.set(event, handler);
    },
  };

  await driver.onRepair(session, {
    getData: () => ({ id: 'zwjs-bridge-main', bridgeId: 'main' }),
  });

  await assert.rejects(
    () => handlers.get('bridge_tools:get_snapshot')(),
    /Bridge Tools unavailable: app runtime diagnostics API is not ready\./,
  );
});

test('bridge driver derives profile attribution when runtime payload omits it', async () => {
  const driver = new BridgeDriver();
  driver._configureHarness({
    app: {
      async getNodeRuntimeDiagnostics() {
        return {
          generatedAt: '2026-03-04T10:00:00.000Z',
          bridgeId: 'main',
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
            connectedAt: '2026-03-04T09:59:00.000Z',
            lastMessageAt: '2026-03-04T10:00:00.000Z',
          },
          compiledProfiles: {
            loaded: true,
            sourcePath: '/tmp/compiled.json',
            generatedAt: '2026-03-04T09:50:00.000Z',
            pipelineFingerprint: 'pf-1',
            entryCount: 12,
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
              homeyDeviceId: 'main:11',
              nodeId: 11,
              curation: {
                entryPresent: false,
              },
              profile: {
                profileId: 'product-triple:20:1:2',
                homeyClass: 'light',
                confidence: 'curated',
                fallbackReason: null,
              },
              recommendation: {
                available: false,
                reason: 'no-curation-entry',
                backfillNeeded: false,
              },
              mapping: {
                inboundConfigured: 1,
                inboundEnabled: 1,
                outboundConfigured: 1,
                outboundEnabled: 1,
              },
            },
          ],
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
    getData: () => ({ id: 'zwjs-bridge-main', bridgeId: 'main' }),
  });

  const snapshot = await handlers.get('bridge_tools:get_snapshot')();
  assert.equal(snapshot.nodes[0].profileAttribution.confidenceCode, 'curated');
  assert.equal(snapshot.nodes[0].profileAttribution.sourceCode, 'compiled-only');
  assert.equal(snapshot.nodes[0].profileAttribution.curationEntryPresent, false);
  assert.equal(snapshot.nodes[0].node.manufacturer, null);
  assert.equal(snapshot.nodes[0].sync.syncReason, null);
  assert.equal(
    snapshot.nodes[0].mapping.skipReasons && typeof snapshot.nodes[0].mapping.skipReasons,
    'object',
  );
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
    /ZWJS client unavailable\. Configure zwjs_connection\.url in app settings and connect a bridge first\./,
  );
});

test('node driver pair session registers list_devices and import_summary status handlers', async () => {
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      getZwjsClient: () => ({
        getStatus() {
          return {
            transportConnected: true,
            lifecycle: 'connected',
            serverVersion: '3.4.0',
            adapterFamily: 'zwjs-default',
          };
        },
        async getNodeList() {
          return {
            nodes: [
              { nodeId: 1, name: 'Controller' },
              { nodeId: 2, name: 'Desk Light' },
            ],
          };
        },
      }),
      getBridgeId: () => 'main',
      async getNodeRuntimeDiagnostics() {
        return {
          bridgeId: 'main',
          nodes: [
            {
              homeyDeviceId: 'main:2',
              nodeId: 2,
              bridgeId: 'main',
              node: {
                manufacturer: 'Leviton',
                product: 'DZ6HD',
                location: 'Study',
                status: 'Alive',
              },
              profile: {
                homeyClass: 'light',
                profileId: 'product-triple:29:12801:1',
                matchBy: 'product-triple',
                matchKey: '29:12801:1',
              },
              recommendation: {
                available: false,
                backfillNeeded: false,
                reasonLabel: 'No recommendation is available.',
              },
            },
          ],
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

  await driver.onPair(session);
  assert.equal(typeof handlers.get('list_devices'), 'function');
  assert.equal(typeof handlers.get('import_summary:get_status'), 'function');
  const candidates = await handlers.get('list_devices')();
  const summary = await handlers.get('import_summary:get_status')();
  assert.equal(Array.isArray(candidates), true);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.data?.nodeId, 2);
  assert.equal(summary.discoveredNodes, 1);
  assert.equal(summary.importedNodes, 1);
  assert.equal(summary.pendingImportNodes, 0);
  assert.deepEqual(summary.warnings, []);
  assert.equal(Array.isArray(summary.importedNodeDetails), true);
  assert.equal(summary.importedNodeDetails.length, 1);
  assert.equal(summary.importedNodeDetails[0]?.nodeId, 2);
  assert.equal(summary.importedNodeDetails[0]?.name, 'Desk Light');
  assert.equal(summary.importedNodeDetails[0]?.manufacturer, 'Leviton');
  assert.equal(summary.importedNodeDetails[0]?.product, 'DZ6HD');
  assert.equal(summary.importedNodeDetails[0]?.profileHomeyClass, 'light');
  assert.equal(summary.importedNodeDetails[0]?.recommendationAction, 'none');
});

test('node driver import_summary status includes warnings when zwjs is unavailable', async () => {
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      getBridgeId: () => 'main',
    },
    devices: [],
  });

  const handlers = new Map();
  const session = {
    setHandler(event, handler) {
      handlers.set(event, handler);
    },
  };

  await driver.onPair(session);
  const summary = await handlers.get('import_summary:get_status')();
  assert.equal(summary.discoveredNodes, null);
  assert.equal(summary.importedNodes, 0);
  assert.equal(summary.pendingImportNodes, null);
  assert.equal(summary.zwjs.available, false);
  assert.deepEqual(summary.importedNodeDetails, []);
  assert.equal(Array.isArray(summary.warnings), true);
  assert.equal(summary.warnings.length >= 1, true);
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

test('node driver keeps pairing functional when only homey.api is present', async () => {
  const client = {
    async getNodeList() {
      return {
        nodes: [{ nodeId: 33, name: 'Desk Lamp', location: 'Study' }],
      };
    },
  };
  const driver = new NodeDriver();
  driver._configureHarness({
    app: {
      getZwjsClient: () => client,
      getBridgeId: () => 'main',
    },
    api: {
      async get(path) {
        assert.equal(typeof path, 'string');
        return {
          z1: { name: 'Study' },
        };
      },
    },
    devices: [],
  });

  const candidates = await driver.onPairListDevices();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.name, 'Desk Lamp - Study');
  assert.equal(candidates[0]?.store?.locationMatchedZone, false);
});

test('node driver pairing still returns candidates when node state lookup hangs', async () => {
  const client = {
    async getNodeList() {
      return {
        nodes: [{ nodeId: 44, name: 'Hall Lamp', location: 'Hallway' }],
      };
    },
    async getNodeState() {
      return await new Promise(() => {});
    },
  };
  const driver = new NodeDriver();
  const previousTimeout = NodeDriver.PAIR_NODE_STATE_TIMEOUT_MS;
  NodeDriver.PAIR_NODE_STATE_TIMEOUT_MS = 25;
  driver._configureHarness({
    app: {
      getZwjsClient: () => client,
      getBridgeId: () => 'main',
      resolveCompiledProfileEntry: () => ({ by: 'none' }),
    },
    devices: [],
  });

  try {
    const startedAt = Date.now();
    const candidates = await driver.onPairListDevices();
    const elapsedMs = Date.now() - startedAt;
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.data?.nodeId, 44);
    assert.equal(elapsedMs < 1000, true);
  } finally {
    NodeDriver.PAIR_NODE_STATE_TIMEOUT_MS = previousTimeout;
  }
});

test('node driver pairing returns quickly with empty list when node list lookup hangs', async () => {
  const client = {
    async getNodeList() {
      return await new Promise(() => {});
    },
  };
  const driver = new NodeDriver();
  const previousListTimeout = NodeDriver.PAIR_NODE_LIST_TIMEOUT_MS;
  const previousFlowTimeout = NodeDriver.PAIR_FLOW_TIMEOUT_MS;
  NodeDriver.PAIR_NODE_LIST_TIMEOUT_MS = 25;
  NodeDriver.PAIR_FLOW_TIMEOUT_MS = 100;
  driver._configureHarness({
    app: {
      getZwjsClient: () => client,
      getBridgeId: () => 'main',
    },
    devices: [],
  });

  try {
    const startedAt = Date.now();
    const candidates = await driver.onPairListDevices();
    const elapsedMs = Date.now() - startedAt;
    assert.deepEqual(candidates, []);
    assert.equal(elapsedMs < 1000, true);
  } finally {
    NodeDriver.PAIR_NODE_LIST_TIMEOUT_MS = previousListTimeout;
    NodeDriver.PAIR_FLOW_TIMEOUT_MS = previousFlowTimeout;
  }
});

test('node driver returns partial candidates when global pair timeout is reached after discovery', async () => {
  const client = {
    async getNodeList() {
      return {
        nodes: [{ nodeId: 45, name: 'Hallway Dimmer', location: 'Hallway' }],
      };
    },
    async getNodeState() {
      return await new Promise(() => {});
    },
  };
  const driver = new NodeDriver();
  const previousFlowTimeout = NodeDriver.PAIR_FLOW_TIMEOUT_MS;
  const previousStateTimeout = NodeDriver.PAIR_NODE_STATE_TIMEOUT_MS;
  const previousIconTimeout = NodeDriver.PAIR_ICON_INFERENCE_TIMEOUT_MS;
  NodeDriver.PAIR_FLOW_TIMEOUT_MS = 40;
  NodeDriver.PAIR_NODE_STATE_TIMEOUT_MS = 200;
  NodeDriver.PAIR_ICON_INFERENCE_TIMEOUT_MS = 200;
  driver._configureHarness({
    app: {
      getZwjsClient: () => client,
      getBridgeId: () => 'main',
      resolveCompiledProfileEntry: () => ({ by: 'none' }),
    },
    devices: [],
  });

  try {
    const startedAt = Date.now();
    const candidates = await driver.onPairListDevices();
    const elapsedMs = Date.now() - startedAt;
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.data?.nodeId, 45);
    assert.equal(elapsedMs < 1000, true);
  } finally {
    NodeDriver.PAIR_FLOW_TIMEOUT_MS = previousFlowTimeout;
    NodeDriver.PAIR_NODE_STATE_TIMEOUT_MS = previousStateTimeout;
    NodeDriver.PAIR_ICON_INFERENCE_TIMEOUT_MS = previousIconTimeout;
  }
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

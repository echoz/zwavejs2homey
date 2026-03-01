const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

class FakeHomeyDevice {
  constructor() {
    this.homey = { app: {} };
    this._data = {};
    this._capabilities = new Set();
    this._capabilityValues = new Map();
    this._capabilityListeners = new Map();
    this._capabilityUpdates = [];
    this._storeValues = new Map();
    this._logs = [];
    this._errors = [];
  }

  _configureHarness({ app, data, capabilities }) {
    if (app) this.homey = { app };
    if (data) this._data = data;
    if (Array.isArray(capabilities)) this._capabilities = new Set(capabilities);
  }

  _getCapabilityValue(capabilityId) {
    return this._capabilityValues.get(capabilityId);
  }

  _getCapabilityUpdates(capabilityId) {
    return this._capabilityUpdates.filter((entry) => entry.capabilityId === capabilityId);
  }

  _getStoreValue(key) {
    return this._storeValues.get(key);
  }

  _getErrors() {
    return [...this._errors];
  }

  async _triggerCapabilityListener(capabilityId, value) {
    const listener = this._capabilityListeners.get(capabilityId);
    assert.ok(listener, `Missing capability listener for ${capabilityId}`);
    return listener(value);
  }

  getData() {
    return this._data;
  }

  hasCapability(capabilityId) {
    return this._capabilities.has(capabilityId);
  }

  async setCapabilityValue(capabilityId, value) {
    this._capabilityValues.set(capabilityId, value);
    this._capabilityUpdates.push({ capabilityId, value });
  }

  registerCapabilityListener(capabilityId, listener) {
    this._capabilityListeners.set(capabilityId, listener);
  }

  async setStoreValue(key, value) {
    this._storeValues.set(key, value);
  }

  log(message, meta) {
    this._logs.push({ message, meta });
  }

  error(message, meta) {
    this._errors.push({ message, meta });
  }
}

function loadNodeDeviceClass() {
  const modulePath = path.resolve(__dirname, '../.homeybuild/drivers/node/device.js');
  const originalLoad = Module._load;
  Module._load = function patchedModuleLoad(request, parent, isMain) {
    if (request === 'homey') {
      return { Device: FakeHomeyDevice };
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

function selectorKey(selector) {
  return JSON.stringify({
    commandClass: selector.commandClass,
    endpoint: selector.endpoint,
    property: selector.property,
    propertyKey: selector.propertyKey,
  });
}

function createMockZwjsClient({
  nodeStateResult,
  nodeValueResultsBySelector = new Map(),
  definedValueIdsResult = { success: true, result: [] },
  nodeValueMetadataResultsBySelector = new Map(),
  setNodeValueResult = { success: true, result: null },
}) {
  const eventListeners = new Set();
  const callLog = {
    getNodeState: [],
    getNodeDefinedValueIds: [],
    getNodeValueMetadata: [],
    getNodeValue: [],
    setNodeValue: [],
  };

  return {
    callLog,
    getListenerCount: () => eventListeners.size,
    emitEvent(event) {
      for (const listener of [...eventListeners]) {
        listener(event);
      }
    },
    getStatus() {
      return {
        transportConnected: true,
        lifecycle: 'started',
      };
    },
    async getNodeState(nodeId) {
      callLog.getNodeState.push({ nodeId });
      return nodeStateResult;
    },
    async getNodeDefinedValueIds(nodeId) {
      callLog.getNodeDefinedValueIds.push({ nodeId });
      return definedValueIdsResult;
    },
    async getNodeValueMetadata(nodeId, selector) {
      callLog.getNodeValueMetadata.push({ nodeId, selector });
      return (
        nodeValueMetadataResultsBySelector.get(selectorKey(selector)) ?? {
          success: true,
          result: {},
        }
      );
    },
    async getNodeValue(nodeId, selector) {
      callLog.getNodeValue.push({ nodeId, selector });
      return (
        nodeValueResultsBySelector.get(selectorKey(selector)) ?? {
          success: false,
          error: { errorCode: 'missing_selector_fixture' },
        }
      );
    },
    async setNodeValue(payload) {
      callLog.setNodeValue.push(payload);
      return setNodeValueResult;
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
  };
}

function createRuntimeStatus(overrides = {}) {
  return {
    sourcePath: '/tmp/compiled-homey-profiles.json',
    loaded: true,
    generatedAt: '2026-03-01T00:00:00.000Z',
    entryCount: 1,
    duplicateKeys: {
      productTriple: 0,
      nodeId: 0,
      deviceKey: 0,
    },
    errorMessage: null,
    ...overrides,
  };
}

function createCompiledProfileMatch() {
  return {
    by: 'product-triple',
    key: '29:66:2',
    entry: {
      device: {
        deviceKey: 'main:5',
        nodeId: 5,
        manufacturerId: 29,
        productType: 66,
        productId: 2,
      },
      compiled: {
        profile: {
          profileId: 'profile-main-5',
          match: {},
          classification: {
            homeyClass: 'socket',
            confidence: 'curated',
            uncurated: false,
          },
          capabilities: [
            {
              capabilityId: 'onoff',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 37,
                  endpoint: 0,
                  property: 'currentValue',
                },
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 37,
                  endpoint: 0,
                  property: 'targetValue',
                },
              },
            },
            {
              capabilityId: 'dim',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 38,
                  endpoint: 0,
                  property: 'currentValue',
                },
                transformRef: 'zwave_level_0_99_to_homey_dim',
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 38,
                  endpoint: 0,
                  property: 'targetValue',
                },
                transformRef: 'homey_dim_to_zwave_level_0_99',
              },
            },
          ],
          provenance: {
            layer: 'project-product',
            ruleId: 'example-profile',
            action: 'replace',
          },
        },
        report: {},
      },
    },
  };
}

function createGenericProfileMatch() {
  return {
    by: 'product-triple',
    key: '29:66:2',
    entry: {
      device: {
        deviceKey: 'main:8',
        nodeId: 8,
        manufacturerId: 29,
        productType: 66,
        productId: 2,
      },
      compiled: {
        profile: {
          profileId: 'profile-main-8',
          match: {},
          classification: {
            homeyClass: 'socket',
            confidence: 'curated',
            uncurated: false,
          },
          capabilities: [
            {
              capabilityId: 'measure_power',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 50,
                  endpoint: 0,
                  property: 'value',
                },
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 112,
                  endpoint: 0,
                  property: 'targetValue',
                },
              },
            },
          ],
          provenance: {
            layer: 'project-product',
            ruleId: 'example-generic-profile',
            action: 'replace',
          },
        },
        report: {},
      },
    },
  };
}

const NodeDevice = loadNodeDeviceClass();

test('node device harness wires read/write/event sync for onoff + dim verticals', async () => {
  const onoffSelector = {
    commandClass: 37,
    endpoint: 0,
    property: 'currentValue',
  };
  const dimSelector = {
    commandClass: 38,
    endpoint: 0,
    property: 'currentValue',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(onoffSelector), {
    success: true,
    result: { value: true },
  });
  nodeValueResultsBySelector.set(selectorKey(dimSelector), {
    success: true,
    result: { value: 99 },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '0x001d',
          productType: '66',
          productId: '2',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        { commandClass: 37, endpoint: 0, property: 'currentValue', readable: true },
        { commandClass: 37, endpoint: 0, property: 'targetValue', writeable: true },
        { commandClass: 38, endpoint: 0, property: 'currentValue', readable: true },
        { commandClass: 38, endpoint: 0, property: 'targetValue', writeable: true },
      ],
    },
  });

  let capturedSelector;
  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: (selector) => {
      capturedSelector = selector;
      return createCompiledProfileMatch();
    },
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 5 },
    capabilities: ['onoff', 'dim'],
  });

  await device.onInit();

  assert.deepEqual(capturedSelector, {
    nodeId: 5,
    deviceKey: 'main:5',
    manufacturerId: 29,
    productType: 66,
    productId: 2,
  });

  assert.equal(client.callLog.getNodeState.length, 1);
  assert.equal(client.callLog.getNodeDefinedValueIds.length, 1);
  assert.equal(client.callLog.getNodeState[0].nodeId, 5);
  assert.equal(client.callLog.getNodeValue.length, 2);
  assert.equal(client.getListenerCount(), 2);
  assert.equal(device._getCapabilityValue('onoff'), true);
  assert.equal(device._getCapabilityValue('dim'), 1);

  await device._triggerCapabilityListener('onoff', false);
  await device._triggerCapabilityListener('dim', 0.5);
  assert.deepEqual(client.callLog.setNodeValue, [
    {
      nodeId: 5,
      valueId: {
        commandClass: 37,
        endpoint: 0,
        property: 'targetValue',
      },
      value: false,
    },
    {
      nodeId: 5,
      valueId: {
        commandClass: 38,
        endpoint: 0,
        property: 'targetValue',
      },
      value: 50,
    },
  ]);

  client.emitEvent({
    type: 'zwjs.event.node.value-updated',
    event: {
      nodeId: 5,
      args: {
        commandClass: 37,
        endpoint: 0,
        propertyName: 'currentValue',
        newValue: 0,
      },
    },
  });
  client.emitEvent({
    type: 'zwjs.event.node.value-updated',
    event: {
      nodeId: 5,
      args: {
        commandClass: 38,
        endpoint: 0,
        propertyName: 'currentValue',
        newValue: 33,
      },
    },
  });
  await Promise.resolve();
  assert.equal(device._getCapabilityValue('onoff'), false);
  assert.equal(device._getCapabilityValue('dim'), 33 / 99);

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.profileId, 'profile-main-5');
  assert.equal(profileResolution?.matchBy, 'product-triple');
  assert.equal(profileResolution?.verticalSliceApplied, true);
  assert.equal(profileResolution?.fallbackReason, null);
  assert.equal(profileResolution?.syncReason, 'init');
  assert.equal(Array.isArray(profileResolution?.mappingDiagnostics), true);
  assert.equal(profileResolution?.mappingDiagnostics?.length, 2);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.inbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.enabled, true);

  await device.onDeleted();
  assert.equal(client.getListenerCount(), 0);
});

test('node device harness refresh replaces runtime listeners and updates sync metadata', async () => {
  const onoffSelector = {
    commandClass: 37,
    endpoint: 0,
    property: 'currentValue',
  };
  const dimSelector = {
    commandClass: 38,
    endpoint: 0,
    property: 'currentValue',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(onoffSelector), {
    success: true,
    result: { value: true },
  });
  nodeValueResultsBySelector.set(selectorKey(dimSelector), {
    success: true,
    result: { value: 99 },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '0x001d',
          productType: '66',
          productId: '2',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        { commandClass: 37, endpoint: 0, property: 'currentValue', readable: true },
        { commandClass: 37, endpoint: 0, property: 'targetValue', writeable: true },
        { commandClass: 38, endpoint: 0, property: 'currentValue', readable: true },
        { commandClass: 38, endpoint: 0, property: 'targetValue', writeable: true },
      ],
    },
  });

  const state = { match: createCompiledProfileMatch() };
  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => state.match,
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 5 },
    capabilities: ['onoff', 'dim'],
  });

  await device.onInit();
  assert.equal(client.getListenerCount(), 2);
  assert.equal(device._getStoreValue('profileResolution')?.syncReason, 'init');

  state.match = createGenericProfileMatch();
  await device.onRuntimeMappingsRefresh('compiled-profiles-updated');
  assert.equal(client.getListenerCount(), 0);
  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.syncReason, 'compiled-profiles-updated');
  assert.equal(profileResolution?.verticalSliceApplied, false);
  assert.equal(profileResolution?.mappingDiagnostics?.length, 1);
  assert.equal(
    profileResolution?.mappingDiagnostics?.[0]?.inbound?.reason,
    'capability_missing_on_homey_device',
  );
});

test('node device harness records explicit fallback when zwjs client is unavailable', async () => {
  const app = {
    getZwjsClient: () => undefined,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => ({ by: 'none' }),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 7 },
    capabilities: ['onoff'],
  });

  await device.onInit();

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.matchBy, 'none');
  assert.equal(profileResolution?.profileId, null);
  assert.equal(profileResolution?.classification?.homeyClass, 'other');
  assert.equal(profileResolution?.fallbackReason, 'zwjs_client_unavailable');
  assert.equal(profileResolution?.verticalSliceApplied, false);
  assert.equal(device._getErrors().length, 0);
});

test('node device harness applies generic inbound mapping but blocks generic outbound writes', async () => {
  const measurePowerSelector = {
    commandClass: 50,
    endpoint: 0,
    property: 'value',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(measurePowerSelector), {
    success: true,
    result: { value: 215.7 },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '0x001d',
          productType: '66',
          productId: '2',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [{ commandClass: 50, endpoint: 0, property: 'value', readable: true }],
    },
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => createGenericProfileMatch(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 8 },
    capabilities: ['measure_power'],
  });

  await device.onInit();
  assert.equal(device._getCapabilityValue('measure_power'), 215.7);
  assert.equal(client.getListenerCount(), 1);
  await assert.rejects(
    () => device._triggerCapabilityListener('measure_power', 42.5),
    /Missing capability listener/,
  );
  assert.equal(client.callLog.setNodeValue.length, 0);

  client.emitEvent({
    type: 'zwjs.event.node.value-updated',
    event: {
      nodeId: 8,
      args: {
        commandClass: 50,
        endpoint: 0,
        propertyName: 'value',
        newValue: 177.9,
      },
    },
  });
  await Promise.resolve();
  assert.equal(device._getCapabilityValue('measure_power'), 177.9);
  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.mappingDiagnostics?.length, 1);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.inbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.configured, false);
  await device.onDeleted();
  assert.equal(client.getListenerCount(), 0);
});

test('node device harness records mapping diagnostics for missing inbound selector and non-writeable outbound target', async () => {
  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '0x001d',
          productType: '66',
          productId: '2',
        },
      },
    },
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 37,
          endpoint: 0,
          property: 'targetValue',
          writeable: false,
        },
      ],
    },
    nodeValueMetadataResultsBySelector: new Map([
      [
        selectorKey({
          commandClass: 37,
          endpoint: 0,
          property: 'targetValue',
        }),
        { success: true, result: { writeable: false } },
      ],
    ]),
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => ({
      by: 'product-triple',
      key: '29:66:2',
      entry: {
        device: {
          deviceKey: 'main:9',
          nodeId: 9,
          manufacturerId: 29,
          productType: 66,
          productId: 2,
        },
        compiled: {
          profile: {
            profileId: 'profile-main-9',
            match: {},
            classification: {
              homeyClass: 'socket',
              confidence: 'curated',
              uncurated: false,
            },
            capabilities: [
              {
                capabilityId: 'onoff',
                inboundMapping: {
                  kind: 'value',
                  selector: {
                    commandClass: 37,
                    endpoint: 0,
                    property: 'currentValue',
                  },
                },
                outboundMapping: {
                  kind: 'set_value',
                  target: {
                    commandClass: 37,
                    endpoint: 0,
                    property: 'targetValue',
                  },
                },
              },
            ],
            provenance: {
              layer: 'project-product',
              ruleId: 'example-diagnostics-profile',
              action: 'replace',
            },
          },
          report: {},
        },
      },
    }),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 9 },
    capabilities: ['onoff'],
  });

  await device.onInit();

  assert.equal(device._getCapabilityValue('onoff'), undefined);
  assert.equal(client.callLog.getNodeValue.length, 0);
  assert.equal(client.callLog.setNodeValue.length, 0);
  assert.equal(client.getListenerCount(), 0);
  assert.equal(client.callLog.getNodeValueMetadata.length, 1);

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.verticalSliceApplied, false);
  assert.equal(profileResolution?.mappingDiagnostics?.length, 1);
  assert.equal(
    profileResolution?.mappingDiagnostics?.[0]?.inbound?.reason,
    'inbound_selector_not_defined',
  );
  assert.equal(
    profileResolution?.mappingDiagnostics?.[0]?.outbound?.reason,
    'outbound_target_not_writeable',
  );
});

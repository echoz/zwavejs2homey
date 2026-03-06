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
    pipelineFingerprint: 'pipeline-fingerprint-1',
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

function createCoverProfileMatch() {
  return {
    by: 'product-triple',
    key: '622:17235:23089',
    entry: {
      device: {
        deviceKey: 'main:23',
        nodeId: 23,
        manufacturerId: 622,
        productType: 17235,
        productId: 23089,
      },
      compiled: {
        profile: {
          profileId: 'profile-main-23',
          match: {},
          classification: {
            homeyClass: 'curtain',
            confidence: 'curated',
            uncurated: false,
          },
          capabilities: [
            {
              capabilityId: 'windowcoverings_set',
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
            ruleId: 'example-cover-profile',
            action: 'replace',
          },
        },
        report: {},
      },
    },
  };
}

function createClimateAndContactProfileMatch() {
  return {
    by: 'product-triple',
    key: '999:1000:1001',
    entry: {
      device: {
        deviceKey: 'main:42',
        nodeId: 42,
        manufacturerId: 999,
        productType: 1000,
        productId: 1001,
      },
      compiled: {
        profile: {
          profileId: 'profile-main-42',
          match: {},
          classification: {
            homeyClass: 'sensor',
            confidence: 'curated',
            uncurated: false,
          },
          capabilities: [
            {
              capabilityId: 'target_temperature',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 67,
                  endpoint: 0,
                  property: 'value',
                  propertyKey: '1',
                },
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 67,
                  endpoint: 0,
                  property: 'targetValue',
                  propertyKey: '1',
                },
              },
            },
            {
              capabilityId: 'alarm_contact',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 48,
                  endpoint: 0,
                  property: 'state',
                },
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 48,
                  endpoint: 0,
                  property: 'state',
                },
              },
            },
          ],
          provenance: {
            layer: 'project-product',
            ruleId: 'example-climate-contact-profile',
            action: 'replace',
          },
        },
        report: {},
      },
    },
  };
}

function createHumidityAndModeProfileMatch() {
  return {
    by: 'product-triple',
    key: '1001:2001:3001',
    entry: {
      device: {
        deviceKey: 'main:43',
        nodeId: 43,
        manufacturerId: 1001,
        productType: 2001,
        productId: 3001,
      },
      compiled: {
        profile: {
          profileId: 'profile-main-43',
          match: {},
          classification: {
            homeyClass: 'thermostat',
            confidence: 'curated',
            uncurated: false,
          },
          capabilities: [
            {
              capabilityId: 'measure_humidity',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 49,
                  endpoint: 0,
                  property: 'Air humidity',
                },
              },
            },
            {
              capabilityId: 'thermostat_mode',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 64,
                  endpoint: 0,
                  property: 'mode',
                },
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 64,
                  endpoint: 0,
                  property: 'mode',
                },
              },
            },
          ],
          provenance: {
            layer: 'project-product',
            ruleId: 'example-humidity-mode-profile',
            action: 'replace',
          },
        },
        report: {},
      },
    },
  };
}

function createEnumModeProfileMatch() {
  return {
    by: 'product-triple',
    key: '1001:2001:3002',
    entry: {
      device: {
        deviceKey: 'main:44',
        nodeId: 44,
        manufacturerId: 1001,
        productType: 2001,
        productId: 3002,
      },
      compiled: {
        profile: {
          profileId: 'profile-main-44',
          match: {},
          classification: {
            homeyClass: 'thermostat',
            confidence: 'curated',
            uncurated: false,
          },
          capabilities: [
            {
              capabilityId: 'thermostat_mode',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 64,
                  endpoint: 0,
                  property: 'mode',
                },
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 64,
                  endpoint: 0,
                  property: 'mode',
                },
              },
            },
          ],
          provenance: {
            layer: 'project-product',
            ruleId: 'example-enum-mode-profile',
            action: 'replace',
          },
        },
        report: {},
      },
    },
  };
}

function createLuminanceAndMotionProfileMatch() {
  return {
    by: 'product-triple',
    key: '1002:2002:3003',
    entry: {
      device: {
        deviceKey: 'main:46',
        nodeId: 46,
        manufacturerId: 1002,
        productType: 2002,
        productId: 3003,
      },
      compiled: {
        profile: {
          profileId: 'profile-main-46',
          match: {},
          classification: {
            homeyClass: 'sensor',
            confidence: 'curated',
            uncurated: false,
          },
          capabilities: [
            {
              capabilityId: 'measure_luminance',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 49,
                  endpoint: 0,
                  property: 'Illuminance',
                },
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 49,
                  endpoint: 0,
                  property: 'Illuminance',
                },
              },
            },
            {
              capabilityId: 'alarm_motion',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 48,
                  endpoint: 0,
                  property: 'state',
                },
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 48,
                  endpoint: 0,
                  property: 'state',
                },
              },
            },
          ],
          provenance: {
            layer: 'project-product',
            ruleId: 'example-luminance-motion-profile',
            action: 'replace',
          },
        },
        report: {},
      },
    },
  };
}

function createMotionOnlyProfileMatch() {
  return {
    by: 'product-triple',
    key: '1002:2002:3004',
    entry: {
      device: {
        deviceKey: 'main:47',
        nodeId: 47,
        manufacturerId: 1002,
        productType: 2002,
        productId: 3004,
      },
      compiled: {
        profile: {
          profileId: 'profile-main-47',
          match: {},
          classification: {
            homeyClass: 'sensor',
            confidence: 'curated',
            uncurated: false,
          },
          capabilities: [
            {
              capabilityId: 'alarm_motion',
              inboundMapping: {
                kind: 'value',
                selector: {
                  commandClass: 48,
                  endpoint: 0,
                  property: 'state',
                },
              },
              outboundMapping: {
                kind: 'set_value',
                target: {
                  commandClass: 48,
                  endpoint: 0,
                  property: 'state',
                },
              },
            },
          ],
          provenance: {
            layer: 'project-product',
            ruleId: 'example-motion-profile',
            action: 'replace',
          },
        },
        report: {},
      },
    },
  };
}

function createCurationEntryForMain5() {
  return {
    targetDevice: {
      homeyDeviceId: 'main:5',
    },
    baselineMarker: {
      projectionVersion: '1',
      baselineProfileHash: 'abc123',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
    overrides: {
      capabilities: {
        onoff: {
          outboundMapping: {
            kind: 'set_value',
            target: {
              commandClass: 37,
              endpoint: 0,
              property: 'targetValueCustom',
            },
          },
        },
      },
      collections: {
        capabilitiesRemove: ['dim'],
      },
    },
    updatedAt: '2026-03-01T00:00:00.000Z',
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
          deviceConfig: {
            manufacturer: 'Leviton',
            description: 'In-Wall 600W Dimmer',
            label: 'DZ6HD',
          },
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 37,
          endpoint: 0,
          property: 'currentValue',
          readable: true,
          type: 'boolean',
        },
        {
          commandClass: 37,
          endpoint: 0,
          property: 'targetValue',
          writeable: true,
          type: 'boolean',
        },
        { commandClass: 38, endpoint: 0, property: 'currentValue', readable: true, type: 'number' },
        { commandClass: 38, endpoint: 0, property: 'targetValue', writeable: true, type: 'number' },
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
  assert.equal(profileResolution?.recommendationAvailable, false);
  assert.equal(profileResolution?.recommendationReason, 'no-curation-entry');
  assert.equal(profileResolution?.recommendationBackfillNeeded, false);
  assert.equal(profileResolution?.currentBaselinePipelineFingerprint, 'pipeline-fingerprint-1');
  assert.equal(profileResolution?.storedBaselineHash, null);
  assert.equal(profileResolution?.manufacturerId, 29);
  assert.equal(profileResolution?.productType, 66);
  assert.equal(profileResolution?.productId, 2);
  assert.equal(profileResolution?.nodeState?.manufacturerId, 29);
  assert.equal(profileResolution?.nodeState?.productType, 66);
  assert.equal(profileResolution?.nodeState?.productId, 2);
  assert.equal(profileResolution?.nodeState?.manufacturer, 'Leviton');
  assert.equal(profileResolution?.nodeState?.product, 'In-Wall 600W Dimmer (DZ6HD)');

  await device.onDeleted();
  assert.equal(client.getListenerCount(), 0);
});

test('node device harness applies curation overrides before runtime mapping extraction', async () => {
  const onoffSelector = {
    commandClass: 37,
    endpoint: 0,
    property: 'currentValue',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(onoffSelector), {
    success: true,
    result: { value: true },
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
        {
          commandClass: 37,
          endpoint: 0,
          property: 'currentValue',
          readable: true,
          type: 'boolean',
        },
        {
          commandClass: 37,
          endpoint: 0,
          property: 'targetValueCustom',
          writeable: true,
          type: 'boolean',
        },
      ],
    },
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    getCurationStatus: () => ({
      loaded: true,
      sourceKey: 'curation.v1',
      source: 'settings',
      schemaVersion: 'homey-curation/v1',
      updatedAt: '2026-03-01T00:00:00.000Z',
      entryCount: 1,
      errorMessage: null,
    }),
    resolveCompiledProfileEntry: () => createCompiledProfileMatch(),
    resolveCurationEntry: () => createCurationEntryForMain5(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { id: 'main:5', bridgeId: 'main', nodeId: 5 },
    capabilities: ['onoff', 'dim'],
  });

  await device.onInit();
  await device._triggerCapabilityListener('onoff', false);
  assert.deepEqual(client.callLog.setNodeValue, [
    {
      nodeId: 5,
      valueId: {
        commandClass: 37,
        endpoint: 0,
        property: 'targetValueCustom',
      },
      value: false,
    },
  ]);
  await assert.rejects(
    () => device._triggerCapabilityListener('dim', 0.5),
    /Missing capability listener/,
  );

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.homeyDeviceId, 'main:5');
  assert.equal(profileResolution?.curationEntryPresent, true);
  assert.equal(profileResolution?.curationReport?.summary?.applied, 2);
  assert.equal(profileResolution?.mappingDiagnostics?.length, 1);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.capabilityId, 'onoff');
  assert.equal(profileResolution?.recommendationAvailable, true);
  assert.equal(profileResolution?.recommendationReason, 'baseline-hash-changed');
  assert.equal(profileResolution?.recommendationBackfillNeeded, false);
  assert.equal(typeof profileResolution?.currentBaselineHash, 'string');
  assert.equal(profileResolution?.storedBaselineHash, 'abc123');
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

test('node device harness keeps no-match fallback deterministic when compiled profiles are loaded', async () => {
  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '0x010f',
          productType: '0x1802',
          productId: '0x2001',
          manufacturer: 'Fibaro',
          product: 'Wall Plug',
        },
      },
    },
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 37,
          endpoint: 0,
          property: 'currentValue',
          readable: true,
        },
      ],
    },
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus({ loaded: true }),
    resolveCompiledProfileEntry: () => ({ by: 'none' }),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 44 },
    capabilities: ['onoff'],
  });

  await device.onInit();

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.matchBy, 'none');
  assert.equal(profileResolution?.profileId, null);
  assert.equal(profileResolution?.classification?.homeyClass, 'other');
  assert.equal(profileResolution?.classification?.confidence, 'generic');
  assert.equal(profileResolution?.classification?.uncurated, true);
  assert.equal(profileResolution?.fallbackReason, 'no_compiled_profile_match');
  assert.equal(profileResolution?.verticalSliceApplied, false);
  assert.deepEqual(profileResolution?.mappingDiagnostics, []);
  assert.equal(profileResolution?.recommendationAvailable, false);
  assert.equal(profileResolution?.curationEntryPresent, false);

  assert.equal(client.callLog.getNodeState.length, 1);
  assert.equal(client.callLog.getNodeDefinedValueIds.length, 1);
  assert.equal(client.callLog.getNodeValue.length, 0);
  assert.equal(client.callLog.setNodeValue.length, 0);
  assert.equal(client.getListenerCount(), 0);
});

test('node device harness reports artifact-unavailable fallback when resolver artifact is not loaded', async () => {
  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '0x010f',
          productType: '0x1802',
          productId: '0x2001',
        },
      },
    },
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () =>
      createRuntimeStatus({
        loaded: false,
        entryCount: 0,
        errorMessage: 'compiled-homey-profiles.v1.json is missing',
      }),
    resolveCompiledProfileEntry: () => ({ by: 'none' }),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 45 },
    capabilities: ['onoff'],
  });

  await device.onInit();

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.matchBy, 'none');
  assert.equal(profileResolution?.profileId, null);
  assert.equal(profileResolution?.classification?.homeyClass, 'other');
  assert.equal(profileResolution?.classification?.confidence, 'generic');
  assert.equal(profileResolution?.classification?.uncurated, true);
  assert.equal(profileResolution?.fallbackReason, 'compiled_profile_artifact_unavailable');
  assert.equal(profileResolution?.resolverLoaded, false);
  assert.equal(profileResolution?.resolverError, 'compiled-homey-profiles.v1.json is missing');
  assert.equal(profileResolution?.verticalSliceApplied, false);
  assert.deepEqual(profileResolution?.mappingDiagnostics, []);
  assert.equal(client.getListenerCount(), 0);
});

test('node device harness applies generic inbound mapping and gates outbound writes by value availability', async () => {
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
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.configured, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.enabled, false);
  assert.equal(
    profileResolution?.mappingDiagnostics?.[0]?.outbound?.reason,
    'outbound_target_not_defined',
  );
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

test('node device harness supports transformed outbound mappings without capability-id contracts', async () => {
  const coverSelector = {
    commandClass: 38,
    endpoint: 0,
    property: 'currentValue',
  };
  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(coverSelector), {
    success: true,
    result: { value: 99 },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '622',
          productType: '17235',
          productId: '23089',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        { commandClass: 38, endpoint: 0, property: 'currentValue', readable: true },
        { commandClass: 38, endpoint: 0, property: 'targetValue', writeable: true },
      ],
    },
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => createCoverProfileMatch(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 23 },
    capabilities: ['windowcoverings_set'],
  });

  await device.onInit();
  assert.equal(device._getCapabilityValue('windowcoverings_set'), 1);

  await device._triggerCapabilityListener('windowcoverings_set', 0.5);
  assert.deepEqual(client.callLog.setNodeValue, [
    {
      nodeId: 23,
      valueId: {
        commandClass: 38,
        endpoint: 0,
        property: 'targetValue',
      },
      value: 50,
    },
  ]);
});

test('node device harness supports generic numeric + boolean verticals without capability-specific code paths', async () => {
  const targetTemperatureSelector = {
    commandClass: 67,
    endpoint: 0,
    property: 'value',
    propertyKey: '1',
  };
  const alarmContactSelector = {
    commandClass: 48,
    endpoint: 0,
    property: 'state',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(targetTemperatureSelector), {
    success: true,
    result: { value: '21.75' },
  });
  nodeValueResultsBySelector.set(selectorKey(alarmContactSelector), {
    success: true,
    result: { value: 0 },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '999',
          productType: '1000',
          productId: '1001',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 67,
          endpoint: 0,
          property: 'value',
          propertyKey: '1',
          readable: true,
          type: 'number',
        },
        {
          commandClass: 67,
          endpoint: 0,
          property: 'targetValue',
          propertyKey: '1',
          writeable: true,
          type: 'number',
        },
        {
          commandClass: 48,
          endpoint: 0,
          property: 'state',
          readable: true,
          type: 'boolean',
        },
        {
          commandClass: 48,
          endpoint: 0,
          property: 'state',
          writeable: true,
          type: 'boolean',
        },
      ],
    },
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => createClimateAndContactProfileMatch(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 42 },
    capabilities: ['target_temperature', 'alarm_contact'],
  });

  await device.onInit();
  assert.equal(device._getCapabilityValue('target_temperature'), 21.75);
  assert.equal(device._getCapabilityValue('alarm_contact'), false);
  assert.equal(client.getListenerCount(), 2);

  await device._triggerCapabilityListener('target_temperature', '22.5');
  await device._triggerCapabilityListener('alarm_contact', 1);
  assert.deepEqual(client.callLog.setNodeValue, [
    {
      nodeId: 42,
      valueId: {
        commandClass: 67,
        endpoint: 0,
        property: 'targetValue',
        propertyKey: '1',
      },
      value: 22.5,
    },
    {
      nodeId: 42,
      valueId: {
        commandClass: 48,
        endpoint: 0,
        property: 'state',
      },
      value: true,
    },
  ]);

  client.emitEvent({
    type: 'zwjs.event.node.value-updated',
    event: {
      nodeId: 42,
      args: {
        commandClass: 67,
        endpoint: 0,
        propertyName: 'value',
        propertyKey: '1',
        newValue: '20.5',
      },
    },
  });
  client.emitEvent({
    type: 'zwjs.event.node.value-updated',
    event: {
      nodeId: 42,
      args: {
        commandClass: 48,
        endpoint: 0,
        propertyName: 'state',
        newValue: 255,
      },
    },
  });
  await Promise.resolve();
  assert.equal(device._getCapabilityValue('target_temperature'), 20.5);
  assert.equal(device._getCapabilityValue('alarm_contact'), true);

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.mappingDiagnostics?.length, 2);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.inbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[1]?.inbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[1]?.outbound?.enabled, true);
});

test('node device harness supports generic numeric + string verticals without capability-specific code paths', async () => {
  const humiditySelector = {
    commandClass: 49,
    endpoint: 0,
    property: 'Air humidity',
  };
  const thermostatModeSelector = {
    commandClass: 64,
    endpoint: 0,
    property: 'mode',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(humiditySelector), {
    success: true,
    result: { value: '55.2' },
  });
  nodeValueResultsBySelector.set(selectorKey(thermostatModeSelector), {
    success: true,
    result: { value: 'heat' },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '1001',
          productType: '2001',
          productId: '3001',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 49,
          endpoint: 0,
          property: 'Air humidity',
          readable: true,
          type: 'number',
        },
        {
          commandClass: 64,
          endpoint: 0,
          property: 'mode',
          readable: true,
          type: 'string',
        },
        {
          commandClass: 64,
          endpoint: 0,
          property: 'mode',
          writeable: true,
          type: 'string',
        },
      ],
    },
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => createHumidityAndModeProfileMatch(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 43 },
    capabilities: ['measure_humidity', 'thermostat_mode'],
  });

  await device.onInit();
  assert.equal(device._getCapabilityValue('measure_humidity'), 55.2);
  assert.equal(device._getCapabilityValue('thermostat_mode'), 'heat');
  assert.equal(client.getListenerCount(), 2);

  await device._triggerCapabilityListener('thermostat_mode', 'cool');
  assert.deepEqual(client.callLog.setNodeValue, [
    {
      nodeId: 43,
      valueId: {
        commandClass: 64,
        endpoint: 0,
        property: 'mode',
      },
      value: 'cool',
    },
  ]);
  await assert.rejects(
    () => device._triggerCapabilityListener('measure_humidity', 44.2),
    /Missing capability listener/,
  );

  client.emitEvent({
    type: 'zwjs.event.node.value-updated',
    event: {
      nodeId: 43,
      args: {
        commandClass: 49,
        endpoint: 0,
        propertyName: 'Air humidity',
        newValue: '47.5',
      },
    },
  });
  client.emitEvent({
    type: 'zwjs.event.node.value-updated',
    event: {
      nodeId: 43,
      args: {
        commandClass: 64,
        endpoint: 0,
        propertyName: 'mode',
        newValue: 'auto',
      },
    },
  });
  await Promise.resolve();
  assert.equal(device._getCapabilityValue('measure_humidity'), 47.5);
  assert.equal(device._getCapabilityValue('thermostat_mode'), 'auto');

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.mappingDiagnostics?.length, 2);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.inbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.configured, false);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.enabled, false);
  assert.equal(profileResolution?.mappingDiagnostics?.[1]?.inbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[1]?.outbound?.enabled, true);
});

test('node device harness supports generic luminance + motion verticals and rejects unsupported outbound values', async () => {
  const luminanceSelector = {
    commandClass: 49,
    endpoint: 0,
    property: 'Illuminance',
  };
  const motionSelector = {
    commandClass: 48,
    endpoint: 0,
    property: 'state',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(luminanceSelector), {
    success: true,
    result: { value: '123.4' },
  });
  nodeValueResultsBySelector.set(selectorKey(motionSelector), {
    success: true,
    result: { value: 0 },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '1002',
          productType: '2002',
          productId: '3003',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 49,
          endpoint: 0,
          property: 'Illuminance',
          readable: true,
          writeable: true,
          type: 'number',
        },
        {
          commandClass: 48,
          endpoint: 0,
          property: 'state',
          readable: true,
          writeable: true,
          type: 'boolean',
        },
      ],
    },
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => createLuminanceAndMotionProfileMatch(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 46 },
    capabilities: ['measure_luminance', 'alarm_motion'],
  });

  await device.onInit();
  assert.equal(device._getCapabilityValue('measure_luminance'), 123.4);
  assert.equal(device._getCapabilityValue('alarm_motion'), false);
  assert.equal(client.getListenerCount(), 2);

  await device._triggerCapabilityListener('alarm_motion', 1);
  await assert.rejects(
    () => device._triggerCapabilityListener('measure_luminance', { invalid: true }),
    /measure_luminance capability value is not supported for outbound mapping/,
  );
  assert.deepEqual(client.callLog.setNodeValue, [
    {
      nodeId: 46,
      valueId: {
        commandClass: 48,
        endpoint: 0,
        property: 'state',
      },
      value: true,
    },
  ]);

  client.emitEvent({
    type: 'zwjs.event.node.value-updated',
    event: {
      nodeId: 46,
      args: {
        commandClass: 49,
        endpoint: 0,
        propertyName: 'Illuminance',
        newValue: '98.6',
      },
    },
  });
  client.emitEvent({
    type: 'zwjs.event.node.value-updated',
    event: {
      nodeId: 46,
      args: {
        commandClass: 48,
        endpoint: 0,
        propertyName: 'state',
        newValue: 255,
      },
    },
  });
  await Promise.resolve();
  assert.equal(device._getCapabilityValue('measure_luminance'), 98.6);
  assert.equal(device._getCapabilityValue('alarm_motion'), true);

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.mappingDiagnostics?.length, 2);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.inbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[1]?.inbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[1]?.outbound?.enabled, true);
});

test('node device harness records writeability-unknown diagnostics for binary alarm verticals', async () => {
  const motionSelector = {
    commandClass: 48,
    endpoint: 0,
    property: 'state',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(motionSelector), {
    success: true,
    result: { value: 255 },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '1002',
          productType: '2002',
          productId: '3004',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 48,
          endpoint: 0,
          property: 'state',
          readable: true,
          type: 'boolean',
        },
      ],
    },
    nodeValueMetadataResultsBySelector: new Map([
      [selectorKey(motionSelector), { success: true, result: { label: 'Motion' } }],
    ]),
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => createMotionOnlyProfileMatch(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 47 },
    capabilities: ['alarm_motion'],
  });

  await device.onInit();
  assert.equal(device._getCapabilityValue('alarm_motion'), true);
  assert.equal(client.callLog.getNodeValue.length, 1);
  assert.equal(client.callLog.getNodeValueMetadata.length, 1);
  assert.equal(client.callLog.setNodeValue.length, 0);
  assert.equal(client.getListenerCount(), 1);

  await assert.rejects(
    () => device._triggerCapabilityListener('alarm_motion', false),
    /Missing capability listener/,
  );

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.mappingDiagnostics?.length, 1);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.inbound?.enabled, true);
  assert.equal(
    profileResolution?.mappingDiagnostics?.[0]?.outbound?.reason,
    'outbound_target_writeability_unknown',
  );
});

test('node device harness records enum-like mapping diagnostics for unreadable inbound and unknown outbound writeability', async () => {
  const modeSelector = {
    commandClass: 64,
    endpoint: 0,
    property: 'mode',
  };

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '1001',
          productType: '2001',
          productId: '3002',
        },
      },
    },
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 64,
          endpoint: 0,
          property: 'mode',
          readable: false,
          type: 'string',
        },
      ],
    },
    nodeValueMetadataResultsBySelector: new Map([
      [selectorKey(modeSelector), { success: true, result: { label: 'Thermostat mode' } }],
    ]),
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => createEnumModeProfileMatch(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 44 },
    capabilities: ['thermostat_mode'],
  });

  await device.onInit();

  assert.equal(device._getCapabilityValue('thermostat_mode'), undefined);
  assert.equal(client.callLog.getNodeValue.length, 0);
  assert.equal(client.callLog.setNodeValue.length, 0);
  assert.equal(client.getListenerCount(), 0);
  assert.equal(client.callLog.getNodeValueMetadata.length, 1);

  await assert.rejects(
    () => device._triggerCapabilityListener('thermostat_mode', 'cool'),
    /Missing capability listener/,
  );

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.mappingDiagnostics?.length, 1);
  assert.equal(
    profileResolution?.mappingDiagnostics?.[0]?.inbound?.reason,
    'inbound_selector_not_readable',
  );
  assert.equal(
    profileResolution?.mappingDiagnostics?.[0]?.outbound?.reason,
    'outbound_target_writeability_unknown',
  );
});

test('node device harness treats undefined readability/writeability as metadata-driven fallbacks', async () => {
  const modeSelector = {
    commandClass: 64,
    endpoint: 0,
    property: 'mode',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(modeSelector), {
    success: true,
    result: { value: 'heat' },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '1001',
          productType: '2001',
          productId: '3002',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 64,
          endpoint: 0,
          property: 'mode',
          type: 'string',
        },
      ],
    },
    nodeValueMetadataResultsBySelector: new Map([
      [selectorKey(modeSelector), { success: true, result: { writeable: true } }],
    ]),
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => createEnumModeProfileMatch(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 44 },
    capabilities: ['thermostat_mode'],
  });

  await device.onInit();

  assert.equal(device._getCapabilityValue('thermostat_mode'), 'heat');
  assert.equal(client.callLog.getNodeValue.length, 1);
  assert.equal(client.callLog.getNodeValueMetadata.length, 1);
  assert.equal(client.getListenerCount(), 1);

  await device._triggerCapabilityListener('thermostat_mode', 'cool');
  assert.deepEqual(client.callLog.setNodeValue, [
    {
      nodeId: 44,
      valueId: {
        commandClass: 64,
        endpoint: 0,
        property: 'mode',
      },
      value: 'cool',
    },
  ]);

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.mappingDiagnostics?.length, 1);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.inbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.inbound?.reason, null);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.enabled, true);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.outbound?.reason, null);
});

test('node device harness reports metadata read failures as outbound writeability unknown', async () => {
  const modeSelector = {
    commandClass: 64,
    endpoint: 0,
    property: 'mode',
  };

  const nodeValueResultsBySelector = new Map();
  nodeValueResultsBySelector.set(selectorKey(modeSelector), {
    success: true,
    result: { value: 'heat' },
  });

  const client = createMockZwjsClient({
    nodeStateResult: {
      success: true,
      result: {
        state: {
          manufacturerId: '1001',
          productType: '2001',
          productId: '3002',
        },
      },
    },
    nodeValueResultsBySelector,
    definedValueIdsResult: {
      success: true,
      result: [
        {
          commandClass: 64,
          endpoint: 0,
          property: 'mode',
          readable: true,
          type: 'string',
        },
      ],
    },
    nodeValueMetadataResultsBySelector: new Map([
      [
        selectorKey(modeSelector),
        {
          success: false,
          error: { errorCode: 'metadata_read_failed' },
        },
      ],
    ]),
  });

  const app = {
    getZwjsClient: () => client,
    getCompiledProfilesStatus: () => createRuntimeStatus(),
    resolveCompiledProfileEntry: () => createEnumModeProfileMatch(),
  };

  const device = new NodeDevice();
  device._configureHarness({
    app,
    data: { bridgeId: 'main', nodeId: 44 },
    capabilities: ['thermostat_mode'],
  });

  await device.onInit();

  assert.equal(device._getCapabilityValue('thermostat_mode'), 'heat');
  assert.equal(client.callLog.getNodeValue.length, 1);
  assert.equal(client.callLog.getNodeValueMetadata.length, 1);
  assert.equal(client.getListenerCount(), 1);

  await assert.rejects(
    () => device._triggerCapabilityListener('thermostat_mode', 'cool'),
    /Missing capability listener/,
  );
  assert.equal(client.callLog.setNodeValue.length, 0);

  const profileResolution = device._getStoreValue('profileResolution');
  assert.equal(profileResolution?.mappingDiagnostics?.length, 1);
  assert.equal(profileResolution?.mappingDiagnostics?.[0]?.inbound?.enabled, true);
  assert.equal(
    profileResolution?.mappingDiagnostics?.[0]?.outbound?.reason,
    'outbound_target_writeability_unknown',
  );
  assert.equal(
    device
      ._getErrors()
      .some((entry) => entry.message === 'NodeDevice failed to read value metadata'),
    true,
  );
});

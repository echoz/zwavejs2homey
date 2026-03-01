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
  constructor(nodeDevices) {
    this.nodeDevices = nodeDevices;
  }

  getDriver(driverId) {
    if (driverId === 'node') {
      return {
        getDevices: () => this.nodeDevices,
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
      return () => {};
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

function loadAppClass(nodeDevices) {
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
    app.homey.drivers = new FakeDriversManager(nodeDevices);
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

  await app.onUninit();
});

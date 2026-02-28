const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { runPanelApp } = require('../dist/app');

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.rawModes = [];
  }

  setRawMode(value) {
    this.rawModes.push(value);
  }
}

class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.columns = 96;
    this.rows = 28;
    this.writes = [];
  }

  write(value) {
    this.writes.push(String(value));
    return true;
  }
}

test('runPanelApp renders panel UI and exits on q', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenter = {
    connectCalls: 0,
    disconnectCalls: 0,
    async connect() {
      this.connectCalls += 1;
    },
    async disconnect() {
      this.disconnectCalls += 1;
    },
    getState() {
      return {
        explorer: {
          items: [
            { nodeId: 1, name: 'Kitchen', product: 'Switch' },
            { nodeId: 2, name: 'Office', product: 'Sensor' },
          ],
        },
      };
    },
    getStatusSnapshot() {
      return {
        mode: 'nodes',
        connectionState: 'ready',
        selectedSignature: undefined,
        cachedNodeCount: 2,
      };
    },
  };

  const runPromise = runPanelApp(
    {
      mode: 'nodes',
      uiMode: 'panel',
      manifestFile: 'rules/manifest.json',
      url: 'ws://127.0.0.1:3000',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 100,
    },
    { log: () => {}, error: () => {} },
    { presenter, stdin: input, stdout: output },
  );

  setTimeout(() => {
    input.emit('keypress', '', { name: 'h' });
    input.emit('keypress', 'q', {});
  }, 5);

  await runPromise;

  assert.equal(presenter.connectCalls, 1);
  assert.equal(presenter.disconnectCalls, 1);
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(
    output.writes.some((line) => line.includes('ZWJS nodes (panel)')),
    true,
  );
});

test('runPanelApp scrolls list viewport when selection moves beyond visible window', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.rows = 20;
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: Array.from({ length: 40 }, (_, index) => ({
            nodeId: index + 1,
            name: `Node-${index + 1}`,
            product: 'Device',
          })),
        },
      };
    },
    getStatusSnapshot() {
      return {
        mode: 'nodes',
        connectionState: 'ready',
        selectedSignature: undefined,
        cachedNodeCount: 40,
      };
    },
  };

  const runPromise = runPanelApp(
    {
      mode: 'nodes',
      uiMode: 'panel',
      manifestFile: 'rules/manifest.json',
      url: 'ws://127.0.0.1:3000',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 100,
    },
    { log: () => {}, error: () => {} },
    { presenter, stdin: input, stdout: output },
  );

  setTimeout(() => {
    for (let i = 0; i < 24; i += 1) {
      input.emit('keypress', '', { name: 'down' });
    }
    input.emit('keypress', 'q', {});
  }, 5);

  await runPromise;

  assert.equal(
    output.writes.some((line) => line.includes('Nodes [')),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Node-25')),
    true,
  );
});

test('runPanelApp supports interactive filtering in list pane', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [
            { nodeId: 1, name: 'Kitchen', product: 'Switch' },
            { nodeId: 2, name: 'Office', product: 'Sensor' },
            { nodeId: 3, name: 'Garage', product: 'Light' },
          ],
        },
      };
    },
    getStatusSnapshot() {
      return {
        mode: 'nodes',
        connectionState: 'ready',
        selectedSignature: undefined,
        cachedNodeCount: 3,
      };
    },
  };

  const runPromise = runPanelApp(
    {
      mode: 'nodes',
      uiMode: 'panel',
      manifestFile: 'rules/manifest.json',
      url: 'ws://127.0.0.1:3000',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 100,
    },
    { log: () => {}, error: () => {} },
    { presenter, stdin: input, stdout: output },
  );

  setTimeout(() => {
    input.emit('keypress', '/', { name: 'slash' });
    input.emit('keypress', 'o', {});
    input.emit('keypress', 'f', {});
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'q', {});
  }, 5);

  await runPromise;

  assert.equal(
    output.writes.some((line) => line.includes('Filter applied: of')),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Office')),
    true,
  );
});

test('runPanelApp can quit via raw data fallback', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 1, name: 'One', product: 'Device' }],
        },
      };
    },
    getStatusSnapshot() {
      return {
        mode: 'nodes',
        connectionState: 'ready',
        selectedSignature: undefined,
        cachedNodeCount: 1,
      };
    },
  };

  const runPromise = runPanelApp(
    {
      mode: 'nodes',
      uiMode: 'panel',
      manifestFile: 'rules/manifest.json',
      url: 'ws://127.0.0.1:3000',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 100,
    },
    { log: () => {}, error: () => {} },
    { presenter, stdin: input, stdout: output },
  );

  setTimeout(() => {
    input.emit('data', 'q');
  }, 5);

  await runPromise;

  assert.equal(
    output.writes.some((line) => line.includes('ZWJS nodes (panel)')),
    true,
  );
});

test('runPanelApp requires double confirmation for write actions', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenter = {
    writeCalls: 0,
    manifestCalls: 0,
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 1, name: 'Kitchen', product: 'Switch' }],
        },
      };
    },
    getStatusSnapshot() {
      return {
        mode: 'nodes',
        connectionState: 'ready',
        selectedSignature: '29:66:2',
        cachedNodeCount: 1,
      };
    },
    async showNodeDetail(nodeId) {
      return {
        nodeId,
        state: { name: 'Kitchen', ready: true, status: 'alive' },
        neighbors: [],
        notificationEvents: [],
        values: [],
      };
    },
    selectSignatureFromNode() {
      return '29:66:2';
    },
    createScaffoldFromSignature() {
      return {
        signature: '29:66:2',
        fileHint: 'product-29-66-2.json',
        generatedAt: new Date().toISOString(),
        bundle: { schemaVersion: 'product-rules/v1', rules: [] },
      };
    },
    writeScaffoldDraft() {
      this.writeCalls += 1;
      return '/tmp/product-29-66-2.json';
    },
    addDraftToManifest() {
      this.manifestCalls += 1;
      return {
        manifestFile: '/tmp/manifest.json',
        entryFilePath: 'project/product/product-29-66-2.json',
        updated: true,
      };
    },
  };

  const runPromise = runPanelApp(
    {
      mode: 'nodes',
      uiMode: 'panel',
      manifestFile: 'rules/manifest.json',
      url: 'ws://127.0.0.1:3000',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 100,
    },
    { log: () => {}, error: () => {} },
    { presenter, stdin: input, stdout: output },
  );

  setTimeout(() => {
    input.emit('keypress', 'p', {});
    input.emit('keypress', 'W', {});
    input.emit('keypress', 'W', {});
    input.emit('keypress', 'A', {});
    input.emit('keypress', 'A', {});
    input.emit('keypress', 'q', {});
  }, 5);

  await runPromise;

  assert.equal(presenter.writeCalls, 1);
  assert.equal(presenter.manifestCalls, 1);
  assert.equal(
    output.writes.some((line) => line.includes('Confirm scaffold write')),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Confirm manifest add')),
    true,
  );
});

test('runPanelApp supports cancelling long-running operation', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 1, name: 'Kitchen', product: 'Switch' }],
        },
      };
    },
    getStatusSnapshot() {
      return {
        mode: 'nodes',
        connectionState: 'ready',
        selectedSignature: '29:66:2',
        cachedNodeCount: 1,
      };
    },
    async showNodeDetail(nodeId) {
      return {
        nodeId,
        state: { name: 'Kitchen', ready: true, status: 'alive' },
        neighbors: [],
        notificationEvents: [],
        values: [],
      };
    },
    selectSignatureFromNode() {
      return '29:66:2';
    },
    async simulateSelectedSignature() {
      return await new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              signature: '29:66:2',
              dryRun: false,
              inspectSkipped: false,
              inspectFormat: 'list',
              inspectCommandLine: 'inspect',
              validateCommandLine: 'validate',
              gatePassed: true,
              totalNodes: 1,
              reviewNodes: 0,
              outcomes: { curated: 1 },
              reportFile: null,
              summaryJsonFile: null,
            }),
          200,
        );
      });
    },
  };

  const runPromise = runPanelApp(
    {
      mode: 'nodes',
      uiMode: 'panel',
      manifestFile: 'rules/manifest.json',
      url: 'ws://127.0.0.1:3000',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 100,
    },
    { log: () => {}, error: () => {} },
    { presenter, stdin: input, stdout: output },
  );

  setTimeout(() => {
    input.emit('keypress', 'm', {});
  }, 5);
  setTimeout(() => {
    input.emit('keypress', 'c', {});
  }, 40);
  setTimeout(() => {
    input.emit('keypress', 'q', {});
  }, 80);

  await runPromise;

  assert.equal(
    output.writes.some((line) => line.includes('Cancel requested for')),
    true,
  );
});

test('runPanelApp reports timeout for long-running operation', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 1, name: 'Kitchen', product: 'Switch' }],
        },
      };
    },
    getStatusSnapshot() {
      return {
        mode: 'nodes',
        connectionState: 'ready',
        selectedSignature: '29:66:2',
        cachedNodeCount: 1,
      };
    },
    async showNodeDetail(nodeId) {
      return {
        nodeId,
        state: { name: 'Kitchen', ready: true, status: 'alive' },
        neighbors: [],
        notificationEvents: [],
        values: [],
      };
    },
    selectSignatureFromNode() {
      return '29:66:2';
    },
    async simulateSelectedSignature() {
      return await new Promise(() => {});
    },
  };

  const runPromise = runPanelApp(
    {
      mode: 'nodes',
      uiMode: 'panel',
      manifestFile: 'rules/manifest.json',
      url: 'ws://127.0.0.1:3000',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 100,
    },
    { log: () => {}, error: () => {} },
    { presenter, stdin: input, stdout: output, panelOperationTimeoutMs: 30 },
  );

  setTimeout(() => {
    input.emit('keypress', 'm', {});
  }, 5);
  setTimeout(() => {
    input.emit('keypress', 'q', {});
  }, 80);

  await runPromise;

  assert.equal(
    output.writes.some((line) => line.toLowerCase().includes('timed out')),
    true,
  );
});

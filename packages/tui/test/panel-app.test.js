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

test('runPanelApp toggles neighbors in node detail and shows readable identity labels', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 140;
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [
            {
              nodeId: 9,
              name: 'Living Room',
              manufacturer: 'Zooz',
              product: 'ZEN32 Scene Controller',
            },
            { nodeId: 2, name: 'Kitchen', manufacturer: 'Zooz', product: 'Plug' },
            { nodeId: 5, name: 'Office', manufacturer: 'Aeotec', product: 'Sensor' },
            { nodeId: 11, name: 'Hallway', manufacturer: 'Inovelli', product: 'Light' },
          ],
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
    async showNodeDetail(nodeId) {
      return {
        nodeId,
        state: {
          name: 'Living Room',
          ready: true,
          status: 'alive',
          manufacturer: 'Zooz',
          manufacturerId: 634,
          product: 'ZEN32 Scene Controller',
          productType: 4,
          productId: 8,
        },
        neighbors: [2, 5, 11],
        notificationEvents: [],
        values: [
          {
            valueId: { commandClass: 49, endpoint: 0, property: 'Air temperature' },
            metadata: {
              label: 'Temperature',
              readable: true,
              writeable: false,
              type: 'number',
              unit: 'C',
            },
            value: 22.7,
          },
          {
            valueId: { commandClass: 38, endpoint: 0, property: 'targetValue' },
            metadata: {
              label: 'Switch',
              readable: true,
              writeable: true,
              type: 'number',
              states: { 0: 'off', 99: 'on' },
            },
            value: 99,
          },
          {
            valueId: { commandClass: 112, endpoint: 0, property: 'statusFlags' },
            metadata: {
              label: 'Status Flags',
              readable: true,
              writeable: false,
              type: 'number',
            },
            value: 3,
          },
        ],
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
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'n', { name: 'n' });
    input.emit('keypress', 'n', { name: 'n' });
    input.emit('keypress', 'z', { name: 'z' });
    input.emit('keypress', 'q', {});
  }, 5);

  await runPromise;

  assert.equal(
    output.writes.some((line) => line.includes('Manufacturer: Zooz (id 634)')),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Product: ZEN32 Scene Controller (type 4, id 8)')),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Neighbors: 3 (press n to expand)')),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Neighbors: 3 (press n to collapse)')),
    true,
  );
  assert.equal(
    output.writes.some(
      (line) => line.includes('Neighbor Nodes:') && line.includes('Node 2 | Kitchen'),
    ),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Node 5 | Office | Aeotec | Sensor')),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Values: 3 (press z to expand)')),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Values: 3 (press z to collapse)')),
    true,
  );
});

test('runPanelApp hydrates missing neighbor manufacturer/product from node detail', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 180;
  const detailByNode = {
    2: {
      name: 'Kitchen',
      ready: true,
      status: 'alive',
      manufacturer: 'Zooz',
      manufacturerId: 634,
      product: 'Plug',
      productType: 1,
      productId: 2,
    },
    5: {
      name: 'Office',
      ready: true,
      status: 'alive',
      manufacturer: 'Aeotec',
      manufacturerId: 134,
      product: 'Sensor',
      productType: 2,
      productId: 9,
    },
    9: {
      name: 'Living Room',
      ready: true,
      status: 'alive',
      manufacturer: 'Zooz',
      manufacturerId: 634,
      product: 'Controller',
      productType: 4,
      productId: 8,
    },
  };
  const presenterState = {
    explorer: {
      items: [
        {
          nodeId: 9,
          name: 'Living Room',
          manufacturer: 'Zooz',
          product: 'Controller',
        },
        { nodeId: 2, name: 'Kitchen', manufacturer: null, product: null },
        { nodeId: 5, name: 'Office', manufacturer: null, product: null },
      ],
    },
    nodeDetailCache: {},
  };
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return presenterState;
    },
    getStatusSnapshot() {
      return {
        mode: 'nodes',
        connectionState: 'ready',
        selectedSignature: undefined,
        cachedNodeCount: 3,
      };
    },
    async showNodeDetail(nodeId) {
      const detail = {
        nodeId,
        state: detailByNode[nodeId] ?? detailByNode[9],
        neighbors: nodeId === 9 ? [2, 5] : [],
        notificationEvents: [],
        values: [],
      };
      presenterState.nodeDetailCache[nodeId] = detail;
      return detail;
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
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'n', { name: 'n' });
    input.emit('keypress', 'q', {});
  }, 5);

  await runPromise;

  assert.equal(
    output.writes.some((line) => line.includes('Node 2 | Kitchen | Zooz')),
    true,
  );
  assert.equal(
    output.writes.some((line) => line.includes('Node 5 | Office | Aeotec')),
    true,
  );
});

test('runPanelApp orders expanded values by relevance', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 140;
  output.rows = 42;
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 3, name: 'Kitchen', manufacturer: 'Zooz', product: 'Dimmer' }],
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
    async showNodeDetail(nodeId) {
      return {
        nodeId,
        state: {
          name: 'Kitchen',
          ready: true,
          status: 'alive',
          manufacturer: 'Zooz',
          manufacturerId: 634,
          product: 'Dimmer',
          productType: 4,
          productId: 2,
        },
        neighbors: [],
        notificationEvents: [],
        values: [
          {
            valueId: { commandClass: 112, endpoint: 0, property: 'statusFlags' },
            metadata: {
              label: 'Status Flags',
              readable: true,
              writeable: false,
              type: 'number',
            },
            value: 3,
          },
          {
            valueId: { commandClass: 49, endpoint: 0, property: 'Air temperature' },
            metadata: {
              label: 'Temperature',
              readable: true,
              writeable: false,
              type: 'number',
              unit: 'C',
            },
            value: 21.4,
          },
          {
            valueId: { commandClass: 38, endpoint: 0, property: 'targetValue' },
            metadata: {
              label: 'Switch',
              readable: true,
              writeable: true,
              type: 'number',
              states: { 0: 'off', 99: 'on' },
            },
            value: 99,
          },
        ],
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
    input.emit('keypress', '', { name: 'return' });
    input.emit('keypress', 'z', { name: 'z' });
    input.emit('keypress', 'q', {});
  }, 5);

  await runPromise;

  const expandedValuesFrame = output.writes.find(
    (line) =>
      line.includes('Values: 3 (press z to collapse)') &&
      line.includes('Value Preview (top relevant first):') &&
      line.includes('Switch = on (99)') &&
      line.includes('Temperature = 21.4 C') &&
      line.includes('Status Flags = 3'),
  );
  assert.notEqual(expandedValuesFrame, undefined);
  assert.equal(
    expandedValuesFrame.indexOf('Switch = on (99)') <
      expandedValuesFrame.indexOf('Temperature = 21.4 C'),
    true,
  );
  assert.equal(
    expandedValuesFrame.indexOf('Temperature = 21.4 C') <
      expandedValuesFrame.indexOf('Status Flags = 3'),
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

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');

const { runPanelApp } = require('../dist/app');

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.readable = true;
    this.writable = true;
    this.fd = 0;
    this.rawModes = [];
    this.resumed = false;
    this.paused = false;
  }

  setRawMode(value) {
    this.rawModes.push(value);
  }

  resume() {
    this.resumed = true;
    this.paused = false;
  }

  pause() {
    this.paused = true;
    this.resumed = false;
  }
}

class FakeOutput extends Writable {
  constructor() {
    super();
    this.isTTY = true;
    this.readable = true;
    this.writable = true;
    this.fd = 1;
    this.columns = 96;
    this.rows = 28;
    this.writes = [];
  }

  _write(chunk, _encoding, callback) {
    this.writes.push(String(chunk));
    callback();
  }
}

function createRenderCapture() {
  const snapshots = [];
  return {
    snapshots,
    onPanelRender(snapshot) {
      snapshots.push(snapshot);
    },
    text() {
      return snapshots
        .map((snapshot) =>
          [
            snapshot.header,
            snapshot.leftTitle,
            ...snapshot.leftLines,
            snapshot.rightTitle,
            ...snapshot.rightLines,
            snapshot.bottomTitle,
            ...snapshot.bottomLines,
            snapshot.footer,
          ]
            .filter((line) => line && line.length > 0)
            .join('\n'),
        )
        .join('\n---\n');
    },
  };
}

function createPanelDeps(presenter, input, output, extra = {}) {
  const capture = createRenderCapture();
  return {
    capture,
    deps: {
      presenter,
      stdin: input,
      stdout: output,
      onPanelRender: capture.onPanelRender,
      ...extra,
    },
  };
}

const keyToData = {
  up: '\u001b[A',
  down: '\u001b[B',
  pageup: '\u001b[5~',
  pagedown: '\u001b[6~',
  home: '\u001b[H',
  end: '\u001b[F',
  return: '\r',
  enter: '\r',
  tab: '\t',
  backspace: '\u007f',
  escape: '\u001b',
  ctrl_c: '\u0003',
};

function emitInputKey(input, token) {
  const value = keyToData[token] ?? token;
  input.emit('data', value);
}

function emitInputKeys(input, tokens) {
  for (const token of tokens) {
    emitInputKey(input, token);
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['h', 'q']);
  }, 5);

  await runPromise;

  assert.equal(presenter.connectCalls, 1);
  assert.equal(presenter.disconnectCalls, 1);
  assert.equal(input.rawModes.includes(true), true);
  assert.equal(input.rawModes.includes(false), true);
  const rendered = capture.text();
  assert.equal(rendered.includes('ZWJS nodes (panel)'), true);
  assert.equal(rendered.includes('(unknown / unknown)'), false);
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    for (let i = 0; i < 24; i += 1) {
      emitInputKey(input, 'down');
    }
    emitInputKey(input, 'q');
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Nodes ['), true);
  assert.equal(rendered.includes('Node-25'), true);
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['/', 'o', 'f', 'return', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Filter applied: of'), true);
  assert.equal(rendered.includes('Office'), true);
});

test('runPanelApp toggles bottom pane between status-bar and full mode', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 1, name: 'Kitchen', product: 'Switch', manufacturer: 'Zooz' }],
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['b', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Status Bar'), false);
  assert.equal(rendered.includes('Output / Run'), true);
  assert.equal(rendered.includes('Bottom pane expanded. Press b for status-bar mode.'), true);
});

test('runPanelApp hydrates visible list identity without opening node detail', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenterState = {
    explorer: {
      items: [
        { nodeId: 1, name: 'Kitchen', product: null, manufacturer: null },
        { nodeId: 2, name: 'Office', product: null, manufacturer: null },
      ],
    },
    nodeDetailCache: {},
  };
  const detailByNode = {
    1: {
      name: 'Kitchen',
      ready: true,
      status: 'alive',
      manufacturer: 'Zooz',
      manufacturerId: 634,
      product: 'Switch',
      productType: 1,
      productId: 2,
    },
    2: {
      name: 'Office',
      ready: true,
      status: 'alive',
      manufacturer: 'Aeotec',
      manufacturerId: 134,
      product: 'Sensor',
      productType: 2,
      productId: 7,
    },
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
        cachedNodeCount: 2,
      };
    },
    async showNodeDetail(nodeId) {
      const detail = {
        nodeId,
        state: detailByNode[nodeId],
        neighbors: [],
        lifelineRoute: null,
        notificationEvents: [],
        values: [],
      };
      presenterState.nodeDetailCache[nodeId] = detail;
      return detail;
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKey(input, 'q');
  }, 40);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Kitchen (Zooz / Switch)'), true);
  assert.equal(rendered.includes('Office (Aeotec / Sensor)'), true);
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
        lifelineRoute: { repeaters: [2, 5], routeSpeed: 40_000 },
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'n', 'n', 'z', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Manufacturer: Zooz (id 634)'), true);
  assert.equal(rendered.includes('Product: ZEN32 Scene Controller (type 4, id 8)'), true);
  assert.equal(rendered.includes('Neighbors 3 (n)'), true);
  assert.equal(rendered.includes('Lifeline route: 2 -> 5 @ 40 kbps'), true);
  assert.equal(
    rendered.includes('Neighbor Nodes:') &&
      rendered.includes('Node 2 | Kitchen | Zooz / Plug | lifeline hop 1/2 @ 40 kbps'),
    true,
  );
  assert.equal(
    rendered.includes('Node 5 | Office | Aeotec / Sensor | lifeline hop 2/2 @ 40 kbps'),
    true,
  );
  assert.equal(rendered.includes('Node 11 | Hallway | Inovelli / Light | not-on-lifeline'), true);
  assert.equal(rendered.includes('Values 3 (z)'), true);
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
      manufacturer: 'Unknown manufacturer',
      manufacturerId: 134,
      product: 'unknown product',
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
        { nodeId: 2, name: 'Kitchen', manufacturer: 'unknown', product: 'unknown' },
        { nodeId: 5, name: 'Office', manufacturer: 'unknown', product: 'unknown' },
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
        lifelineRoute: nodeId === 9 ? { repeaters: [2], routeSpeed: 100_000 } : null,
        notificationEvents: [],
        values: [],
      };
      presenterState.nodeDetailCache[nodeId] = detail;
      return detail;
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'n', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Node 2 | Kitchen | Zooz'), true);
  assert.equal(rendered.includes('Node 5 | Office | id 134 / type 2, id 9'), true);
  assert.equal(rendered.includes('unknown | unknown'), false);
  assert.equal(rendered.toLowerCase().includes('unknown manufacturer'), false);
});

test('runPanelApp omits link column when lifeline route is not reported', async () => {
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
            { nodeId: 7, name: 'Bedroom', manufacturer: 'Zooz', product: 'Dimmer' },
            { nodeId: 8, name: 'Hall', manufacturer: 'Inovelli', product: 'Switch' },
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
    async showNodeDetail(nodeId) {
      return {
        nodeId,
        state: {
          name: 'Bedroom',
          ready: true,
          status: 'alive',
          manufacturer: 'Zooz',
          product: 'Dimmer',
        },
        neighbors: [8],
        lifelineRoute: null,
        notificationEvents: [],
        values: [],
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'n', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Lifeline route: not reported'), true);
  assert.equal(rendered.includes('Node 8 | Hall | Inovelli / Switch'), true);
  assert.equal(rendered.includes('link n/a'), false);
});

test('runPanelApp wraps long neighbor identity fields without truncating content', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 92;
  output.rows = 60;
  const longManufacturer = 'ExtremelyLongManufacturerNameForNeighborIdentityValidation';
  const longProduct = 'SuperVerboseProductDescriptorUsedToVerifyWrappingBehavior';
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [
            { nodeId: 4, name: 'Main Node', manufacturer: 'Zooz', product: 'Switch' },
            {
              nodeId: 6,
              name: 'Neighbor Node',
              manufacturer: longManufacturer,
              product: longProduct,
            },
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
    async showNodeDetail(nodeId) {
      return {
        nodeId,
        state: {
          name: 'Main Node',
          ready: true,
          status: 'alive',
          manufacturer: 'Zooz',
          product: 'Switch',
        },
        neighbors: [6],
        lifelineRoute: { repeaters: [6], routeSpeed: 40_000 },
        notificationEvents: [],
        values: [],
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'n', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  const compact = rendered.replace(/\s+/g, '');
  assert.equal(compact.includes(longManufacturer), true);
  assert.equal(compact.includes(longProduct), true);
});

test('runPanelApp renders status codes and notifications in human-readable form', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 7, name: 'Front Door', manufacturer: 'Yale', product: 'Lock' }],
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
          name: 'Front Door',
          ready: true,
          status: 4,
          manufacturer: 'Yale',
          product: 'Lock',
        },
        neighbors: [],
        notificationEvents: {
          'Access Control': [6, 22],
          HomeSecurity: [2],
        },
        values: [],
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Status: 4 (alive)'), true);
  assert.equal(rendered.includes('Notifications: 2 type(s)'), true);
  assert.equal(rendered.includes('- Access Control: 6, 22'), true);
  assert.equal(rendered.includes('- HomeSecurity: 2'), true);
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'z', 'q']);
  }, 5);

  await runPromise;

  const expandedValuesFrame = capture.text();
  assert.equal(expandedValuesFrame.includes('Values 3 (z)'), true);
  assert.equal(expandedValuesFrame.includes('Controls: 1 (1)'), true);
  assert.equal(expandedValuesFrame.includes('Sensors: 1 (2)'), true);
  assert.equal(expandedValuesFrame.includes('Config: 1 (4)'), true);
  assert.equal(expandedValuesFrame.includes('Switch: on (99)'), true);
  assert.equal(expandedValuesFrame.includes('Temperature: 21.4 C'), true);
  assert.equal(expandedValuesFrame.includes('Status Flags: 3'), true);
  assert.equal(expandedValuesFrame.includes('dir read-write'), true);
  assert.equal(expandedValuesFrame.includes('map onoff'), true);
  assert.equal(expandedValuesFrame.includes('conf high'), true);
  assert.notEqual(expandedValuesFrame, undefined);
  assert.equal(
    expandedValuesFrame.indexOf('Switch: on (99)') <
      expandedValuesFrame.indexOf('Temperature: 21.4 C'),
    true,
  );
  assert.equal(
    expandedValuesFrame.indexOf('Temperature: 21.4 C') <
      expandedValuesFrame.indexOf('Status Flags: 3'),
    true,
  );
});

test('runPanelApp explains missing value as summary-mode not fetched', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 140;
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 24, name: 'Front Door', manufacturer: 'Yale', product: 'Lock' }],
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
          name: 'Front Door',
          ready: true,
          status: 'alive',
          manufacturer: 'Yale',
          product: 'Lock',
        },
        neighbors: [],
        notificationEvents: [],
        values: [
          {
            valueId: { commandClass: 99, endpoint: 0, property: 'userCode', propertyKey: 1 },
            metadata: {
              label: 'User Code 1',
              readable: true,
              writeable: true,
              type: 'string',
            },
            value: undefined,
          },
        ],
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'z', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('User Code 1: <not fetched: summary mode>'), true);
});

test('runPanelApp fetches only the selected value with enter in node detail', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 140;
  const detailCalls = [];
  const valueFetchCalls = [];
  let currentDetail = null;
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 24, name: 'Front Door', manufacturer: 'Yale', product: 'Lock' }],
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
    async showNodeDetail(nodeId, options = {}) {
      detailCalls.push(options);
      currentDetail = {
        nodeId,
        state: {
          name: 'Front Door',
          ready: true,
          status: 'alive',
          manufacturer: 'Yale',
          product: 'Lock',
        },
        neighbors: [],
        notificationEvents: [],
        values: [
          {
            valueId: { commandClass: 99, endpoint: 0, property: 'userCode', propertyKey: 1 },
            metadata: {
              label: 'User Code 1',
              readable: true,
              writeable: true,
              type: 'string',
            },
            value: undefined,
          },
          {
            valueId: { commandClass: 99, endpoint: 0, property: 'userCode', propertyKey: 2 },
            metadata: {
              label: 'User Code 2',
              readable: true,
              writeable: true,
              type: 'string',
            },
            value: undefined,
          },
        ],
      };
      return currentDetail;
    },
    async fetchNodeValue(nodeId, valueId) {
      valueFetchCalls.push({ nodeId, valueId });
      if (!currentDetail || currentDetail.nodeId !== nodeId) {
        throw new Error('node detail not loaded');
      }
      currentDetail = {
        ...currentDetail,
        values: currentDetail.values.map((value) =>
          value.valueId.propertyKey === valueId.propertyKey ? { ...value, value: '5678' } : value,
        ),
      };
      return currentDetail;
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'z', 'tab', 'down', 'return']);
  }, 5);
  setTimeout(() => {
    emitInputKey(input, 'q');
  }, 40);

  await runPromise;

  assert.equal(valueFetchCalls.length >= 1, true);
  assert.equal(
    valueFetchCalls.every((call) => call.valueId.propertyKey === 2),
    true,
  );
  assert.equal(
    detailCalls.some((call) => call && call.includeValues === 'full'),
    false,
  );
  const fullFrame = [...capture.snapshots]
    .reverse()
    .find((snapshot) => snapshot.rightLines.join('\n').includes('User Code 2: 5678'));
  assert.notEqual(fullFrame, undefined);
  const frameText = fullFrame.rightLines.join('\n');
  assert.equal(frameText.includes('> User Code 2: 5678'), true);
  assert.equal(frameText.includes('User Code 1: <not fetched: summary mode>'), true);
  assert.equal(
    frameText.indexOf('User Code 1: <not fetched: summary mode>') <
      frameText.indexOf('User Code 2: 5678'),
    true,
  );
});

test('runPanelApp can fetch full node values with uppercase F', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 140;
  const detailCalls = [];
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 24, name: 'Front Door', manufacturer: 'Yale', product: 'Lock' }],
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
    async showNodeDetail(nodeId, options = {}) {
      detailCalls.push(options);
      const full = options.includeValues === 'full';
      return {
        nodeId,
        state: {
          name: 'Front Door',
          ready: true,
          status: 'alive',
          manufacturer: 'Yale',
          product: 'Lock',
        },
        neighbors: [],
        notificationEvents: [],
        values: [
          {
            valueId: { commandClass: 99, endpoint: 0, property: 'userCode', propertyKey: 1 },
            metadata: {
              label: 'User Code 1',
              readable: true,
              writeable: true,
              type: 'string',
            },
            value: full ? '1234' : undefined,
          },
        ],
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'F', 'z']);
  }, 5);
  setTimeout(() => {
    emitInputKey(input, 'q');
  }, 40);

  await runPromise;

  assert.equal(
    detailCalls.some((call) => call && call.includeValues === 'full'),
    true,
  );
  const rendered = capture.text();
  assert.equal(rendered.includes('User Code 1: 1234'), true);
});

test('runPanelApp toggles individual value subsections with numeric keys', async () => {
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
          items: [{ nodeId: 13, name: 'Office', manufacturer: 'Zooz', product: 'Dimmer' }],
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
          name: 'Office',
          ready: true,
          status: 'alive',
          manufacturer: 'Zooz',
          product: 'Dimmer',
        },
        neighbors: [],
        notificationEvents: [],
        values: [
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
            valueId: { commandClass: 49, endpoint: 0, property: 'Air temperature' },
            metadata: {
              label: 'Temperature',
              readable: true,
              writeable: false,
              type: 'number',
              unit: 'C',
            },
            value: 22.3,
          },
        ],
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'z', '2', 'q']);
  }, 5);

  await runPromise;

  const frame = [...capture.snapshots]
    .reverse()
    .find((snapshot) => snapshot.rightLines.join('\n').includes('▶ Sensors: 1 (2)'));
  assert.notEqual(frame, undefined);
  const frameText = frame.rightLines.join('\n');
  assert.equal(frameText.includes('▶ Sensors: 1 (2)'), true);
  assert.equal(frameText.includes('Temperature: 22.3 C'), false);
  assert.equal(frameText.includes('Switch: on (99)'), true);
});

test('runPanelApp shows profile provenance when compiled value attribution is available', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 140;
  output.rows = 42;
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        sessionConfig: {
          mode: 'nodes',
          uiMode: 'panel',
          manifestFile: 'rules/manifest.json',
          url: 'ws://127.0.0.1:3000',
          schemaVersion: 0,
          includeValues: 'summary',
          maxValues: 100,
        },
        explorer: {
          items: [{ nodeId: 42, name: 'Kitchen', manufacturer: 'Zooz', product: 'Switch' }],
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
          product: 'Switch',
        },
        neighbors: [],
        notificationEvents: [],
        values: [
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
            valueId: { commandClass: 49, endpoint: 0, property: 'Air temperature' },
            metadata: {
              label: 'Temperature',
              readable: true,
              writeable: false,
              type: 'number',
              unit: 'C',
            },
            value: 21.9,
          },
        ],
      };
    },
  };
  const curationService = {
    async inspectNodeCompiledValueAttribution() {
      return {
        nodeId: 42,
        valueAttributions: {
          '38:0:targetValue:': [
            {
              capabilityId: 'onoff',
              mappingRole: 'inbound',
              provenanceLayer: 'project-product',
              provenanceRuleId: 'profile-switch',
              provenanceAction: 'replace',
            },
          ],
        },
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output, { curationService });

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'z']);
  }, 5);
  setTimeout(() => {
    emitInputKey(input, 'q');
  }, 40);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('map onoff (inbound)'), true);
  assert.equal(rendered.includes('src profile'), true);
  assert.equal(rendered.includes('rule project-product:profile-switch'), true);
  assert.equal(rendered.includes('Temperature: 21.9 C'), true);
  assert.equal(rendered.includes('src heuristic-fallback'), true);
});

test('runPanelApp shows section counts and top preview when values are collapsed', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 140;
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 6, name: 'Dining', manufacturer: 'Zooz', product: 'Dimmer' }],
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
          name: 'Dining',
          ready: true,
          status: 'alive',
          manufacturer: 'Zooz',
          product: 'Dimmer',
        },
        neighbors: [],
        notificationEvents: [],
        values: [
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
            valueId: { commandClass: 49, endpoint: 0, property: 'Air temperature' },
            metadata: {
              label: 'Temperature',
              readable: true,
              writeable: false,
              type: 'number',
              unit: 'C',
            },
            value: 20.8,
          },
          {
            valueId: { commandClass: 112, endpoint: 0, property: 'statusFlags' },
            metadata: {
              label: 'Status Flags',
              readable: true,
              writeable: false,
              type: 'number',
            },
            value: 2,
          },
        ],
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Values 3 (z)'), true);
  assert.equal(rendered.includes('Controls (1) (1)'), true);
  assert.equal(rendered.includes('Sensors (1) (2)'), true);
  assert.equal(rendered.includes('Config (1) (4)'), true);
  assert.equal(rendered.includes('Switch: on (99)'), true);
  assert.equal(rendered.includes('Temperature: 20.8 C'), true);
  assert.equal(rendered.includes('Status Flags: 2'), true);
});

test('runPanelApp scrolls right pane when focused on node detail', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.rows = 24;
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 4, name: 'Bedroom', product: 'Dimmer' }],
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
          name: 'Bedroom',
          ready: true,
          status: 'alive',
          manufacturer: 'Inovelli',
          manufacturerId: 4655,
          product: 'Dimmer',
          productType: 1,
          productId: 2,
        },
        neighbors: [1, 2],
        notificationEvents: [],
        values: Array.from({ length: 16 }, (_, index) => ({
          valueId: {
            commandClass: 112,
            endpoint: 0,
            property: `prop-${index + 1}`,
          },
          metadata: {
            label: `Property ${index + 1}`,
            readable: true,
            writeable: false,
            type: 'number',
          },
          value: index,
        })),
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'z', 'tab', 'pagedown', 'q']);
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Node 4 Detail'), true);
  const ranges = [];
  for (const match of rendered.matchAll(/Detail \[(\d+)-(\d+)\/(\d+)\]/g)) {
    ranges.push(Number(match[1]));
  }
  assert.equal(ranges.length > 0, true);
  assert.equal(
    ranges.some((start) => start > 1),
    true,
  );
  assert.equal(rendered.includes('Property 16'), true);
});

test('runPanelApp keeps selected value visible while moving down in right pane', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.rows = 18;
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [{ nodeId: 4, name: 'Bedroom', product: 'Dimmer' }],
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
          name: 'Bedroom',
          ready: true,
          status: 'alive',
          manufacturer: 'Inovelli',
          manufacturerId: 4655,
          product: 'Dimmer',
          productType: 1,
          productId: 2,
        },
        neighbors: [1, 2],
        notificationEvents: [],
        values: Array.from({ length: 32 }, (_, index) => ({
          valueId: {
            commandClass: 112,
            endpoint: 0,
            property: `prop-${index + 1}`,
          },
          metadata: {
            label: `Property ${index + 1}`,
            readable: true,
            writeable: false,
            type: 'number',
          },
          value: index,
        })),
      };
    },
  };
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, [
      'return',
      'z',
      'tab',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'down',
      'q',
    ]);
  }, 5);

  await runPromise;

  const selectedFrame = [...capture.snapshots]
    .reverse()
    .find((snapshot) => snapshot.rightLines.join('\n').includes('> Property 26:'));
  assert.notEqual(selectedFrame, undefined);
  assert.equal(
    selectedFrame.rightLines.some((line) => line.includes('> Property 26:')),
    true,
  );
  const rangeMatch = selectedFrame.rightTitle.match(/Detail \[(\d+)-(\d+)\/(\d+)\]/);
  assert.notEqual(rangeMatch, null);
  assert.equal(Number(rangeMatch[1]) > 1, true);
});

test('runPanelApp can scroll past large neighbors block to values section', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.rows = 24;
  const neighborIds = Array.from({ length: 450 }, (_, index) => 1000 + index);
  const neighborItems = neighborIds.map((nodeId) => ({
    nodeId,
    name: `VeryLongNeighborNodeName-${nodeId}-Segment-Alpha-Beta-Gamma`,
    manufacturer: `Manufacturer-${nodeId}-With-Long-Descriptor`,
    product: `Product-${nodeId}-Extended-Model-Name`,
  }));
  const presenter = {
    async connect() {},
    async disconnect() {},
    getState() {
      return {
        explorer: {
          items: [
            { nodeId: 21, name: 'Hallway', manufacturer: 'Zooz', product: 'Switch' },
            ...neighborItems,
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
          name: 'Hallway',
          ready: true,
          status: 4,
          manufacturer: 'Zooz',
          product: 'Switch',
        },
        neighbors: neighborIds,
        notificationEvents: [],
        values: [
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['return', 'n', 'tab']);
    for (let i = 0; i < 40; i += 1) {
      emitInputKey(input, 'pagedown');
    }
    emitInputKey(input, 'q');
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Values 1 (z)'), true);
  assert.equal(rendered.includes('Switch: on (99)'), true);
});

test('runPanelApp can quit via ctrl+c keypress intent', async () => {
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKey(input, 'ctrl_c');
  }, 5);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('ZWJS nodes (panel)'), true);
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKeys(input, ['p', 'W', 'W', 'A', 'A', 'q']);
  }, 5);

  await runPromise;

  assert.equal(presenter.writeCalls, 1);
  assert.equal(presenter.manifestCalls, 1);
  const rendered = capture.text();
  assert.equal(rendered.includes('Confirm scaffold write'), true);
  assert.equal(rendered.includes('Confirm manifest add'), true);
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
  const { capture, deps } = createPanelDeps(presenter, input, output);

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
    deps,
  );

  setTimeout(() => {
    emitInputKey(input, 'm');
  }, 5);
  setTimeout(() => {
    emitInputKey(input, 'c');
  }, 40);
  setTimeout(() => {
    emitInputKey(input, 'q');
  }, 80);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.includes('Cancel requested for'), true);
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
  const { capture, deps } = createPanelDeps(presenter, input, output, {
    panelOperationTimeoutMs: 30,
  });

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
    deps,
  );

  setTimeout(() => {
    emitInputKey(input, 'm');
  }, 5);
  setTimeout(() => {
    emitInputKey(input, 'q');
  }, 80);

  await runPromise;

  const rendered = capture.text();
  assert.equal(rendered.toLowerCase().includes('timed out'), true);
});

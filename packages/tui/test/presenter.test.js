const test = require('node:test');
const assert = require('node:assert/strict');

const { ExplorerPresenter } = require('../dist/presenter/explorer-presenter');

test('ExplorerPresenter connect success loads nodes and sets ready state', async () => {
  const service = {
    connectCalls: 0,
    listNodesCalls: 0,
    async connect() {
      this.connectCalls += 1;
    },
    async disconnect() {},
    async listNodes() {
      this.listNodesCalls += 1;
      return [
        {
          nodeId: 3,
          name: 'Kitchen',
          ready: true,
          status: 'alive',
          manufacturer: null,
          product: null,
        },
      ];
    },
    async getNodeDetail() {
      throw new Error('not used');
    },
  };

  const presenter = new ExplorerPresenter(service);
  const nodes = await presenter.connect({
    url: 'ws://127.0.0.1:3000',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
  });

  assert.equal(service.connectCalls, 1);
  assert.equal(service.listNodesCalls, 1);
  assert.equal(nodes.length, 1);
  const state = presenter.getState();
  assert.equal(state.connectionState, 'ready');
  assert.equal(state.explorer.items.length, 1);
  assert.equal(state.lastError, undefined);
});

test('ExplorerPresenter connect failure sets error state', async () => {
  const service = {
    async connect() {
      throw new Error('boom');
    },
    async disconnect() {},
    async listNodes() {
      return [];
    },
    async getNodeDetail() {
      return null;
    },
  };

  const presenter = new ExplorerPresenter(service);
  await assert.rejects(
    () =>
      presenter.connect({
        url: 'ws://127.0.0.1:3000',
        schemaVersion: 0,
        includeValues: 'summary',
        maxValues: 200,
      }),
    /boom/,
  );

  const state = presenter.getState();
  assert.equal(state.connectionState, 'error');
  assert.match(state.lastError, /boom/);
  assert.equal(
    state.runLog.some((entry) => entry.level === 'error'),
    true,
  );
});

test('ExplorerPresenter showNodeDetail caches selected node detail', async () => {
  const service = {
    async connect() {},
    async disconnect() {},
    async listNodes() {
      return [];
    },
    async getNodeDetail(nodeId) {
      return {
        nodeId,
        state: { name: 'Node' },
        neighbors: [],
        notificationEvents: [],
        values: [],
      };
    },
  };
  const presenter = new ExplorerPresenter(service);
  await presenter.connect({
    url: 'ws://127.0.0.1:3000',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
  });

  const detail = await presenter.showNodeDetail(12);
  assert.equal(detail.nodeId, 12);
  const state = presenter.getState();
  assert.equal(state.explorer.selectedNodeId, 12);
  assert.equal(state.nodeDetailCache[12].nodeId, 12);
});

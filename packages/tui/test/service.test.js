const test = require('node:test');
const assert = require('node:assert/strict');

const { ZwjsExplorerServiceImpl } = require('../dist/service/zwjs-explorer-service');

function createFakeClient() {
  return {
    startCalls: 0,
    initializeCalls: 0,
    startListeningCalls: 0,
    stopCalls: 0,
    async start() {
      this.startCalls += 1;
    },
    async initialize() {
      this.initializeCalls += 1;
      return { success: true, result: {} };
    },
    async startListening() {
      this.startListeningCalls += 1;
      return { success: true, result: {} };
    },
    async stop() {
      this.stopCalls += 1;
    },
    async getNodeList() {
      return {
        success: true,
        result: {
          nodes: [
            { nodeId: 9, name: 'B' },
            { nodeId: 2, name: 'A' },
          ],
        },
      };
    },
    async getNodeState(nodeId) {
      return {
        success: true,
        result: {
          state: { nodeId, name: `Node ${nodeId}`, ready: true, status: 'alive' },
        },
      };
    },
    async getControllerNodeNeighbors() {
      return { success: true, result: [1, 2] };
    },
    async getNodeSupportedNotificationEvents() {
      return { success: true, result: [] };
    },
    async getControllerKnownLifelineRoutes() {
      return {
        success: true,
        result: {
          routes: {
            2: {
              repeaters: [1, 7],
              routeSpeed: 40_000,
            },
          },
        },
      };
    },
    async getNodeDefinedValueIds() {
      return {
        success: true,
        result: [{ commandClass: 37, property: 'currentValue', endpoint: 0 }],
      };
    },
    async getNodeValueMetadata() {
      return { success: true, result: { type: 'boolean' } };
    },
    async getNodeValue() {
      return { success: true, result: { value: true } };
    },
    async getNodeValueTimestamp() {
      return { success: true, result: 123 };
    },
  };
}

test('ZwjsExplorerServiceImpl connects, lists nodes, shows details, and disconnects', async () => {
  const fakeClient = createFakeClient();
  const service = new ZwjsExplorerServiceImpl({
    createClient: () => fakeClient,
  });

  await service.connect({
    mode: 'nodes',
    manifestFile: 'rules/manifest.json',
    url: 'ws://127.0.0.1:3000',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 50,
  });

  assert.equal(fakeClient.startCalls, 1);
  assert.equal(fakeClient.initializeCalls, 1);
  assert.equal(fakeClient.startListeningCalls, 1);

  const nodes = await service.listNodes();
  assert.deepEqual(
    nodes.map((node) => node.nodeId),
    [2, 9],
  );

  const detail = await service.getNodeDetail(2, { includeValues: 'summary', maxValues: 10 });
  assert.equal(detail.nodeId, 2);
  assert.equal(Array.isArray(detail.values), true);
  assert.equal(detail.values.length, 1);
  assert.deepEqual(detail.lifelineRoute, { repeaters: [1, 7], routeSpeed: 40_000 });

  const detailNoLink = await service.getNodeDetail(2, {
    includeValues: 'none',
    maxValues: 1,
    includeLinkQuality: false,
  });
  assert.equal(detailNoLink.lifelineRoute, undefined);

  await service.disconnect();
  assert.equal(fakeClient.stopCalls, 1);
});

test('ZwjsExplorerServiceImpl fails if listing nodes before connect', async () => {
  const service = new ZwjsExplorerServiceImpl({
    createClient: () => createFakeClient(),
  });
  await assert.rejects(() => service.listNodes(), /not connected/i);
});

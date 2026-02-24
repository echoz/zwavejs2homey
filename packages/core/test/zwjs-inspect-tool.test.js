const test = require('node:test');
const assert = require('node:assert/strict');

async function loadLib() {
  return import('../../../tools/zwjs-inspect-lib.mjs');
}

test('parseCliArgs parses nodes list command with defaults', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs(['nodes', 'list', '--url', 'ws://127.0.0.1:3000']);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.command, {
    group: 'nodes',
    action: 'list',
    nodeId: undefined,
    url: 'ws://127.0.0.1:3000',
    token: undefined,
    format: 'table',
    schemaVersion: 0,
    maxValues: 200,
    includeValues: 'full',
  });
});

test('parseCliArgs validates show command and required node id', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs(['nodes', 'show', '--url', 'ws://127.0.0.1:3000']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /nodeId/);
});

test('parseCliArgs returns usage text for help flag', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs(['--help']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Usage:/);
  assert.match(parsed.error, /nodes show/);
});

test('formatNodeListTable renders expected headers and rows', async () => {
  const { formatNodeListTable } = await loadLib();
  const output = formatNodeListTable([
    {
      nodeId: 5,
      name: 'Kitchen Dimmer',
      ready: true,
      status: 'alive',
      manufacturer: 'Inovelli',
      product: 'Dimmer',
    },
  ]);
  assert.match(output, /Node\s+Name\s+Ready/);
  assert.match(output, /Kitchen Dimmer/);
  assert.match(output, /alive/);
});

test('fetchNodesList normalizes and sorts nodes', async () => {
  const { fetchNodesList } = await loadLib();
  const client = {
    async getNodeList() {
      return {
        nodes: [
          { nodeId: 8, name: 'B', ready: false },
          { nodeId: 2, name: 'A', ready: true, manufacturer: 'X' },
        ],
      };
    },
  };
  const nodes = await fetchNodesList(client);
  assert.deepEqual(
    nodes.map((n) => n.nodeId),
    [2, 8],
  );
  assert.equal(nodes[0].manufacturer, 'X');
});

test('fetchNodesList supports wrapped command result shape for compatibility', async () => {
  const { fetchNodesList } = await loadLib();
  const client = {
    async getNodeList() {
      return {
        success: true,
        result: {
          nodes: [{ nodeId: 1, name: 'Only' }],
        },
      };
    },
  };
  const nodes = await fetchNodesList(client);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].nodeId, 1);
});

test('fetchNodeDetails collects node state, neighbors and value details', async () => {
  const { fetchNodeDetails } = await loadLib();
  const valueId = { commandClass: 37, endpoint: 0, property: 'currentValue' };
  const client = {
    async getNodeState(nodeId) {
      assert.equal(nodeId, 5);
      return { success: true, result: { state: { nodeId, name: 'Switch', ready: true } } };
    },
    async getControllerNodeNeighbors() {
      return { success: true, result: { neighbors: [1, 2] } };
    },
    async getNodeSupportedNotificationEvents() {
      return { success: false, error: { errorCode: 'not_supported' } };
    },
    async getNodeDefinedValueIds() {
      return { success: true, result: [valueId] };
    },
    async getNodeValueMetadata() {
      return { success: true, result: { label: 'Current value', type: 'boolean' } };
    },
    async getNodeValue() {
      return { success: true, result: { value: true } };
    },
    async getNodeValueTimestamp() {
      return { success: true, result: { timestamp: 123 } };
    },
  };

  const detail = await fetchNodeDetails(client, 5, { includeValues: 'full', maxValues: 10 });
  assert.equal(detail.nodeId, 5);
  assert.deepEqual(detail.neighbors, [1, 2]);
  assert.ok(detail.notificationEvents._error);
  assert.equal(detail.values.length, 1);
  assert.equal(detail.values[0].value, true);
  assert.deepEqual(detail.values[0].timestamp, { timestamp: 123 });
});

test('fetchNodeDetails summary mode omits value/timestamp fetches and returns metadata previews', async () => {
  const { fetchNodeDetails, formatNodeDetailTable } = await loadLib();
  const valueId = { commandClass: 37, endpoint: 0, property: 'currentValue' };
  let valueCalls = 0;
  const client = {
    async getNodeState() {
      return { success: true, result: { state: { nodeId: 5, name: 'Switch' } } };
    },
    async getControllerNodeNeighbors() {
      return { success: true, result: [] };
    },
    async getNodeSupportedNotificationEvents() {
      return { success: true, result: {} };
    },
    async getNodeDefinedValueIds() {
      return { success: true, result: [valueId] };
    },
    async getNodeValueMetadata() {
      return { success: true, result: { type: 'boolean' } };
    },
    async getNodeValue() {
      valueCalls += 1;
      return { success: true, result: { value: true } };
    },
    async getNodeValueTimestamp() {
      valueCalls += 1;
      return { success: true, result: { timestamp: 1 } };
    },
  };
  const detail = await fetchNodeDetails(client, 5, { includeValues: 'summary', maxValues: 5 });
  assert.equal(valueCalls, 0);
  const table = formatNodeDetailTable(detail);
  assert.match(table, /\"type\":\"boolean\"/);
});

test('formatNodeDetailTable falls back to deviceConfig manufacturer/label', async () => {
  const { formatNodeDetailTable } = await loadLib();
  const table = formatNodeDetailTable({
    nodeId: 9,
    state: {
      name: 'Example',
      ready: true,
      status: 4,
      manufacturerId: 29,
      productType: 1,
      productId: 2,
      deviceConfig: { manufacturer: 'Leviton', label: 'DZ15S' },
    },
    neighbors: [],
    notificationEvents: {},
    values: [],
  });
  assert.match(table, /Manufacturer: Leviton/);
  assert.match(table, /Product: DZ15S/);
});

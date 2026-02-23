const test = require('node:test');
const assert = require('node:assert/strict');

const { ZwjsClientImpl } = require('../dist/client/zwjs-client.js');
const { loadFixture } = require('./fixtures/_load-fixture.js');

class FakeTransport {
  constructor() {
    this.open = false;
    this.currentEvents = undefined;
    this.sent = [];
  }

  connect(_url, events) {
    this.currentEvents = events;
    return Promise.resolve();
  }

  send(data) {
    if (!this.open) throw new Error('WebSocket is not connected');
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.open = false;
    this.currentEvents?.onClose?.({ code: 1000, reason: 'closed', wasClean: true });
  }

  isOpen() {
    return this.open;
  }

  triggerOpen() {
    this.open = true;
    this.currentEvents?.onOpen?.();
  }

  triggerMessage(frame) {
    this.currentEvents?.onMessage?.(JSON.stringify(frame));
  }
}

function makeClient() {
  const client = new ZwjsClientImpl({
    url: 'ws://example.test:3000',
    reconnect: { enabled: false },
    timeouts: { connectTimeoutMs: 100, requestTimeoutMs: 100 },
  });
  const transport = new FakeTransport();
  client.transport = transport;
  return { client, transport };
}

async function startConnected(client, transport) {
  const startPromise = client.start();
  transport.triggerOpen();
  transport.triggerMessage(loadFixture('zwjs-server', 'version.frame.json'));
  await startPromise;
}

function withMessageId(frame, messageId) {
  return { ...frame, messageId };
}

test('getControllerNodeNeighbors sends correct command and returns result array', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getControllerNodeNeighbors(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(sent, withMessageId(loadFixture('zwjs-server', 'command.controller.get_node_neighbors.json'), sent.messageId));

  transport.triggerMessage(withMessageId(loadFixture('zwjs-server', 'result.controller.get_node_neighbors.success.json'), sent.messageId));
  const result = await pending;

  assert.equal(result.success, true);
  assert.deepEqual(result.result, [2, 7, 12]);
  await client.stop();
});

test('getNodeDefinedValueIds sends correct command and returns result array', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getNodeDefinedValueIds(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(sent, withMessageId(loadFixture('zwjs-server', 'command.node.get_defined_value_ids.json'), sent.messageId));

  transport.triggerMessage(withMessageId(loadFixture('zwjs-server', 'result.node.get_defined_value_ids.success.json'), sent.messageId));
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(Array.isArray(result.result), true);
  assert.equal(result.result[0].commandClass, 37);
  await client.stop();
});

test('getNodeValue sends correct command and returns raw value result', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const valueId = { commandClass: 37, property: 'currentValue', endpoint: 0 };
  const pending = client.getNodeValue(5, valueId);
  const sent = transport.sent.at(-1);
  assert.deepEqual(sent, withMessageId(loadFixture('zwjs-server', 'command.node.get_value.json'), sent.messageId));

  transport.triggerMessage(withMessageId(loadFixture('zwjs-server', 'result.node.get_value.success.json'), sent.messageId));
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(result.result, true);
  await client.stop();
});

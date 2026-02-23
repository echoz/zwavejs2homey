const test = require('node:test');
const assert = require('node:assert/strict');

const { ZwjsClientImpl } = require('../dist/client/zwjs-client.js');
const { loadFixture } = require('./fixtures/_load-fixture.js');

class FakeTransport {
  constructor() {
    this.open = false;
    this.connectCalls = [];
    this.sent = [];
    this.currentEvents = undefined;
  }

  connect(url, events, headers) {
    this.connectCalls.push({ url, headers });
    this.currentEvents = events;
    return Promise.resolve();
  }

  send(data) {
    if (!this.open) {
      throw new Error('WebSocket is not connected');
    }
    this.sent.push(data);
  }

  close() {
    if (!this.currentEvents) return;
    this.open = false;
    this.currentEvents.onClose?.({ code: 1000, reason: 'closed', wasClean: true });
  }

  isOpen() {
    return this.open;
  }

  triggerOpen() {
    this.open = true;
    this.currentEvents?.onOpen?.();
  }

  triggerMessage(obj) {
    this.currentEvents?.onMessage?.(JSON.stringify(obj));
  }

  triggerClose(evt = { code: 1006, reason: 'abnormal', wasClean: false }) {
    this.open = false;
    this.currentEvents?.onClose?.(evt);
  }

  lastSentFrame() {
    assert.ok(this.sent.length > 0, 'expected sent frames');
    return JSON.parse(this.sent[this.sent.length - 1]);
  }
}

function makeClient(overrides = {}) {
  const client = new ZwjsClientImpl({
    url: 'ws://example.test:3000',
    reconnect: { enabled: true, initialDelayMs: 5, maxDelayMs: 10, multiplier: 2, jitterRatio: 0 },
    timeouts: { connectTimeoutMs: 100, requestTimeoutMs: 100 },
    ...overrides,
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

test('correlates concurrent command results by messageId (out of order)', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const p1 = client.sendCommand({ command: 'driver.get_config' });
  const p2 = client.sendCommand({ command: 'controller.get_state' });

  const first = JSON.parse(transport.sent[0]);
  const second = JSON.parse(transport.sent[1]);
  assert.equal(first.command, 'driver.get_config');
  assert.equal(second.command, 'controller.get_state');
  assert.notEqual(first.messageId, second.messageId);

  transport.triggerMessage({
    type: 'result',
    messageId: second.messageId,
    success: true,
    result: { state: { controllerId: 1 } },
  });
  transport.triggerMessage({
    type: 'result',
    messageId: first.messageId,
    success: true,
    result: { config: { statisticsEnabled: true } },
  });

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal(r1.result.config.statisticsEnabled, true);
  assert.equal(r2.result.state.controllerId, 1);

  await client.stop();
});

test('returns protocol failure result (success=false) without throwing', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.sendCommand({ command: 'set_api_schema', args: { schemaVersion: 999 } });
  const frame = transport.lastSentFrame();

  transport.triggerMessage(loadFixture('zwjs-server', 'result.error.schema-incompatible.json'));
  // rewrite fixture messageId to match actual request
  // send a second frame with the real messageId because correlation is strict
  transport.triggerMessage({
    type: 'result',
    messageId: frame.messageId,
    success: false,
    errorCode: 'schema_incompatible',
  });

  const result = await pending;
  assert.equal(result.success, false);
  assert.equal(result.messageId, frame.messageId);
  assert.equal(result.error.errorCode, 'schema_incompatible');
  assert.equal(result.error.raw.errorCode, 'schema_incompatible');

  await client.stop();
});

test('reconnects after abnormal disconnect and can process commands again', async () => {
  const { client, transport } = makeClient();
  const events = [];
  client.onEvent((event) => events.push(event));

  await startConnected(client, transport);
  assert.equal(client.getStatus().lifecycle, 'connected');

  transport.triggerClose({ code: 1006, reason: 'drop', wasClean: false });

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.ok(transport.connectCalls.length >= 2, 'expected reconnect connect() call');

  transport.triggerOpen();
  transport.triggerMessage(loadFixture('zwjs-server', 'version.frame.json'));
  await new Promise((resolve) => setTimeout(resolve, 5));

  const cmd = client.sendCommand({ command: 'driver.get_config' });
  const sent = transport.lastSentFrame();
  transport.triggerMessage({
    type: 'result',
    messageId: sent.messageId,
    success: true,
    result: { config: { logConfig: { enabled: true } } },
  });

  const res = await cmd;
  assert.equal(res.success, true);
  assert.equal(res.result.config.logConfig.enabled, true);
  assert.equal(client.getStatus().lifecycle, 'connected');
  assert.equal(events.some((e) => e.type === 'client.reconnect.scheduled'), true);

  await client.stop();
});

test('clears cached server and node snapshots on reconnect before new frames arrive', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const firstNodeListPromise = client.getNodeList();
  const startListeningFrame = transport.lastSentFrame();
  assert.equal(startListeningFrame.command, 'start_listening');
  transport.triggerMessage({
    type: 'result',
    messageId: startListeningFrame.messageId,
    success: true,
    result: { state: { nodes: [{ nodeId: 5, name: 'Kitchen' }] } },
  });
  const firstNodeList = await firstNodeListPromise;
  assert.equal(firstNodeList.nodes.length, 1);
  assert.equal((await client.getServerInfo()).serverVersion, '1.0.0');

  transport.triggerClose({ code: 1006, reason: 'drop', wasClean: false });
  await new Promise((resolve) => setTimeout(resolve, 15));
  transport.triggerOpen();

  await assert.rejects(() => client.getServerInfo(), /Server info not yet available/);

  const pendingNodeList = client.getNodeList();
  const earlyResult = await Promise.race([
    pendingNodeList.then(() => 'resolved'),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 5)),
  ]);
  assert.equal(earlyResult, 'pending', 'node list should not resolve from stale cache before new snapshot');

  transport.triggerMessage({
    type: 'version',
    serverVersion: '3.4.1',
    driverVersion: '15.21.0',
    minSchemaVersion: 0,
    maxSchemaVersion: 39,
  });
  const secondStartListeningFrame = transport.lastSentFrame();
  assert.equal(secondStartListeningFrame.command, 'start_listening');
  transport.triggerMessage({
    type: 'result',
    messageId: secondStartListeningFrame.messageId,
    success: true,
    result: { state: { nodes: [{ nodeId: 7, name: 'Office' }] } },
  });
  const secondNodeList = await pendingNodeList;
  assert.equal(secondNodeList.nodes[0].nodeId, 7);
  assert.equal((await client.getServerInfo()).serverVersion, '3.4.1');

  await client.stop();
});

test('getNodeList waits for snapshot instead of returning an empty list when start_listening has no state', async () => {
  const { client, transport } = makeClient({
    timeouts: { connectTimeoutMs: 100, requestTimeoutMs: 1000 },
  });
  await startConnected(client, transport);

  const nodeListPromise = client.getNodeList();
  const sent = transport.lastSentFrame();
  assert.equal(sent.command, 'start_listening');

  transport.triggerMessage({
    type: 'result',
    messageId: sent.messageId,
    success: true,
    result: {},
  });

  const earlyResult = await Promise.race([
    nodeListPromise.then(() => 'resolved'),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 5)),
  ]);
  assert.equal(earlyResult, 'pending', 'should wait for a later snapshot event');

  transport.triggerMessage({
    type: 'nodes.snapshot',
    payload: [{ nodeId: 11, name: 'Hallway' }],
  });

  const nodeList = await nodeListPromise;
  assert.deepEqual(nodeList.nodes.map((n) => n.nodeId), [11]);

  await client.stop();
});

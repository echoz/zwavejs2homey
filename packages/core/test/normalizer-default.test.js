const test = require('node:test');
const assert = require('node:assert/strict');

const { DefaultZwjsFamilyNormalizer } = require('../dist/protocol/normalizers/family-default.js');

const normalizer = new DefaultZwjsFamilyNormalizer();

test('normalizes version frame to server.info', () => {
  const msg = {
    type: 'version',
    driverVersion: '15.21.0',
    serverVersion: '3.4.0',
    homeId: 123,
    minSchemaVersion: 0,
    maxSchemaVersion: 44,
  };

  const out = normalizer.normalizeIncoming(msg);
  assert.equal(out.serverInfo.serverVersion, '3.4.0');
  assert.equal(out.serverInfo.zwaveJsVersion, '15.21.0');
  assert.deepEqual(out.serverInfo.schemaHints, ['min:0', 'max:44']);
  assert.equal(out.events[0].type, 'server.info');
});

test('normalizes start_listening result state nodes to snapshot', () => {
  const msg = {
    type: 'result',
    messageId: 'abc',
    success: true,
    result: {
      state: {
        nodes: [
          { id: 2, name: 'Kitchen Dimmer', loc: 'Kitchen', ready: true, status: 'alive' },
          { id: 3, name: 'Door Sensor', loc: 'Entry', ready: false, status: 'asleep' },
        ],
      },
    },
  };

  const out = normalizer.normalizeIncoming(msg);
  assert.equal(out.requestResponse.id, 'abc');
  assert.equal(out.nodesSnapshot.nodes.length, 2);
  assert.deepEqual(out.nodesSnapshot.nodes[0], {
    nodeId: 2,
    name: 'Kitchen Dimmer',
    location: 'Kitchen',
    ready: true,
    status: 'alive',
  });
  assert.equal(out.events.some((e) => e.type === 'nodes.snapshot'), true);
});

test('normalizes event frame to raw-normalized event', () => {
  const msg = {
    type: 'event',
    event: {
      source: 'node',
      event: 'value updated',
      nodeId: 2,
    },
  };

  const out = normalizer.normalizeIncoming(msg);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].type, 'node.event.raw-normalized');
  assert.equal(out.events[0].event.source, 'node');
});

test('normalizes failed result as requestError only', () => {
  const msg = {
    type: 'result',
    messageId: 'bad1',
    success: false,
    error: { code: 'boom' },
  };

  const out = normalizer.normalizeIncoming(msg);
  assert.equal(out.requestResponse, undefined);
  assert.equal(out.requestError.id, 'bad1');
  assert.deepEqual(out.requestError.error, { code: 'boom' });
});

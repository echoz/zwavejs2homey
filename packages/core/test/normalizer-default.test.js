const test = require('node:test');
const assert = require('node:assert/strict');

const { DefaultZwjsFamilyNormalizer } = require('../dist/protocol/normalizers/family-default.js');
const { loadFixture } = require('./fixtures/_load-fixture.js');

const normalizer = new DefaultZwjsFamilyNormalizer();

test('normalizes version frame to server.info', () => {
  const msg = loadFixture('zwjs-server', 'version.frame.json');

  const out = normalizer.normalizeIncoming(msg);
  assert.equal(out.serverInfo.serverVersion, '1.0.0');
  assert.equal(out.serverInfo.zwaveJsVersion, '6.5.0');
  assert.deepEqual(out.serverInfo.schemaHints, ['min:0', 'max:1']);
  assert.equal(out.events[0].type, 'server.info');
});

test('normalizes start_listening result state nodes to snapshot', () => {
  const msg = loadFixture('zwjs-server', 'result.start-listening.state.minimal.json');

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
  const msg = loadFixture('zwjs-server', 'event.node.value-updated.minimal.json');

  const out = normalizer.normalizeIncoming(msg);
  assert.equal(out.events.length, 3);
  assert.equal(out.events[0].type, 'zwjs.event.node');
  assert.equal(out.events[1].type, 'zwjs.event.node.value-updated');
  assert.equal(out.events[0].event.source, 'node');
  assert.equal(out.events[2].type, 'node.event.raw-normalized');
  assert.equal(out.events[2].event.source, 'node');
});

test('normalizes controller event frame to source-aware typed event', () => {
  const msg = loadFixture('zwjs-server', 'event.controller.nvm-restore-progress.json');

  const out = normalizer.normalizeIncoming(msg);
  assert.equal(out.events[0].type, 'zwjs.event.controller');
  assert.equal(out.events[0].event.event, 'nvm restore progress');
  assert.equal(out.events[0].event.bytesWritten, 128);
});

test('normalizes failed result as requestError only', () => {
  const msg = loadFixture('zwjs-server', 'result.error.schema-incompatible.json');

  const out = normalizer.normalizeIncoming(msg);
  assert.equal(out.requestResponse, undefined);
  assert.equal(out.requestError.id, '1');
  assert.deepEqual(out.requestError.error, msg);
});

test('builds start_listening command envelope', () => {
  const built = normalizer.buildStartListeningRequest('fixture-1');
  const expected = loadFixture('zwjs-server', 'command.start_listening.json');
  assert.deepEqual(built, expected);
});

test('builds driver.get_config command envelope', () => {
  const built = normalizer.buildCommandRequest('fixture-2', 'driver.get_config');
  const expected = loadFixture('zwjs-server', 'command.driver.get_config.json');
  assert.deepEqual(built, expected);
});

test('emits specialized node value-updated event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.value-updated.args.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.value-updated');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
  assert.equal(specialized.event.args.newValue, true);
});

test('emits specialized node metadata-updated event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.metadata-updated.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.metadata-updated');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
  assert.equal(specialized.event.args.propertyName, 'currentValue');
});

test('emits specialized node notification event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.notification.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.notification');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
  assert.equal(specialized.event.args.label, 'Motion detected');
});

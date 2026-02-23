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
  assert.equal(out.events.some((e) => e.type === 'zwjs.event.controller.nvm-restore-progress'), true);
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

test('emits specialized node value-added event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.value-added.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.value-added');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
  assert.equal(specialized.event.args.property, 'currentValue');
});

test('emits specialized node value-removed event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.value-removed.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.value-removed');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
  assert.equal(specialized.event.args.property, 'targetValue');
});

test('emits specialized node value-notification event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.value-notification.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.value-notification');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
  assert.equal(specialized.event.args.commandClass, 113);
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

test('emits specialized node wake-up event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.wake-up.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.wake-up');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
  assert.equal(specialized.event.oldStatus, 'asleep');
});

test('emits specialized node sleep event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.sleep.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.sleep');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
  assert.equal(specialized.event.oldStatus, 'awake');
});

test('emits specialized node interview-started event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.interview-started.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.interview-started');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
});

test('emits specialized node interview-completed event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.interview-completed.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.interview-completed');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
});

test('emits specialized node interview-failed event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.interview-failed.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.interview-failed');
  assert.ok(specialized);
  assert.equal(specialized.event.args.reason, 'timeout');
});

test('emits specialized node interview-stage-completed event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.interview-stage-completed.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.interview-stage-completed');
  assert.ok(specialized);
  assert.equal(specialized.event.stageName, 'CommandClasses');
});

test('emits specialized driver logging event', () => {
  const msg = loadFixture('zwjs-server', 'event.driver.logging.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.driver.logging');
  assert.ok(specialized);
  assert.equal(specialized.event.formattedMessage, 'Controller ready');
});

test('emits specialized controller nvm convert progress event', () => {
  const msg = loadFixture('zwjs-server', 'event.controller.nvm-convert-progress.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.controller.nvm-convert-progress');
  assert.ok(specialized);
  assert.equal(specialized.event.bytesRead, 256);
  assert.equal(specialized.event.total, 1024);
});

test('emits specialized controller nvm backup progress event', () => {
  const msg = loadFixture('zwjs-server', 'event.controller.nvm-backup-progress.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.controller.nvm-backup-progress');
  assert.ok(specialized);
  assert.equal(specialized.event.bytesRead, 64);
  assert.equal(specialized.event.total, 1024);
});

test('emits specialized node test powerlevel progress event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.test-powerlevel-progress.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.test-powerlevel-progress');
  assert.ok(specialized);
  assert.equal(specialized.event.nodeId, 5);
  assert.equal(specialized.event.acknowledged, 7);
});

test('emits specialized node check lifeline health progress event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.check-lifeline-health-progress.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.check-lifeline-health-progress');
  assert.ok(specialized);
  assert.equal(specialized.event.round, 2);
  assert.equal(specialized.event.totalRounds, 5);
});

test('emits specialized node check route health progress event', () => {
  const msg = loadFixture('zwjs-server', 'event.node.check-route-health-progress.json');
  const out = normalizer.normalizeIncoming(msg);
  const specialized = out.events.find((e) => e.type === 'zwjs.event.node.check-route-health-progress');
  assert.ok(specialized);
  assert.equal(specialized.event.rounds, 3);
  assert.equal(specialized.event.lastRating, 7);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isZwjsVersionFrame,
  isZwjsResultFrame,
  isZwjsEventFrame,
} = require('../dist/protocol/raw-frame-types.js');
const { loadFixture } = require('./fixtures/_load-fixture.js');

test('recognizes version frame', () => {
  assert.equal(isZwjsVersionFrame(loadFixture('zwjs-server', 'version.frame.json')), true);
});

test('recognizes result frame', () => {
  assert.equal(isZwjsResultFrame(loadFixture('zwjs-server', 'result.error.schema-incompatible.json')), true);
  assert.equal(isZwjsResultFrame({ type: 'result', messageId: 1, success: true }), false);
});

test('recognizes event frame', () => {
  assert.equal(isZwjsEventFrame(loadFixture('zwjs-server', 'event.node.value-updated.minimal.json')), true);
  assert.equal(isZwjsEventFrame({ type: 'event', event: { source: 'node' } }), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isZwjsVersionFrame,
  isZwjsResultFrame,
  isZwjsResultSuccessFrame,
  isZwjsResultErrorFrame,
  isZwjsEventFrame,
} = require('../dist/protocol/raw-frame-types.js');
const { loadFixture } = require('./fixtures/_load-fixture.js');

test('recognizes version frame', () => {
  assert.equal(isZwjsVersionFrame(loadFixture('zwjs-server', 'version.frame.json')), true);
});

test('recognizes result frame', () => {
  assert.equal(
    isZwjsResultFrame(loadFixture('zwjs-server', 'result.error.schema-incompatible.json')),
    true,
  );
  assert.equal(isZwjsResultFrame({ type: 'result', messageId: 1, success: true }), false);
});

test('recognizes result success/error frame variants', () => {
  assert.equal(
    isZwjsResultSuccessFrame({
      type: 'result',
      messageId: '1',
      success: true,
      result: { ok: true },
    }),
    true,
  );
  assert.equal(
    isZwjsResultSuccessFrame(loadFixture('zwjs-server', 'result.error.schema-incompatible.json')),
    false,
  );

  assert.equal(
    isZwjsResultErrorFrame(loadFixture('zwjs-server', 'result.error.zwave-error.json')),
    true,
  );
  assert.equal(
    isZwjsResultErrorFrame({ type: 'result', messageId: '2', success: true, result: {} }),
    false,
  );
});

test('recognizes event frame', () => {
  assert.equal(
    isZwjsEventFrame(loadFixture('zwjs-server', 'event.node.value-updated.minimal.json')),
    true,
  );
  assert.equal(isZwjsEventFrame({ type: 'event', event: { source: 'node' } }), false);
});

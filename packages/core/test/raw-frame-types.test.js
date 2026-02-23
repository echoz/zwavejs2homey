const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isZwjsVersionFrame,
  isZwjsResultFrame,
  isZwjsEventFrame,
} = require('../dist/protocol/raw-frame-types.js');

test('recognizes version frame', () => {
  assert.equal(
    isZwjsVersionFrame({
      type: 'version',
      driverVersion: '1.0.0',
      serverVersion: '2.0.0',
      minSchemaVersion: 0,
      maxSchemaVersion: 44,
    }),
    true,
  );
});

test('recognizes result frame', () => {
  assert.equal(isZwjsResultFrame({ type: 'result', messageId: '1', success: true, result: {} }), true);
  assert.equal(isZwjsResultFrame({ type: 'result', messageId: 1, success: true }), false);
});

test('recognizes event frame', () => {
  assert.equal(isZwjsEventFrame({ type: 'event', event: { source: 'node', event: 'value updated' } }), true);
  assert.equal(isZwjsEventFrame({ type: 'event', event: { source: 'node' } }), false);
});

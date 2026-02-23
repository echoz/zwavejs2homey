const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isZwjsNodeValueEnvelopeResult,
  extractZwjsNodeValue,
} = require('../dist/protocol/value-result-guards.js');
const { loadFixture } = require('./fixtures/_load-fixture.js');

test('recognizes object envelopes and rejects arrays/null', () => {
  assert.equal(isZwjsNodeValueEnvelopeResult({ value: false }), true);
  assert.equal(isZwjsNodeValueEnvelopeResult({}), true);
  assert.equal(isZwjsNodeValueEnvelopeResult([]), false);
  assert.equal(isZwjsNodeValueEnvelopeResult(null), false);
});

test('extracts value from observed value envelope shape', () => {
  const fixture = loadFixture('zwjs-server', 'result.node.get_value.success.value-envelope.json');
  assert.equal(extractZwjsNodeValue(fixture.result), false);
});

test('returns undefined for empty object envelope', () => {
  const fixture = loadFixture('zwjs-server', 'result.node.get_value.success.empty-envelope.json');
  assert.equal(extractZwjsNodeValue(fixture.result), undefined);
});

test('passes through scalar and array values', () => {
  assert.equal(extractZwjsNodeValue(true), true);
  assert.equal(extractZwjsNodeValue(42), 42);
  assert.equal(extractZwjsNodeValue('on'), 'on');
  assert.deepEqual(extractZwjsNodeValue([1, 2]), [1, 2]);
});

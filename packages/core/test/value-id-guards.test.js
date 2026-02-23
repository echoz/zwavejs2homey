const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isZwjsValueId,
  isZwjsDefinedValueId,
  extractZwjsDefinedValueIds,
} = require('../dist/protocol/value-id-guards.js');
const { loadFixture } = require('./fixtures/_load-fixture.js');

test('recognizes valid ZwjsValueId and rejects invalid shapes', () => {
  assert.equal(isZwjsValueId({ commandClass: 37, property: 'currentValue', endpoint: 0 }), true);
  assert.equal(
    isZwjsValueId({ commandClass: 'Binary Switch', property: 'currentValue', propertyKey: 'foo' }),
    true,
  );
  assert.equal(isZwjsValueId({ commandClass: null, property: 'x' }), false);
  assert.equal(isZwjsValueId({ commandClass: 37 }), false);
  assert.equal(isZwjsValueId({ commandClass: 37, property: 'x', endpoint: '0' }), false);
});

test('recognizes defined value id fixture entries', () => {
  const fixture = loadFixture('zwjs-server', 'result.node.get_defined_value_ids.success.json');
  assert.equal(isZwjsDefinedValueId(fixture.result[0]), true);
  assert.equal(isZwjsDefinedValueId({ nope: true }), false);
});

test('extracts defined value ids from array result shape', () => {
  const fixture = loadFixture('zwjs-server', 'result.node.get_defined_value_ids.success.json');
  const out = extractZwjsDefinedValueIds(fixture.result);
  assert.equal(out.length, 2);
  assert.equal(out[0].commandClass, 37);
  assert.equal(out[0].property, 'currentValue');
});

test('extracts defined value ids from object wrapper shape and filters invalid entries', () => {
  const fixture = loadFixture(
    'zwjs-server',
    'result.node.get_defined_value_ids.success.object-wrapper.json',
  );
  const out = extractZwjsDefinedValueIds(fixture);
  assert.equal(out.length, 2);
  assert.equal(out[1].commandClass, 112);
  assert.equal(out[1].propertyKey, 0);
});

test('extracts defined value ids from valueIds wrapper shape used by observed server responses', () => {
  const fixture = loadFixture(
    'zwjs-server',
    'result.node.get_defined_value_ids.success.valueIds-wrapper.json',
  );
  const out = extractZwjsDefinedValueIds(fixture);
  assert.equal(out.length, 2);
  assert.equal(out[0].propertyName, 'Current value');
  assert.equal(out[1].commandClass, 128);
});

test('returns empty list for unsupported defined value id result shapes', () => {
  assert.deepEqual(extractZwjsDefinedValueIds(null), []);
  assert.deepEqual(extractZwjsDefinedValueIds({ values: 'nope' }), []);
});

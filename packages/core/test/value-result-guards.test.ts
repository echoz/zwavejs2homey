const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractZwjsDurationValue,
  extractZwjsFirmwareVersionsValue,
  extractZwjsLockHandleFlagsValue,
  isZwjsNodeValueEnvelopeResult,
  isZwjsDurationValue,
  isZwjsFirmwareVersionsValue,
  isZwjsFirmwareVersionsValueSample,
  isZwjsLockHandleFlagsValue,
  isZwjsLockHandleFlagsValueSample,
  isZwjsSwitchDurationValueSample,
  extractZwjsNodeValue,
  hasZwjsNodeValue,
} = require('../dist/protocol/value-result-guards.js');
const { loadFixture } = require('./fixtures/_load-fixture.ts');

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
  assert.equal(hasZwjsNodeValue(fixture.result), false);
});

test('passes through scalar and array values', () => {
  assert.equal(extractZwjsNodeValue(true), true);
  assert.equal(extractZwjsNodeValue(42), 42);
  assert.equal(extractZwjsNodeValue('on'), 'on');
  assert.deepEqual(extractZwjsNodeValue([1, 2]), [1, 2]);
  assert.equal(hasZwjsNodeValue(true), true);
  assert.equal(hasZwjsNodeValue([1, 2]), true);
});

test('detects whether value envelope contains a value key', () => {
  assert.equal(hasZwjsNodeValue({ value: false }), true);
  assert.equal(hasZwjsNodeValue({ value: null }), true);
  assert.equal(hasZwjsNodeValue({}), false);
});

test('recognizes and extracts observed duration value object', () => {
  const fixture = loadFixture(
    'zwjs-server',
    'result.node.get_value.success.duration-envelope.observed.json',
  );
  const value = extractZwjsNodeValue(fixture.result);
  assert.equal(isZwjsDurationValue(value), true);
  assert.deepEqual(extractZwjsDurationValue(fixture.result), { value: 1, unit: 'seconds' });
  assert.equal(
    isZwjsSwitchDurationValueSample(
      { commandClass: 38, endpoint: 0, property: 'duration' },
      fixture.result,
    ),
    true,
  );
});

test('recognizes and extracts observed lock handle flags value', () => {
  const fixture = loadFixture(
    'zwjs-server',
    'result.node.get_value.success.lock-handle-flags.observed.json',
  );
  const value = extractZwjsNodeValue(fixture.result);
  assert.equal(isZwjsLockHandleFlagsValue(value), true);
  assert.deepEqual(extractZwjsLockHandleFlagsValue(fixture.result), [false, false, false, false]);
  assert.equal(
    isZwjsLockHandleFlagsValueSample(
      { commandClass: 98, endpoint: 0, property: 'insideHandlesCanOpenDoor' },
      fixture.result,
    ),
    true,
  );
});

test('recognizes and extracts observed firmware versions value', () => {
  const fixture = loadFixture(
    'zwjs-server',
    'result.node.get_value.success.firmware-versions.observed.json',
  );
  const value = extractZwjsNodeValue(fixture.result);
  assert.equal(isZwjsFirmwareVersionsValue(value), true);
  assert.deepEqual(extractZwjsFirmwareVersionsValue(fixture.result), ['10.11', '2.2']);
  assert.equal(
    isZwjsFirmwareVersionsValueSample(
      { commandClass: 134, endpoint: 0, property: 'firmwareVersions' },
      fixture.result,
    ),
    true,
  );
});

test('command-class sample guards reject mismatched value ids', () => {
  const durationFixture = loadFixture(
    'zwjs-server',
    'result.node.get_value.success.duration-envelope.observed.json',
  );
  assert.equal(
    isZwjsSwitchDurationValueSample(
      { commandClass: 99, endpoint: 0, property: 'duration' },
      durationFixture.result,
    ),
    false,
  );
});

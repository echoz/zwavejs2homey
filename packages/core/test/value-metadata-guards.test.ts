const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasZwjsNodeValueMetadataBounds,
  isZwjsNodeValueMetadataDuration,
  isZwjsNodeValueMetadataResult,
} = require('../dist/protocol/value-metadata-guards.js');
const { loadFixture } = require('./fixtures/_load-fixture.ts');

test('recognizes observed rich metadata result shape', () => {
  const fixture = loadFixture(
    'zwjs-server',
    'result.node.get_value_metadata.success.observed.config-rich.json',
  );
  assert.equal(isZwjsNodeValueMetadataResult(fixture.result), true);
  assert.equal(hasZwjsNodeValueMetadataBounds(fixture.result), true);
  assert.equal(isZwjsNodeValueMetadataDuration(fixture.result), false);
});

test('recognizes observed duration metadata result shape', () => {
  const fixture = loadFixture(
    'zwjs-server',
    'result.node.get_value_metadata.success.observed.duration-rich.json',
  );
  assert.equal(isZwjsNodeValueMetadataResult(fixture.result), true);
  assert.equal(isZwjsNodeValueMetadataDuration(fixture.result), true);
});

test('rejects invalid metadata field types', () => {
  const invalid = {
    type: 'number',
    readable: true,
    writeable: true,
    label: 'Bad Metadata',
    min: '0',
    max: 100,
  };
  assert.equal(isZwjsNodeValueMetadataResult(invalid), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { DefaultZwjsFamilyNormalizer } = require('../dist/protocol/normalizers/family-default.js');
const { FallbackNormalizer } = require('../dist/protocol/normalizers/fallback.js');
const { loadFixture } = require('./fixtures/_load-fixture.js');

test('default normalizer exposes successful result via requestResponse', () => {
  const n = new DefaultZwjsFamilyNormalizer();
  const out = n.normalizeIncoming({ type: 'result', messageId: '1', success: true, result: { ok: true } });
  assert.deepEqual(out.requestResponse, { id: '1', payload: { ok: true } });
  assert.equal(out.requestError, undefined);
});

test('default normalizer exposes failed result via requestError only', () => {
  const n = new DefaultZwjsFamilyNormalizer();
  const out = n.normalizeIncoming(loadFixture('zwjs-server', 'result.error.zwave-error.json'));
  assert.equal(out.requestResponse, undefined);
  assert.deepEqual(out.requestError, { id: '1', error: loadFixture('zwjs-server', 'result.error.zwave-error.json') });
});

test('fallback normalizer exposes failed result via requestError only', () => {
  const n = new FallbackNormalizer();
  const out = n.normalizeIncoming(loadFixture('zwjs-server', 'result.error.schema-incompatible.json'));
  assert.equal(out.requestResponse, undefined);
  assert.deepEqual(out.requestError, { id: '1', error: loadFixture('zwjs-server', 'result.error.schema-incompatible.json') });
});

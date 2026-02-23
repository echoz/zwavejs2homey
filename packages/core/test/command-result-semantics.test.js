const test = require('node:test');
const assert = require('node:assert/strict');

const { DefaultZwjsFamilyNormalizer } = require('../dist/protocol/normalizers/family-default.js');
const { FallbackNormalizer } = require('../dist/protocol/normalizers/fallback.js');

test('default normalizer exposes successful result via requestResponse', () => {
  const n = new DefaultZwjsFamilyNormalizer();
  const out = n.normalizeIncoming({ type: 'result', messageId: '1', success: true, result: { ok: true } });
  assert.deepEqual(out.requestResponse, { id: '1', payload: { ok: true } });
  assert.equal(out.requestError, undefined);
});

test('default normalizer exposes failed result via requestError only', () => {
  const n = new DefaultZwjsFamilyNormalizer();
  const out = n.normalizeIncoming({ type: 'result', messageId: '2', success: false, error: { message: 'bad' } });
  assert.equal(out.requestResponse, undefined);
  assert.deepEqual(out.requestError, { id: '2', error: { message: 'bad' } });
});

test('fallback normalizer exposes failed result via requestError only', () => {
  const n = new FallbackNormalizer();
  const out = n.normalizeIncoming({ type: 'result', messageId: '3', success: false, error: { code: 500 } });
  assert.equal(out.requestResponse, undefined);
  assert.deepEqual(out.requestError, { id: '3', error: { code: 500 } });
});

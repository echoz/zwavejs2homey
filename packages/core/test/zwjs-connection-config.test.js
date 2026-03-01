const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveZwjsConnectionConfig, ZWJS_CONNECTION_SETTINGS_KEY } = require('../dist/index.js');

test('ZWJS connection settings key remains stable', () => {
  assert.equal(ZWJS_CONNECTION_SETTINGS_KEY, 'zwjs_connection');
});

test('resolveZwjsConnectionConfig falls back to defaults when unset', () => {
  const resolved = resolveZwjsConnectionConfig(undefined);
  assert.equal(resolved.source, 'default');
  assert.equal(resolved.clientConfig.url, 'ws://127.0.0.1:3000');
  assert.deepEqual(resolved.clientConfig.auth, { type: 'none' });
  assert.deepEqual(resolved.warnings, []);
});

test('resolveZwjsConnectionConfig accepts ws URL string setting', () => {
  const resolved = resolveZwjsConnectionConfig('ws://192.168.1.15:3000');
  assert.equal(resolved.source, 'settings');
  assert.equal(resolved.clientConfig.url, 'ws://192.168.1.15:3000/');
  assert.deepEqual(resolved.clientConfig.auth, { type: 'none' });
  assert.deepEqual(resolved.warnings, []);
});

test('resolveZwjsConnectionConfig accepts object url + token setting', () => {
  const resolved = resolveZwjsConnectionConfig({
    url: 'wss://example.com/zwave',
    token: 'abc123',
  });
  assert.equal(resolved.source, 'settings');
  assert.equal(resolved.clientConfig.url, 'wss://example.com/zwave');
  assert.deepEqual(resolved.clientConfig.auth, { type: 'bearer', token: 'abc123' });
  assert.deepEqual(resolved.warnings, []);
});

test('resolveZwjsConnectionConfig warns and falls back on invalid URL', () => {
  const resolved = resolveZwjsConnectionConfig({
    url: 'http://bad',
    token: 'abc123',
  });
  assert.equal(resolved.source, 'settings');
  assert.equal(resolved.clientConfig.url, 'ws://127.0.0.1:3000');
  assert.deepEqual(resolved.clientConfig.auth, { type: 'bearer', token: 'abc123' });
  assert.equal(
    resolved.warnings.includes('zwjs_connection.url ignored: must be ws:// or wss:// URL'),
    true,
  );
});

test('resolveZwjsConnectionConfig warns and falls back on invalid auth shape', () => {
  const resolved = resolveZwjsConnectionConfig({
    auth: {
      type: 'bearer',
      token: '',
    },
  });
  assert.equal(resolved.source, 'settings');
  assert.equal(resolved.clientConfig.url, 'ws://127.0.0.1:3000');
  assert.deepEqual(resolved.clientConfig.auth, { type: 'none' });
  assert.equal(
    resolved.warnings.includes(
      'zwjs_connection.auth.token ignored: non-empty bearer token is required',
    ),
    true,
  );
});

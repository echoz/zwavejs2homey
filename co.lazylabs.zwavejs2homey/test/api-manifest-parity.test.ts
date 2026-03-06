const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const composeAppManifest = require(path.resolve(__dirname, '../.homeycompose/app.json'));
const generatedAppManifest = require(path.resolve(__dirname, '../app.json'));
const apiHandlers = require(path.resolve(__dirname, '../.homeybuild/api.js'));

test('Homey API manifest parity: compose and generated app.json stay in sync', () => {
  assert.deepEqual(generatedAppManifest.api, composeAppManifest.api);
});

test('Homey API manifest parity: route keys match exported handlers', () => {
  const manifestApi = composeAppManifest.api ?? {};
  const manifestRouteKeys = Object.keys(manifestApi).sort();
  const handlerKeys = Object.keys(apiHandlers).sort();

  assert.deepEqual(handlerKeys, manifestRouteKeys);
  for (const routeKey of manifestRouteKeys) {
    assert.equal(typeof apiHandlers[routeKey], 'function', `${routeKey} must export a function`);
  }
});

test('Homey API manifest parity: route definitions stay canonical', () => {
  const manifestApi = composeAppManifest.api ?? {};
  const allowedMethods = new Set(['GET', 'POST']);
  const seenRouteSignatures = new Set();

  for (const [routeKey, route] of Object.entries(manifestApi)) {
    assert.equal(typeof route, 'object', `${routeKey} route config must be an object`);
    const method = route && typeof route.method === 'string' ? route.method : '';
    const pathValue = route && typeof route.path === 'string' ? route.path : '';

    assert.equal(allowedMethods.has(method), true, `${routeKey} has unsupported method: ${method}`);
    assert.equal(
      pathValue.startsWith('/runtime/'),
      true,
      `${routeKey} path must start with /runtime/`,
    );

    const signature = `${method} ${pathValue}`;
    assert.equal(
      seenRouteSignatures.has(signature),
      false,
      `${routeKey} duplicates route signature ${signature}`,
    );
    seenRouteSignatures.add(signature);
  }
});

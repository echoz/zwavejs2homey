const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { API_SCHEMA_VERSION, RuntimeApiClientError, createRuntimeApiClient } = require(
  path.resolve(__dirname, '../runtime-api-client.js'),
);

function createCallbackHomeyApi(resolver) {
  const calls = [];
  return {
    calls,
    api(method, uri, bodyOrCb, maybeCb) {
      const callback = typeof bodyOrCb === 'function' ? bodyOrCb : maybeCb;
      const body = typeof bodyOrCb === 'function' ? undefined : bodyOrCb;
      calls.push({ method, uri, body });
      resolver({ method, uri, body, callback });
    },
  };
}

function createEnvelope(data) {
  return {
    schemaVersion: API_SCHEMA_VERSION,
    ok: true,
    data,
    error: null,
  };
}

function createErrorEnvelope(code, message, details) {
  return {
    schemaVersion: API_SCHEMA_VERSION,
    ok: false,
    data: null,
    error: { code, message, details: details ?? null },
  };
}

test('client getRuntimeDiagnostics forwards encoded query and unwraps envelope', async () => {
  const homeyApi = createCallbackHomeyApi(({ callback }) => {
    callback(null, createEnvelope({ kind: 'diagnostics' }));
  });
  const client = createRuntimeApiClient(homeyApi);

  const result = await client.getRuntimeDiagnostics({
    homeyDeviceId: ' main:8 ',
    bridgeId: ' bridge-2 ',
  });
  assert.deepEqual(result, { kind: 'diagnostics' });
  assert.deepEqual(homeyApi.calls, [
    {
      method: 'GET',
      uri: '/runtime/diagnostics?homeyDeviceId=main%3A8&bridgeId=bridge-2',
      body: undefined,
    },
  ]);
});

test('client getRuntimeBridges calls bridges endpoint and unwraps envelope', async () => {
  const homeyApi = createCallbackHomeyApi(({ callback }) => {
    callback(null, createEnvelope({ kind: 'bridges' }));
  });
  const client = createRuntimeApiClient(homeyApi);

  const result = await client.getRuntimeBridges();
  assert.deepEqual(result, { kind: 'bridges' });
  assert.deepEqual(homeyApi.calls, [
    {
      method: 'GET',
      uri: '/runtime/bridges',
      body: undefined,
    },
  ]);
});

test('client getRecommendationActionQueue encodes includeNoAction in query', async () => {
  const homeyApi = createCallbackHomeyApi(({ callback }) => {
    callback(null, createEnvelope({ kind: 'queue' }));
  });
  const client = createRuntimeApiClient(homeyApi);

  const result = await client.getRecommendationActionQueue({
    homeyDeviceId: 'main:8',
    bridgeId: 'bridge-2',
    includeNoAction: true,
  });
  assert.equal(result.kind, 'queue');
  assert.deepEqual(homeyApi.calls[0], {
    method: 'GET',
    uri: '/runtime/recommendations?homeyDeviceId=main%3A8&bridgeId=bridge-2&includeNoAction=true',
    body: undefined,
  });
});

test('client getRuntimeSupportBundle encodes query options', async () => {
  const homeyApi = createCallbackHomeyApi(({ callback }) => {
    callback(null, createEnvelope({ kind: 'support-bundle' }));
  });
  const client = createRuntimeApiClient(homeyApi);

  const result = await client.getRuntimeSupportBundle({
    homeyDeviceId: 'main:8',
    bridgeId: 'bridge-2',
    includeNoAction: false,
  });
  assert.equal(result.kind, 'support-bundle');
  assert.deepEqual(homeyApi.calls[0], {
    method: 'GET',
    uri: '/runtime/support-bundle?homeyDeviceId=main%3A8&bridgeId=bridge-2&includeNoAction=false',
    body: undefined,
  });
});

test('client executeRecommendationAction validates required homeyDeviceId', async () => {
  const homeyApi = createCallbackHomeyApi(() => {
    throw new Error('should-not-call-homey-api');
  });
  const client = createRuntimeApiClient(homeyApi);

  await assert.rejects(
    () => client.executeRecommendationAction({ homeyDeviceId: '  ' }),
    (error) => {
      assert.ok(error instanceof RuntimeApiClientError);
      assert.equal(error.code, 'invalid-argument');
      return true;
    },
  );
});

test('client rejects non-string bridgeId arguments', async () => {
  const homeyApi = createCallbackHomeyApi(() => {
    throw new Error('should-not-call-homey-api');
  });
  const client = createRuntimeApiClient(homeyApi);
  await assert.rejects(
    () => client.getRuntimeDiagnostics({ bridgeId: 123 }),
    (error) => {
      assert.ok(error instanceof RuntimeApiClientError);
      assert.equal(error.code, 'invalid-argument');
      assert.match(error.message, /bridgeId must be a string/);
      return true;
    },
  );
});

test('client executeRecommendationAction forwards validated payload', async () => {
  const homeyApi = createCallbackHomeyApi(({ callback }) => {
    callback(null, createEnvelope({ executed: true }));
  });
  const client = createRuntimeApiClient(homeyApi);

  const result = await client.executeRecommendationAction({
    homeyDeviceId: ' main:8 ',
    action: 'backfill-marker',
  });
  assert.equal(result.executed, true);
  assert.deepEqual(homeyApi.calls[0], {
    method: 'POST',
    uri: '/runtime/recommendations/execute',
    body: { homeyDeviceId: 'main:8', action: 'backfill-marker' },
  });
});

test('client executeRecommendationActions forwards batch payload', async () => {
  const homeyApi = createCallbackHomeyApi(({ callback }) => {
    callback(null, createEnvelope({ total: 2, executed: 1 }));
  });
  const client = createRuntimeApiClient(homeyApi);

  const result = await client.executeRecommendationActions({
    homeyDeviceId: 'main:8',
    bridgeId: 'bridge-2',
    includeNoAction: false,
  });
  assert.equal(result.total, 2);
  assert.deepEqual(homeyApi.calls[0], {
    method: 'POST',
    uri: '/runtime/recommendations/execute-batch',
    body: { homeyDeviceId: 'main:8', bridgeId: 'bridge-2', includeNoAction: false },
  });
});

test('client throws RuntimeApiClientError from error envelope', async () => {
  const homeyApi = createCallbackHomeyApi(({ callback }) => {
    callback(
      null,
      createErrorEnvelope('invalid-homey-device-id', 'homeyDeviceId is required', {
        field: 'homeyDeviceId',
      }),
    );
  });
  const client = createRuntimeApiClient(homeyApi);

  await assert.rejects(
    () => client.executeRecommendationAction({ homeyDeviceId: 'main:8' }),
    (error) => {
      assert.ok(error instanceof RuntimeApiClientError);
      assert.equal(error.code, 'invalid-homey-device-id');
      assert.equal(error.message, 'homeyDeviceId is required');
      assert.deepEqual(error.details, { field: 'homeyDeviceId' });
      return true;
    },
  );
});

test('client rejects malformed envelopes', async () => {
  const homeyApi = createCallbackHomeyApi(({ callback }) => {
    callback(null, { ok: true });
  });
  const client = createRuntimeApiClient(homeyApi);

  await assert.rejects(
    () => client.getRuntimeDiagnostics(),
    (error) => {
      assert.ok(error instanceof RuntimeApiClientError);
      assert.equal(error.code, 'invalid-envelope');
      return true;
    },
  );
});

test('client supports promise-style Homey api wrappers', async () => {
  const calls = [];
  const homeyApi = {
    api(method, uri, bodyOrCb) {
      if (typeof bodyOrCb === 'function') {
        throw new Error('promise test should not use callback argument');
      }
      calls.push({ method, uri, body: bodyOrCb });
      return Promise.resolve(createEnvelope({ kind: 'queue' }));
    },
  };
  const client = createRuntimeApiClient(homeyApi);
  const result = await client.executeRecommendationActions();
  assert.equal(result.kind, 'queue');
  assert.deepEqual(calls, [
    {
      method: 'POST',
      uri: '/runtime/recommendations/execute-batch',
      body: { homeyDeviceId: undefined, bridgeId: undefined, includeNoAction: undefined },
    },
  ]);
});

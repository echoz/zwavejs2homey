const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const api = require(path.resolve(__dirname, '../.homeybuild/api.js'));

function createHomeyAppStub(overrides = {}) {
  const calls = {
    diagnostics: [],
    supportBundle: [],
    queue: [],
    action: [],
    actions: [],
  };

  const app = {
    async getNodeRuntimeDiagnostics(options) {
      calls.diagnostics.push(options);
      return { kind: 'diagnostics' };
    },
    async getRuntimeSupportBundle(options) {
      calls.supportBundle.push(options);
      return { kind: 'support-bundle' };
    },
    async getRecommendationActionQueue(options) {
      calls.queue.push(options);
      return { kind: 'queue' };
    },
    async executeRecommendationAction(options) {
      calls.action.push(options);
      return { kind: 'action' };
    },
    async executeRecommendationActions(options) {
      calls.actions.push(options);
      return { kind: 'actions' };
    },
    ...overrides,
  };

  return {
    homey: { app },
    calls,
  };
}

function assertSuccessEnvelope(result) {
  assert.equal(result.schemaVersion, 'zwjs2homey-api/v1');
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
}

function assertErrorEnvelope(result, codePattern) {
  assert.equal(result.schemaVersion, 'zwjs2homey-api/v1');
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.match(result.error.code, codePattern);
}

test('api getRuntimeDiagnostics forwards normalized query options', async () => {
  const { homey, calls } = createHomeyAppStub();
  const result = await api.getRuntimeDiagnostics({
    homey,
    query: { homeyDeviceId: '  main:8 ' },
  });
  assertSuccessEnvelope(result);
  assert.equal(result.data.kind, 'diagnostics');
  assert.deepEqual(calls.diagnostics, [{ homeyDeviceId: 'main:8' }]);
});

test('api getRecommendationActionQueue parses includeNoAction values', async () => {
  const { homey, calls } = createHomeyAppStub();
  const result = await api.getRecommendationActionQueue({
    homey,
    query: { includeNoAction: 'true', homeyDeviceId: 'main:8' },
  });
  assertSuccessEnvelope(result);
  assert.equal(result.data.kind, 'queue');
  assert.deepEqual(calls.queue, [{ homeyDeviceId: 'main:8', includeNoAction: true }]);
});

test('api getRuntimeSupportBundle parses filter query options', async () => {
  const { homey, calls } = createHomeyAppStub();
  const result = await api.getRuntimeSupportBundle({
    homey,
    query: { includeNoAction: '1', homeyDeviceId: ' main:8 ' },
  });
  assertSuccessEnvelope(result);
  assert.equal(result.data.kind, 'support-bundle');
  assert.deepEqual(calls.supportBundle, [{ homeyDeviceId: 'main:8', includeNoAction: true }]);
});

test('api executeRecommendationAction returns structured error when homeyDeviceId missing', async () => {
  const { homey } = createHomeyAppStub();
  const result = await api.executeRecommendationAction({ homey, body: {} });
  assertErrorEnvelope(result, /invalid-homey-device-id/);
  assert.match(result.error.message, /homeyDeviceId is required/);
});

test('api executeRecommendationAction returns structured error on invalid action enum', async () => {
  const { homey } = createHomeyAppStub();
  const result = await api.executeRecommendationAction({
    homey,
    body: { homeyDeviceId: 'main:8', action: 'invalid' },
  });
  assertErrorEnvelope(result, /invalid-action-selection/);
  assert.match(result.error.message, /action must be one of/);
});

test('api executeRecommendationAction forwards normalized payload', async () => {
  const { homey, calls } = createHomeyAppStub();
  const result = await api.executeRecommendationAction({
    homey,
    body: { homeyDeviceId: ' main:8 ', action: ' backfill-marker ' },
  });
  assertSuccessEnvelope(result);
  assert.equal(result.data.kind, 'action');
  assert.deepEqual(calls.action, [{ homeyDeviceId: 'main:8', action: 'backfill-marker' }]);
});

test('api executeRecommendationActions forwards normalized payload', async () => {
  const { homey, calls } = createHomeyAppStub();
  const result = await api.executeRecommendationActions({
    homey,
    body: { homeyDeviceId: 'main:8', includeNoAction: '1' },
  });
  assertSuccessEnvelope(result);
  assert.equal(result.data.kind, 'actions');
  assert.deepEqual(calls.actions, [{ homeyDeviceId: 'main:8', includeNoAction: true }]);
});

test('api returns structured errors for invalid includeNoAction values', async () => {
  const { homey } = createHomeyAppStub();
  const result = await api.executeRecommendationActions({
    homey,
    body: { includeNoAction: 'sometimes' },
  });
  assertErrorEnvelope(result, /invalid-request/);
  assert.match(result.error.message, /includeNoAction must be a boolean/);
});

test('api returns runtime-error envelope on unexpected app failures', async () => {
  const { homey } = createHomeyAppStub({
    async getNodeRuntimeDiagnostics() {
      throw new Error('diagnostics exploded');
    },
  });
  const result = await api.getRuntimeDiagnostics({ homey, query: {} });
  assertErrorEnvelope(result, /runtime-error/);
  assert.match(result.error.message, /diagnostics exploded/);
});

test('api returns route-timeout envelope when handler does not resolve', async () => {
  const { homey } = createHomeyAppStub({
    async getNodeRuntimeDiagnostics() {
      return new Promise(() => {});
    },
  });

  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = ((callback, _delay, ...args) => {
    if (typeof callback === 'function') {
      callback(...args);
    }
    return 0;
  }) as typeof global.setTimeout;
  global.clearTimeout = (() => {}) as typeof global.clearTimeout;

  try {
    const result = await api.getRuntimeDiagnostics({ homey, query: {} });
    assertErrorEnvelope(result, /route-timeout/);
    assert.match(result.error.message, /timed out/i);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

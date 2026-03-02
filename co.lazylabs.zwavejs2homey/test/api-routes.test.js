const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const api = require(path.resolve(__dirname, '../.homeybuild/api.js'));

function createHomeyAppStub(overrides = {}) {
  const calls = {
    diagnostics: [],
    queue: [],
    action: [],
    actions: [],
  };

  const app = {
    async getNodeRuntimeDiagnostics(options) {
      calls.diagnostics.push(options);
      return { kind: 'diagnostics' };
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

test('api getRuntimeDiagnostics forwards normalized query options', async () => {
  const { homey, calls } = createHomeyAppStub();
  const result = await api.getRuntimeDiagnostics({
    homey,
    query: { homeyDeviceId: '  main:8 ' },
  });
  assert.equal(result.kind, 'diagnostics');
  assert.deepEqual(calls.diagnostics, [{ homeyDeviceId: 'main:8' }]);
});

test('api getRecommendationActionQueue parses includeNoAction values', async () => {
  const { homey, calls } = createHomeyAppStub();
  const result = await api.getRecommendationActionQueue({
    homey,
    query: { includeNoAction: 'true', homeyDeviceId: 'main:8' },
  });
  assert.equal(result.kind, 'queue');
  assert.deepEqual(calls.queue, [{ homeyDeviceId: 'main:8', includeNoAction: true }]);
});

test('api executeRecommendationAction validates required homeyDeviceId', async () => {
  const { homey } = createHomeyAppStub();
  await assert.rejects(
    () => api.executeRecommendationAction({ homey, body: {} }),
    /homeyDeviceId is required/,
  );
});

test('api executeRecommendationAction validates action enum', async () => {
  const { homey } = createHomeyAppStub();
  await assert.rejects(
    () =>
      api.executeRecommendationAction({
        homey,
        body: { homeyDeviceId: 'main:8', action: 'invalid' },
      }),
    /action must be one of/,
  );
});

test('api executeRecommendationAction forwards normalized payload', async () => {
  const { homey, calls } = createHomeyAppStub();
  const result = await api.executeRecommendationAction({
    homey,
    body: { homeyDeviceId: ' main:8 ', action: ' backfill-marker ' },
  });
  assert.equal(result.kind, 'action');
  assert.deepEqual(calls.action, [{ homeyDeviceId: 'main:8', action: 'backfill-marker' }]);
});

test('api executeRecommendationActions forwards normalized payload', async () => {
  const { homey, calls } = createHomeyAppStub();
  const result = await api.executeRecommendationActions({
    homey,
    body: { homeyDeviceId: 'main:8', includeNoAction: '1' },
  });
  assert.equal(result.kind, 'actions');
  assert.deepEqual(calls.actions, [{ homeyDeviceId: 'main:8', includeNoAction: true }]);
});

test('api rejects invalid includeNoAction value', async () => {
  const { homey } = createHomeyAppStub();
  await assert.rejects(
    () =>
      api.executeRecommendationActions({
        homey,
        body: { includeNoAction: 'sometimes' },
      }),
    /includeNoAction must be a boolean/,
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadLib() {
  return import('../../../tools/homey-runtime-api-smoke-lib.mjs');
}

test('parseCliArgs validates required and optional runtime API smoke flags', async () => {
  const { parseCliArgs } = await loadLib();

  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(['--base-url', 'not-a-url']).ok, false);
  assert.equal(parseCliArgs(['--base-url', 'http://x', '--format', 'yaml']).ok, false);

  const parsed = parseCliArgs([
    '--base-url',
    'http://127.0.0.1:1234/api/app/co.lazylabs.zwavejs2homey/',
    '--token',
    'abc123',
    '--read-device-id',
    'main:8',
    '--smoke-device-id',
    'main:999',
    '--timeout-ms',
    '5000',
    '--format',
    'json',
  ]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.baseUrl, 'http://127.0.0.1:1234/api/app/co.lazylabs.zwavejs2homey');
  assert.equal(parsed.command.token, 'abc123');
  assert.equal(parsed.command.readDeviceId, 'main:8');
  assert.equal(parsed.command.smokeDeviceId, 'main:999');
  assert.equal(parsed.command.timeoutMs, 5000);
  assert.equal(parsed.command.format, 'json');
});

test('buildSmokeRouteRequests covers all runtime routes', async () => {
  const { buildSmokeRouteRequests } = await loadLib();
  const requests = buildSmokeRouteRequests({
    readDeviceId: 'main:8',
    smokeDeviceId: '__smoke_invalid__',
  });

  assert.equal(requests.length, 6);
  assert.deepEqual(
    requests.map((entry) => entry.path),
    [
      '/runtime/bridges',
      '/runtime/diagnostics',
      '/runtime/support-bundle',
      '/runtime/recommendations',
      '/runtime/recommendations/execute',
      '/runtime/recommendations/execute-batch',
    ],
  );
  assert.equal(requests[1].query.homeyDeviceId, 'main:8');
  assert.equal(requests[2].query.includeNoAction, true);
  assert.equal(requests[4].body.homeyDeviceId, '__smoke_invalid__');
});

test('runHomeyRuntimeApiSmoke succeeds when all route envelopes validate', async () => {
  const { runHomeyRuntimeApiSmoke } = await loadLib();
  const logs = [];
  const calls = [];

  const summary = await runHomeyRuntimeApiSmoke(
    {
      baseUrl: 'http://127.0.0.1:1234/api/app/co.lazylabs.zwavejs2homey',
      token: undefined,
      readDeviceId: undefined,
      smokeDeviceId: '__smoke_invalid__',
      timeoutMs: 1000,
      format: 'json',
    },
    { log: (line) => logs.push(line) },
    {
      invokeRouteImpl: async (_command, request) => {
        calls.push(request.path);
        return {
          url: `http://example.test${request.path}`,
          status: 200,
          envelope: {
            schemaVersion: 'zwjs2homey-api/v1',
            ok: true,
            data: { route: request.path },
            error: null,
          },
        };
      },
    },
  );

  assert.equal(summary.failed, 0);
  assert.equal(summary.total, 6);
  assert.deepEqual(calls, [
    '/runtime/bridges',
    '/runtime/diagnostics',
    '/runtime/support-bundle',
    '/runtime/recommendations',
    '/runtime/recommendations/execute',
    '/runtime/recommendations/execute-batch',
  ]);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /"failed": 0/);
});

test('runHomeyRuntimeApiSmoke fails when envelope schema is invalid', async () => {
  const { runHomeyRuntimeApiSmoke } = await loadLib();
  const logs = [];
  await assert.rejects(
    () =>
      runHomeyRuntimeApiSmoke(
        {
          baseUrl: 'http://127.0.0.1:1234/api/app/co.lazylabs.zwavejs2homey',
          token: undefined,
          readDeviceId: undefined,
          smokeDeviceId: '__smoke_invalid__',
          timeoutMs: 1000,
          format: 'table',
        },
        { log: (line) => logs.push(line) },
        {
          invokeRouteImpl: async () => ({
            url: 'http://example.test/runtime/diagnostics',
            status: 200,
            envelope: {
              schemaVersion: 'zwjs2homey-api/v0',
              ok: true,
              data: {},
              error: null,
            },
          }),
        },
      ),
    /Runtime API smoke failed \(6\/6\)/,
  );
  assert.equal(logs.length, 1);
  assert.match(logs[0], /FAIL/);
});

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadLib() {
  return import('../../../tools/homey-support-bundle-lib.mjs');
}

test('parseCliArgs validates required flags and unknown arguments', async () => {
  const { parseCliArgs } = await loadLib();

  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(['--base-url', 'not-a-url']).ok, false);
  assert.equal(parseCliArgs(['--base-url', 'http://x', '--wat']).ok, false);
});

test('parseCliArgs parses explicit support bundle options', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs([
    '--base-url',
    'http://127.0.0.1:1234/api/app/co.lazylabs.zwavejs2homey/',
    '--token',
    'abc123',
    '--homey-device-id',
    'main:8',
    '--include-no-action',
    'false',
    '--timeout-ms',
    '5000',
    '--format',
    'markdown',
    '--output-file',
    '/tmp/support.md',
    '--redact-share',
  ]);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.baseUrl, 'http://127.0.0.1:1234/api/app/co.lazylabs.zwavejs2homey');
  assert.equal(parsed.command.token, 'abc123');
  assert.equal(parsed.command.homeyDeviceId, 'main:8');
  assert.equal(parsed.command.includeNoAction, false);
  assert.equal(parsed.command.timeoutMs, 5000);
  assert.equal(parsed.command.format, 'markdown');
  assert.equal(parsed.command.outputFile, '/tmp/support.md');
  assert.equal(parsed.command.redactShare, true);
});

test('runHomeySupportBundle produces summary with route outcomes', async () => {
  const { runHomeySupportBundle } = await loadLib();
  const logs = [];

  const bundle = await runHomeySupportBundle(
    {
      baseUrl: 'http://127.0.0.1:1234/api/app/co.lazylabs.zwavejs2homey',
      token: undefined,
      homeyDeviceId: undefined,
      includeNoAction: true,
      timeoutMs: 1000,
      format: 'json',
      outputFile: undefined,
      redactShare: false,
    },
    { log: (line) => logs.push(line) },
    {
      nowIso: () => '2026-03-06T00:00:00.000Z',
      invokeRouteImpl: async () => {
        return {
          url: 'http://example.test/runtime/support-bundle',
          status: 200,
          envelope: {
            schemaVersion: 'zwjs2homey-api/v1',
            ok: true,
            data: {
              summary: {
                nodeCount: 2,
                actionableRecommendations: 1,
              },
            },
            error: null,
          },
        };
      },
    },
  );

  assert.equal(bundle.schemaVersion, 'zwjs2homey-support-bundle/v1');
  assert.equal(bundle.generatedAt, '2026-03-06T00:00:00.000Z');
  assert.equal(bundle.summary.routeCount, 1);
  assert.equal(bundle.summary.routesPassed, 1);
  assert.equal(bundle.summary.routesFailed, 0);
  assert.equal(bundle.summary.diagnosticsNodeCount, 2);
  assert.equal(bundle.summary.actionableRecommendations, 1);
  assert.equal(logs.length, 1);
});

test('runHomeySupportBundle supports output-file write and redaction mode', async () => {
  const { runHomeySupportBundle } = await loadLib();
  const writes = [];
  const logs = [];

  const bundle = await runHomeySupportBundle(
    {
      baseUrl: 'http://127.0.0.1:1234/api/app/co.lazylabs.zwavejs2homey',
      token: 'secret',
      homeyDeviceId: 'main:8',
      includeNoAction: true,
      timeoutMs: 1000,
      format: 'json-pretty',
      outputFile: '/tmp/support.json',
      redactShare: true,
    },
    { log: (line) => logs.push(line) },
    {
      nowIso: () => '2026-03-06T00:00:00.000Z',
      invokeRouteImpl: async (_command, request) => ({
        url: `http://example.test${request.path}`,
        status: 200,
        envelope: {
          schemaVersion: 'zwjs2homey-api/v1',
          ok: true,
          data: {
            homeyDeviceId: 'main:8',
            name: 'Bedroom Lamp',
            location: 'Bedroom',
            nodes: [{ homeyDeviceId: 'main:8', name: 'Bedroom Lamp' }],
          },
          error: null,
        },
      }),
      writeFileImpl: async (filePath, contents, encoding) => {
        writes.push({ filePath, contents, encoding });
      },
    },
  );

  assert.equal(bundle.source.baseUrl, '<redacted>');
  assert.equal(bundle.source.homeyDeviceId, '<redacted>');
  assert.equal(bundle.routes.supportBundle.data.homeyDeviceId, '<redacted>');
  assert.equal(bundle.routes.supportBundle.data.name, '<redacted>');
  assert.equal(bundle.routes.supportBundle.data.location, '<redacted>');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filePath, '/tmp/support.json');
  assert.equal(writes[0].encoding, 'utf8');
  assert.equal(logs[0], 'Wrote support bundle: /tmp/support.json');
});

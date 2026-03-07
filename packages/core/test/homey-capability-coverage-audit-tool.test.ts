const test = require('node:test');
const assert = require('node:assert/strict');

async function loadLib() {
  return import('../src/tools/homey-capability-coverage-audit.ts');
}

test('parseCliArgs validates unknown args and numeric bounds', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs(['--wat']).ok, false);
  assert.equal(parseCliArgs(['--top', '0']).ok, false);
  assert.equal(parseCliArgs(['--format', 'ndjson']).ok, false);
});

test('parseCliArgs parses explicit capability audit options', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs([
    '--artifact-file',
    '/tmp/compiled.json',
    '--support-bundle-file',
    '/tmp/support.json',
    '--top',
    '7',
    '--format',
    'markdown',
    '--output-file',
    '/tmp/report.md',
  ]);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.artifactFile, '/tmp/compiled.json');
  assert.equal(parsed.command.supportBundleFile, '/tmp/support.json');
  assert.equal(parsed.command.top, 7);
  assert.equal(parsed.command.format, 'markdown');
  assert.equal(parsed.command.outputFile, '/tmp/report.md');
});

test('runHomeyCapabilityCoverageAudit ranks by artifact frequency without runtime bundle', async () => {
  const { runHomeyCapabilityCoverageAudit } = await loadLib();
  const logs = [];
  const artifact = {
    schemaVersion: 'compiled-homey-profiles/v1',
    entries: [
      {
        device: { manufacturerId: 1, productType: 1, productId: 1 },
        compiled: {
          profile: {
            capabilities: [{ capabilityId: 'onoff' }, { capabilityId: 'dim' }],
          },
        },
      },
      {
        device: { manufacturerId: 1, productType: 1, productId: 2 },
        compiled: {
          profile: {
            capabilities: [{ capabilityId: 'onoff' }, { capabilityId: 'measure_battery' }],
          },
        },
      },
    ],
  };

  const result = await runHomeyCapabilityCoverageAudit(
    {
      artifactFile: '/tmp/compiled.json',
      supportBundleFile: undefined,
      top: 3,
      format: 'summary',
      outputFile: undefined,
    },
    { log: (line) => logs.push(line) },
    {
      nowIso: () => '2026-03-07T00:00:00.000Z',
      readFileImpl: async (filePath) => {
        if (filePath !== '/tmp/compiled.json') {
          throw new Error(`unexpected read path: ${filePath}`);
        }
        return JSON.stringify(artifact);
      },
    },
  );

  assert.equal(result.summary.mode, 'artifact-frequency-only');
  assert.equal(result.ranking[0].capabilityId, 'onoff');
  assert.equal(result.ranking[0].artifactProfiles, 2);
  assert.equal(result.ranking[0].runtimeSkipSignals, 0);
  assert.equal(result.generatedAt, '2026-03-07T00:00:00.000Z');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /Homey Capability Coverage Audit/);
});

test('runHomeyCapabilityCoverageAudit supports wrapped support bundle payload and weights skip pressure', async () => {
  const { runHomeyCapabilityCoverageAudit } = await loadLib();
  const writes = [];
  const logs = [];
  const artifact = {
    schemaVersion: 'compiled-homey-profiles/v1',
    entries: [
      {
        device: { manufacturerId: 10, productType: 20, productId: 30 },
        compiled: {
          profile: {
            capabilities: [{ capabilityId: 'onoff' }, { capabilityId: 'dim' }],
          },
        },
      },
      {
        device: { manufacturerId: 10, productType: 20, productId: 31 },
        compiled: {
          profile: {
            capabilities: [{ capabilityId: 'onoff' }, { capabilityId: 'measure_battery' }],
          },
        },
      },
    ],
  };
  const wrappedSupportBundle = {
    schemaVersion: 'zwjs2homey-support-bundle/v1',
    routes: {
      supportBundle: {
        data: {
          schemaVersion: 'homey-runtime-support-bundle/v1',
          diagnostics: {
            nodes: [
              {
                profile: { profileId: 'product-triple:10:20:30' },
                mapping: { inboundSkipped: 2, outboundSkipped: 1 },
              },
              {
                profile: { profileId: 'product-triple:10:20:31' },
                mapping: { inboundSkipped: 0, outboundSkipped: 0 },
              },
            ],
          },
        },
      },
    },
  };

  const result = await runHomeyCapabilityCoverageAudit(
    {
      artifactFile: '/tmp/compiled.json',
      supportBundleFile: '/tmp/support.json',
      top: 3,
      format: 'json',
      outputFile: '/tmp/audit.json',
    },
    { log: (line) => logs.push(line) },
    {
      nowIso: () => '2026-03-07T00:00:00.000Z',
      readFileImpl: async (filePath) => {
        if (filePath === '/tmp/compiled.json') return JSON.stringify(artifact);
        if (filePath === '/tmp/support.json') return JSON.stringify(wrappedSupportBundle);
        throw new Error(`unexpected read path: ${filePath}`);
      },
      writeFileImpl: async (filePath, contents, encoding) => {
        writes.push({ filePath, contents, encoding });
      },
    },
  );

  assert.equal(result.summary.mode, 'runtime-diagnostics-weighted');
  assert.equal(result.summary.runtimeNodes, 2);
  assert.equal(result.summary.runtimeNodesWithKnownProfile, 2);
  assert.equal(result.summary.runtimeNodesWithSkipSignals, 1);
  assert.equal(result.ranking[0].capabilityId, 'onoff');
  assert.equal(result.ranking[0].runtimeSkipSignals, 3);
  assert.equal(result.ranking[1].capabilityId, 'dim');
  assert.equal(result.ranking[1].runtimeSkipSignals, 3);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filePath, '/tmp/audit.json');
  assert.equal(writes[0].encoding, 'utf8');
  assert.equal(logs[0], 'Wrote capability coverage audit: /tmp/audit.json');
});

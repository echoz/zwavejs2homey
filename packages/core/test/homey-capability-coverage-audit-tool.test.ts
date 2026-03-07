const test = require('node:test');
const assert = require('node:assert/strict');

async function loadLib() {
  return import('../src/tools/homey-capability-coverage-audit.ts');
}

test('parseCliArgs validates unknown args and numeric bounds', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs(['--wat']).ok, false);
  assert.equal(parseCliArgs(['--top', '0']).ok, false);
  assert.equal(parseCliArgs(['--min-skip-signals', '-1']).ok, false);
  assert.equal(parseCliArgs(['--reason']).ok, false);
  assert.equal(parseCliArgs(['--format', 'ndjson']).ok, false);
  assert.equal(parseCliArgs(['--focus', 'noise']).ok, false);
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
    '--focus',
    'all',
    '--min-skip-signals',
    '2',
    '--reason',
    'missing-writeable-selector',
    '--output-file',
    '/tmp/report.md',
  ]);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.artifactFile, '/tmp/compiled.json');
  assert.equal(parsed.command.supportBundleFile, '/tmp/support.json');
  assert.equal(parsed.command.top, 7);
  assert.equal(parsed.command.format, 'markdown');
  assert.equal(parsed.command.focus, 'all');
  assert.equal(parsed.command.minSkipSignals, 2);
  assert.equal(parsed.command.reasonFilter, 'missing-writeable-selector');
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
      focus: 'actionable',
      minSkipSignals: 0,
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
  assert.equal(result.summary.focus, 'actionable');
  assert.equal(result.summary.runtimeFilter.minSkipSignals, 0);
  assert.equal(result.summary.runtimeFilter.reason, null);
  assert.equal(result.summary.runtimeFilter.applied, false);
  assert.equal(result.ranking[0].capabilityId, 'onoff');
  assert.equal(result.ranking[0].artifactProfiles, 2);
  assert.equal(result.ranking[0].runtimeSkipSignals, 0);
  assert.equal(result.ranking[0].runtimeFilterSignals, 0);
  assert.deepEqual(result.ranking[0].runtimeTopSkipReasons, []);
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
                mapping: {
                  inboundSkipped: 2,
                  outboundSkipped: 1,
                  skipReasons: {
                    'missing-writeable-selector': 2,
                    'value-not-writeable': 1,
                  },
                },
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
      focus: 'actionable',
      minSkipSignals: 0,
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
  assert.equal(result.summary.focus, 'actionable');
  assert.equal(result.summary.runtimeFilter.minSkipSignals, 0);
  assert.equal(result.summary.runtimeFilter.reason, null);
  assert.equal(result.summary.runtimeFilter.applied, true);
  assert.equal(result.summary.runtimeNodes, 2);
  assert.equal(result.summary.runtimeNodesWithKnownProfile, 2);
  assert.equal(result.summary.runtimeNodesWithSkipSignals, 1);
  assert.equal(result.summary.runtimeTopSkipReasons[0].reason, 'missing-writeable-selector');
  assert.equal(result.summary.runtimeTopSkipReasons[0].count, 2);
  assert.equal(result.ranking[0].capabilityId, 'onoff');
  assert.equal(result.ranking[0].runtimeSkipSignals, 3);
  assert.equal(result.ranking[0].runtimeFilterSignals, 3);
  assert.equal(result.ranking[0].runtimeTopSkipReasons[0].reason, 'missing-writeable-selector');
  assert.equal(result.ranking[1].capabilityId, 'dim');
  assert.equal(result.ranking[1].runtimeSkipSignals, 3);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filePath, '/tmp/audit.json');
  assert.equal(writes[0].encoding, 'utf8');
  assert.equal(logs[0], 'Wrote capability coverage audit: /tmp/audit.json');
});

test('runHomeyCapabilityCoverageAudit focus=actionable filters zero-signal rows in runtime mode', async () => {
  const { runHomeyCapabilityCoverageAudit } = await loadLib();
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
            capabilities: [{ capabilityId: 'measure_battery' }],
          },
        },
      },
    ],
  };
  const runtimeBundle = {
    schemaVersion: 'homey-runtime-support-bundle/v1',
    diagnostics: {
      nodes: [
        {
          profile: { profileId: 'product-triple:10:20:30' },
          mapping: {
            inboundSkipped: 1,
            outboundSkipped: 0,
            skipReasons: {
              'missing-writeable-selector': 1,
            },
          },
        },
        {
          profile: { profileId: 'product-triple:10:20:31' },
          mapping: {
            inboundSkipped: 0,
            outboundSkipped: 0,
            skipReasons: {},
          },
        },
      ],
    },
  };

  const result = await runHomeyCapabilityCoverageAudit(
    {
      artifactFile: '/tmp/compiled.json',
      supportBundleFile: '/tmp/support.json',
      top: 10,
      format: 'json',
      focus: 'actionable',
      minSkipSignals: 0,
    },
    { log: () => {} },
    {
      readFileImpl: async (filePath) => {
        if (filePath === '/tmp/compiled.json') return JSON.stringify(artifact);
        if (filePath === '/tmp/support.json') return JSON.stringify(runtimeBundle);
        throw new Error(`unexpected read path: ${filePath}`);
      },
    },
  );

  assert.equal(result.summary.mode, 'runtime-diagnostics-weighted');
  assert.equal(result.ranking.some((row) => row.capabilityId === 'measure_battery'), false);
  assert.equal(result.ranking.some((row) => row.capabilityId === 'onoff'), true);
  assert.equal(result.ranking.some((row) => row.capabilityId === 'dim'), true);
});

test('runHomeyCapabilityCoverageAudit supports reason + min-skip-signals runtime filtering', async () => {
  const { runHomeyCapabilityCoverageAudit } = await loadLib();
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
            capabilities: [{ capabilityId: 'measure_battery' }],
          },
        },
      },
    ],
  };
  const runtimeBundle = {
    schemaVersion: 'homey-runtime-support-bundle/v1',
    diagnostics: {
      nodes: [
        {
          profile: { profileId: 'product-triple:10:20:30' },
          mapping: {
            inboundSkipped: 2,
            outboundSkipped: 0,
            skipReasons: {
              'missing-writeable-selector': 2,
              'value-not-writeable': 1,
            },
          },
        },
        {
          profile: { profileId: 'product-triple:10:20:31' },
          mapping: {
            inboundSkipped: 2,
            outboundSkipped: 0,
            skipReasons: {
              'value-not-writeable': 2,
            },
          },
        },
      ],
    },
  };

  const result = await runHomeyCapabilityCoverageAudit(
    {
      artifactFile: '/tmp/compiled.json',
      supportBundleFile: '/tmp/support.json',
      top: 10,
      format: 'json',
      focus: 'all',
      minSkipSignals: 2,
      reasonFilter: 'missing-writeable-selector',
    },
    { log: () => {} },
    {
      readFileImpl: async (filePath) => {
        if (filePath === '/tmp/compiled.json') return JSON.stringify(artifact);
        if (filePath === '/tmp/support.json') return JSON.stringify(runtimeBundle);
        throw new Error(`unexpected read path: ${filePath}`);
      },
    },
  );

  assert.equal(result.summary.mode, 'runtime-diagnostics-weighted');
  assert.equal(result.summary.runtimeFilter.minSkipSignals, 2);
  assert.equal(result.summary.runtimeFilter.reason, 'missing-writeable-selector');
  assert.equal(result.ranking.length, 2);
  assert.equal(result.ranking[0].capabilityId, 'dim');
  assert.equal(result.ranking[0].runtimeFilterSignals, 2);
  assert.equal(result.ranking[1].capabilityId, 'onoff');
  assert.equal(result.ranking[1].runtimeFilterSignals, 2);
  assert.equal(result.ranking.some((row) => row.capabilityId === 'measure_battery'), false);
});

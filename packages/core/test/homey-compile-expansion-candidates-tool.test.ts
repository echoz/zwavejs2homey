const test = require('node:test');
const assert = require('node:assert/strict');

async function loadLib() {
  return import('../src/tools/homey-compile-expansion-candidates.ts');
}

test('parseCliArgs validates required/unknown arguments', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(['--wat']).ok, false);
  assert.equal(parseCliArgs(['--inspect-live-file', '/tmp/x.json', '--top', '0']).ok, false);
});

test('parseCliArgs parses explicit options', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs([
    '--inspect-live-file',
    '/tmp/inspect.json',
    '--top',
    '5',
    '--include-stable',
    'true',
    '--format',
    'markdown',
    '--output-file',
    '/tmp/candidates.md',
  ]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.inspectLiveFile, '/tmp/inspect.json');
  assert.equal(parsed.command.top, 5);
  assert.equal(parsed.command.includeStable, true);
  assert.equal(parsed.command.format, 'markdown');
  assert.equal(parsed.command.outputFile, '/tmp/candidates.md');
});

test('runCompileExpansionCandidates ranks non-stable triples by default', async () => {
  const { runCompileExpansionCandidates } = await loadLib();
  const logs = [];
  const inspectPayload = {
    results: [
      {
        node: { nodeId: 9, name: 'Kitchen Sensor' },
        deviceFacts: { manufacturerId: 29, productType: 5001, productId: 1 },
        compiled: {
          profile: {
            profileId: null,
            classification: { homeyClass: 'other', confidence: 'generic' },
          },
          report: {
            profileOutcome: 'generic',
            summary: { unmatchedActions: 42 },
            curationCandidates: {
              likelyNeedsReview: true,
              reasons: ['known-device-generic-fallback'],
            },
          },
        },
      },
      {
        node: { nodeId: 12, name: 'Hall Sensor' },
        deviceFacts: { manufacturerId: 29, productType: 5001, productId: 1 },
        compiled: {
          profile: {
            profileId: null,
            classification: { homeyClass: 'other', confidence: 'generic' },
          },
          report: {
            profileOutcome: 'generic',
            summary: { unmatchedActions: 11 },
            curationCandidates: {
              likelyNeedsReview: true,
              reasons: ['known-device-generic-fallback'],
            },
          },
        },
      },
      {
        node: { nodeId: 4, name: 'Stable Dimmer' },
        deviceFacts: { manufacturerId: 29, productType: 66, productId: 2 },
        compiled: {
          profile: {
            profileId: 'product-triple:29:66:2',
            classification: { homeyClass: 'light', confidence: 'curated' },
          },
          report: {
            profileOutcome: 'curated',
            summary: { unmatchedActions: 0 },
            curationCandidates: {
              likelyNeedsReview: false,
              reasons: [],
            },
          },
        },
      },
    ],
  };

  const result = await runCompileExpansionCandidates(
    {
      inspectLiveFile: '/tmp/inspect-live.json',
      top: 10,
      includeStable: false,
      format: 'summary',
      outputFile: undefined,
    },
    { log: (line) => logs.push(line) },
    {
      nowIso: () => '2026-03-07T00:00:00.000Z',
      readFileImpl: async (filePath) => {
        assert.equal(filePath, '/tmp/inspect-live.json');
        return JSON.stringify(inspectPayload);
      },
    },
  );

  assert.equal(result.summary.totalNodes, 3);
  assert.equal(result.summary.candidateNodes, 3);
  assert.equal(result.summary.uniqueProductTriples, 2);
  assert.equal(result.summary.triplesNeedingReview, 1);
  assert.equal(result.ranking.length, 1);
  assert.equal(result.ranking[0].productTriple, '29:5001:1');
  assert.equal(result.ranking[0].nodeCount, 2);
  assert.equal(result.ranking[0].reviewNodes, 2);
  assert.equal(result.ranking[0].suggestion, 'author-product-rule');
  assert.match(logs[0], /Compile Expansion Candidates/);
});

test('runCompileExpansionCandidates supports includeStable + file output', async () => {
  const { runCompileExpansionCandidates } = await loadLib();
  const writes = [];
  const logs = [];
  const inspectPayload = {
    results: [
      {
        node: { nodeId: 2, name: 'Stable Switch' },
        deviceFacts: { manufacturerId: 1120, productType: 2, productId: 136 },
        compiled: {
          profile: {
            profileId: 'product-triple:1120:2:136',
            classification: { homeyClass: 'socket', confidence: 'curated' },
          },
          report: {
            profileOutcome: 'curated',
            summary: { unmatchedActions: 0 },
            curationCandidates: {
              likelyNeedsReview: false,
              reasons: [],
            },
          },
        },
      },
    ],
  };

  const result = await runCompileExpansionCandidates(
    {
      inspectLiveFile: '/tmp/inspect-live.json',
      top: 5,
      includeStable: true,
      format: 'json',
      outputFile: '/tmp/candidates.json',
    },
    { log: (line) => logs.push(line) },
    {
      nowIso: () => '2026-03-07T00:00:00.000Z',
      readFileImpl: async () => JSON.stringify(inspectPayload),
      writeFileImpl: async (filePath, contents, encoding) => {
        writes.push({ filePath, contents, encoding });
      },
    },
  );

  assert.equal(result.ranking.length, 1);
  assert.equal(result.ranking[0].suggestion, 'stable');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filePath, '/tmp/candidates.json');
  assert.equal(writes[0].encoding, 'utf8');
  assert.equal(logs[0], 'Wrote compile expansion candidates: /tmp/candidates.json');
});

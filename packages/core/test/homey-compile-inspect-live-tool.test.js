const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/homey-compile-inspect-live-lib.mjs');
}

const fixturesDir = path.join(__dirname, '../../compiler/test/fixtures');

test('parseCliArgs validates live inspect required inputs and formats', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs(['--all-nodes', '--rules-file', 'r.json']).ok, false);
  assert.equal(parseCliArgs(['--url', 'ws://x', '--rules-file', 'r.json']).ok, false);
  assert.equal(parseCliArgs(['--url', 'ws://x', '--all-nodes']).ok, false);
  assert.equal(
    parseCliArgs(['--url', 'ws://x', '--all-nodes', '--rules-file', 'r.json', '--format', 'yaml'])
      .ok,
    false,
  );
  assert.equal(
    parseCliArgs([
      '--url',
      'ws://x',
      '--all-nodes',
      '--rules-file',
      'r.json',
      '--explain-only',
      '--format',
      'list',
    ]).ok,
    false,
  );

  const parsed = parseCliArgs([
    '--url',
    'ws://x',
    '--node',
    '5',
    '--rules-file',
    'r.json',
    '--format',
    'list',
  ]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.nodeId, 5);
  assert.equal(parsed.command.includeValues, 'full');
});

test('normalizeCompilerDeviceFactsFromZwjsDetail converts zwjs-inspect node detail', async () => {
  const { normalizeCompilerDeviceFactsFromZwjsDetail } = await loadLib();
  const detail = require(path.join(fixturesDir, 'zwjs-inspect-node-detail-sample.json'));
  detail.values = [
    {
      valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
      metadata: { type: 'boolean', readable: true, writeable: true },
    },
  ];
  const facts = normalizeCompilerDeviceFactsFromZwjsDetail(detail);
  assert.equal(facts.nodeId, 5);
  assert.equal(facts.manufacturerId, 0x0184);
  assert.equal(facts.productType, 0x4447);
  assert.equal(facts.productId, 0x3034);
  assert.equal(facts.values.length, 1);
  assert.equal(facts.values[0].valueId.commandClass, 37);
});

test('formatListOutput renders compiled live overview rows', async () => {
  const { formatListOutput } = await loadLib();
  const out = formatListOutput([
    {
      nodeId: 5,
      name: 'Kitchen Plug',
      homeyClass: 'socket',
      profileOutcome: 'curated',
      confidence: 'curated',
      uncurated: false,
      catalogRef: 'cid-1',
      reviewReason: '',
    },
  ]);
  assert.match(out, /Node/);
  assert.match(out, /Kitchen Plug/);
  assert.match(out, /socket/);
});

test('runLiveInspectCommand compiles all nodes and renders list output with mocks', async () => {
  const { runLiveInspectCommand } = await loadLib();
  const logs = [];
  const fakeCompiled = {
    profile: {
      profileId: 'p1',
      classification: { homeyClass: 'socket', confidence: 'generic', uncurated: true },
      capabilities: [],
      ignoredValues: [],
      catalogMatch: { by: 'product-triple', catalogId: 'cid-1' },
    },
    report: {
      profileOutcome: 'generic',
      summary: { appliedActions: 1, unmatchedActions: 2, suppressedFillActions: 0 },
      byRule: [],
      bySuppressedSlot: [],
      curationCandidates: { likelyNeedsReview: true, reasons: ['known-device-generic-fallback'] },
      diagnosticDeviceKey: 'catalog:cid-1',
      catalogContext: { knownCatalogDevice: true, matchRef: 'catalog:cid-1' },
      unknownDeviceReport: {
        kind: 'known-catalog',
        diagnosticDeviceKey: 'catalog:cid-1',
        profileOutcome: 'generic',
        matchRef: 'catalog:cid-1',
        reasons: ['known-device-generic-fallback'],
      },
    },
    ruleSources: [],
  };
  await runLiveInspectCommand(
    {
      url: 'ws://x',
      allNodes: true,
      nodeId: undefined,
      manifestFile: undefined,
      rulesFiles: [path.join(fixturesDir, 'rules-switch-meter.json')],
      catalogFile: undefined,
      format: 'list',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 10,
      focus: 'all',
      top: 3,
      show: 'none',
      explainAll: false,
      explainOnly: false,
      homeyClass: undefined,
      driverTemplateId: undefined,
    },
    { log: (line) => logs.push(line) },
    {
      connectAndInitializeImpl: async () => ({ stop: async () => {} }),
      fetchNodesListImpl: async () => [{ nodeId: 5, name: 'Kitchen Plug' }],
      fetchNodeDetailsImpl: async () => ({
        nodeId: 5,
        state: {
          name: 'Kitchen Plug',
          manufacturerId: '0x0184',
          productType: '0x4447',
          productId: '0x3034',
        },
        values: [],
      }),
      compileProfilePlanFromRuleSetManifestImpl: () => fakeCompiled,
    },
  );

  assert.equal(logs.length, 1);
  assert.match(logs[0], /Kitchen Plug/);
  assert.match(logs[0], /generic/);
  assert.match(logs[0], /known-device-generic-fallback/);
});

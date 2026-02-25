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
    parseCliArgs(['--url', 'ws://x', '--all-nodes', '--compiled-file', 'compiled.json']).ok,
    true,
  );
  assert.equal(
    parseCliArgs([
      '--url',
      'ws://x',
      '--all-nodes',
      '--compiled-file',
      'compiled.json',
      '--manifest-file',
      'm.json',
    ]).ok,
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
  detail.state = {
    ...(detail.state ?? {}),
    deviceClass: {
      generic: 'Multilevel Power Switch',
      specific: 'Class A Motor Control',
    },
  };
  const facts = normalizeCompilerDeviceFactsFromZwjsDetail(detail);
  assert.equal(facts.nodeId, 5);
  assert.equal(facts.manufacturerId, 0x0184);
  assert.equal(facts.productType, 0x4447);
  assert.equal(facts.productId, 0x3034);
  assert.equal(facts.deviceClassGeneric, 'Multilevel Power Switch');
  assert.equal(facts.deviceClassSpecific, 'Class A Motor Control');
  assert.equal(facts.values.length, 1);
  assert.equal(facts.values[0].valueId.commandClass, 37);
});

test('isControllerLikeZwjsNodeDetail detects controller node detail', async () => {
  const { isControllerLikeZwjsNodeDetail } = await loadLib();
  const controllerDetail = {
    nodeId: 1,
    state: {
      label: '700/800 Series',
      deviceClass: { generic: 'Static Controller', basic: 'Static Controller' },
    },
    values: [],
  };
  const switchDetail = {
    nodeId: 5,
    state: {
      label: 'Switch',
      deviceClass: { generic: 'Binary Switch', basic: 'Routing Slave' },
    },
    values: [],
  };
  assert.equal(isControllerLikeZwjsNodeDetail(controllerDetail), true);
  assert.equal(isControllerLikeZwjsNodeDetail(switchDetail), false);
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
      includeControllerNodes: false,
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

test('runLiveInspectCommand skips controller-like nodes by default', async () => {
  const { runLiveInspectCommand } = await loadLib();
  const logs = [];
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
      includeControllerNodes: false,
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
      fetchNodesListImpl: async () => [
        { nodeId: 1, name: 'Controller' },
        { nodeId: 5, name: 'Kitchen Plug' },
      ],
      fetchNodeDetailsImpl: async (_client, nodeId) =>
        nodeId === 1
          ? {
              nodeId: 1,
              state: {
                label: '700/800 Series',
                deviceClass: { generic: 'Static Controller', basic: 'Static Controller' },
              },
              values: [],
            }
          : {
              nodeId: 5,
              state: {
                name: 'Kitchen Plug',
                manufacturerId: '0x0184',
                productType: '0x4447',
                productId: '0x3034',
              },
              values: [],
            },
      compileProfilePlanFromRuleSetManifestImpl: () => ({
        profile: {
          profileId: 'p1',
          classification: { homeyClass: 'socket', confidence: 'generic', uncurated: true },
          capabilities: [],
          ignoredValues: [],
        },
        report: {
          profileOutcome: 'generic',
          summary: { appliedActions: 1, unmatchedActions: 0, suppressedFillActions: 0 },
          byRule: [],
          bySuppressedSlot: [],
          curationCandidates: { likelyNeedsReview: false, reasons: [] },
          diagnosticDeviceKey: 'zwjs-live:0184-4447-3034',
        },
        ruleSources: [],
      }),
    },
  );
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /Controller/);
  assert.match(logs[0], /Kitchen Plug/);
});

test('runLiveInspectCommand applies precompiled artifact when --compiled-file is used', async () => {
  const { runLiveInspectCommand } = await loadLib();
  const fs = require('node:fs');
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-live-compiled-'));
  const compiledFile = path.join(tmpDir, 'compiled.json');
  fs.writeFileSync(
    compiledFile,
    JSON.stringify({
      schemaVersion: 'compiled-homey-profiles/v1',
      generatedAt: '2026-02-25T00:00:00.000Z',
      source: {},
      entries: [
        {
          device: {
            deviceKey: 'x',
            nodeId: 5,
            manufacturerId: 0x0184,
            productType: 0x4447,
            productId: 0x3034,
          },
          compiled: {
            profile: {
              profileId: 'compiled-p1',
              match: {},
              classification: { homeyClass: 'socket', confidence: 'curated', uncurated: false },
              capabilities: [],
              ignoredValues: [],
              provenance: { layer: 'project-product', ruleId: 'r', action: 'replace' },
              catalogMatch: { by: 'product-triple', catalogId: 'cid-1' },
            },
            report: {
              profileOutcome: 'curated',
              summary: {
                appliedActions: 1,
                unmatchedActions: 0,
                suppressedFillActions: 0,
                ignoredValues: 0,
              },
              byRule: [],
              bySuppressedSlot: [],
              curationCandidates: { likelyNeedsReview: false, reasons: [] },
              diagnosticDeviceKey: 'catalog:cid-1',
              catalogContext: { knownCatalogDevice: true, matchRef: 'catalog:cid-1' },
            },
            ruleSources: [],
          },
        },
      ],
    }),
    'utf8',
  );

  const logs = [];
  let compileCalled = false;
  await runLiveInspectCommand(
    {
      url: 'ws://x',
      allNodes: false,
      nodeId: 5,
      compiledFile,
      manifestFile: undefined,
      rulesFiles: [],
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
      fetchNodesListImpl: async () => [],
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
      compileProfilePlanFromRuleSetManifestImpl: () => {
        compileCalled = true;
        throw new Error('should not compile');
      },
    },
  );

  assert.equal(compileCalled, false);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /Kitchen Plug/);
  assert.match(logs[0], /curated/);
});

test('runLiveInspectCommand summary explain includes conflict suppression details', async () => {
  const { runLiveInspectCommand } = await loadLib();
  const logs = [];
  await runLiveInspectCommand(
    {
      url: 'ws://x',
      allNodes: false,
      nodeId: 5,
      compiledFile: undefined,
      manifestFile: undefined,
      rulesFiles: [path.join(fixturesDir, 'rules-switch-meter.json')],
      catalogFile: undefined,
      format: 'summary',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 10,
      focus: 'all',
      top: 3,
      show: 'all',
      explainCapabilityId: 'onoff',
      explainAll: false,
      explainOnly: false,
      homeyClass: undefined,
      driverTemplateId: undefined,
    },
    { log: (line) => logs.push(line) },
    {
      connectAndInitializeImpl: async () => ({ stop: async () => {} }),
      fetchNodesListImpl: async () => [],
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
      compileProfilePlanFromRuleSetManifestImpl: () => ({
        profile: {
          profileId: 'p-conflict',
          classification: { homeyClass: 'socket', confidence: 'curated', uncurated: false },
          capabilities: [
            {
              capabilityId: 'onoff',
              directionality: 'bidirectional',
              inboundMapping: {
                kind: 'value',
                selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
              },
              outboundMapping: {
                kind: 'set_value',
                target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
              },
              provenance: { layer: 'ha-derived', ruleId: 'ha-onoff', action: 'fill' },
            },
          ],
          ignoredValues: [],
        },
        report: {
          profileOutcome: 'curated',
          summary: { appliedActions: 1, unmatchedActions: 0, suppressedFillActions: 0 },
          byRule: [],
          bySuppressedSlot: [],
          overlapPolicy: {
            suppressedCapabilities: [
              {
                capabilityId: 'dim',
                winnerCapabilityId: 'onoff',
                selectorKey: 'value:37:0:currentValue:',
                conflictKey: 'switch.control',
                reason: 'conflict-exclusive:switch.control',
              },
            ],
          },
          curationCandidates: { likelyNeedsReview: false, reasons: [] },
          diagnosticDeviceKey: 'catalog:demo-conflict',
        },
        ruleSources: [],
      }),
    },
  );

  assert.equal(logs.length, 1);
  assert.match(logs[0], /Conflict suppression detail:/);
  assert.match(logs[0], /Explain: onoff/);
  assert.match(logs[0], /Conflict wins: 1/);
});

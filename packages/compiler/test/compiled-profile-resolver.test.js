const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist/index.js');

function makeEntry({
  deviceKey,
  nodeId,
  manufacturerId,
  productType,
  productId,
  profileId,
  homeyClass = 'other',
}) {
  return {
    device: { deviceKey, nodeId, manufacturerId, productType, productId },
    compiled: {
      profile: {
        profileId,
        match: {},
        classification: { homeyClass, confidence: 'generic', uncurated: true },
        capabilities: [],
        ignoredValues: [],
        provenance: { layer: 'project-generic', ruleId: 'test', action: 'fill' },
      },
      report: {
        profileOutcome: 'generic',
        summary: {
          appliedActions: 0,
          unmatchedActions: 0,
          suppressedFillActions: 0,
          ignoredValues: 0,
        },
        byRule: [],
        bySuppressedSlot: [],
        curationCandidates: { likelyNeedsReview: false, reasons: [] },
        diagnosticDeviceKey: deviceKey,
      },
      ruleSources: [],
    },
  };
}

function makeArtifact(entries) {
  return {
    schemaVersion: 'compiled-homey-profiles/v1',
    generatedAt: '2026-03-01T00:00:00.000Z',
    source: {},
    entries,
  };
}

test('buildCompiledProfileResolverIndexV1 indexes product triple/node/device-key and tracks duplicates', () => {
  const first = makeEntry({
    deviceKey: 'zwjs-live:a',
    nodeId: 7,
    manufacturerId: 29,
    productType: 12801,
    productId: 1,
    profileId: 'first',
  });
  const second = makeEntry({
    deviceKey: 'zwjs-live:b',
    nodeId: 7,
    manufacturerId: 29,
    productType: 12801,
    productId: 1,
    profileId: 'second',
  });
  const artifact = makeArtifact([first, second]);
  const index = compiler.buildCompiledProfileResolverIndexV1(artifact);

  assert.equal(index.byProductTriple.get('29:12801:1').compiled.profile.profileId, 'first');
  assert.equal(index.byNodeId.get(7).compiled.profile.profileId, 'first');
  assert.equal(index.byDeviceKey.get('zwjs-live:b').compiled.profile.profileId, 'second');
  assert.deepEqual(index.duplicates.productTriple, [{ key: '29:12801:1', count: 2 }]);
  assert.deepEqual(index.duplicates.nodeId, [{ key: 7, count: 2 }]);
  assert.deepEqual(index.duplicates.deviceKey, []);
});

test('resolveCompiledProfileEntryFromIndexV1 uses default precedence product-triple then node-id then device-key', () => {
  const tripleFirst = makeEntry({
    deviceKey: 'zwjs-live:triple',
    nodeId: 11,
    manufacturerId: 29,
    productType: 65,
    productId: 2,
    profileId: 'triple-first',
  });
  const nodeFallback = makeEntry({
    deviceKey: 'zwjs-live:node',
    nodeId: 12,
    manufacturerId: 99,
    productType: 1,
    productId: 1,
    profileId: 'node-fallback',
  });
  const deviceFallback = makeEntry({
    deviceKey: 'zwjs-live:key',
    nodeId: 13,
    manufacturerId: 1,
    productType: 1,
    productId: 1,
    profileId: 'device-fallback',
  });
  const index = compiler.buildCompiledProfileResolverIndexV1(
    makeArtifact([tripleFirst, nodeFallback, deviceFallback]),
  );

  const tripleMatch = compiler.resolveCompiledProfileEntryFromIndexV1(index, {
    manufacturerId: 29,
    productType: 65,
    productId: 2,
    nodeId: 12,
  });
  assert.equal(tripleMatch.by, 'product-triple');
  assert.equal(tripleMatch.entry.compiled.profile.profileId, 'triple-first');

  const nodeMatch = compiler.resolveCompiledProfileEntryFromIndexV1(index, { nodeId: 12 });
  assert.equal(nodeMatch.by, 'node-id');
  assert.equal(nodeMatch.entry.compiled.profile.profileId, 'node-fallback');

  const keyMatch = compiler.resolveCompiledProfileEntryFromIndexV1(index, {
    deviceKey: 'zwjs-live:key',
  });
  assert.equal(keyMatch.by, 'device-key');
  assert.equal(keyMatch.entry.compiled.profile.profileId, 'device-fallback');
});

test('resolveCompiledProfileEntryFromIndexV1 supports custom precedence and rejects invalid precedence values', () => {
  const tripleEntry = makeEntry({
    deviceKey: 'zwjs-live:triple',
    nodeId: 21,
    manufacturerId: 29,
    productType: 65,
    productId: 2,
    profileId: 'triple',
  });
  const nodeEntry = makeEntry({
    deviceKey: 'zwjs-live:node',
    nodeId: 99,
    manufacturerId: 700,
    productType: 701,
    productId: 702,
    profileId: 'node',
  });
  const index = compiler.buildCompiledProfileResolverIndexV1(
    makeArtifact([tripleEntry, nodeEntry]),
  );

  const nodeFirst = compiler.resolveCompiledProfileEntryFromIndexV1(
    index,
    {
      manufacturerId: 29,
      productType: 65,
      productId: 2,
      nodeId: 99,
    },
    { precedence: ['node-id', 'product-triple', 'device-key'] },
  );
  assert.equal(nodeFirst.by, 'node-id');
  assert.equal(nodeFirst.entry.compiled.profile.profileId, 'node');

  const noMatch = compiler.resolveCompiledProfileEntryFromIndexV1(index, {
    manufacturerId: 123,
    productType: 456,
    productId: 789,
  });
  assert.equal(noMatch.by, 'none');
  assert.equal(noMatch.entry, undefined);

  assert.throws(
    () =>
      compiler.resolveCompiledProfileEntryFromIndexV1(
        index,
        { nodeId: 1 },
        { precedence: ['node-id', 'invalid-kind'] },
      ),
    /Unsupported compiled profile resolver precedence token/,
  );
});

test('toCompiledProfileResolverSelector normalizes invalid identity fields and artifact resolve helper works', () => {
  const entry = makeEntry({
    deviceKey: 'zwjs-live:normalized',
    nodeId: 4,
    manufacturerId: 17,
    productType: 18,
    productId: 19,
    profileId: 'normalized',
  });
  const artifact = makeArtifact([entry]);
  const selector = compiler.toCompiledProfileResolverSelector({
    deviceKey: '',
    nodeId: Number.NaN,
    manufacturerId: 17,
    productType: 18,
    productId: 19,
  });

  assert.deepEqual(selector, {
    deviceKey: undefined,
    nodeId: undefined,
    manufacturerId: 17,
    productType: 18,
    productId: 19,
  });
  assert.equal(compiler.compiledProfileProductTripleKey(selector), '17:18:19');

  const match = compiler.resolveCompiledProfileEntryFromArtifactV1(artifact, selector);
  assert.equal(match.by, 'product-triple');
  assert.equal(match.entry.compiled.profile.profileId, 'normalized');
});

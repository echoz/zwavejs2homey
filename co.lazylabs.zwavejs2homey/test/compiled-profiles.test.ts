const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  COMPILED_PROFILES_PATH_SETTINGS_KEY,
  DEFAULT_COMPILED_PROFILES_RELATIVE_PATH,
  resolveCompiledProfilesArtifactPath,
  tryLoadCompiledProfilesRuntimeFromFile,
  resolveCompiledProfileEntryFromRuntime,
  buildNodeResolverSelector,
  resolveNodeProfileClassification,
  parseZwjsIdentityId,
} = require('../compiled-profiles.js');

function createArtifact(entries) {
  return {
    schemaVersion: 'compiled-homey-profiles/v1',
    generatedAt: '2026-03-01T00:00:00.000Z',
    source: {
      buildProfile: 'default-manifest',
      pipelineFingerprint: 'pipeline-fingerprint-1',
    },
    entries,
  };
}

function createEntry({
  deviceKey = 'main:5',
  nodeId = 5,
  manufacturerId = 29,
  productType = 66,
  productId = 2,
} = {}) {
  return {
    device: {
      deviceKey,
      nodeId,
      manufacturerId,
      productType,
      productId,
    },
    compiled: {
      profile: {
        profileId: `profile-${deviceKey}`,
        match: {},
        classification: {
          homeyClass: 'socket',
          confidence: 'curated',
          uncurated: false,
        },
        capabilities: [],
        provenance: {
          layer: 'project-product',
          ruleId: 'rule-1',
          action: 'replace',
        },
      },
      report: {},
    },
  };
}

test('compiled profile path resolution supports default, relative, and absolute paths', () => {
  const appDir = '/opt/homey/app';
  assert.equal(
    resolveCompiledProfilesArtifactPath(appDir, undefined),
    path.resolve(appDir, DEFAULT_COMPILED_PROFILES_RELATIVE_PATH),
  );
  assert.equal(
    resolveCompiledProfilesArtifactPath(appDir, './tmp/compiled.json'),
    path.resolve(appDir, './tmp/compiled.json'),
  );
  assert.equal(
    resolveCompiledProfilesArtifactPath(appDir, '/var/data/compiled.json'),
    '/var/data/compiled.json',
  );
  assert.equal(COMPILED_PROFILES_PATH_SETTINGS_KEY, 'compiled_profiles_file');
});

test('runtime loader validates compiled artifact and builds resolver index', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compiled-runtime-'));
  const filePath = path.join(tempDir, 'compiled.json');
  await fs.writeFile(
    filePath,
    JSON.stringify(
      createArtifact([createEntry(), createEntry({ deviceKey: 'main:8', nodeId: 8 })]),
    ),
    'utf8',
  );

  const runtime = await tryLoadCompiledProfilesRuntimeFromFile(filePath);
  assert.equal(runtime.status.loaded, true);
  assert.equal(runtime.status.entryCount, 2);
  assert.equal(runtime.status.pipelineFingerprint, 'pipeline-fingerprint-1');
  assert.equal(runtime.status.errorMessage, null);

  const selector = {
    manufacturerId: 29,
    productType: 66,
    productId: 2,
  };
  const match = resolveCompiledProfileEntryFromRuntime(runtime, selector);
  assert.equal(match.by, 'product-triple');
  assert.equal(match.entry?.compiled.profile.profileId, 'profile-main:5');

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('runtime loader surfaces invalid/missing artifacts as degraded status', async () => {
  const missingRuntime = await tryLoadCompiledProfilesRuntimeFromFile('/missing/compiled.json');
  assert.equal(missingRuntime.status.loaded, false);
  assert.match(missingRuntime.status.errorMessage ?? '', /no such file|ENOENT/i);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compiled-runtime-invalid-'));
  const invalidPath = path.join(tempDir, 'invalid.json');
  await fs.writeFile(invalidPath, JSON.stringify({ hello: 'world' }), 'utf8');
  const invalidRuntime = await tryLoadCompiledProfilesRuntimeFromFile(invalidPath);
  assert.equal(invalidRuntime.status.loaded, false);
  assert.match(invalidRuntime.status.errorMessage ?? '', /schemaVersion/i);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('node selector extraction parses zwjs identity fields from node state', () => {
  const selector = buildNodeResolverSelector(
    { bridgeId: 'main', nodeId: 12 },
    {
      manufacturerId: '0x001d',
      productType: '66',
      productId: 2,
    },
  );
  assert.deepEqual(selector, {
    nodeId: 12,
    deviceKey: 'main:12',
    manufacturerId: 29,
    productType: 66,
    productId: 2,
  });

  assert.equal(parseZwjsIdentityId('0x0184'), 388);
  assert.equal(parseZwjsIdentityId('123'), 123);
  assert.equal(parseZwjsIdentityId(77), 77);
  assert.equal(parseZwjsIdentityId('bad'), undefined);
});

test('node profile classification resolves match or no-match fallback consistently', () => {
  const matched = resolveNodeProfileClassification(
    {
      by: 'product-triple',
      key: '29:66:2',
      entry: createEntry(),
    },
    {
      sourcePath: '/tmp/compiled.json',
      loaded: true,
      generatedAt: '2026-03-01T00:00:00.000Z',
      pipelineFingerprint: 'pipeline-fingerprint-1',
      entryCount: 1,
      duplicateKeys: { productTriple: 0, nodeId: 0, deviceKey: 0 },
      errorMessage: null,
    },
  );
  assert.equal(matched.matchBy, 'product-triple');
  assert.equal(matched.classification.homeyClass, 'socket');
  assert.equal(matched.fallbackReason, null);

  const noMatch = resolveNodeProfileClassification(
    { by: 'none' },
    {
      sourcePath: '/tmp/compiled.json',
      loaded: true,
      generatedAt: '2026-03-01T00:00:00.000Z',
      pipelineFingerprint: 'pipeline-fingerprint-1',
      entryCount: 1,
      duplicateKeys: { productTriple: 0, nodeId: 0, deviceKey: 0 },
      errorMessage: null,
    },
  );
  assert.equal(noMatch.matchBy, 'none');
  assert.equal(noMatch.classification.homeyClass, 'other');
  assert.equal(noMatch.fallbackReason, 'no_compiled_profile_match');

  const unavailable = resolveNodeProfileClassification(
    { by: 'none' },
    {
      sourcePath: '/tmp/compiled.json',
      loaded: false,
      generatedAt: null,
      pipelineFingerprint: null,
      entryCount: 0,
      duplicateKeys: { productTriple: 0, nodeId: 0, deviceKey: 0 },
      errorMessage: 'missing',
    },
  );
  assert.equal(unavailable.fallbackReason, 'compiled_profile_artifact_unavailable');
});

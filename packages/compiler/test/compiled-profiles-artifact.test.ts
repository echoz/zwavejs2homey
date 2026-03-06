const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist/index.js');

test('createCompiledHomeyProfilesArtifactV1 creates valid artifact', () => {
  const artifact = compiler.createCompiledHomeyProfilesArtifactV1(
    [
      {
        device: { deviceKey: 'dev-1', nodeId: 5 },
        compiled: {
          profile: {
            profileId: 'p1',
            classification: { homeyClass: 'socket', confidence: 'generic', uncurated: true },
            capabilities: [],
          },
          report: { summary: { appliedActions: 0, unmatchedActions: 0, suppressedFillActions: 0 } },
        },
      },
    ],
    {
      manifestFile: 'rules/manifest.json',
      buildProfile: 'default-manifest',
      pipelineFingerprint: 'abcd',
      ruleSources: [
        {
          filePath: 'rules/manifest.json',
          ruleCount: 1,
          declaredLayer: 'ha-derived',
          resolvedLayer: 'ha-derived',
        },
      ],
    },
    new Date('2026-02-24T00:00:00.000Z'),
  );

  assert.equal(artifact.schemaVersion, 'compiled-homey-profiles/v1');
  assert.equal(artifact.generatedAt, '2026-02-24T00:00:00.000Z');
  assert.doesNotThrow(() => compiler.assertCompiledHomeyProfilesArtifactV1(artifact));
});

test('assertCompiledHomeyProfilesArtifactV1 rejects malformed artifact', () => {
  assert.throws(
    () =>
      compiler.assertCompiledHomeyProfilesArtifactV1({
        schemaVersion: 'compiled-homey-profiles/v1',
        generatedAt: 'x',
        source: {},
        entries: [{ device: {}, compiled: {} }],
      }),
    /deviceKey is required/,
  );
});

test('assertCompiledHomeyProfilesArtifactV1 rejects malformed optional source metadata', () => {
  assert.throws(
    () =>
      compiler.assertCompiledHomeyProfilesArtifactV1({
        schemaVersion: 'compiled-homey-profiles/v1',
        generatedAt: 'x',
        source: {
          buildProfile: 'weird',
          ruleSources: [{ filePath: '', ruleCount: 'x' }],
        },
        entries: [
          {
            device: { deviceKey: 'dev-1' },
            compiled: { profile: {}, report: {} },
          },
        ],
      }),
    /buildProfile|ruleSources/i,
  );
});

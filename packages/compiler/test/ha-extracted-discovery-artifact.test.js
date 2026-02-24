const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('loadHaExtractedDiscoveryArtifact loads valid extracted artifact', () => {
  const filePath = path.join(fixturesDir, 'ha-extracted-discovery-input-v1.json');
  const artifact = compiler.loadHaExtractedDiscoveryArtifact(filePath);
  assert.equal(artifact.schemaVersion, 'ha-extracted-discovery/v1');
  assert.equal(Array.isArray(artifact.entries), true);
  assert.equal(artifact.entries.length > 0, true);
});

test('loadHaExtractedDiscoveryArtifact wraps validation errors with file context', () => {
  const filePath = path.join(fixturesDir, 'ha-extracted-discovery-invalid.json');
  assert.throws(
    () => compiler.loadHaExtractedDiscoveryArtifact(filePath),
    (error) =>
      error &&
      error.name === 'HaExtractedDiscoveryArtifactError' &&
      error.filePath === filePath &&
      /valueMatch\.commandClass must be a number/i.test(error.message),
  );
});

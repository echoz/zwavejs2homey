const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('loadHaDerivedGeneratedRuleArtifact loads generated HA-derived rule artifact contract', () => {
  const filePath = path.join(fixturesDir, 'ha-derived-rules-v1.json');
  const artifact = compiler.loadHaDerivedGeneratedRuleArtifact(filePath);
  assert.equal(artifact.schemaVersion, 'ha-derived-rules/v1');
  assert.equal(artifact.source.upstream, 'home-assistant');
  assert.equal(artifact.rules.length, 1);
  assert.equal(artifact.rules[0].layer, 'ha-derived');
  assert.equal(artifact.rules[0].actions[0].type, 'device-identity');
});

test('loadHaDerivedGeneratedRuleArtifact rejects non-ha-derived rules in generated artifact', () => {
  const filePath = path.join(fixturesDir, 'ha-derived-rules-invalid.json');
  assert.throws(
    () => compiler.loadHaDerivedGeneratedRuleArtifact(filePath),
    (error) =>
      error &&
      error.name === 'HaGeneratedRuleArtifactError' &&
      error.filePath === filePath &&
      /non-ha-derived rule/i.test(error.message),
  );
});

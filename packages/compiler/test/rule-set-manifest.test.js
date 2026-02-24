const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('loadJsonRuleSetManifest validates declared layers and returns loaded entries', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const loaded = compiler.loadJsonRuleSetManifest([{ filePath: rulesFile }]);
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].rules.length, 3);
  assert.deepEqual(loaded.duplicateRuleIds, []);
});

test('loadJsonRuleSetManifest rejects duplicate ruleIds across files', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const dupFile = path.join(fixturesDir, 'rules-switch-meter-duplicate.json');
  assert.throws(
    () => compiler.loadJsonRuleSetManifest([{ filePath: rulesFile }, { filePath: dupFile }]),
    /Duplicate ruleId/,
  );
});

test('loadJsonRuleSetManifest rejects layer mismatch when declared in manifest', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  assert.throws(
    () => compiler.loadJsonRuleSetManifest([{ filePath: rulesFile, layer: 'project-generic' }]),
    /manifest declares/,
  );
});

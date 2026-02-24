const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('loadJsonRuleFile loads valid rule arrays', () => {
  const filePath = path.join(fixturesDir, 'rules-switch-meter.json');
  const rules = compiler.loadJsonRuleFile(filePath);
  assert.equal(Array.isArray(rules), true);
  assert.equal(rules.length > 0, true);
  assert.equal(rules[0].ruleId, 'ha-onoff');
});

test('loadJsonRuleFile rejects invalid rule shapes with file context', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-shape.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.name === 'RuleFileLoadError' &&
      error.filePath === filePath &&
      /invalid action/i.test(error.message),
  );
});

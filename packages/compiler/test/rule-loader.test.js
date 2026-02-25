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
      /(invalid action|capability action .*capabilityId)/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects empty device-identity actions with clear error', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-device-identity-empty.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /device-identity action .*homeyClass or driverTemplateId/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects action mode not allowed by layer', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-generic-replace.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /not allowed in layer \"project-generic\"/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects invalid ignore-value valueId shapes', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-ignore-valueid.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /ignore-value action .*invalid valueId shape/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects invalid capability conflict metadata', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-capability-conflict.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error && error.filePath === filePath && /conflict\.(key|mode|priority)/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects invalid remove-capability action mode', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-remove-capability.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /remove-capability action .*mode \"replace\"/i.test(error.message),
  );
});

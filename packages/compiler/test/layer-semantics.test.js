const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist');

test('rule layer order is deterministic and generic is last', () => {
  assert.deepEqual(compiler.getRuleLayerOrder(), [
    'ha-derived',
    'project-product',
    'project-generic',
  ]);
});

test('normalizeRuleActionMode defaults to fill', () => {
  assert.equal(compiler.normalizeRuleActionMode(undefined), 'fill');
  assert.equal(compiler.normalizeRuleActionMode('augment'), 'augment');
});

test('replace is only allowed in project-product layer', () => {
  assert.equal(compiler.isRuleActionModeAllowedForLayer('ha-derived', 'replace'), false);
  assert.equal(compiler.isRuleActionModeAllowedForLayer('project-product', 'replace'), true);
  assert.equal(compiler.isRuleActionModeAllowedForLayer('project-generic', 'replace'), false);
});

test('fill and augment are allowed in all compile layers', () => {
  for (const layer of compiler.getRuleLayerOrder()) {
    assert.equal(compiler.isRuleActionModeAllowedForLayer(layer, 'fill'), true);
    assert.equal(compiler.isRuleActionModeAllowedForLayer(layer, 'augment'), true);
  }
});

test('assertRuleActionModeAllowedForLayer throws actionable error', () => {
  assert.throws(
    () => compiler.assertRuleActionModeAllowedForLayer('project-generic', 'replace'),
    /not allowed/,
  );
});

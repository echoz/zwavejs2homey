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
  assert.equal(loaded.entries[0].resolvedLayer, undefined);
  assert.deepEqual(loaded.duplicateRuleIds, []);
});

test('loadJsonRuleSetManifest resolves layer metadata for single-layer files', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter-generic-onoff-fill.json');
  const loaded = compiler.loadJsonRuleSetManifest([{ filePath: rulesFile }]);
  assert.equal(loaded.entries[0].resolvedLayer, 'project-generic');
});

test('loadJsonRuleSetManifest injects declared layer for no-layer rule files', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter-generic-no-layer.json');
  const loaded = compiler.loadJsonRuleSetManifest([
    { filePath: rulesFile, layer: 'project-generic' },
  ]);
  assert.equal(loaded.entries[0].resolvedLayer, 'project-generic');
  assert.equal(loaded.entries[0].rules[0].layer, 'project-generic');
});

test('loadJsonRuleSetManifest rejects empty manifest entries', () => {
  assert.throws(() => compiler.loadJsonRuleSetManifest([]), /at least one entry/i);
});

test('loadJsonRuleSetManifest rejects duplicate ruleIds across files', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const dupFile = path.join(fixturesDir, 'rules-switch-meter-duplicate.json');
  assert.throws(
    () => compiler.loadJsonRuleSetManifest([{ filePath: rulesFile }, { filePath: dupFile }]),
    /Duplicate ruleId/,
  );
});

test('loadJsonRuleSetManifest rejects per-rule layer when manifest declares layer', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter-generic-onoff-fill.json');
  assert.throws(
    () => compiler.loadJsonRuleSetManifest([{ filePath: rulesFile, layer: 'project-generic' }]),
    /must not define layer when manifest declares/i,
  );
});

test('loadJsonRuleSetManifest rejects non-bundle file for project-product layer', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  assert.throws(
    () => compiler.loadJsonRuleSetManifest([{ filePath: rulesFile, layer: 'project-product' }]),
    /requires schemaVersion "product-rules\/v1" bundle files/i,
  );
});

test('loadJsonRuleSetManifest accepts product-rules/v1 file for project-product layer', () => {
  const rulesFile = path.join(fixturesDir, 'rules-product-bundle-valid.json');
  const loaded = compiler.loadJsonRuleSetManifest([
    { filePath: rulesFile, layer: 'project-product' },
  ]);
  assert.equal(loaded.entries[0].resolvedLayer, 'project-product');
  assert.equal(loaded.entries[0].rules[0].layer, 'project-product');
  assert.deepEqual(loaded.entries[0].rules[0].device, {
    manufacturerId: [29],
    productType: [13313],
    productId: [1],
  });
});

test('loadJsonRuleSetManifest rejects duplicate manifest file paths', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  assert.throws(
    () => compiler.loadJsonRuleSetManifest([{ filePath: rulesFile }, { filePath: rulesFile }]),
    /Duplicate manifest filePath/i,
  );
});

test('loadJsonRuleSetManifest rejects out-of-order declared layers', () => {
  const genericFile = path.join(fixturesDir, 'rules-switch-meter-generic-no-layer.json');
  const haGeneratedFile = path.join(fixturesDir, 'ha-derived-rules-v1.json');
  assert.throws(
    () =>
      compiler.loadJsonRuleSetManifest([
        { filePath: genericFile, layer: 'project-generic' },
        { filePath: haGeneratedFile, kind: 'ha-derived-generated', layer: 'ha-derived' },
      ]),
    /out of order/i,
  );
});

test('loadJsonRuleSetManifest rejects unsupported manifest kind values', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  assert.throws(
    () => compiler.loadJsonRuleSetManifest([{ filePath: rulesFile, kind: 'ha-derived-genrated' }]),
    /unsupported kind/i,
  );
});

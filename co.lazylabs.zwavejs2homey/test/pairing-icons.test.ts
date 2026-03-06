const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PAIR_ICON_PATHS,
  PAIR_ICON_BY_HOMEY_CLASS,
  SUPPORTED_HOMEY_PAIR_ICON_CLASSES,
  normalizeHomeyClassForPairIcon,
  resolveDriverPairIconForHomeyClass,
  resolvePairIconForHomeyClass,
} = require('../pairing-icons.js');

test('pair icon resolver normalizes homey class input and falls back to other', () => {
  assert.equal(normalizeHomeyClassForPairIcon(' Light '), 'light');
  assert.equal(normalizeHomeyClassForPairIcon('UNKNOWN_CLASS'), 'other');
  assert.equal(normalizeHomeyClassForPairIcon(''), 'other');
  assert.equal(normalizeHomeyClassForPairIcon(undefined), 'other');

  assert.equal(resolvePairIconForHomeyClass('light'), '/pair-icons/light.svg');
  assert.equal(resolvePairIconForHomeyClass('airfryer'), '/pair-icons/appliance.svg');
  assert.equal(resolvePairIconForHomeyClass('networkrouter'), '/pair-icons/media.svg');
  assert.equal(resolvePairIconForHomeyClass('other'), '/pair-icons/other.svg');
  assert.equal(resolvePairIconForHomeyClass('not-real'), '/pair-icons/other.svg');
  assert.equal(
    resolveDriverPairIconForHomeyClass('light', 'node'),
    '/pair-icons/light.svg',
  );
  assert.equal(
    resolveDriverPairIconForHomeyClass('bridge', 'bridge'),
    '/pair-icons/bridge.svg',
  );
});

test('pair icon mapping includes full supported class list and valid icon paths', () => {
  assert.ok(SUPPORTED_HOMEY_PAIR_ICON_CLASSES.includes('bridge'));
  assert.ok(SUPPORTED_HOMEY_PAIR_ICON_CLASSES.includes('light'));
  assert.ok(SUPPORTED_HOMEY_PAIR_ICON_CLASSES.includes('thermostat'));
  assert.ok(SUPPORTED_HOMEY_PAIR_ICON_CLASSES.includes('other'));

  for (const homeyClass of SUPPORTED_HOMEY_PAIR_ICON_CLASSES) {
    const path = PAIR_ICON_BY_HOMEY_CLASS[homeyClass];
    assert.equal(typeof path, 'string');
    assert.ok(path.startsWith('/pair-icons/'));
    assert.ok(Object.values(PAIR_ICON_PATHS).includes(path));
  }
});

test('pair icon assets exist under both driver asset roots', () => {
  const driverAssetRoots = [
    path.resolve(__dirname, '../drivers/node/assets'),
    path.resolve(__dirname, '../drivers/bridge/assets'),
  ];

  for (const iconPath of Object.values(PAIR_ICON_PATHS)) {
    const relativePath = iconPath.startsWith('/') ? iconPath.slice(1) : iconPath;
    for (const root of driverAssetRoots) {
      const absolutePath = path.join(root, relativePath);
      assert.equal(fs.existsSync(absolutePath), true, `missing pair icon asset: ${absolutePath}`);
    }
  }
});

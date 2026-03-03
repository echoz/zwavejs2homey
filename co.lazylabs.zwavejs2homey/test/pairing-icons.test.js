const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PAIR_ICON_PATHS,
  PAIR_ICON_BY_HOMEY_CLASS,
  SUPPORTED_HOMEY_PAIR_ICON_CLASSES,
  normalizeHomeyClassForPairIcon,
  resolvePairIconForHomeyClass,
} = require('../pairing-icons.js');

test('pair icon resolver normalizes homey class input and falls back to other', () => {
  assert.equal(normalizeHomeyClassForPairIcon(' Light '), 'light');
  assert.equal(normalizeHomeyClassForPairIcon('UNKNOWN_CLASS'), 'other');
  assert.equal(normalizeHomeyClassForPairIcon(''), 'other');
  assert.equal(normalizeHomeyClassForPairIcon(undefined), 'other');

  assert.equal(resolvePairIconForHomeyClass('light'), '/assets/pair-icons/light.svg');
  assert.equal(resolvePairIconForHomeyClass('airfryer'), '/assets/pair-icons/appliance.svg');
  assert.equal(resolvePairIconForHomeyClass('networkrouter'), '/assets/pair-icons/media.svg');
  assert.equal(resolvePairIconForHomeyClass('other'), '/assets/pair-icons/other.svg');
  assert.equal(resolvePairIconForHomeyClass('not-real'), '/assets/pair-icons/other.svg');
});

test('pair icon mapping includes full supported class list and valid icon paths', () => {
  assert.ok(SUPPORTED_HOMEY_PAIR_ICON_CLASSES.includes('bridge'));
  assert.ok(SUPPORTED_HOMEY_PAIR_ICON_CLASSES.includes('light'));
  assert.ok(SUPPORTED_HOMEY_PAIR_ICON_CLASSES.includes('thermostat'));
  assert.ok(SUPPORTED_HOMEY_PAIR_ICON_CLASSES.includes('other'));

  for (const homeyClass of SUPPORTED_HOMEY_PAIR_ICON_CLASSES) {
    const path = PAIR_ICON_BY_HOMEY_CLASS[homeyClass];
    assert.equal(typeof path, 'string');
    assert.ok(path.startsWith('/assets/pair-icons/'));
    assert.ok(Object.values(PAIR_ICON_PATHS).includes(path));
  }
});

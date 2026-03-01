const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CURATION_SCHEMA_VERSION,
  CURATION_SETTINGS_KEY,
  loadCurationRuntimeFromSettings,
  resolveCurationEntryFromRuntime,
} = require('../curation.js');

function createValidCurationDocument() {
  return {
    schemaVersion: CURATION_SCHEMA_VERSION,
    updatedAt: '2026-03-01T00:00:00.000Z',
    entries: {
      'homey-device-1': {
        targetDevice: {
          homeyDeviceId: 'homey-device-1',
          catalogId: '29:66:2',
        },
        baselineMarker: {
          projectionVersion: 'v1',
          baselineProfileHash: 'abc123',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        overrides: {
          deviceIdentity: {
            homeyClass: 'socket',
            driverTemplateId: 'node.socket',
          },
          collections: {
            capabilitiesAdd: ['measure_power', 'measure_power', 'meter_power'],
            capabilitiesRemove: ['alarm_generic'],
          },
        },
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    },
  };
}

test('curation loader returns empty loaded runtime when settings key is not set', () => {
  const runtime = loadCurationRuntimeFromSettings(undefined);
  assert.equal(runtime.status.loaded, true);
  assert.equal(runtime.status.source, 'settings-default-empty');
  assert.equal(runtime.status.sourceKey, CURATION_SETTINGS_KEY);
  assert.equal(runtime.status.entryCount, 0);
  assert.equal(runtime.status.errorMessage, null);
  assert.deepEqual(runtime.document.entries, {});
});

test('curation loader validates schema and normalizes collection dedupe', () => {
  const runtime = loadCurationRuntimeFromSettings(createValidCurationDocument());
  assert.equal(runtime.status.loaded, true);
  assert.equal(runtime.status.entryCount, 1);

  const entry = resolveCurationEntryFromRuntime(runtime, 'homey-device-1');
  assert.equal(Boolean(entry), true);
  assert.deepEqual(entry.overrides.collections.capabilitiesAdd, ['measure_power', 'meter_power']);
});

test('curation loader rejects invalid entries with clear error status', () => {
  const invalid = createValidCurationDocument();
  invalid.entries['homey-device-1'].targetDevice.homeyDeviceId = 'mismatch';
  const runtime = loadCurationRuntimeFromSettings(invalid);
  assert.equal(runtime.status.loaded, false);
  assert.match(runtime.status.errorMessage ?? '', /must match entry key/i);
  assert.equal(resolveCurationEntryFromRuntime(runtime, 'homey-device-1'), undefined);
});

test('curation loader rejects add/remove collection overlap', () => {
  const invalid = createValidCurationDocument();
  invalid.entries['homey-device-1'].overrides.collections.capabilitiesRemove = ['meter_power'];
  const runtime = loadCurationRuntimeFromSettings(invalid);
  assert.equal(runtime.status.loaded, false);
  assert.match(runtime.status.errorMessage ?? '', /overlapping values/i);
});

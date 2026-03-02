const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyCurationEntryToProfile,
  CURATION_SCHEMA_VERSION,
  CURATION_SETTINGS_KEY,
  lowerCurationEntryToRuntimeActions,
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

function createBaseProfile() {
  return {
    profileId: 'profile-main-5',
    match: {},
    classification: {
      homeyClass: 'socket',
      confidence: 'curated',
      uncurated: false,
    },
    capabilities: [
      {
        capabilityId: 'onoff',
        directionality: 'bidirectional',
        inboundMapping: {
          kind: 'value',
          selector: {
            commandClass: 37,
            endpoint: 0,
            property: 'currentValue',
          },
        },
        outboundMapping: {
          kind: 'set_value',
          target: {
            commandClass: 37,
            endpoint: 0,
            property: 'targetValue',
          },
        },
        provenance: {
          layer: 'project-product',
          ruleId: 'base-rule',
          action: 'replace',
        },
      },
      {
        capabilityId: 'dim',
        directionality: 'bidirectional',
        inboundMapping: {
          kind: 'value',
          selector: {
            commandClass: 38,
            endpoint: 0,
            property: 'currentValue',
          },
        },
        outboundMapping: {
          kind: 'set_value',
          target: {
            commandClass: 38,
            endpoint: 0,
            property: 'targetValue',
          },
        },
        provenance: {
          layer: 'project-product',
          ruleId: 'base-rule',
          action: 'replace',
        },
      },
    ],
  };
}

test('curation lowering emits deterministic runtime actions for overrides', () => {
  const runtime = loadCurationRuntimeFromSettings(createValidCurationDocument());
  const entry = resolveCurationEntryFromRuntime(runtime, 'homey-device-1');
  const actions = lowerCurationEntryToRuntimeActions(entry, { homeyDeviceId: 'homey-device-1' });
  assert.equal(actions.length, 5);
  assert.deepEqual(
    actions.map((action) => action.kind),
    [
      'set-device-identity',
      'set-device-identity',
      'add-capability',
      'add-capability',
      'remove-capability',
    ],
  );
  assert.equal(
    actions[0].ruleId.includes('curation.homey-device-1.deviceidentity.homeyclass'),
    true,
  );
});

test('curation apply updates profile and records report summaries', () => {
  const runtime = loadCurationRuntimeFromSettings(createValidCurationDocument());
  const entry = resolveCurationEntryFromRuntime(runtime, 'homey-device-1');
  const baseProfile = createBaseProfile();
  const result = applyCurationEntryToProfile(baseProfile, entry, {
    homeyDeviceId: 'homey-device-1',
  });

  assert.equal(result.profile.classification.homeyClass, 'socket');
  assert.equal(result.profile.classification.driverTemplateId, 'node.socket');
  assert.deepEqual(
    result.profile.capabilities.map((capability) => capability.capabilityId),
    ['onoff', 'dim', 'measure_power', 'meter_power'],
  );
  assert.equal(result.report.summary.lowered, 5);
  assert.equal(result.report.summary.applied, 4);
  assert.equal(result.report.summary.skipped, 1);
  assert.equal(result.report.summary.errors, 0);
  assert.equal(result.report.skippedActions[0].reason, 'capability_not_found');

  assert.equal(baseProfile.capabilities.length, 2);
});

test('curation apply can override capability mappings and remove existing capabilities', () => {
  const document = createValidCurationDocument();
  document.entries['homey-device-1'].overrides.capabilities = {
    onoff: {
      outboundMapping: {
        kind: 'set_value',
        target: {
          commandClass: 37,
          endpoint: 0,
          property: 'targetValueCustom',
        },
      },
    },
  };
  document.entries['homey-device-1'].overrides.collections.capabilitiesRemove = ['dim'];
  const runtime = loadCurationRuntimeFromSettings(document);
  const entry = resolveCurationEntryFromRuntime(runtime, 'homey-device-1');
  const baseProfile = createBaseProfile();
  const result = applyCurationEntryToProfile(baseProfile, entry, {
    homeyDeviceId: 'homey-device-1',
  });

  assert.deepEqual(
    result.profile.capabilities.map((capability) => capability.capabilityId),
    ['onoff', 'measure_power', 'meter_power'],
  );
  assert.equal(result.profile.capabilities[0].outboundMapping.target.property, 'targetValueCustom');
  assert.equal(result.profile.capabilities[0].provenance.layer, 'user-curation');
  assert.equal(result.report.summary.errors, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BASELINE_MARKER_PROJECTION_VERSION,
  applyCurationEntryToProfile,
  CURATION_SCHEMA_VERSION,
  CURATION_SETTINGS_KEY,
  createBaselineMarkerV1,
  evaluateBaselineRecommendationState,
  lowerCurationEntryToRuntimeActions,
  loadCurationRuntimeFromSettings,
  removeCurationEntryV1,
  resolveCurationEntryFromRuntime,
  upsertCurationBaselineMarkerV1,
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
          projectionVersion: '1',
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

test('baseline recommendation remains unavailable when stored and current hashes match', () => {
  const baseProfile = createBaseProfile();
  const marker = createBaselineMarkerV1(baseProfile, {
    pipelineFingerprint: 'fingerprint-a',
    now: '2026-03-02T00:00:00.000Z',
  });
  const curationEntry = {
    targetDevice: { homeyDeviceId: 'homey-device-1' },
    baselineMarker: marker,
    overrides: {},
    updatedAt: '2026-03-02T00:00:00.000Z',
  };

  const result = evaluateBaselineRecommendationState(baseProfile, curationEntry, {
    pipelineFingerprint: 'fingerprint-a',
    now: '2026-03-02T00:05:00.000Z',
  });
  assert.equal(result.recommendationAvailable, false);
  assert.equal(result.recommendationReason, 'baseline-hash-unchanged');
  assert.equal(result.shouldBackfillMarker, false);
  assert.equal(result.currentMarker.projectionVersion, BASELINE_MARKER_PROJECTION_VERSION);
});

test('baseline recommendation becomes available when stored and current hashes differ', () => {
  const baseProfile = createBaseProfile();
  const marker = createBaselineMarkerV1(baseProfile, {
    pipelineFingerprint: 'fingerprint-a',
    now: '2026-03-02T00:00:00.000Z',
  });
  const curationEntry = {
    targetDevice: { homeyDeviceId: 'homey-device-1' },
    baselineMarker: marker,
    overrides: {},
    updatedAt: '2026-03-02T00:00:00.000Z',
  };

  const changedProfile = createBaseProfile();
  changedProfile.capabilities = [...changedProfile.capabilities, { capabilityId: 'measure_power' }];
  const result = evaluateBaselineRecommendationState(changedProfile, curationEntry, {
    pipelineFingerprint: 'fingerprint-b',
    now: '2026-03-02T00:05:00.000Z',
  });
  assert.equal(result.recommendationAvailable, true);
  assert.equal(result.recommendationReason, 'baseline-hash-changed');
  assert.equal(result.shouldBackfillMarker, false);
});

test('baseline recommendation requests marker backfill when marker is missing', () => {
  const baseProfile = createBaseProfile();
  const curationEntry = {
    targetDevice: { homeyDeviceId: 'homey-device-1' },
    overrides: {},
    updatedAt: '2026-03-02T00:00:00.000Z',
  };

  const result = evaluateBaselineRecommendationState(baseProfile, curationEntry, {
    now: '2026-03-02T00:05:00.000Z',
  });
  assert.equal(result.recommendationAvailable, false);
  assert.equal(result.recommendationReason, 'marker-missing-backfill');
  assert.equal(result.shouldBackfillMarker, true);
  assert.equal(result.storedMarker, null);
});

test('baseline recommendation requests marker backfill on projection version mismatch', () => {
  const baseProfile = createBaseProfile();
  const marker = createBaselineMarkerV1(baseProfile, {
    pipelineFingerprint: 'fingerprint-a',
    now: '2026-03-02T00:00:00.000Z',
  });
  const curationEntry = {
    targetDevice: { homeyDeviceId: 'homey-device-1' },
    baselineMarker: {
      ...marker,
      projectionVersion: '0',
    },
    overrides: {},
    updatedAt: '2026-03-02T00:00:00.000Z',
  };

  const result = evaluateBaselineRecommendationState(baseProfile, curationEntry, {
    now: '2026-03-02T00:05:00.000Z',
  });
  assert.equal(result.recommendationAvailable, false);
  assert.equal(result.recommendationReason, 'projection-version-mismatch-backfill');
  assert.equal(result.shouldBackfillMarker, true);
});

test('upsert baseline marker creates a curation entry when one is missing', () => {
  const mutation = upsertCurationBaselineMarkerV1(
    {
      schemaVersion: CURATION_SCHEMA_VERSION,
      updatedAt: '2026-03-01T00:00:00.000Z',
      entries: {},
    },
    'homey-device-1',
    {
      projectionVersion: '1',
      baselineProfileHash: 'hash-1',
      updatedAt: '2026-03-02T00:00:00.000Z',
      pipelineFingerprint: 'fingerprint-1',
    },
    { now: '2026-03-02T00:00:00.000Z' },
  );

  assert.equal(mutation.createdEntry, true);
  assert.equal(
    mutation.document.entries['homey-device-1'].targetDevice.homeyDeviceId,
    'homey-device-1',
  );
  assert.equal(
    mutation.document.entries['homey-device-1'].baselineMarker.baselineProfileHash,
    'hash-1',
  );
  assert.equal(mutation.document.entries['homey-device-1'].overrides?.collections, undefined);
});

test('upsert baseline marker preserves existing overrides while updating marker', () => {
  const mutation = upsertCurationBaselineMarkerV1(
    createValidCurationDocument(),
    'homey-device-1',
    {
      projectionVersion: '1',
      baselineProfileHash: 'hash-2',
      updatedAt: '2026-03-02T00:00:00.000Z',
    },
    { now: '2026-03-02T00:00:00.000Z' },
  );

  assert.equal(mutation.createdEntry, false);
  assert.equal(
    mutation.document.entries['homey-device-1'].baselineMarker.baselineProfileHash,
    'hash-2',
  );
  assert.equal(
    mutation.document.entries['homey-device-1'].overrides.deviceIdentity.homeyClass,
    'socket',
  );
});

test('remove curation entry deletes only the targeted device entry', () => {
  const document = createValidCurationDocument();
  document.entries['homey-device-2'] = {
    targetDevice: {
      homeyDeviceId: 'homey-device-2',
    },
    baselineMarker: {
      projectionVersion: '1',
      baselineProfileHash: 'hash-2',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
    overrides: {},
    updatedAt: '2026-03-01T00:00:00.000Z',
  };

  const mutation = removeCurationEntryV1(document, 'homey-device-1', {
    now: '2026-03-02T00:00:00.000Z',
  });
  assert.equal(mutation.removed, true);
  assert.equal(mutation.document.entries['homey-device-1'], undefined);
  assert.equal(Boolean(mutation.document.entries['homey-device-2']), true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const compiler = require('../dist');
const device = require('./fixtures/device-switch-meter.json');
const unmappedDevice = require('./fixtures/device-unmapped.json');
const reorderedDevice = require('./fixtures/device-switch-meter-reordered.json');

const fixturesDir = path.join(__dirname, 'fixtures');

test('compileProfilePlanFromRuleFiles returns rule source metadata and grouped report stats', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const result = compiler.compileProfilePlanFromRuleFiles(device, [rulesFile], {
    homeyClass: 'socket',
  });

  assert.equal(result.profile.profileId, 'fixture-switch-meter-1');
  assert.deepEqual(result.ruleSources, [
    {
      filePath: rulesFile,
      ruleCount: 3,
      ruleIds: ['ha-onoff', 'product-onoff-write', 'generic-meter-power'],
    },
  ]);

  const byRule = Object.fromEntries(
    result.report.byRule.map((entry) => [`${entry.layer}:${entry.ruleId}`, entry]),
  );
  assert.deepEqual(byRule['ha-derived:ha-onoff'], {
    ruleId: 'ha-onoff',
    layer: 'ha-derived',
    applied: 1,
    unmatched: 2,
    actionTypes: { capability: 3 },
  });
  assert.deepEqual(byRule['project-product:product-onoff-write'], {
    ruleId: 'product-onoff-write',
    layer: 'project-product',
    applied: 1,
    unmatched: 2,
    actionTypes: { capability: 3 },
  });
  assert.deepEqual(byRule['project-generic:generic-meter-power'], {
    ruleId: 'generic-meter-power',
    layer: 'project-generic',
    applied: 2,
    unmatched: 4,
    actionTypes: { capability: 3, 'ignore-value': 3 },
  });
  assert.deepEqual(result.report.bySuppressedSlot, []);
  assert.deepEqual(result.report.curationCandidates, {
    likelyNeedsReview: false,
    reasons: [],
  });
  assert.equal(result.report.diagnosticDeviceKey, 'product-triple:29-13313-1');
  assert.equal(result.report.profileOutcome, 'curated');
});

test('compileProfilePlanFromRuleSetManifest supports manifest entries and grouped reporting', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const result = compiler.compileProfilePlanFromRuleSetManifest(device, [{ filePath: rulesFile }], {
    homeyClass: 'socket',
  });

  assert.equal(result.profile.classification.homeyClass, 'socket');
  assert.equal(result.ruleSources.length, 1);
  assert.equal(result.report.byRule.length >= 3, true);
  assert.equal(result.classificationProvenance, undefined);
});

test('compileProfilePlanFromLoadedRuleSetManifest reuses preloaded manifest data', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const loaded = compiler.loadJsonRuleSetManifest([{ filePath: rulesFile }]);
  const result = compiler.compileProfilePlanFromLoadedRuleSetManifest(device, loaded, {
    homeyClass: 'socket',
  });
  assert.equal(result.profile.classification.homeyClass, 'socket');
  assert.equal(result.ruleSources.length, 1);
  assert.equal(result.ruleSources[0].filePath, rulesFile);
});

test('compileProfilePlanFromRuleSetManifest groups suppressed fills and flags curation review', () => {
  const baseRules = path.join(fixturesDir, 'rules-switch-meter-device-identity.json');
  const extraGeneric = path.join(
    fixturesDir,
    'rules-switch-meter-device-identity-generic-fill.json',
  );
  const result = compiler.compileProfilePlanFromRuleSetManifest(device, [
    { filePath: baseRules },
    { filePath: extraGeneric, layer: 'project-generic' },
  ]);

  assert.ok(
    result.report.bySuppressedSlot.some(
      (row) =>
        row.ruleId === 'generic-device-class-fill' &&
        row.layer === 'project-generic' &&
        row.slot === 'deviceIdentity.homeyClass' &&
        row.count >= 1,
    ),
  );
  assert.equal(result.report.curationCandidates.likelyNeedsReview, true);
  assert.ok(
    result.report.curationCandidates.reasons.some((reason) =>
      reason.startsWith('suppressed-fill-actions:'),
    ),
  );
  const genericOnoff = result.report.byRule.find(
    (row) => row.ruleId === 'generic-device-class-fill',
  );
  assert.equal(genericOnoff.applied, 0);
  assert.equal(genericOnoff.unmatched, 2);
  assert.equal(
    result.report.actions.some(
      (a) =>
        a.ruleId === 'generic-device-class-fill' &&
        a.actionType === 'device-identity' &&
        a.applied === true &&
        a.changed === false,
    ),
    true,
  );
  assert.equal(
    result.report.actions.some(
      (a) =>
        a.ruleId === 'generic-device-class-fill' &&
        a.actionType === 'device-identity' &&
        a.reason === 'device-identity-already-applied',
    ),
    false,
  );
  assert.deepEqual(result.classificationProvenance, {
    layer: 'project-product',
    ruleId: 'product-device-class',
    action: 'derived-from-device-identity-action',
  });
});

test('compileProfilePlanFromRuleSetManifest reports classification provenance for device-identity actions', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter-device-identity.json');
  const result = compiler.compileProfilePlanFromRuleSetManifest(device, [{ filePath: rulesFile }]);
  assert.deepEqual(result.classificationProvenance, {
    layer: 'project-product',
    ruleId: 'product-device-class',
    action: 'derived-from-device-identity-action',
  });
});

test('compileProfilePlanFromRuleFiles marks empty outcome and no-meaningful-mapping curation hint', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const result = compiler.compileProfilePlanFromRuleFiles(unmappedDevice, [rulesFile]);
  assert.equal(result.report.profileOutcome, 'empty');
  assert.equal(result.profile.capabilities.length, 0);
  assert.equal(result.report.curationCandidates.likelyNeedsReview, true);
  assert.ok(result.report.curationCandidates.reasons.includes('no-meaningful-mapping'));
  assert.deepEqual(result.report.unknownDeviceReport, {
    kind: 'no-catalog',
    diagnosticDeviceKey: `product-triple:${unmappedDevice.manufacturerId}-${unmappedDevice.productType}-${unmappedDevice.productId}`,
    profileOutcome: 'empty',
    reasons: result.report.curationCandidates.reasons,
  });
});

test('compileProfilePlanFromRuleFilesWithCatalog annotates known catalog generic fallback curation', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter-generic-onoff-fill.json');
  const catalogFile = path.join(fixturesDir, 'catalog-devices-v1.json');
  const result = compiler.compileProfilePlanFromRuleFilesWithCatalog(
    device,
    [rulesFile],
    catalogFile,
  );

  assert.equal(result.report.profileOutcome, 'generic');
  assert.deepEqual(result.report.catalogContext, {
    knownCatalogDevice: true,
    catalogId: 'observed:29-13313-1',
    label: undefined,
    matchRef: 'catalog:observed:29-13313-1',
  });
  assert.equal(result.report.diagnosticDeviceKey, 'catalog:observed:29-13313-1');
  assert.ok(result.report.curationCandidates.reasons.includes('known-device-generic-fallback'));
  assert.deepEqual(result.report.unknownDeviceReport, {
    kind: 'known-catalog',
    diagnosticDeviceKey: 'catalog:observed:29-13313-1',
    profileOutcome: 'generic',
    matchRef: 'catalog:observed:29-13313-1',
    label: undefined,
    reasons: result.report.curationCandidates.reasons,
  });
});

test('compileProfilePlanFromRuleFilesWithCatalog annotates unknown catalog generic fallback curation', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter-generic-onoff-fill.json');
  const catalogFile = path.join(fixturesDir, 'catalog-devices-v1.json');
  const miss = compiler.compileProfilePlanFromRuleFilesWithCatalog(
    unmappedDevice,
    [rulesFile],
    catalogFile,
  );
  assert.equal(miss.report.profileOutcome, 'empty');
  assert.deepEqual(miss.report.catalogContext, { knownCatalogDevice: false });
  assert.equal(miss.report.diagnosticDeviceKey, 'product-triple:65535-65535-65535');
  assert.ok(miss.report.curationCandidates.reasons.includes('no-meaningful-mapping'));
  assert.deepEqual(miss.report.unknownDeviceReport, {
    kind: 'unknown-catalog',
    diagnosticDeviceKey: 'product-triple:65535-65535-65535',
    profileOutcome: 'empty',
    reasons: miss.report.curationCandidates.reasons,
  });
});

test('compileProfilePlanFromRuleFilesWithCatalog annotates known catalog unmapped curation', () => {
  const catalogFile = path.join(fixturesDir, 'catalog-devices-v1.json');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-unmapped-rules-'));
  const noMatchRulesFile = path.join(tmpDir, 'rules-no-match.json');
  fs.writeFileSync(
    noMatchRulesFile,
    JSON.stringify(
      [
        {
          ruleId: 'no-match',
          layer: 'project-generic',
          value: { commandClass: [999], property: ['never'] },
          actions: [{ type: 'capability', capabilityId: 'measure_power' }],
        },
      ],
      null,
      2,
    ),
  );

  const result = compiler.compileProfilePlanFromRuleFilesWithCatalog(
    device,
    [noMatchRulesFile],
    catalogFile,
  );
  assert.equal(result.report.profileOutcome, 'empty');
  assert.deepEqual(result.report.catalogContext, {
    knownCatalogDevice: true,
    catalogId: 'observed:29-13313-1',
    label: undefined,
    matchRef: 'catalog:observed:29-13313-1',
  });
  assert.equal(result.report.diagnosticDeviceKey, 'catalog:observed:29-13313-1');
  assert.ok(result.report.curationCandidates.reasons.includes('known-device-unmapped'));
});

test('compileProfilePlanFromRuleSetManifest is stable across value ordering for device-identity classification', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter-device-identity.json');
  const a = compiler.compileProfilePlanFromRuleSetManifest(device, [{ filePath: rulesFile }]);
  const b = compiler.compileProfilePlanFromRuleSetManifest(reorderedDevice, [
    { filePath: rulesFile },
  ]);

  assert.deepEqual(a.profile.classification, b.profile.classification);
  assert.deepEqual(a.classificationProvenance, b.classificationProvenance);
});

test('compileProfilePlanFromRuleSetManifest supports ha-derived generated artifact entries', () => {
  const haGeneratedRules = path.join(fixturesDir, 'ha-derived-rules-v1.json');
  const projectRules = path.join(fixturesDir, 'rules-switch-meter.json');

  const result = compiler.compileProfilePlanFromRuleSetManifest(device, [
    { filePath: haGeneratedRules, kind: 'ha-derived-generated', layer: 'ha-derived' },
    { filePath: projectRules },
  ]);

  assert.equal(result.profile.classification.homeyClass, 'socket');
  assert.equal(
    result.profile.capabilities.some((cap) => cap.capabilityId === 'onoff'),
    true,
  );
  assert.equal(
    result.ruleSources.some((src) => src.filePath === haGeneratedRules && src.ruleCount === 1),
    true,
  );
  assert.ok(
    result.report.byRule.some(
      (row) => row.layer === 'ha-derived' && row.ruleId === 'ha-switch-binary-current',
    ),
  );
});

test('compileProfilePlanFromRuleSetManifest supports larger mixed HA-derived source extract with project rules', () => {
  const discoveryPy = path.join(
    __dirname,
    '../../../docs/external/home-assistant/homeassistant/components/zwave_js/discovery.py',
  );
  const extractResult = compiler.extractHaDiscoverySubsetFromFile(discoveryPy);
  const translated = compiler.translateHaExtractedDiscoveryToGeneratedArtifact(
    extractResult.artifact,
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-ha-derived-'));
  const haGeneratedFile = path.join(tmpDir, 'ha-derived-generated.json');
  fs.writeFileSync(haGeneratedFile, JSON.stringify(translated.artifact, null, 2));

  const projectRules = path.join(fixturesDir, 'rules-switch-meter.json');
  const result = compiler.compileProfilePlanFromRuleSetManifest(device, [
    { filePath: haGeneratedFile, kind: 'ha-derived-generated', layer: 'ha-derived' },
    { filePath: projectRules },
  ]);

  assert.equal(extractResult.report.translated > 50, true);
  assert.equal(translated.artifact.rules.length > 50, true);
  assert.equal(result.profile.classification.homeyClass, 'socket');
  assert.equal(result.report.profileOutcome, 'curated');
  assert.equal(result.report.byRule.length > 20, true);
  assert.ok(
    result.report.byRule.some(
      (row) => row.layer === 'ha-derived' && row.ruleId.startsWith('ha:ha_extracted_'),
    ),
  );
  assert.equal(result.report.curationCandidates.likelyNeedsReview, true);
  assert.ok(
    result.report.curationCandidates.reasons.some((reason) =>
      reason.startsWith('high-unmatched-ratio:'),
    ),
  );
});

test('compileProfilePlanFromRuleFilesWithCatalog reports catalog lookup match', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const catalogFile = path.join(fixturesDir, 'catalog-devices-v1.json');
  const result = compiler.compileProfilePlanFromRuleFilesWithCatalog(
    device,
    [rulesFile],
    catalogFile,
  );

  assert.deepEqual(result.catalogLookup, {
    matched: true,
    by: 'product-triple',
    catalogId: 'observed:29-13313-1',
    label: undefined,
  });
  assert.deepEqual(result.profile.catalogMatch, {
    by: 'product-triple',
    catalogId: 'observed:29-13313-1',
    label: undefined,
  });
});

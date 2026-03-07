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
const rootRulesDir = path.join(__dirname, '../../../rules');

function loadRootManifestEntries() {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootRulesDir, 'manifest.json'), 'utf8'));
  return manifest.map((entry) => ({
    ...entry,
    filePath: path.join(rootRulesDir, entry.filePath),
  }));
}

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

test('compileProfilePlanFromLoadedRuleSetManifest flattens rules once per loaded manifest', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const loaded = compiler.loadJsonRuleSetManifest([{ filePath: rulesFile }]);
  const originalFlatMap = loaded.entries.flatMap.bind(loaded.entries);
  let flatMapCalls = 0;
  loaded.entries.flatMap = (...args) => {
    flatMapCalls += 1;
    return originalFlatMap(...args);
  };

  const a = compiler.compileProfilePlanFromLoadedRuleSetManifest(device, loaded, {
    homeyClass: 'socket',
  });
  const b = compiler.compileProfilePlanFromLoadedRuleSetManifest(device, loaded, {
    homeyClass: 'socket',
  });

  assert.equal(flatMapCalls, 1);
  assert.deepEqual(a.profile.classification, b.profile.classification);
});

test('compileProfilePlanFromLoadedRuleSetManifest caches rule source metadata per loaded manifest', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const loaded = compiler.loadJsonRuleSetManifest([{ filePath: rulesFile }]);

  const a = compiler.compileProfilePlanFromLoadedRuleSetManifest(device, loaded, {
    homeyClass: 'socket',
  });
  const b = compiler.compileProfilePlanFromLoadedRuleSetManifest(device, loaded, {
    homeyClass: 'socket',
  });

  assert.equal(a.ruleSources, b.ruleSources);
  assert.equal(Object.isFrozen(a.ruleSources), true);
  assert.equal(Object.isFrozen(a.ruleSources[0]), true);
  assert.equal(Object.isFrozen(a.ruleSources[0].ruleIds), true);
});

test('compileProfilePlanFromLoadedRuleSetManifest summary mode skips heavy report groupings', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter-device-identity.json');
  const loaded = compiler.loadJsonRuleSetManifest([{ filePath: rulesFile }]);

  const full = compiler.compileProfilePlanFromLoadedRuleSetManifest(device, loaded);
  const summary = compiler.compileProfilePlanFromLoadedRuleSetManifest(device, loaded, {
    reportMode: 'summary',
  });

  assert.equal(full.report.byRule.length > 0, true);
  assert.equal(summary.report.byRule.length, 0);
  assert.equal(summary.report.bySuppressedSlot.length, 0);
  assert.equal(summary.classificationProvenance, undefined);
  assert.equal(summary.report.actions.length, 0);
  assert.equal(summary.report.profileOutcome, 'curated');
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
  assert.equal(result.report.curationCandidates.likelyNeedsReview, false);
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
  assert.equal(result.report.curationCandidates.likelyNeedsReview, false);
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

test('root manifest product overrides curate Leviton dimmers', () => {
  const manifestEntries = loadRootManifestEntries();
  const levitonNodes = [
    {
      deviceKey: 'leviton-dz6hd',
      manufacturerId: 29,
      productType: 12801,
      productId: 1,
      values: [
        {
          valueId: { commandClass: 38, endpoint: 0, property: 'currentValue' },
          metadata: { type: 'number', readable: true, writeable: false },
        },
        {
          valueId: { commandClass: 38, endpoint: 0, property: 'targetValue' },
          metadata: { type: 'number', readable: true, writeable: true },
        },
      ],
    },
    {
      deviceKey: 'leviton-zw6hd',
      manufacturerId: 29,
      productType: 65,
      productId: 2,
      values: [
        {
          valueId: { commandClass: 38, endpoint: 0, property: 'currentValue' },
          metadata: { type: 'number', readable: true, writeable: false },
        },
        {
          valueId: { commandClass: 38, endpoint: 0, property: 'targetValue' },
          metadata: { type: 'number', readable: true, writeable: true },
        },
      ],
    },
  ];

  for (const deviceFacts of levitonNodes) {
    const result = compiler.compileProfilePlanFromRuleSetManifest(deviceFacts, manifestEntries);
    assert.equal(result.profile.classification.homeyClass, 'light');
    assert.equal(result.profile.classification.driverTemplateId, 'product-leviton-dimmer');
    assert.equal(result.profile.classification.confidence, 'curated');
    assert.equal(result.profile.classification.uncurated, false);
    assert.equal(
      result.profile.capabilities.some((capability) => capability.capabilityId === 'dim'),
      true,
    );
    assert.equal(
      result.profile.capabilities.some(
        (capability) => capability.capabilityId === 'windowcoverings_set',
      ),
      false,
    );
    assert.equal(result.report.profileOutcome, 'curated');
    assert.deepEqual(result.classificationProvenance, {
      layer: 'project-product',
      ruleId:
        deviceFacts.productType === 12801
          ? 'product-leviton-dz6hd-class-and-dim'
          : 'product-leviton-zw6hd-class-and-dim',
      action: 'derived-from-device-identity-action',
    });
  }
});

test('root manifest product overrides curate Leviton switches and Yale locks', () => {
  const manifestEntries = loadRootManifestEntries();
  const curatedDevices = [
    {
      name: 'leviton-dz15s',
      facts: {
        deviceKey: 'leviton-dz15s',
        manufacturerId: 29,
        productType: 13313,
        productId: 1,
        values: [
          {
            valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
            metadata: { type: 'boolean', readable: true, writeable: false },
          },
          {
            valueId: { commandClass: 37, endpoint: 0, property: 'targetValue' },
            metadata: { type: 'boolean', readable: true, writeable: true },
          },
        ],
      },
      expected: {
        homeyClass: 'socket',
        driverTemplateId: 'product-leviton-switch',
        requiredCapabilities: ['onoff'],
        forbiddenCapabilities: [],
      },
    },
    {
      name: 'leviton-zw15s',
      facts: {
        deviceKey: 'leviton-zw15s',
        manufacturerId: 29,
        productType: 66,
        productId: 2,
        values: [
          {
            valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
            metadata: { type: 'boolean', readable: true, writeable: false },
          },
          {
            valueId: { commandClass: 37, endpoint: 0, property: 'targetValue' },
            metadata: { type: 'boolean', readable: true, writeable: true },
          },
        ],
      },
      expected: {
        homeyClass: 'socket',
        driverTemplateId: 'product-leviton-switch',
        requiredCapabilities: ['onoff'],
        forbiddenCapabilities: [],
      },
    },
    {
      name: 'yale-yrd226',
      facts: {
        deviceKey: 'yale-yrd226',
        manufacturerId: 297,
        productType: 32770,
        productId: 1536,
        values: [
          {
            valueId: { commandClass: 98, endpoint: 0, property: 'currentMode' },
            metadata: { type: 'number', readable: true, writeable: false },
          },
          {
            valueId: { commandClass: 98, endpoint: 0, property: 'targetMode' },
            metadata: { type: 'number', readable: true, writeable: true },
          },
          {
            valueId: { commandClass: 98, endpoint: 0, property: 'doorStatus' },
            metadata: { type: 'string', readable: true, writeable: false },
          },
          {
            valueId: {
              commandClass: 113,
              endpoint: 0,
              property: 'Access Control',
              propertyKey: 'Lock state',
            },
            metadata: { type: 'number', readable: true, writeable: false },
          },
          {
            valueId: { commandClass: 128, endpoint: 0, property: 'level' },
            metadata: { type: 'number', readable: true, writeable: false },
          },
        ],
      },
      expected: {
        homeyClass: 'lock',
        driverTemplateId: 'product-yale-lock',
        requiredCapabilities: [
          'locked',
          'enum_select',
          'lock_mode',
          'alarm_contact',
          'alarm_generic',
          'measure_battery',
          'alarm_battery',
          'alarm_tamper',
        ],
        forbiddenCapabilities: [],
      },
    },
  ];

  for (const entry of curatedDevices) {
    const result = compiler.compileProfilePlanFromRuleSetManifest(entry.facts, manifestEntries);
    assert.equal(result.profile.classification.homeyClass, entry.expected.homeyClass);
    assert.equal(result.profile.classification.driverTemplateId, entry.expected.driverTemplateId);
    assert.equal(result.profile.classification.confidence, 'curated');
    assert.equal(result.profile.classification.uncurated, false);
    assert.equal(result.report.profileOutcome, 'curated');

    for (const capability of entry.expected.requiredCapabilities) {
      assert.equal(
        result.profile.capabilities.some((item) => item.capabilityId === capability),
        true,
        `${entry.name} expected capability ${capability}`,
      );
    }
    for (const capability of entry.expected.forbiddenCapabilities) {
      assert.equal(
        result.profile.capabilities.some((item) => item.capabilityId === capability),
        false,
        `${entry.name} should not include capability ${capability}`,
      );
    }

    if (entry.name === 'yale-yrd226') {
      const lockedCapability = result.profile.capabilities.find(
        (item) => item.capabilityId === 'locked',
      );
      const enumSelectCapability = result.profile.capabilities.find(
        (item) => item.capabilityId === 'enum_select',
      );
      const lockModeCapability = result.profile.capabilities.find(
        (item) => item.capabilityId === 'lock_mode',
      );
      const alarmBatteryCapability = result.profile.capabilities.find(
        (item) => item.capabilityId === 'alarm_battery',
      );
      const alarmContactCapability = result.profile.capabilities.find(
        (item) => item.capabilityId === 'alarm_contact',
      );
      const alarmGenericCapability = result.profile.capabilities.find(
        (item) => item.capabilityId === 'alarm_generic',
      );
      const alarmTamperCapability = result.profile.capabilities.find(
        (item) => item.capabilityId === 'alarm_tamper',
      );
      assert.equal(lockedCapability?.outboundMapping?.kind, 'set_value');
      assert.deepEqual(lockedCapability?.outboundMapping?.target, {
        commandClass: 98,
        endpoint: 0,
        property: 'targetMode',
      });
      assert.equal(enumSelectCapability?.outboundMapping?.kind, 'set_value');
      assert.deepEqual(enumSelectCapability?.outboundMapping?.target, {
        commandClass: 98,
        endpoint: 0,
        property: 'targetMode',
      });
      assert.equal(lockModeCapability?.outboundMapping?.kind, 'set_value');
      assert.deepEqual(lockModeCapability?.outboundMapping?.target, {
        commandClass: 98,
        endpoint: 0,
        property: 'targetMode',
      });
      assert.equal(alarmBatteryCapability?.inboundMapping?.kind, 'value');
      assert.equal(
        alarmBatteryCapability?.inboundMapping?.transformRef,
        'zwave_battery_level_to_homey_alarm_battery',
      );
      assert.equal(alarmContactCapability?.inboundMapping?.kind, 'value');
      assert.deepEqual(alarmContactCapability?.inboundMapping?.selector, {
        commandClass: 98,
        endpoint: 0,
        property: 'doorStatus',
      });
      assert.equal(
        alarmContactCapability?.inboundMapping?.transformRef,
        'zwave_door_status_to_homey_alarm_contact',
      );
      assert.equal(alarmGenericCapability?.inboundMapping?.kind, 'value');
      assert.deepEqual(alarmGenericCapability?.inboundMapping?.selector, {
        commandClass: 113,
        endpoint: 0,
        property: 'Access Control',
        propertyKey: 'Lock state',
      });
      assert.equal(
        alarmGenericCapability?.inboundMapping?.transformRef,
        'zwave_notification_nonzero_to_homey_alarm_generic',
      );
      assert.equal(alarmTamperCapability?.inboundMapping?.kind, 'event');
      assert.deepEqual(alarmTamperCapability?.inboundMapping?.selector, {
        eventType: 'zwjs.event.node.notification',
      });
      assert.equal(
        alarmTamperCapability?.inboundMapping?.transformRef,
        'zwjs_notification_to_homey_alarm_tamper',
      );
    }
  }
});

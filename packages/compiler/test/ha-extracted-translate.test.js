const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');
const device = require('./fixtures/device-switch-meter.json');
const extractedInput = require('./fixtures/ha-extracted-discovery-input-v1.json');

const fixturesDir = path.join(__dirname, 'fixtures');

test('translateHaExtractedDiscoveryToGeneratedArtifact maps extracted fixture to ha-derived artifact', () => {
  const result = compiler.translateHaExtractedDiscoveryToGeneratedArtifact(extractedInput);

  assert.equal(result.artifact.schemaVersion, 'ha-derived-rules/v1');
  assert.equal(result.artifact.rules.length, 3);
  assert.deepEqual(result.artifact.rules[0], {
    ruleId: 'ha:switch_binary_current_extracted',
    layer: 'ha-derived',
    device: {
      manufacturerId: [29],
      productType: [13313],
      productId: [1],
    },
    value: {
      commandClass: [37],
      endpoint: [0],
      property: ['currentValue'],
      metadataType: ['boolean'],
      readable: true,
    },
    constraints: {
      requiredValues: [{ commandClass: [37], endpoint: [0], property: ['targetValue'] }],
      absentValues: [{ commandClass: [49], endpoint: [0], property: ['Air temperature'] }],
    },
    actions: [
      {
        type: 'device-identity',
        homeyClass: 'socket',
        driverTemplateId: 'ha-generic-socket',
      },
      {
        type: 'capability',
        capabilityId: 'onoff',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        },
        flags: {
          allowMulti: true,
          assumedState: true,
          entityRegistryEnabledDefault: false,
        },
      },
    ],
  });
  assert.deepEqual(result.artifact.rules[1], {
    ruleId: 'ha:switch_binary_wrong_device_extracted',
    layer: 'ha-derived',
    device: {
      manufacturerId: [9999],
    },
    value: {
      commandClass: [37],
      endpoint: [0],
      property: ['currentValue'],
      metadataType: ['boolean'],
      readable: true,
    },
    actions: [
      {
        type: 'capability',
        capabilityId: 'alarm_contact',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        },
      },
    ],
  });
  assert.deepEqual(result.artifact.rules[2], {
    ruleId: 'ha:meter_power_extracted',
    layer: 'ha-derived',
    device: {
      manufacturerId: [29],
      productType: [13313],
      productId: [1],
    },
    value: {
      commandClass: [50],
      endpoint: [0],
      property: ['value'],
      metadataType: ['number'],
      readable: true,
    },
    actions: [
      {
        type: 'capability',
        capabilityId: 'measure_power',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 50, endpoint: 0, property: 'value' },
        },
      },
    ],
  });
  assert.deepEqual(result.report.unsupported, [
    { id: 'unsupported_extracted_match_extra', reason: 'unsupported-match-field' },
  ]);
  assert.equal(result.report.skipped, 1);
});

test('translated extracted HA artifact rules are compiler-compatible with project rules', () => {
  const translated = compiler.translateHaExtractedDiscoveryToGeneratedArtifact(extractedInput);
  const projectRules = compiler
    .loadJsonRuleFile(path.join(fixturesDir, 'rules-switch-meter.json'))
    .filter((rule) => rule.layer !== 'ha-derived');

  const { profile, report } = compiler.compileProfilePlan(device, [
    ...translated.artifact.rules,
    ...projectRules,
  ]);

  assert.equal(profile.classification.homeyClass, 'socket');
  assert.equal(
    profile.capabilities.some((c) => c.capabilityId === 'onoff'),
    true,
  );
  assert.equal(
    profile.capabilities.some((c) => c.capabilityId === 'measure_power'),
    true,
  );
  assert.equal(
    profile.capabilities.some((c) => c.capabilityId === 'alarm_contact'),
    false,
  );
  const onoffCapability = profile.capabilities.find((c) => c.capabilityId === 'onoff');
  const measurePowerCapability = profile.capabilities.find(
    (c) => c.capabilityId === 'measure_power',
  );
  assert.ok(onoffCapability);
  assert.ok(measurePowerCapability);
  assert.equal(onoffCapability.flags?.allowMulti, true);
  assert.equal(onoffCapability.flags?.assumedState, true);
  assert.equal(onoffCapability.flags?.entityRegistryEnabledDefault, false);
  assert.equal(onoffCapability.flags?.readable, true);
  assert.equal(onoffCapability.flags?.writeable, true);
  assert.equal(onoffCapability.directionality, 'bidirectional');
  assert.equal(measurePowerCapability.provenance.layer, 'ha-derived');
  assert.equal(measurePowerCapability.provenance.ruleId, 'ha:meter_power_extracted');
  assert.ok(
    report.actions.some(
      (a) =>
        a.ruleId === 'generic-meter-power' &&
        a.actionType === 'capability' &&
        a.changed === false &&
        a.applied === true,
    ),
  );
});

test('translateHaExtractedDiscoveryToGeneratedArtifact validates extracted schema shape', () => {
  assert.throws(
    () =>
      compiler.translateHaExtractedDiscoveryToGeneratedArtifact({
        schemaVersion: 'ha-extracted-discovery/v1',
        source: { generatedAt: '2026-02-24T00:00:00Z', sourceRef: 'x' },
        entries: [{ id: 'x', sourceRef: 'x', valueMatch: { commandClass: '37' }, output: {} }],
      }),
    (error) =>
      error &&
      error.name === 'HaExtractedTranslationError' &&
      /valueMatch\.commandClass must be a number/i.test(error.message),
  );
});

test('translateHaExtractedDiscoveryToGeneratedArtifact validates companions matcher shape at extracted layer', () => {
  assert.throws(
    () =>
      compiler.translateHaExtractedDiscoveryToGeneratedArtifact({
        schemaVersion: 'ha-extracted-discovery/v1',
        source: { generatedAt: '2026-02-24T00:00:00Z', sourceRef: 'x' },
        entries: [
          {
            id: 'x',
            sourceRef: 'x',
            valueMatch: { commandClass: 37, property: 'currentValue' },
            companions: {
              requiredValues: [{ commandClass: '50', property: 'value' }],
            },
            output: { capabilityId: 'onoff' },
          },
        ],
      }),
    (error) =>
      error &&
      error.name === 'HaExtractedTranslationError' &&
      /companions\.requiredValues\[0\]\.commandClass must be a number/i.test(error.message),
  );
});

test('translateHaExtractedDiscoveryToGeneratedArtifact preserves extracted semantics into capability flags where supported', () => {
  const result = compiler.translateHaExtractedDiscoveryToGeneratedArtifact({
    schemaVersion: 'ha-extracted-discovery/v1',
    source: { generatedAt: '2026-02-24T00:00:00Z', sourceRef: 'x' },
    entries: [
      {
        id: 'semantic_test',
        sourceRef: 'x:1',
        semantics: {
          allowMulti: true,
          assumedState: true,
          entityRegistryEnabledDefault: false,
        },
        valueMatch: {
          commandClass: 87,
          endpoint: 0,
          property: 'currentValue',
          metadata: { type: 'boolean', readable: true, writeable: false },
        },
        output: { capabilityId: 'alarm_generic' },
      },
    ],
  });

  assert.equal(result.report.skipped, 0);
  assert.deepEqual(result.artifact.rules[0].actions, [
    {
      type: 'capability',
      capabilityId: 'alarm_generic',
      inboundMapping: {
        kind: 'value',
        selector: { commandClass: 87, endpoint: 0, property: 'currentValue' },
      },
      flags: {
        assumedState: true,
        allowMulti: true,
        entityRegistryEnabledDefault: false,
      },
    },
  ]);

  const { profile } = compiler.compileProfilePlan(
    {
      deviceKey: 'semantics-fixture',
      values: [
        {
          valueId: { commandClass: 87, endpoint: 0, property: 'currentValue' },
          metadata: { type: 'boolean', readable: true, writeable: false },
        },
      ],
    },
    result.artifact.rules,
  );
  const capability = profile.capabilities.find((c) => c.capabilityId === 'alarm_generic');
  assert.ok(capability);
  assert.deepEqual(capability.flags, {
    assumedState: true,
    allowMulti: true,
    entityRegistryEnabledDefault: false,
  });
});

test('translateHaExtractedDiscoveryToGeneratedArtifact preserves device class match constraints', () => {
  const result = compiler.translateHaExtractedDiscoveryToGeneratedArtifact({
    schemaVersion: 'ha-extracted-discovery/v1',
    source: { generatedAt: '2026-02-24T00:00:00Z', sourceRef: 'x' },
    entries: [
      {
        id: 'cover_multilevel_switch',
        sourceRef: 'x:2',
        deviceMatch: {
          deviceClassGeneric: ['Multilevel Switch'],
          deviceClassSpecific: ['Motor Control Class A'],
        },
        valueMatch: {
          commandClass: 38,
          endpoint: 0,
          property: 'currentValue',
          metadata: { type: 'number', readable: true, writeable: false },
        },
        output: {
          homeyClass: 'curtain',
          driverTemplateId: 'ha-import-cover',
          capabilityId: 'windowcoverings_set',
        },
      },
    ],
  });

  assert.equal(result.report.skipped, 0);
  assert.deepEqual(result.artifact.rules[0].device, {
    deviceClassGeneric: ['Multilevel Switch'],
    deviceClassSpecific: ['Motor Control Class A'],
  });

  const matching = compiler.compileProfilePlan(
    {
      deviceKey: 'matching-device-class',
      deviceClassGeneric: 'Multilevel Switch',
      deviceClassSpecific: 'Motor Control Class A',
      values: [
        {
          valueId: { commandClass: 38, endpoint: 0, property: 'currentValue' },
          metadata: { type: 'number', readable: true, writeable: false },
        },
      ],
    },
    result.artifact.rules,
  );
  assert.equal(matching.profile.classification.homeyClass, 'curtain');

  const nonMatching = compiler.compileProfilePlan(
    {
      deviceKey: 'nonmatching-device-class',
      deviceClassGeneric: 'Multilevel Switch',
      deviceClassSpecific: 'Multilevel Power Switch',
      values: [
        {
          valueId: { commandClass: 38, endpoint: 0, property: 'currentValue' },
          metadata: { type: 'number', readable: true, writeable: false },
        },
      ],
    },
    result.artifact.rules,
  );
  assert.equal(nonMatching.profile.classification.homeyClass, 'other');
});

test('translateHaExtractedDiscoveryToGeneratedArtifact preserves propertyKey arrays from extracted aliases', () => {
  const positionKeys = ['inboundTop', 'inboundBottom'];
  const tiltKeys = ['horizontalSlatsAngle', 'verticalSlatsAngle'];
  const result = compiler.translateHaExtractedDiscoveryToGeneratedArtifact({
    schemaVersion: 'ha-extracted-discovery/v1',
    source: { generatedAt: '2026-02-25T00:00:00Z', sourceRef: 'x' },
    entries: [
      {
        id: 'cover_position',
        sourceRef: 'x:10',
        valueMatch: {
          commandClass: 106,
          endpoint: 0,
          property: 'currentValue',
          propertyKey: positionKeys,
          metadata: { type: 'number' },
        },
        output: {
          homeyClass: 'curtain',
          driverTemplateId: 'ha-import-cover',
          capabilityId: 'windowcoverings_set',
        },
      },
      {
        id: 'cover_tilt',
        sourceRef: 'x:11',
        valueMatch: {
          commandClass: 106,
          endpoint: 0,
          property: 'currentValue',
          propertyKey: tiltKeys,
          metadata: { type: 'number' },
        },
        companions: {
          absentValues: [
            {
              commandClass: 106,
              endpoint: 0,
              property: 'currentValue',
              propertyKey: positionKeys,
            },
          ],
        },
        output: {
          homeyClass: 'curtain',
          driverTemplateId: 'ha-import-cover',
          capabilityId: 'windowcoverings_set',
        },
      },
    ],
  });

  assert.equal(result.report.skipped, 0);
  assert.deepEqual(result.artifact.rules[0].value.propertyKey, positionKeys);
  assert.deepEqual(result.artifact.rules[1].value.propertyKey, tiltKeys);
  assert.deepEqual(result.artifact.rules[1].constraints.absentValues[0].propertyKey, positionKeys);
});

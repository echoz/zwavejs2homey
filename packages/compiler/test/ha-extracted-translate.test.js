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
  assert.equal(result.artifact.rules.length, 2);
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

  const { profile } = compiler.compileProfilePlan(device, [
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
      flags: { assumedState: true },
    },
  ]);
});

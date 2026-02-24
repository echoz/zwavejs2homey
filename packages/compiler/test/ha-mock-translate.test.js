const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');
const device = require('./fixtures/device-switch-meter.json');
const mockInput = require('./fixtures/ha-mock-discovery-input-v1.json');

const fixturesDir = path.join(__dirname, 'fixtures');

test('translateHaMockDiscoveryToGeneratedArtifact emits deterministic ha-derived artifact and report', () => {
  const result = compiler.translateHaMockDiscoveryToGeneratedArtifact(mockInput);

  assert.equal(result.artifact.schemaVersion, 'ha-derived-rules/v1');
  assert.equal(result.artifact.rules.length, 2);
  assert.deepEqual(result.artifact.rules[0], {
    ruleId: 'ha:switch_binary_current',
    layer: 'ha-derived',
    value: {
      commandClass: [37],
      endpoint: [0],
      property: ['currentValue'],
      metadataType: ['boolean'],
      readable: true,
    },
    constraints: {
      requiredValues: [
        {
          commandClass: [37],
          endpoint: [0],
          property: ['targetValue'],
        },
      ],
      absentValues: [
        {
          commandClass: [49],
          endpoint: [0],
          property: ['Air temperature'],
        },
      ],
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
    ruleId: 'ha:contact_like_binary_without_target',
    layer: 'ha-derived',
    value: {
      commandClass: [37],
      endpoint: [0],
      property: ['currentValue'],
      metadataType: ['boolean'],
      writeable: false,
    },
    constraints: {
      absentValues: [
        {
          commandClass: [37],
          endpoint: [0],
          property: ['targetValue'],
        },
      ],
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
  assert.deepEqual(result.report, {
    translated: 2,
    skipped: 4,
    unsupported: [
      { id: 'unsupported_constraint_matcher_field', reason: 'unsupported-match-field' },
      { id: 'unsupported_match_extra_field', reason: 'unsupported-match-field' },
      { id: 'unsupported_output_shape', reason: 'unsupported-output-shape' },
      { id: 'unsupported_no_output', reason: 'no-supported-output' },
    ],
    sourceRefs: [
      'discovery.py#contact_like_binary_without_target',
      'discovery.py#switch_binary_current',
      'discovery.py#unsupported_constraint_matcher_field',
      'discovery.py#unsupported_match_extra_field',
      'discovery.py#unsupported_no_output',
      'discovery.py#unsupported_output_shape',
    ],
  });
});

test('translated ha-derived artifact rules are compiler-compatible with project rules', () => {
  const translated = compiler.translateHaMockDiscoveryToGeneratedArtifact(mockInput);
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
  assert.ok(
    report.actions.some(
      (a) => a.ruleId === 'ha:switch_binary_current' && a.actionType === 'device-identity',
    ),
  );
  assert.equal(
    profile.capabilities.some((c) => c.capabilityId === 'alarm_contact'),
    false,
  );
  assert.ok(
    report.actions.some(
      (a) =>
        a.ruleId === 'ha:contact_like_binary_without_target' && a.reason === 'rule-not-matched',
    ),
  );
});

test('translateHaMockDiscoveryToGeneratedArtifact validates input shape with explicit error', () => {
  assert.throws(
    () =>
      compiler.translateHaMockDiscoveryToGeneratedArtifact({
        schemaVersion: 'ha-mock-discovery/v1',
        source: { generatedAt: '2026-02-24T00:00:00Z', sourceRef: 'x' },
        definitions: [{ id: 'bad', sourceRef: 'x', match: { commandClass: '37' }, output: {} }],
      }),
    (error) =>
      error &&
      error.name === 'HaMockTranslationError' &&
      /match\.commandClass must be a number/i.test(error.message),
  );
});

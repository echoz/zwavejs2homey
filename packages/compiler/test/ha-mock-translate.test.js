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
  assert.equal(result.artifact.rules.length, 1);
  assert.deepEqual(result.artifact.rules[0], {
    ruleId: 'ha:switch_binary_current',
    layer: 'ha-derived',
    value: {
      commandClass: [37],
      endpoint: [0],
      property: ['currentValue'],
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
  assert.deepEqual(result.report, {
    translated: 1,
    skipped: 0,
    unsupported: [{ id: 'unsupported_no_output', reason: 'no-supported-output' }],
    sourceRefs: ['discovery.py#switch_binary_current', 'discovery.py#unsupported_no_output'],
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
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');
const realProbe = require('./fixtures/ha-extracted-discovery-real-probe-v1.json');

test('real-source extracted probe fixture translates to generated ha-derived rules', () => {
  const result = compiler.translateHaExtractedDiscoveryToGeneratedArtifact(realProbe);

  assert.equal(result.artifact.schemaVersion, 'ha-derived-rules/v1');
  assert.equal(result.report.unsupported.length, 0);
  assert.equal(result.report.skipped, 0);
  assert.equal(result.artifact.rules.length, 2);

  const byId = Object.fromEntries(result.artifact.rules.map((rule) => [rule.ruleId, rule]));

  assert.deepEqual(byId['ha:ha_probe_honeywell_fan_39358'].device, {
    manufacturerId: [57],
    productId: [12593],
    productType: [18756],
  });
  assert.deepEqual(byId['ha:ha_probe_honeywell_fan_39358'].constraints, {
    requiredValues: [{ commandClass: [38], endpoint: [0], property: ['targetValue'] }],
  });

  assert.deepEqual(byId['ha:ha_probe_thermostat_setpoint_without_mode'].constraints, {
    absentValues: [{ commandClass: [64], endpoint: [0], property: ['mode'] }],
  });
});

test('real-source extracted probe fixture compiles with expected companion-constraint behavior', () => {
  const translated = compiler.translateHaExtractedDiscoveryToGeneratedArtifact(realProbe);

  const fanDevice = {
    deviceKey: 'fan-probe',
    manufacturerId: 57,
    productId: 12593,
    productType: 18756,
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
  };
  const thermostatWithMode = {
    deviceKey: 'thermostat-probe',
    values: [
      {
        valueId: { commandClass: 67, endpoint: 0, property: 'setpoint' },
        metadata: { type: 'number', readable: true, writeable: true },
      },
      {
        valueId: { commandClass: 64, endpoint: 0, property: 'mode' },
        metadata: { type: 'number', readable: true, writeable: true },
      },
    ],
  };

  const fanResult = compiler.compileProfilePlan(fanDevice, translated.artifact.rules);
  assert.equal(
    fanResult.profile.capabilities.some((c) => c.capabilityId === 'dim'),
    true,
  );

  const thermostatResult = compiler.compileProfilePlan(
    thermostatWithMode,
    translated.artifact.rules,
  );
  assert.equal(
    thermostatResult.profile.capabilities.some((c) => c.capabilityId === 'target_temperature'),
    false,
  );
});

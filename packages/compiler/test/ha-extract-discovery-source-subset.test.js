const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

test('extractHaDiscoverySubsetFromSource parses constrained subset and reports unsupported blocks', () => {
  const source = `
ZWaveDiscoverySchema(
    platform=Platform.FAN,
    hint="has_fan_value_mapping",
    manufacturer_id={0x0039},
    product_id={0x3131},
    product_type={0x4944},
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
    required_values=[SWITCH_MULTILEVEL_TARGET_VALUE_SCHEMA],
),
ZWaveDiscoverySchema(
    platform=Platform.SWITCH,
    primary_value=SWITCH_BINARY_CURRENT_VALUE_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.COVER,
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
`;

  const result = compiler.extractHaDiscoverySubsetFromSource(source, 'discovery.py');
  assert.equal(result.report.scannedSchemas, 3);
  assert.equal(result.report.translated, 2);
  assert.equal(result.report.skipped, 1);
  assert.equal(result.artifact.entries.length, 2);
  assert.equal(result.artifact.entries[0].output.homeyClass, 'fan');
  assert.equal(result.artifact.entries[1].output.capabilityId, 'onoff');
  assert.equal(result.report.unsupported[0].reason, 'unsupported-platform');
});

test('extractHaDiscoverySubsetFromFile parses real HA discovery.py probe patterns', () => {
  const discoveryPy = path.join(
    __dirname,
    '../../../docs/external/home-assistant/homeassistant/components/zwave_js/discovery.py',
  );
  const result = compiler.extractHaDiscoverySubsetFromFile(discoveryPy);

  assert.equal(result.report.scannedSchemas > 50, true);
  assert.equal(result.report.translated >= 3, true);
  assert.equal(
    result.artifact.entries.some((entry) => entry.id.includes('has_fan_value_mapping')),
    true,
  );
  assert.equal(
    result.artifact.entries.some((entry) => entry.output.capabilityId === 'target_temperature'),
    true,
  );
});

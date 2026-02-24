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
  assert.equal(result.report.translated, 3);
  assert.equal(result.report.skipped, 0);
  assert.equal(result.artifact.entries.length, 3);
  assert.equal(result.artifact.entries[0].output.homeyClass, 'fan');
  assert.equal(result.artifact.entries[1].output.capabilityId, 'onoff');
  assert.equal(result.artifact.entries[2].output.homeyClass, 'curtain');
  assert.equal(result.artifact.entries[2].output.capabilityId, 'windowcoverings_set');
});

test('extractHaDiscoverySubsetFromSource supports LIGHT and BINARY_SENSOR platform mappings', () => {
  const source = `
ZWaveDiscoverySchema(
    platform=Platform.LIGHT,
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.LIGHT,
    primary_value=SWITCH_BINARY_CURRENT_VALUE_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.BINARY_SENSOR,
    primary_value=ZWaveValueDiscoverySchema(
        command_class={CommandClass.SENSOR_BINARY},
        property={CURRENT_VALUE_PROPERTY},
        type={ValueType.BOOLEAN},
    ),
),
`;
  const result = compiler.extractHaDiscoverySubsetFromSource(source, 'discovery.py');
  assert.equal(result.report.translated, 3);
  assert.equal(result.report.skipped, 0);
  assert.deepEqual(
    result.artifact.entries.map((entry) => ({
      homeyClass: entry.output.homeyClass,
      capabilityId: entry.output.capabilityId,
    })),
    [
      { homeyClass: 'light', capabilityId: 'dim' },
      { homeyClass: 'light', capabilityId: 'onoff' },
      { homeyClass: 'sensor', capabilityId: 'alarm_generic' },
    ],
  );
});

test('extractHaDiscoverySubsetFromSource supports additional platform mappings with existing value schemas', () => {
  const source = `
ZWaveDiscoverySchema(
    platform=Platform.COVER,
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.SENSOR,
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.NUMBER,
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.BUTTON,
    primary_value=SWITCH_BINARY_CURRENT_VALUE_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.SIREN,
    primary_value=SWITCH_BINARY_CURRENT_VALUE_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.HUMIDIFIER,
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
`;
  const result = compiler.extractHaDiscoverySubsetFromSource(source, 'discovery.py');
  assert.equal(result.report.translated, 6);
  assert.equal(result.report.skipped, 0);
  assert.deepEqual(
    result.artifact.entries.map((entry) => ({
      homeyClass: entry.output.homeyClass,
      capabilityId: entry.output.capabilityId,
    })),
    [
      { homeyClass: 'curtain', capabilityId: 'windowcoverings_set' },
      { homeyClass: 'sensor', capabilityId: 'measure_generic' },
      { homeyClass: 'other', capabilityId: 'number_value' },
      { homeyClass: 'button', capabilityId: 'button_action' },
      { homeyClass: 'alarm', capabilityId: 'alarm_siren' },
      { homeyClass: 'humidifier', capabilityId: 'dim' },
    ],
  );
});
test('extractHaDiscoverySubsetFromSource supports inline multi-cc and property-set patterns', () => {
  const source = `
ZWaveDiscoverySchema(
    platform=Platform.LOCK,
    primary_value=ZWaveValueDiscoverySchema(
        command_class={CommandClass.LOCK},
        property={LOCKED_PROPERTY},
        type={ValueType.BOOLEAN},
    ),
),
ZWaveDiscoverySchema(
    platform=Platform.BINARY_SENSOR,
    primary_value=ZWaveValueDiscoverySchema(
        command_class={CommandClass.LOCK, CommandClass.DOOR_LOCK},
        property={DOOR_STATUS_PROPERTY},
        type={ValueType.ANY},
    ),
),
ZWaveDiscoverySchema(
    platform=Platform.SELECT,
    primary_value=ZWaveValueDiscoverySchema(
        command_class={CommandClass.PROTECTION},
        property={LOCAL_PROPERTY, RF_PROPERTY},
        endpoint={2},
        type={ValueType.NUMBER},
    ),
),
`;
  const result = compiler.extractHaDiscoverySubsetFromSource(source, 'discovery.py');
  assert.equal(result.report.translated, 3);
  assert.equal(result.report.skipped, 0);
  assert.deepEqual(
    result.artifact.entries.map((entry) => entry.output.capabilityId),
    ['locked', 'alarm_generic', 'enum_select'],
  );
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
  assert.equal(Array.isArray(result.report.unsupported), true);
  assert.equal(typeof result.report.unsupportedByReason, 'object');
});

test('extractHaDiscoverySubsetFromSource reports granular unsupported primary/companion reasons', () => {
  const source = `
ZWaveDiscoverySchema(
    platform=Platform.FAN,
    primary_value=UNSUPPORTED_ALIAS_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.SWITCH,
    primary_value=SWITCH_BINARY_CURRENT_VALUE_SCHEMA,
    required_values=[UNSUPPORTED_ALIAS_SCHEMA],
),
`;
  const result = compiler.extractHaDiscoverySubsetFromSource(source, 'discovery.py');
  assert.equal(result.report.translated, 0);
  assert.equal(result.report.skipped, 2);
  assert.equal(result.report.unsupportedByReason['unsupported-primary-value-alias'], 1);
  assert.equal(result.report.unsupportedByReason['unsupported-companion-alias'], 1);
});

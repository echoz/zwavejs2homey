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

test('extractHaDiscoverySubsetFromSource extracts semantics and inline readable/writeable metadata', () => {
  const source = `
ZWaveDiscoverySchema(
    platform=Platform.BINARY_SENSOR,
    primary_value=ZWaveValueDiscoverySchema(
        command_class={CommandClass.INDICATOR},
        type={ValueType.BOOLEAN},
        readable=True,
        writeable=False,
    ),
    allow_multi=True,
    assumed_state=True,
    entity_registry_enabled_default=False,
),
`;
  const result = compiler.extractHaDiscoverySubsetFromSource(source, 'discovery.py');
  assert.equal(result.report.translated, 1);
  const entry = result.artifact.entries[0];
  assert.deepEqual(entry.semantics, {
    allowMulti: true,
    assumedState: true,
    entityRegistryEnabledDefault: false,
  });
  assert.deepEqual(entry.valueMatch.metadata, {
    type: 'boolean',
    readable: true,
    writeable: false,
  });
});

test('extractHaDiscoverySubsetFromSource handles nested parentheses in schema bodies', () => {
  const source = `
ZWaveDiscoverySchema(
    platform=Platform.SWITCH,
    primary_value=SWITCH_BINARY_CURRENT_VALUE_SCHEMA,
    firmware_version=FirmwareVersionRange(min_version="1.0", max_version="2.0"),
),
ZWaveDiscoverySchema(
    platform=Platform.LIGHT,
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
`;
  const result = compiler.extractHaDiscoverySubsetFromSource(source, 'discovery.py');
  assert.equal(result.report.scannedSchemas, 2);
  assert.equal(result.report.translated, 2);
  assert.equal(result.report.skipped, 0);
  assert.equal(result.artifact.entries[0].output.capabilityId, 'onoff');
  assert.deepEqual(result.artifact.entries[0].deviceMatch?.firmwareVersionRange, {
    min: '1.0',
    max: '2.0',
  });
  assert.equal(result.artifact.entries[1].output.capabilityId, 'dim');
});

test('extractHaDiscoverySubsetFromSource parses device class constraints', () => {
  const source = `
ZWaveDiscoverySchema(
    platform=Platform.COVER,
    hint="multilevel_switch",
    device_class_generic={"Multilevel Switch"},
    device_class_specific={"Motor Control Class A", "Motor Control Class B"},
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
`;
  const result = compiler.extractHaDiscoverySubsetFromSource(source, 'discovery.py');
  assert.equal(result.report.translated, 1);
  assert.equal(result.report.skipped, 0);
  assert.deepEqual(result.artifact.entries[0].deviceMatch, {
    deviceClassGeneric: ['Multilevel Switch'],
    deviceClassSpecific: ['Motor Control Class A', 'Motor Control Class B'],
  });
});

test('extractHaDiscoverySubsetFromSource preserves alias property_key sets for cover schemas', () => {
  const source = `
ZWaveDiscoverySchema(
    platform=Platform.COVER,
    hint="cover_window_covering",
    primary_value=WINDOW_COVERING_COVER_CURRENT_VALUE_SCHEMA,
),
ZWaveDiscoverySchema(
    platform=Platform.COVER,
    hint="cover_tilt_window_covering",
    primary_value=WINDOW_COVERING_SLAT_CURRENT_VALUE_SCHEMA,
    absent_values=[WINDOW_COVERING_COVER_CURRENT_VALUE_SCHEMA],
),
`;
  const result = compiler.extractHaDiscoverySubsetFromSource(source, 'discovery.py');
  assert.equal(result.report.translated, 2);
  assert.equal(result.report.skipped, 0);

  const [cover, tilt] = result.artifact.entries;
  assert.equal(Array.isArray(cover.valueMatch.propertyKey), true);
  assert.equal(cover.valueMatch.propertyKey.length > 10, true);
  assert.equal(cover.valueMatch.propertyKey.includes('inboundTop'), true);
  assert.equal(Array.isArray(tilt.valueMatch.propertyKey), true);
  assert.equal(tilt.valueMatch.propertyKey.includes('horizontalSlatsAngle'), true);
  assert.equal(Array.isArray(tilt.companions?.absentValues?.[0]?.propertyKey), true);
  assert.equal(tilt.companions?.absentValues?.[0]?.propertyKey.includes('inboundTop'), true);
  assert.notDeepEqual(tilt.valueMatch.propertyKey, tilt.companions?.absentValues?.[0]?.propertyKey);
});

test('extractHaDiscoverySubsetFromFile parses pinned HA discovery.py with full current coverage', () => {
  const discoveryPy = path.join(
    __dirname,
    '../../../docs/external/home-assistant/homeassistant/components/zwave_js/discovery.py',
  );
  const result = compiler.extractHaDiscoverySubsetFromFile(discoveryPy);

  assert.equal(result.report.scannedSchemas >= 70, true);
  assert.equal(result.report.translated, result.report.scannedSchemas);
  assert.equal(result.report.skipped, 0);
  assert.equal(
    result.artifact.entries.some((entry) => entry.id.includes('has_fan_value_mapping')),
    true,
  );
  assert.equal(
    result.artifact.entries.some((entry) => entry.output.capabilityId === 'target_temperature'),
    true,
  );
  assert.equal(
    result.artifact.entries.some(
      (entry) =>
        entry.semantics?.allowMulti === true ||
        entry.semantics?.entityRegistryEnabledDefault === false,
    ),
    true,
  );
  assert.equal(Array.isArray(result.report.unsupported), true);
  assert.deepEqual(result.report.unsupportedByReason, {});
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

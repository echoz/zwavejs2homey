const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCapabilityRuntimeVerticals,
  extractValueResultPayload,
  coerceCapabilityInboundValue,
  coerceCapabilityOutboundValue,
  getSpecializedCapabilityCoercions,
  getSupportedInboundTransformRefs,
  getSupportedOutboundTransformRefs,
  selectorMatchesNodeValueUpdatedEvent,
} = require('../node-runtime.js');

test('node-runtime publishes supported transform refs and specialized coercion ids', () => {
  assert.deepEqual(getSupportedInboundTransformRefs(), [
    'zwave_battery_level_to_homey_alarm_battery',
    'zwave_door_status_to_homey_alarm_contact',
    'zwave_level_0_99_to_homey_dim',
    'zwave_level_nonzero_to_homey_onoff',
    'zwave_notification_nonzero_to_homey_alarm_generic',
    'zwjs_notification_to_homey_alarm_tamper',
  ]);
  assert.deepEqual(getSupportedOutboundTransformRefs(), [
    'homey_dim_to_zwave_level_0_99',
    'homey_onoff_to_zwave_level_0_99',
  ]);
  assert.deepEqual(getSpecializedCapabilityCoercions(), [
    'enum_select',
    'lock_mode',
    'locked',
    'measure_battery',
  ]);
});

test('extractCapabilityRuntimeVerticals returns value/set_value runtime-compatible mappings', () => {
  const slices = extractCapabilityRuntimeVerticals({
    capabilities: [
      {
        capabilityId: 'onoff',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        },
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
        },
      },
      {
        capabilityId: 'measure_power',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 50, endpoint: 0, property: 'value' },
        },
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 112, endpoint: 0, property: 'targetValue' },
        },
      },
      {
        capabilityId: 'dim',
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 38, endpoint: 0, property: 'targetValue' },
          transformRef: 'homey_dim_to_zwave_level_0_99',
        },
      },
      {
        capabilityId: 'windowcoverings_set',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 38, endpoint: 0, property: 'currentValue' },
          transformRef: 'zwave_level_0_99_to_homey_dim',
        },
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 38, endpoint: 0, property: 'targetValue' },
          transformRef: 'homey_dim_to_zwave_level_0_99',
        },
      },
      {
        capabilityId: 'locked',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 118, endpoint: 0, property: 'locked' },
        },
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 118, endpoint: 0, property: 'locked' },
        },
      },
      {
        capabilityId: 'ignored_event',
        inboundMapping: {
          kind: 'event',
          selector: { eventType: 'node.notification' },
        },
      },
      {
        capabilityId: 'ignored_command',
        outboundMapping: {
          kind: 'zwjs_command',
          target: { command: 'node.foo' },
        },
      },
    ],
  });

  assert.deepEqual(slices, [
    {
      capabilityId: 'onoff',
      inboundSelector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
      inboundTransformRef: undefined,
      outboundTarget: { commandClass: 37, endpoint: 0, property: 'targetValue' },
      outboundTransformRef: undefined,
    },
    {
      capabilityId: 'measure_power',
      inboundSelector: { commandClass: 50, endpoint: 0, property: 'value' },
      inboundTransformRef: undefined,
      outboundTarget: { commandClass: 112, endpoint: 0, property: 'targetValue' },
      outboundTransformRef: undefined,
    },
    {
      capabilityId: 'dim',
      inboundSelector: undefined,
      inboundTransformRef: undefined,
      outboundTarget: { commandClass: 38, endpoint: 0, property: 'targetValue' },
      outboundTransformRef: 'homey_dim_to_zwave_level_0_99',
    },
    {
      capabilityId: 'windowcoverings_set',
      inboundSelector: { commandClass: 38, endpoint: 0, property: 'currentValue' },
      inboundTransformRef: 'zwave_level_0_99_to_homey_dim',
      outboundTarget: { commandClass: 38, endpoint: 0, property: 'targetValue' },
      outboundTransformRef: 'homey_dim_to_zwave_level_0_99',
    },
    {
      capabilityId: 'locked',
      inboundSelector: { commandClass: 118, endpoint: 0, property: 'locked' },
      inboundTransformRef: undefined,
      outboundTarget: { commandClass: 118, endpoint: 0, property: 'locked' },
      outboundTransformRef: undefined,
    },
    {
      capabilityId: 'ignored_event',
      inboundSelector: undefined,
      inboundEventSelector: { eventType: 'node.notification' },
      inboundTransformRef: undefined,
      outboundTarget: undefined,
      outboundTransformRef: undefined,
    },
  ]);
});

test('extractCapabilityRuntimeVerticals is capability-agnostic and keeps valid selector/target pairs', () => {
  const slices = extractCapabilityRuntimeVerticals({
    capabilities: [
      {
        capabilityId: 'onoff',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 50, endpoint: 0, property: 'value' },
        },
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 50, endpoint: 0, property: 'value' },
        },
      },
      {
        capabilityId: 'dim',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        },
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
        },
      },
      {
        capabilityId: 'windowcoverings_set',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        },
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
        },
      },
      {
        capabilityId: 'locked',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 118, endpoint: 0, property: 'locked' },
        },
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 98, endpoint: 0, property: 'currentMode' },
        },
      },
    ],
  });

  assert.deepEqual(slices, [
    {
      capabilityId: 'onoff',
      inboundSelector: { commandClass: 50, endpoint: 0, property: 'value' },
      inboundTransformRef: undefined,
      outboundTarget: { commandClass: 50, endpoint: 0, property: 'value' },
      outboundTransformRef: undefined,
    },
    {
      capabilityId: 'dim',
      inboundSelector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
      inboundTransformRef: undefined,
      outboundTarget: { commandClass: 37, endpoint: 0, property: 'targetValue' },
      outboundTransformRef: undefined,
    },
    {
      capabilityId: 'windowcoverings_set',
      inboundSelector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
      inboundTransformRef: undefined,
      outboundTarget: { commandClass: 37, endpoint: 0, property: 'targetValue' },
      outboundTransformRef: undefined,
    },
    {
      capabilityId: 'locked',
      inboundSelector: { commandClass: 118, endpoint: 0, property: 'locked' },
      inboundTransformRef: undefined,
      outboundTarget: { commandClass: 98, endpoint: 0, property: 'currentMode' },
      outboundTransformRef: undefined,
    },
  ]);
});

test('extractCapabilityRuntimeVerticals skips invalid capability ids and malformed selector/target shapes', () => {
  const slices = extractCapabilityRuntimeVerticals({
    capabilities: [
      {
        capabilityId: 123,
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 50, endpoint: 0, property: 'value' },
        },
      },
      {
        capabilityId: 'measure_power',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 'not-a-number', endpoint: 0, property: 'value' },
        },
      },
      {
        capabilityId: 'measure_power',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 50, endpoint: 0, property: 'value' },
        },
      },
      {
        capabilityId: 'onoff',
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 37, endpoint: 'bad', property: 'targetValue' },
        },
      },
    ],
  });

  assert.deepEqual(slices, [
    {
      capabilityId: 'measure_power',
      inboundSelector: { commandClass: 50, endpoint: 0, property: 'value' },
      inboundTransformRef: undefined,
      outboundTarget: undefined,
      outboundTransformRef: undefined,
    },
  ]);
});

test('extractValueResultPayload unwraps zwjs value envelopes', () => {
  assert.equal(extractValueResultPayload({ value: true }), true);
  assert.equal(extractValueResultPayload(false), false);
});

test('coerceCapability inbound/outbound uses transform refs and generic pass-through', () => {
  assert.equal(coerceCapabilityInboundValue('onoff', { value: 1 }), 1);
  assert.equal(coerceCapabilityInboundValue('onoff', { value: 1 }, undefined, 'boolean'), true);
  assert.equal(
    coerceCapabilityInboundValue('dim', { value: 99 }, 'zwave_level_0_99_to_homey_dim'),
    1,
  );
  assert.equal(
    coerceCapabilityInboundValue(
      'windowcoverings_set',
      { value: 99 },
      'zwave_level_0_99_to_homey_dim',
    ),
    1,
  );
  assert.equal(
    coerceCapabilityInboundValue('onoff', { value: 99 }, 'zwave_level_nonzero_to_homey_onoff'),
    true,
  );
  assert.equal(
    coerceCapabilityInboundValue('onoff', { value: 0 }, 'zwave_level_nonzero_to_homey_onoff'),
    false,
  );
  assert.equal(coerceCapabilityInboundValue('locked', { value: 1 }), true);
  assert.equal(coerceCapabilityInboundValue('measure_power', { value: 44.2 }), 44.2);
  assert.equal(
    coerceCapabilityInboundValue('target_temperature', { value: '21.75' }, undefined, 'number'),
    21.75,
  );
  assert.equal(
    coerceCapabilityInboundValue('alarm_contact', { value: 255 }, undefined, 'boolean'),
    true,
  );
  assert.equal(
    coerceCapabilityInboundValue('thermostat_mode', { value: 'heat' }, undefined, 'string'),
    'heat',
  );
  assert.equal(
    coerceCapabilityInboundValue('measure_luminance', { value: '123.4' }, undefined, 'number'),
    123.4,
  );
  assert.equal(
    coerceCapabilityInboundValue('measure_battery', { value: '88' }, undefined, 'number'),
    88,
  );
  assert.equal(
    coerceCapabilityInboundValue(
      'alarm_battery',
      { value: '88' },
      'zwave_battery_level_to_homey_alarm_battery',
    ),
    false,
  );
  assert.equal(
    coerceCapabilityInboundValue(
      'alarm_battery',
      { value: '15' },
      'zwave_battery_level_to_homey_alarm_battery',
    ),
    true,
  );
  assert.equal(
    coerceCapabilityInboundValue(
      'alarm_contact',
      { value: 'open' },
      'zwave_door_status_to_homey_alarm_contact',
    ),
    true,
  );
  assert.equal(
    coerceCapabilityInboundValue(
      'alarm_contact',
      { value: 'closed' },
      'zwave_door_status_to_homey_alarm_contact',
    ),
    false,
  );
  assert.equal(
    coerceCapabilityInboundValue(
      'alarm_generic',
      { value: 11 },
      'zwave_notification_nonzero_to_homey_alarm_generic',
    ),
    true,
  );
  assert.equal(
    coerceCapabilityInboundValue(
      'alarm_generic',
      { value: 0 },
      'zwave_notification_nonzero_to_homey_alarm_generic',
    ),
    false,
  );
  assert.equal(
    coerceCapabilityInboundValue(
      'alarm_tamper',
      {
        type: 'zwjs.event.node.notification',
        event: { nodeId: 24, args: { eventLabel: 'Tampering, product moved' } },
      },
      'zwjs_notification_to_homey_alarm_tamper',
    ),
    true,
  );
  assert.equal(
    coerceCapabilityInboundValue(
      'alarm_tamper',
      {
        type: 'zwjs.event.node.notification',
        event: { nodeId: 24, args: { eventLabel: 'Idle' } },
      },
      'zwjs_notification_to_homey_alarm_tamper',
    ),
    false,
  );
  assert.equal(
    coerceCapabilityInboundValue('measure_battery', { value: 255 }, undefined, 'number'),
    1,
  );
  assert.equal(
    coerceCapabilityInboundValue('measure_battery', { value: 143 }, undefined, 'number'),
    100,
  );
  assert.equal(
    coerceCapabilityInboundValue('meter_power', { value: '12.5' }, undefined, 'number'),
    12.5,
  );
  assert.equal(
    coerceCapabilityInboundValue('enum_select', { value: 'secured' }, undefined, 'string'),
    'secured',
  );
  assert.equal(coerceCapabilityInboundValue('enum_select', { value: 3 }, undefined, 'number'), '3');
  assert.equal(coerceCapabilityInboundValue('lock_mode', { value: 3 }, undefined, 'number'), '3');
  assert.equal(coerceCapabilityInboundValue('locked', { value: 'secured' }), true);
  assert.equal(coerceCapabilityInboundValue('locked', { value: 'unsecured' }), false);
  assert.equal(
    coerceCapabilityInboundValue('alarm_motion', { value: 255 }, undefined, 'boolean'),
    true,
  );
  assert.equal(
    coerceCapabilityInboundValue('measure_power', { value: { nested: true } }),
    undefined,
  );

  assert.equal(coerceCapabilityOutboundValue('onoff', false), false);
  assert.equal(coerceCapabilityOutboundValue('onoff', 0, undefined, 'boolean'), false);
  assert.equal(coerceCapabilityOutboundValue('dim', 0.5, 'homey_dim_to_zwave_level_0_99'), 50);
  assert.equal(
    coerceCapabilityOutboundValue('windowcoverings_set', 0.5, 'homey_dim_to_zwave_level_0_99'),
    50,
  );
  assert.equal(coerceCapabilityOutboundValue('onoff', true, 'homey_onoff_to_zwave_level_0_99'), 99);
  assert.equal(coerceCapabilityOutboundValue('onoff', false, 'homey_onoff_to_zwave_level_0_99'), 0);
  assert.equal(coerceCapabilityOutboundValue('locked', true), true);
  assert.equal(coerceCapabilityOutboundValue('locked', true, undefined, 'string'), 'secured');
  assert.equal(coerceCapabilityOutboundValue('locked', false, undefined, 'string'), 'unsecured');
  assert.equal(coerceCapabilityOutboundValue('locked', true, undefined, 'number'), 255);
  assert.equal(coerceCapabilityOutboundValue('locked', false, undefined, 'number'), 0);
  assert.equal(coerceCapabilityOutboundValue('measure_power', 13.4), 13.4);
  assert.equal(
    coerceCapabilityOutboundValue('target_temperature', '22.5', undefined, 'number'),
    22.5,
  );
  assert.equal(coerceCapabilityOutboundValue('alarm_contact', 0, undefined, 'boolean'), false);
  assert.equal(
    coerceCapabilityOutboundValue('thermostat_mode', { value: 'cool' }, undefined, 'string'),
    'cool',
  );
  assert.equal(
    coerceCapabilityOutboundValue('measure_luminance', '98.6', undefined, 'number'),
    98.6,
  );
  assert.equal(coerceCapabilityOutboundValue('meter_power', '13.2', undefined, 'number'), 13.2);
  assert.equal(
    coerceCapabilityOutboundValue('enum_select', { value: 'unsecured' }, undefined, 'string'),
    'unsecured',
  );
  assert.equal(coerceCapabilityOutboundValue('lock_mode', { value: '2' }, undefined, 'number'), 2);
  assert.equal(
    coerceCapabilityOutboundValue('enum_select', { value: '2' }, undefined, 'number'),
    2,
  );
  assert.equal(coerceCapabilityOutboundValue('enum_select', 4, undefined, 'string'), '4');
  assert.equal(
    coerceCapabilityOutboundValue('measure_battery', { value: 140 }, undefined, 'number'),
    100,
  );
  assert.equal(coerceCapabilityOutboundValue('alarm_motion', 'off', undefined, 'boolean'), false);
  assert.equal(coerceCapabilityOutboundValue('measure_power', { invalid: true }), undefined);
  assert.equal(
    coerceCapabilityOutboundValue('measure_luminance', { invalid: true }, undefined, 'number'),
    undefined,
  );
});

test('selectorMatchesNodeValueUpdatedEvent matches compatible selector payloads', () => {
  const selector = {
    commandClass: 37,
    endpoint: 0,
    property: 'currentValue',
  };
  const eventPayload = {
    nodeId: 5,
    args: {
      commandClass: 37,
      endpoint: 0,
      propertyName: 'currentValue',
      newValue: true,
    },
  };
  assert.equal(selectorMatchesNodeValueUpdatedEvent(selector, eventPayload), true);

  assert.equal(
    selectorMatchesNodeValueUpdatedEvent(
      { commandClass: 37, endpoint: 2, property: 'currentValue' },
      eventPayload,
    ),
    false,
  );
  assert.equal(
    selectorMatchesNodeValueUpdatedEvent(
      { commandClass: 37, endpoint: 0, property: 'targetValue' },
      eventPayload,
    ),
    false,
  );

  assert.equal(
    selectorMatchesNodeValueUpdatedEvent(
      { commandClass: 67, endpoint: 0, property: 'value', propertyKey: '1' },
      {
        nodeId: 5,
        args: {
          commandClass: 67,
          endpoint: 0,
          propertyName: 'value',
          propertyKeyName: '1',
          newValue: 22.5,
        },
      },
    ),
    true,
  );

  assert.equal(
    selectorMatchesNodeValueUpdatedEvent(
      { commandClass: 49, endpoint: 0, property: 1 },
      {
        nodeId: 5,
        args: {
          commandClass: 49,
          endpoint: 0,
          propertyName: '1',
          newValue: '98.6',
        },
      },
    ),
    true,
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCapabilityRuntimeVerticals,
  extractValueResultPayload,
  coerceCapabilityInboundValue,
  coerceCapabilityOutboundValue,
  selectorMatchesNodeValueUpdatedEvent,
} = require('../node-runtime.js');

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
  assert.equal(coerceCapabilityInboundValue('locked', { value: 1 }), 1);
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
  assert.equal(coerceCapabilityOutboundValue('locked', true), true);
  assert.equal(coerceCapabilityOutboundValue('measure_power', 13.4), 13.4);
  assert.equal(
    coerceCapabilityOutboundValue('target_temperature', '22.5', undefined, 'number'),
    22.5,
  );
  assert.equal(coerceCapabilityOutboundValue('alarm_contact', 0, undefined, 'boolean'), false);
  assert.equal(coerceCapabilityOutboundValue('measure_power', { invalid: true }), undefined);
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
});

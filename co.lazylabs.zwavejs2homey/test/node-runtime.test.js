const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCapabilityRuntimeVerticals,
  coerceDimInboundValue,
  coerceDimOutboundValue,
  extractOnOffCapabilityVertical,
  extractDimCapabilityVertical,
  extractValueResultPayload,
  coerceOnOffValue,
  coerceCapabilityInboundValue,
  coerceCapabilityOutboundValue,
  selectorMatchesNodeValueUpdatedEvent,
} = require('../node-runtime.js');

function createOnOffProfile() {
  return {
    capabilities: [
      {
        capabilityId: 'onoff',
        inboundMapping: {
          kind: 'value',
          selector: {
            commandClass: 37,
            endpoint: 0,
            property: 'currentValue',
          },
        },
        outboundMapping: {
          kind: 'set_value',
          target: {
            commandClass: 37,
            endpoint: 0,
            property: 'targetValue',
          },
        },
      },
    ],
  };
}

function createDimProfile() {
  return {
    capabilities: [
      {
        capabilityId: 'dim',
        inboundMapping: {
          kind: 'value',
          selector: {
            commandClass: 38,
            endpoint: 0,
            property: 'currentValue',
          },
          transformRef: 'zwave_level_0_99_to_homey_dim',
        },
        outboundMapping: {
          kind: 'set_value',
          target: {
            commandClass: 38,
            endpoint: 0,
            property: 'targetValue',
          },
          transformRef: 'homey_dim_to_zwave_level_0_99',
        },
      },
    ],
  };
}

test('extractOnOffCapabilityVertical returns the onoff slice when profile is compatible', () => {
  const slice = extractOnOffCapabilityVertical(createOnOffProfile());
  assert.deepEqual(slice, {
    capabilityId: 'onoff',
    inboundSelector: {
      commandClass: 37,
      endpoint: 0,
      property: 'currentValue',
    },
    outboundTarget: {
      commandClass: 37,
      endpoint: 0,
      property: 'targetValue',
    },
  });
});

test('extractDimCapabilityVertical returns the dim slice when profile is compatible', () => {
  const slice = extractDimCapabilityVertical(createDimProfile());
  assert.deepEqual(slice, {
    capabilityId: 'dim',
    inboundSelector: {
      commandClass: 38,
      endpoint: 0,
      property: 'currentValue',
    },
    inboundTransformRef: 'zwave_level_0_99_to_homey_dim',
    outboundTarget: {
      commandClass: 38,
      endpoint: 0,
      property: 'targetValue',
    },
    outboundTransformRef: 'homey_dim_to_zwave_level_0_99',
  });
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
      outboundTarget: undefined,
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

test('extractCapabilityRuntimeVerticals enforces capability contracts for known verticals', () => {
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
      capabilityId: 'locked',
      inboundSelector: { commandClass: 118, endpoint: 0, property: 'locked' },
      inboundTransformRef: undefined,
      outboundTarget: undefined,
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

test('extractOnOffCapabilityVertical rejects incompatible capability mappings', () => {
  assert.equal(extractOnOffCapabilityVertical(null), null);
  assert.equal(extractOnOffCapabilityVertical({ capabilities: [] }), null);
  assert.equal(
    extractOnOffCapabilityVertical({
      capabilities: [
        {
          capabilityId: 'onoff',
          inboundMapping: { kind: 'event', selector: { eventType: 'x' } },
          outboundMapping: {
            kind: 'set_value',
            target: { commandClass: 37, property: 'targetValue' },
          },
        },
      ],
    }),
    null,
  );
  assert.equal(
    extractOnOffCapabilityVertical({
      capabilities: [
        {
          capabilityId: 'onoff',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 38, property: 'currentValue' },
          },
          outboundMapping: {
            kind: 'set_value',
            target: { commandClass: 38, property: 'targetValue' },
          },
        },
      ],
    }),
    null,
  );
});

test('extractDimCapabilityVertical rejects incompatible dim mappings', () => {
  assert.equal(extractDimCapabilityVertical(null), null);
  assert.equal(extractDimCapabilityVertical({ capabilities: [] }), null);
  assert.equal(
    extractDimCapabilityVertical({
      capabilities: [
        {
          capabilityId: 'dim',
          inboundMapping: { kind: 'event', selector: { eventType: 'x' } },
          outboundMapping: {
            kind: 'set_value',
            target: { commandClass: 38, property: 'targetValue' },
          },
        },
      ],
    }),
    null,
  );
  assert.equal(
    extractDimCapabilityVertical({
      capabilities: [
        {
          capabilityId: 'dim',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, property: 'currentValue' },
          },
          outboundMapping: {
            kind: 'set_value',
            target: { commandClass: 37, property: 'targetValue' },
          },
        },
      ],
    }),
    null,
  );
});

test('extractValueResultPayload and coerceOnOffValue normalize zwjs value envelopes', () => {
  assert.equal(extractValueResultPayload({ value: true }), true);
  assert.equal(extractValueResultPayload(false), false);
  assert.equal(coerceOnOffValue({ value: true }), true);
  assert.equal(coerceOnOffValue({ value: 0 }), false);
  assert.equal(coerceOnOffValue({ value: 255 }), true);
  assert.equal(coerceOnOffValue('off'), false);
  assert.equal(coerceOnOffValue('on'), true);
  assert.equal(coerceOnOffValue('1'), true);
  assert.equal(coerceOnOffValue('0'), false);
  assert.equal(coerceOnOffValue('unknown'), undefined);
});

test('coerceDim inbound/outbound values with transform refs and fallbacks', () => {
  assert.equal(coerceDimInboundValue({ value: 0 }, 'zwave_level_0_99_to_homey_dim'), 0);
  assert.equal(coerceDimInboundValue({ value: 99 }, 'zwave_level_0_99_to_homey_dim'), 1);
  assert.equal(coerceDimInboundValue({ value: 49.5 }, 'zwave_level_0_99_to_homey_dim'), 0.5);
  assert.equal(coerceDimInboundValue({ value: 255 }), 1);
  assert.equal(coerceDimInboundValue({ value: 0.25 }), 0.25);

  assert.equal(coerceDimOutboundValue(0, 'homey_dim_to_zwave_level_0_99'), 0);
  assert.equal(coerceDimOutboundValue(1, 'homey_dim_to_zwave_level_0_99'), 99);
  assert.equal(coerceDimOutboundValue(0.5, 'homey_dim_to_zwave_level_0_99'), 50);
  assert.equal(coerceDimOutboundValue(75), 75);
  assert.equal(coerceDimOutboundValue('0.1', 'homey_dim_to_zwave_level_0_99'), 10);
  assert.equal(coerceDimOutboundValue('x', 'homey_dim_to_zwave_level_0_99'), undefined);
});

test('coerceCapability inbound/outbound delegates known verticals and filters unsupported values', () => {
  assert.equal(coerceCapabilityInboundValue('onoff', { value: 1 }), true);
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
  assert.equal(coerceCapabilityInboundValue('locked', { value: 1 }), true);
  assert.equal(coerceCapabilityInboundValue('measure_power', { value: 44.2 }), 44.2);
  assert.equal(
    coerceCapabilityInboundValue('measure_power', { value: { nested: true } }),
    undefined,
  );

  assert.equal(coerceCapabilityOutboundValue('onoff', 0), false);
  assert.equal(coerceCapabilityOutboundValue('dim', 0.5, 'homey_dim_to_zwave_level_0_99'), 50);
  assert.equal(
    coerceCapabilityOutboundValue('windowcoverings_set', 0.5, 'homey_dim_to_zwave_level_0_99'),
    50,
  );
  assert.equal(coerceCapabilityOutboundValue('locked', true), true);
  assert.equal(coerceCapabilityOutboundValue('measure_power', 13.4), undefined);
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

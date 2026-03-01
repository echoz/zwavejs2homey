const test = require('node:test');
const assert = require('node:assert/strict');
const {
  coerceDimInboundValue,
  coerceDimOutboundValue,
  extractOnOffCapabilityVertical,
  extractDimCapabilityVertical,
  extractValueResultPayload,
  coerceOnOffValue,
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

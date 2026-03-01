const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractOnOffCapabilityVertical,
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

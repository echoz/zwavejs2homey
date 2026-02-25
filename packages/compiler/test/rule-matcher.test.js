const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist');

function makeDevice() {
  return {
    deviceKey: 'mfg-1-prod-2-type-3',
    manufacturerId: 1,
    productType: 3,
    productId: 2,
    firmwareVersion: '1.2.3',
    deviceClassGeneric: 'Multilevel Switch',
    deviceClassSpecific: 'Multilevel Power Switch',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'targetValue' },
        metadata: { type: 'boolean', readable: true, writeable: true },
      },
      {
        valueId: { commandClass: 50, endpoint: 0, property: 'value', propertyKey: 0 },
        metadata: { type: 'number', readable: true, writeable: false },
      },
    ],
  };
}

test('matchesDevice checks ids and firmware range', () => {
  const device = makeDevice();
  assert.equal(
    compiler.matchesDevice(device, {
      manufacturerId: [1],
      productId: [2],
      productType: [3],
      firmwareVersionRange: { min: '1.0.0', max: '1.9.9' },
      deviceClassGeneric: ['multilevel switch'],
      deviceClassSpecific: ['Multilevel Power Switch'],
    }),
    true,
  );
  assert.equal(compiler.matchesDevice(device, { firmwareVersionRange: { min: '2.0.0' } }), false);
  assert.equal(
    compiler.matchesDevice(device, { deviceClassSpecific: ['Motor Control Class A'] }),
    false,
  );
});

test('matchesValue checks command class/property/propertyKey and metadata predicates', () => {
  const [current, target, meter] = makeDevice().values;
  assert.equal(
    compiler.matchesValue(current, {
      commandClass: [37],
      property: ['currentValue'],
      metadataType: ['boolean'],
      readable: true,
      writeable: false,
    }),
    true,
  );
  assert.equal(compiler.matchesValue(target, { writeable: false }), false);
  assert.equal(compiler.matchesValue(meter, { propertyKey: [null] }), false);
  assert.equal(compiler.matchesValue(meter, { propertyKey: [0] }), true);
  assert.equal(compiler.matchesValue(meter, { notPropertyKey: [0] }), false);
});

test('companion constraints support required and absent value matchers', () => {
  const device = makeDevice();
  assert.equal(
    compiler.matchesRuleCompanionConstraints(device, {
      ruleId: 'r1',
      layer: 'ha-derived',
      constraints: {
        requiredValues: [{ commandClass: [37], property: ['targetValue'] }],
        absentValues: [{ commandClass: [112] }],
      },
      actions: [],
    }),
    true,
  );
  assert.equal(
    compiler.matchesRuleCompanionConstraints(device, {
      ruleId: 'r2',
      layer: 'ha-derived',
      constraints: { absentValues: [{ commandClass: [50], property: ['value'] }] },
      actions: [],
    }),
    false,
  );
});

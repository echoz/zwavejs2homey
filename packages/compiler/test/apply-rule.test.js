const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist');

function makeDevice() {
  return {
    deviceKey: 'dev-1',
    manufacturerId: 29,
    productType: 13313,
    productId: 1,
    firmwareVersion: '1.23',
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

test('applyRuleToValue applies matching capability action and emits provenance-based result metadata', () => {
  const device = makeDevice();
  const value = device.values[0];
  const state = compiler.createProfileBuildState();
  const rule = {
    ruleId: 'ha-switch-binary',
    layer: 'ha-derived',
    value: { commandClass: [37], property: ['currentValue'] },
    actions: [
      {
        type: 'capability',
        capabilityId: 'onoff',
        inboundMapping: {
          kind: 'value',
          selector: value.valueId,
        },
      },
    ],
  };

  const results = compiler.applyRuleToValue(state, device, value, rule);
  assert.deepEqual(results, [
    { ruleId: 'ha-switch-binary', actionType: 'capability', applied: true },
  ]);
  const [cap] = compiler.materializeCapabilityPlans(state);
  assert.equal(cap.capabilityId, 'onoff');
  assert.equal(cap.provenance.layer, 'ha-derived');
  assert.match(cap.provenance.reason, /cc=37/);
});

test('applyRuleToValue returns rule-not-matched without mutating state', () => {
  const device = makeDevice();
  const value = device.values[2];
  const state = compiler.createProfileBuildState();
  const rule = {
    ruleId: 'binary-only',
    layer: 'ha-derived',
    value: { commandClass: [37], property: ['currentValue'] },
    actions: [{ type: 'capability', capabilityId: 'onoff' }],
  };
  const results = compiler.applyRuleToValue(state, device, value, rule);
  assert.deepEqual(results, [
    {
      ruleId: 'binary-only',
      actionType: 'capability',
      applied: false,
      reason: 'rule-not-matched',
    },
  ]);
  assert.equal(compiler.materializeCapabilityPlans(state).length, 0);
});

test('end-to-end hand-authored layering example preserves curated onoff and adds generic power', () => {
  const device = makeDevice();
  const state = compiler.createProfileBuildState();

  const rules = [
    {
      ruleId: 'ha-switch-current',
      layer: 'ha-derived',
      value: { commandClass: [37], property: ['currentValue'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'onoff',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
          },
        },
      ],
    },
    {
      ruleId: 'product-switch-target',
      layer: 'project-product',
      device: { manufacturerId: [29], productType: [13313], productId: [1] },
      value: { commandClass: [37], property: ['targetValue'] },
      actions: [
        {
          type: 'capability',
          mode: 'augment',
          capabilityId: 'onoff',
          outboundMapping: {
            kind: 'set_value',
            target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
          },
          flags: { readable: true, writeable: true },
        },
      ],
    },
    {
      ruleId: 'generic-meter-power',
      layer: 'project-generic',
      value: { commandClass: [50], property: ['value'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'measure_power',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 50, endpoint: 0, property: 'value' },
          },
          flags: { readable: true, writeable: false },
        },
      ],
    },
  ];

  for (const value of device.values) {
    for (const rule of rules) {
      compiler.applyRuleToValue(state, device, value, rule);
    }
  }

  const plans = compiler.materializeCapabilityPlans(state);
  const onoff = plans.find((p) => p.capabilityId === 'onoff');
  const power = plans.find((p) => p.capabilityId === 'measure_power');

  assert.equal(onoff.directionality, 'bidirectional');
  assert.equal(onoff.inboundMapping.selector.property, 'currentValue');
  assert.equal(onoff.outboundMapping.target.property, 'targetValue');
  assert.equal(power.directionality, 'inbound-only');
  assert.equal(power.inboundMapping.selector.commandClass, 50);
});

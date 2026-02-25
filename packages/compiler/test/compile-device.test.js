const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist');

function makeDevice() {
  return {
    deviceKey: 'dev-compile-1',
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

test('compileDevice sorts by layer, applies mappings, and returns report entries', () => {
  const device = makeDevice();
  const rules = [
    {
      ruleId: 'generic-onoff-should-not-overwrite',
      layer: 'project-generic',
      value: { commandClass: [37], property: ['currentValue'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'onoff',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, property: 'currentValue' },
          },
        },
      ],
    },
    {
      ruleId: 'ha-onoff',
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
      ruleId: 'product-onoff-write',
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
        },
        { type: 'ignore-value' },
      ],
    },
  ];

  const result = compiler.compileDevice(device, rules);

  assert.deepEqual(
    result.capabilities.map((c) => c.capabilityId),
    ['measure_power', 'onoff'],
  );
  const onoff = result.capabilities.find((c) => c.capabilityId === 'onoff');
  assert.equal(onoff.directionality, 'bidirectional');
  assert.equal(onoff.provenance.layer, 'ha-derived');
  assert.equal(onoff.outboundMapping.kind, 'set_value');

  assert.deepEqual(result.ignoredValues, [
    { commandClass: 50, endpoint: 0, property: 'value', propertyKey: 0 },
  ]);

  assert.ok(
    result.report.actions.some(
      (a) => a.ruleId === 'generic-meter-power' && a.actionType === 'ignore-value' && a.applied,
    ),
  );
  assert.ok(
    result.report.suppressedActions.some(
      (a) => a.ruleId === 'generic-onoff-should-not-overwrite' && a.slot === 'inboundMapping',
    ),
  );
  assert.equal(result.report.summary.appliedActions > 0, true);
  assert.equal(result.report.summary.ignoredValues, 1);
});

test('compileDevice candidate pruning preserves unmatched reporting for commandClass/property/endpoint', () => {
  const device = {
    deviceKey: 'dev-prune-1',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'rule-no-cc-filter',
      layer: 'ha-derived',
      value: { property: ['currentValue'] },
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
      ruleId: 'rule-wrong-cc',
      layer: 'project-product',
      value: { commandClass: [50], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }],
    },
    {
      ruleId: 'rule-wrong-property',
      layer: 'project-product',
      value: { commandClass: [37], property: ['targetValue'] },
      actions: [{ type: 'capability', capabilityId: 'alarm_generic' }],
    },
    {
      ruleId: 'rule-wrong-endpoint',
      layer: 'project-product',
      value: { commandClass: [37], endpoint: [1], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'alarm_motion' }],
    },
  ];

  const result = compiler.compileDevice(device, rules);

  assert.deepEqual(
    result.capabilities.map((capability) => capability.capabilityId),
    ['onoff'],
  );
  assert.equal(result.report.actions.length, 4);
  assert.deepEqual(
    result.report.actions.map((action) => ({
      ruleId: action.ruleId,
      applied: action.applied,
      reason: action.reason,
    })),
    [
      { ruleId: 'rule-no-cc-filter', applied: true, reason: undefined },
      { ruleId: 'rule-wrong-cc', applied: false, reason: 'rule-not-matched' },
      { ruleId: 'rule-wrong-property', applied: false, reason: 'rule-not-matched' },
      { ruleId: 'rule-wrong-endpoint', applied: false, reason: 'rule-not-matched' },
    ],
  );
});

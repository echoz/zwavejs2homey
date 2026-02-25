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

test('compileDevice device-level gating preserves unmatched reporting for device/constraints mismatch', () => {
  const device = makeDevice();
  const rules = [
    {
      ruleId: 'rule-device-mismatch',
      layer: 'project-product',
      device: { manufacturerId: [999] },
      value: { commandClass: [37], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'alarm_generic' }],
    },
    {
      ruleId: 'rule-required-values-mismatch',
      layer: 'project-product',
      value: { commandClass: [37], property: ['currentValue'] },
      constraints: {
        requiredValues: [{ commandClass: [49], endpoint: [0], property: ['Air temperature'] }],
      },
      actions: [{ type: 'capability', capabilityId: 'measure_temperature' }],
    },
    {
      ruleId: 'rule-absent-values-mismatch',
      layer: 'project-product',
      value: { commandClass: [37], property: ['currentValue'] },
      constraints: {
        absentValues: [{ commandClass: [37], endpoint: [0], property: ['targetValue'] }],
      },
      actions: [{ type: 'capability', capabilityId: 'alarm_motion' }],
    },
    {
      ruleId: 'rule-match',
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
  ];

  const result = compiler.compileDevice(device, rules);

  assert.deepEqual(
    result.capabilities.map((capability) => capability.capabilityId),
    ['onoff'],
  );

  const byRule = result.report.actions.reduce((acc, action) => {
    acc[action.ruleId] = (acc[action.ruleId] ?? 0) + 1;
    return acc;
  }, {});

  assert.equal(byRule['rule-device-mismatch'], device.values.length);
  assert.equal(byRule['rule-required-values-mismatch'], device.values.length);
  assert.equal(byRule['rule-absent-values-mismatch'], device.values.length);
  assert.equal(byRule['rule-match'], device.values.length);
  assert.equal(
    result.report.actions
      .filter((action) => action.ruleId !== 'rule-match')
      .every((action) => action.applied === false && action.reason === 'rule-not-matched'),
    true,
  );
});

test('compileDevice unmatched reporting emits one entry per action for ineligible rules', () => {
  const device = {
    deviceKey: 'dev-multi-unmatched-1',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'multi-action-unmatched',
      layer: 'project-product',
      value: { commandClass: [50], property: ['value'] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }, { type: 'ignore-value' }],
    },
  ];

  const result = compiler.compileDevice(device, rules);

  assert.equal(result.report.actions.length, 2);
  assert.deepEqual(
    result.report.actions.map((action) => ({
      actionType: action.actionType,
      applied: action.applied,
      reason: action.reason,
      layer: action.layer,
    })),
    [
      {
        actionType: 'capability',
        applied: false,
        reason: 'rule-not-matched',
        layer: 'project-product',
      },
      {
        actionType: 'ignore-value',
        applied: false,
        reason: 'rule-not-matched',
        layer: 'project-product',
      },
    ],
  );
});

test('compileDevice candidate scratch does not leak matches across multiple values', () => {
  const device = {
    deviceKey: 'dev-candidate-scratch-1',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
      {
        valueId: { commandClass: 50, endpoint: 0, property: 'value' },
        metadata: { type: 'number', readable: true, writeable: false },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'rule-current',
      layer: 'ha-derived',
      value: { commandClass: [37], endpoint: [0], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'onoff' }],
    },
    {
      ruleId: 'rule-meter',
      layer: 'ha-derived',
      value: { commandClass: [50], endpoint: [0], property: ['value'] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }],
    },
    {
      ruleId: 'rule-never',
      layer: 'project-product',
      value: { commandClass: [37], endpoint: [0], property: ['targetValue'] },
      actions: [{ type: 'capability', capabilityId: 'alarm_generic' }],
    },
  ];

  const result = compiler.compileDevice(device, rules);

  assert.deepEqual(
    result.capabilities.map((capability) => capability.capabilityId),
    ['measure_power', 'onoff'],
  );

  const byRule = result.report.actions.reduce((acc, action) => {
    acc[action.ruleId] ??= { applied: 0, unmatched: 0 };
    if (action.applied) acc[action.ruleId].applied += 1;
    if (action.reason === 'rule-not-matched') acc[action.ruleId].unmatched += 1;
    return acc;
  }, {});

  assert.deepEqual(byRule, {
    'rule-current': { applied: 1, unmatched: 1 },
    'rule-meter': { applied: 1, unmatched: 1 },
    'rule-never': { applied: 0, unmatched: 2 },
  });
});

test('compileDevice summary counters remain consistent with action results', () => {
  const device = makeDevice();
  const rules = [
    {
      ruleId: 'matched-capability',
      layer: 'ha-derived',
      value: { commandClass: [37], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'onoff' }],
    },
    {
      ruleId: 'unmatched-multi-action',
      layer: 'project-product',
      value: { commandClass: [99], property: ['never'] },
      actions: [{ type: 'capability', capabilityId: 'alarm_generic' }, { type: 'ignore-value' }],
    },
  ];

  const result = compiler.compileDevice(device, rules);
  const countedApplied = result.report.actions.filter(
    (action) => action.applied && action.changed !== false,
  ).length;
  const countedUnmatched = result.report.actions.filter(
    (action) => action.reason === 'rule-not-matched',
  ).length;

  assert.equal(result.report.summary.appliedActions, countedApplied);
  assert.equal(result.report.summary.unmatchedActions, countedUnmatched);
});

test('compileDevice report valueIds are immutable snapshots of input values', () => {
  const device = makeDevice();
  const rules = [
    {
      ruleId: 'matched-capability',
      layer: 'ha-derived',
      value: { commandClass: [37], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'onoff' }],
    },
  ];

  const result = compiler.compileDevice(device, rules);
  const firstReported = result.report.actions.find(
    (action) => action.valueId.property === 'currentValue',
  );
  assert.ok(firstReported);
  assert.equal(Object.isFrozen(firstReported.valueId), true);

  device.values[0].valueId.property = 'mutatedProperty';
  assert.equal(firstReported.valueId.property, 'currentValue');
});

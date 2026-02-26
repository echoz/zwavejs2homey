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
  assert.equal(result.report.summary.totalActions, result.report.actions.length);
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
  const countedAppliedProjectProduct = result.report.actions.filter(
    (action) => action.layer === 'project-product' && action.applied && action.changed !== false,
  ).length;

  assert.equal(result.report.summary.appliedActions, countedApplied);
  assert.equal(result.report.summary.unmatchedActions, countedUnmatched);
  assert.equal(result.report.summary.totalActions, result.report.actions.length);
  assert.equal(result.report.summary.appliedProjectProductActions, countedAppliedProjectProduct);
});

test('compileDevice summary report mode omits action records while preserving summaries', () => {
  const device = makeDevice();
  const rules = [
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
      ruleId: 'generic-onoff-duplicate-fill',
      layer: 'project-generic',
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
      ruleId: 'product-driver',
      layer: 'project-product',
      value: { commandClass: [37], property: ['targetValue'] },
      actions: [
        {
          type: 'device-identity',
          mode: 'replace',
          homeyClass: 'light',
          driverTemplateId: 'product-light',
        },
      ],
    },
    {
      ruleId: 'generic-meter',
      layer: 'project-generic',
      value: { commandClass: [50], property: ['value'] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }],
    },
    {
      ruleId: 'property-key-mismatch',
      layer: 'project-product',
      value: {
        commandClass: [50],
        property: ['value'],
        propertyKey: [1],
      },
      actions: [{ type: 'capability', capabilityId: 'alarm_generic' }],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.equal(summaryOnly.report.actions.length, 0);
  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.deviceIdentity, full.deviceIdentity);
  assert.equal(full.report.suppressedActions.length > 0, true);
  assert.equal(summaryOnly.report.suppressedActions.length, 0);
  assert.equal(
    summaryOnly.report.summary.suppressedFillActions,
    full.report.summary.suppressedFillActions,
  );
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
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

test('compileDevice summary mode does not double-apply rules with duplicate commandClass tokens', () => {
  const device = {
    deviceKey: 'dev-summary-dup-cc-1',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'dup-cc-summary-rule',
      layer: 'project-product',
      value: {
        commandClass: [37, 37],
        property: ['currentValue'],
      },
      actions: [
        {
          type: 'capability',
          mode: 'replace',
          capabilityId: 'onoff',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
          },
        },
      ],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.appliedActions, 1);
  assert.equal(summaryOnly.report.summary.unmatchedActions, 0);
});

test('compileDevice summary mode does not double-apply rules with duplicate property tokens', () => {
  const device = {
    deviceKey: 'dev-summary-dup-prop-1',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'dup-prop-summary-rule',
      layer: 'project-product',
      value: {
        commandClass: [37],
        property: ['currentValue', 'currentValue'],
      },
      actions: [
        {
          type: 'capability',
          mode: 'replace',
          capabilityId: 'onoff',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
          },
        },
      ],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.appliedActions, 1);
  assert.equal(summaryOnly.report.summary.unmatchedActions, 0);
});

test('compileDevice summary mode does not double-apply rules with duplicate endpoint tokens', () => {
  const device = {
    deviceKey: 'dev-summary-dup-endpoint-1',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 1, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'dup-endpoint-summary-rule',
      layer: 'project-product',
      value: {
        commandClass: [37],
        endpoint: [1, 1],
        property: ['currentValue'],
      },
      actions: [
        {
          type: 'capability',
          mode: 'replace',
          capabilityId: 'onoff',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, endpoint: 1, property: 'currentValue' },
          },
        },
      ],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.appliedActions, 1);
  assert.equal(summaryOnly.report.summary.unmatchedActions, 0);
});

test('compileDevice summary mode preserves endpoint-specific and wildcard endpoint parity', () => {
  const device = {
    deviceKey: 'dev-summary-endpoint-parity-1',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 1, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
      {
        valueId: { commandClass: 37, endpoint: 2, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'endpoint-wildcard',
      layer: 'ha-derived',
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
      ruleId: 'endpoint-1-specific',
      layer: 'project-product',
      value: { commandClass: [37], endpoint: [1], property: ['currentValue'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'alarm_generic',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, endpoint: 1, property: 'currentValue' },
          },
        },
      ],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.appliedActions, 2);
});

test('compileDevice summary mode preserves wildcard selector parity on repeated selectors', () => {
  const device = {
    deviceKey: 'dev-summary-cache-shape-1',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
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
      ruleId: 'wildcard-all',
      layer: 'ha-derived',
      actions: [{ type: 'ignore-value' }],
    },
    {
      ruleId: 'switch-onoff',
      layer: 'project-product',
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

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.appliedActions, 4);
});

test('compileDevice summary mode preserves numeric-vs-string property token parity', () => {
  const device = {
    deviceKey: 'dev-summary-property-token-parity-1',
    values: [
      {
        valueId: { commandClass: 112, endpoint: 0, property: 1 },
        metadata: { type: 'number', readable: true, writeable: false },
      },
      {
        valueId: { commandClass: 112, endpoint: 0, property: '1' },
        metadata: { type: 'number', readable: true, writeable: false },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'numeric-property',
      layer: 'project-product',
      value: { commandClass: [112], property: [1] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }],
    },
    {
      ruleId: 'string-property',
      layer: 'project-product',
      value: { commandClass: [112], property: ['1'] },
      actions: [{ type: 'capability', capabilityId: 'measure_voltage' }],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.appliedActions, 2);
  assert.equal(summaryOnly.report.summary.unmatchedActions, 2);
});

test('compileDevice summary selector cache eviction preserves outputs', () => {
  const device = {
    deviceKey: 'dev-summary-cache-eviction-1',
    values: Array.from({ length: 1100 }, (_, index) => ({
      valueId: {
        commandClass: 49,
        endpoint: 0,
        property: `sensor-${index}`,
      },
      metadata: { type: 'number', readable: true, writeable: false },
    })),
  };
  const rules = [
    {
      ruleId: 'wildcard-ignore',
      layer: 'ha-derived',
      actions: [{ type: 'ignore-value' }],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.ignoredValues, full.ignoredValues);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.appliedActions, 1100);
  assert.equal(summaryOnly.report.summary.unmatchedActions, 0);
});

test('compileDevice summary selector cache eviction stays stable under sustained selector churn', () => {
  const rules = [
    {
      ruleId: 'wildcard-ignore',
      layer: 'ha-derived',
      actions: [{ type: 'ignore-value' }],
    },
    {
      ruleId: 'sensor-1024-capability',
      layer: 'project-product',
      value: { commandClass: [49], property: ['sensor-1024'] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }],
    },
    {
      ruleId: 'sensor-2048-capability',
      layer: 'project-product',
      value: { commandClass: [49], property: ['sensor-2048'] },
      actions: [{ type: 'capability', capabilityId: 'measure_voltage' }],
    },
  ];
  const createDevice = (start, count) => ({
    deviceKey: `dev-summary-cache-churn-${start}`,
    values: Array.from({ length: count }, (_, index) => ({
      valueId: {
        commandClass: 49,
        endpoint: 0,
        property: `sensor-${start + index}`,
      },
      metadata: { type: 'number', readable: true, writeable: false },
    })),
  });

  for (let round = 0; round < 5; round += 1) {
    const device = createDevice(round * 700, 700);
    const full = compiler.compileDevice(device, rules);
    const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });
    const summaryRepeat = compiler.compileDevice(device, rules, { reportMode: 'summary' });

    assert.deepEqual(summaryOnly.capabilities, full.capabilities);
    assert.deepEqual(summaryOnly.ignoredValues, full.ignoredValues);
    assert.deepEqual(summaryOnly.report.summary, full.report.summary);
    assert.deepEqual(summaryRepeat.report.summary, summaryOnly.report.summary);
  }
});

test('compileDevice summary selector merge marks stay isolated between selector resolutions', () => {
  const device = {
    deviceKey: 'dev-summary-selector-merge-stamp-1',
    values: [
      {
        valueId: { commandClass: 49, endpoint: 0, property: 'sensor-a' },
        metadata: { type: 'number', readable: true, writeable: false },
      },
      {
        valueId: { commandClass: 49, endpoint: 0, property: 'sensor-b' },
        metadata: { type: 'number', readable: true, writeable: false },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'wildcard-ignore',
      layer: 'ha-derived',
      actions: [{ type: 'ignore-value' }],
    },
    {
      ruleId: 'sensor-a-capability',
      layer: 'project-product',
      value: { commandClass: [49], property: ['sensor-a'] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }],
    },
    {
      ruleId: 'sensor-b-capability',
      layer: 'project-product',
      value: { commandClass: [49], property: ['sensor-b'] },
      actions: [{ type: 'capability', capabilityId: 'measure_voltage' }],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.ignoredValues, full.ignoredValues);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.appliedActions, 4);
  assert.equal(summaryOnly.report.summary.unmatchedActions, 2);
});

test('compileDevice summary mode preserves mixed matched/unmatched multi-action counters', () => {
  const device = {
    deviceKey: 'dev-summary-multi-counter-parity-1',
    values: [
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'targetValue' },
        metadata: { type: 'boolean', readable: true, writeable: true },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'current-multi',
      layer: 'project-product',
      value: { commandClass: [37], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'onoff' }, { type: 'ignore-value' }],
    },
    {
      ruleId: 'wildcard-ignore',
      layer: 'ha-derived',
      actions: [{ type: 'ignore-value' }],
    },
    {
      ruleId: 'target-single',
      layer: 'project-generic',
      value: { commandClass: [37], property: ['targetValue'] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.totalActions, 8);
  assert.equal(summaryOnly.report.summary.unmatchedActions, 3);
  assert.equal(summaryOnly.report.summary.appliedActions, 5);
});

test('compileDevice summary mode preserves counters with device-ineligible multi-action rules', () => {
  const device = {
    deviceKey: 'dev-summary-ineligible-counter-parity-1',
    manufacturerId: 29,
    productType: 13313,
    productId: 1,
    values: [
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'boolean', readable: true, writeable: false },
      },
      {
        valueId: { commandClass: 37, endpoint: 0, property: 'targetValue' },
        metadata: { type: 'boolean', readable: true, writeable: true },
      },
    ],
  };
  const rules = [
    {
      ruleId: 'ineligible-multi-action',
      layer: 'project-product',
      device: { manufacturerId: [999] },
      value: { commandClass: [37], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'alarm_generic' }, { type: 'ignore-value' }],
    },
    {
      ruleId: 'current-onoff',
      layer: 'ha-derived',
      value: { commandClass: [37], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'onoff' }],
    },
    {
      ruleId: 'target-power',
      layer: 'project-generic',
      value: { commandClass: [37], property: ['targetValue'] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }],
    },
  ];

  const full = compiler.compileDevice(device, rules);
  const summaryOnly = compiler.compileDevice(device, rules, { reportMode: 'summary' });

  assert.deepEqual(summaryOnly.capabilities, full.capabilities);
  assert.deepEqual(summaryOnly.report.summary, full.report.summary);
  assert.equal(summaryOnly.report.summary.totalActions, 8);
  assert.equal(summaryOnly.report.summary.unmatchedActions, 6);
  assert.equal(summaryOnly.report.summary.appliedActions, 2);
});

test('compileDevice summary mode preserves parity when all-eligible and ineligible devices share cached plan', () => {
  const rules = [
    {
      ruleId: 'wildcard-ignore',
      layer: 'ha-derived',
      actions: [{ type: 'ignore-value' }],
    },
    {
      ruleId: 'mfg-1-onoff',
      layer: 'project-product',
      device: { manufacturerId: [1] },
      value: { commandClass: [37], property: ['currentValue'] },
      actions: [{ type: 'capability', capabilityId: 'onoff' }],
    },
    {
      ruleId: 'meter-power',
      layer: 'project-generic',
      value: { commandClass: [50], property: ['value'] },
      actions: [{ type: 'capability', capabilityId: 'measure_power' }],
    },
  ];
  const createDevice = (deviceKey, manufacturerId) => ({
    deviceKey,
    manufacturerId,
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
  });

  const eligibleDevice = createDevice('dev-summary-eligibility-1', 1);
  const ineligibleDevice = createDevice('dev-summary-eligibility-2', 2);

  const eligibleFull = compiler.compileDevice(eligibleDevice, rules);
  const eligibleSummary = compiler.compileDevice(eligibleDevice, rules, { reportMode: 'summary' });
  assert.deepEqual(eligibleSummary.capabilities, eligibleFull.capabilities);
  assert.deepEqual(eligibleSummary.report.summary, eligibleFull.report.summary);
  assert.equal(eligibleSummary.report.summary.appliedActions, 4);
  assert.equal(eligibleSummary.report.summary.unmatchedActions, 2);

  const ineligibleFull = compiler.compileDevice(ineligibleDevice, rules);
  const ineligibleSummary = compiler.compileDevice(ineligibleDevice, rules, {
    reportMode: 'summary',
  });
  assert.deepEqual(ineligibleSummary.capabilities, ineligibleFull.capabilities);
  assert.deepEqual(ineligibleSummary.report.summary, ineligibleFull.report.summary);
  assert.equal(ineligibleSummary.report.summary.appliedActions, 3);
  assert.equal(ineligibleSummary.report.summary.unmatchedActions, 3);
});

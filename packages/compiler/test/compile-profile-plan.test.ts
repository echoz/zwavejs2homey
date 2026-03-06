const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist');
const device = require('./fixtures/device-switch-meter.json');
const rules = require('./fixtures/rules-switch-meter.json');
const identityRules = require('./fixtures/rules-switch-meter-device-identity.json');

test('compileProfilePlan emits a Homey-targeted compiled profile skeleton and report summary', () => {
  const { profile, report } = compiler.compileProfilePlan(device, rules, {
    homeyClass: 'socket',
    driverTemplateId: 'generic-socket',
  });

  assert.deepEqual(profile, {
    profileId: 'fixture-switch-meter-1',
    match: {
      manufacturerId: 29,
      productType: 13313,
      productId: 1,
      firmwareVersion: '1.23',
    },
    classification: {
      homeyClass: 'socket',
      driverTemplateId: 'generic-socket',
      confidence: 'curated',
      uncurated: false,
    },
    capabilities: [
      {
        capabilityId: 'measure_power',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 50, endpoint: 0, property: 'value' },
          watchers: undefined,
          transformParams: undefined,
        },
        outboundMapping: undefined,
        directionality: 'inbound-only',
        flags: undefined,
        provenance: {
          layer: 'project-generic',
          ruleId: 'generic-meter-power',
          action: 'fill',
          sourceRef: 'generic-meter-power',
          reason: 'cc=50,ep=0,prop=value',
        },
      },
      {
        capabilityId: 'onoff',
        inboundMapping: {
          kind: 'value',
          selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
          watchers: undefined,
          transformParams: undefined,
        },
        outboundMapping: {
          kind: 'set_value',
          target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
          transformParams: undefined,
          validation: undefined,
          executionHints: undefined,
        },
        directionality: 'bidirectional',
        flags: { readable: true, writeable: true },
        provenance: {
          layer: 'ha-derived',
          ruleId: 'ha-onoff',
          action: 'fill',
          sourceRef: 'ha-onoff',
          reason: 'cc=37,ep=0,prop=currentValue',
        },
      },
    ],
    ignoredValues: [{ commandClass: 50, endpoint: 0, property: 'value', propertyKey: 0 }],
    provenance: {
      layer: 'project-generic',
      ruleId: 'compiler:compile-profile-plan',
      action: 'fill',
      sourceRef: 'compiler',
      reason: 'deviceKey=fixture-switch-meter-1',
      supersedes: undefined,
    },
  });

  assert.deepEqual(report.summary, {
    appliedActions: 4,
    unmatchedActions: 8,
    totalActions: 12,
    appliedProjectProductActions: 1,
    suppressedFillActions: 0,
    ignoredValues: 1,
  });
});

test('compileProfilePlan supports summary report mode without changing confidence', () => {
  const { profile, report } = compiler.compileProfilePlan(device, rules, {
    reportMode: 'summary',
  });

  assert.equal(profile.classification.confidence, 'curated');
  assert.equal(report.actions.length, 0);
  assert.equal(report.summary.totalActions, 12);
  assert.equal(report.summary.appliedProjectProductActions, 1);
});

test('compileProfilePlan derives classification from compiled device-identity actions', () => {
  const { profile, report } = compiler.compileProfilePlan(device, identityRules);
  assert.deepEqual(profile.classification, {
    homeyClass: 'light',
    driverTemplateId: 'product-dimmer',
    confidence: 'curated',
    uncurated: false,
  });
  assert.equal(
    profile.capabilities.some((c) => c.capabilityId === 'onoff'),
    true,
  );
  assert.ok(
    report.actions.some(
      (a) =>
        a.ruleId === 'product-device-class' &&
        a.actionType === 'device-identity' &&
        a.applied &&
        a.changed,
    ),
  );
});

test('compileProfilePlan does not mark profile curated from product no-op fills only', () => {
  const noOpProductRules = [
    ...identityRules,
    {
      ruleId: 'product-device-noop-fill',
      layer: 'project-product',
      value: { commandClass: [37], property: ['targetValue'] },
      actions: [
        {
          type: 'device-identity',
          mode: 'fill',
          homeyClass: 'socket',
          driverTemplateId: 'noop-template',
        },
      ],
    },
  ];
  const { profile, report } = compiler.compileProfilePlan(device, noOpProductRules, {
    confidence: undefined,
  });
  assert.equal(profile.classification.confidence, 'curated');
  assert.ok(
    report.actions.some(
      (a) => a.ruleId === 'product-device-noop-fill' && a.applied === true && a.changed === false,
    ),
  );
});

test('compileProfilePlan reports catalog lookup match when catalog artifact is provided', () => {
  const catalogArtifact = compiler.loadCatalogDevicesArtifact(
    require('node:path').join(__dirname, 'fixtures', 'catalog-devices-v1.json'),
  );
  const result = compiler.compileProfilePlan(device, rules, {
    catalogArtifact,
  });
  assert.deepEqual(result.catalogLookup, {
    matched: true,
    by: 'product-triple',
    catalogId: 'observed:29-13313-1',
    label: undefined,
  });
  assert.deepEqual(result.profile.catalogMatch, {
    by: 'product-triple',
    catalogId: 'observed:29-13313-1',
    label: undefined,
  });
  assert.match(result.profile.provenance.reason, /catalogId=observed:29-13313-1/);
});

test('compileProfilePlan caches catalog indexes per catalog artifact instance', () => {
  const catalogArtifact = compiler.loadCatalogDevicesArtifact(
    require('node:path').join(__dirname, 'fixtures', 'catalog-devices-v1.json'),
  );
  let iteratorCalls = 0;
  const originalIterator = catalogArtifact.devices[Symbol.iterator].bind(catalogArtifact.devices);
  catalogArtifact.devices[Symbol.iterator] = function* iteratorWrapper() {
    iteratorCalls += 1;
    yield* originalIterator();
  };

  const first = compiler.compileProfilePlan(device, rules, { catalogArtifact });
  const second = compiler.compileProfilePlan(device, rules, { catalogArtifact });

  assert.equal(iteratorCalls, 1);
  assert.deepEqual(first.catalogLookup, second.catalogLookup);
  assert.deepEqual(first.profile.catalogMatch, second.profile.catalogMatch);
});

test('compileProfilePlan resolves same-selector conflicts using capability conflict metadata', () => {
  const coverDevice = {
    deviceKey: 'fixture-cover-1',
    manufacturerId: 29,
    productType: 12801,
    productId: 1,
    values: [
      {
        valueId: { commandClass: 38, endpoint: 0, property: 'currentValue' },
        metadata: { type: 'number', readable: true, writeable: true },
      },
    ],
  };
  const overlapRules = [
    {
      ruleId: 'ha-cover-class',
      layer: 'ha-derived',
      value: { commandClass: [38], property: ['currentValue'] },
      actions: [{ type: 'device-identity', homeyClass: 'curtain' }],
    },
    {
      ruleId: 'ha-dim',
      layer: 'ha-derived',
      value: { commandClass: [38], property: ['currentValue'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'dim',
          conflict: { key: 'cover.position_control', mode: 'exclusive', priority: 40 },
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 38, endpoint: 0, property: 'currentValue' },
          },
          outboundMapping: {
            kind: 'set_value',
            target: { commandClass: 38, endpoint: 0, property: 'currentValue' },
          },
        },
      ],
    },
    {
      ruleId: 'ha-number',
      layer: 'ha-derived',
      value: { commandClass: [38], property: ['currentValue'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'number_value',
          conflict: { key: 'cover.position_control', mode: 'exclusive', priority: 10 },
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 38, endpoint: 0, property: 'currentValue' },
          },
        },
      ],
    },
    {
      ruleId: 'ha-cover-window',
      layer: 'ha-derived',
      value: { commandClass: [38], property: ['currentValue'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'windowcoverings_set',
          conflict: { key: 'cover.position_control', mode: 'exclusive', priority: 90 },
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 38, endpoint: 0, property: 'currentValue' },
          },
        },
      ],
    },
  ];

  const { profile, report } = compiler.compileProfilePlan(coverDevice, overlapRules);
  assert.deepEqual(
    profile.capabilities.map((c) => c.capabilityId),
    ['windowcoverings_set'],
  );
  assert.deepEqual(report.overlapPolicy?.suppressedCapabilities.map((s) => s.capabilityId).sort(), [
    'dim',
    'number_value',
  ]);
  assert.deepEqual(
    report.overlapPolicy?.suppressedCapabilities.map((s) => s.reason),
    ['conflict-exclusive:cover.position_control', 'conflict-exclusive:cover.position_control'],
  );
  assert.deepEqual(
    report.overlapPolicy?.suppressedCapabilities.map((s) => s.winnerCapabilityId),
    ['windowcoverings_set', 'windowcoverings_set'],
  );
  assert.deepEqual(
    report.overlapPolicy?.suppressedCapabilities.map((s) => s.conflictKey),
    ['cover.position_control', 'cover.position_control'],
  );
});

test('compileProfilePlan keeps allow-multi conflict candidates and suppresses exclusive conflict candidates', () => {
  const deviceFacts = {
    deviceKey: 'fixture-sensor-1',
    manufacturerId: 1120,
    productType: 2,
    productId: 136,
    values: [
      {
        valueId: { commandClass: 50, endpoint: 0, property: 'reset' },
        metadata: { type: 'boolean', readable: true },
      },
      {
        valueId: { commandClass: 113, endpoint: 0, property: 'alarmType' },
        metadata: { type: 'number', readable: true },
      },
    ],
  };
  const rulesForSensor = [
    {
      ruleId: 'ha-sensor-class',
      layer: 'ha-derived',
      value: { commandClass: [113], property: ['alarmType'] },
      actions: [{ type: 'device-identity', homeyClass: 'sensor' }],
    },
    {
      ruleId: 'ha-button-reset',
      layer: 'ha-derived',
      value: { commandClass: [50], property: ['reset'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'button_action',
          conflict: { key: 'service.control', mode: 'allow-multi', priority: 5 },
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 50, endpoint: 0, property: 'reset' },
          },
        },
      ],
    },
    {
      ruleId: 'ha-sensor-alarm',
      layer: 'ha-derived',
      value: { commandClass: [113], property: ['alarmType'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'measure_generic',
          conflict: { key: 'service.control', mode: 'exclusive', priority: 100 },
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 113, endpoint: 0, property: 'alarmType' },
          },
        },
      ],
    },
  ];

  const { profile, report } = compiler.compileProfilePlan(deviceFacts, rulesForSensor);
  assert.deepEqual(profile.capabilities.map((c) => c.capabilityId).sort(), [
    'button_action',
    'measure_generic',
  ]);
  assert.equal(report.overlapPolicy, undefined);
});

test('compileProfilePlan supports project-product remove-capability actions for noisy HA mappings', () => {
  const deviceFacts = {
    deviceKey: 'fixture-plug-1',
    manufacturerId: 1120,
    productType: 2,
    productId: 136,
    values: [
      {
        valueId: { commandClass: 50, endpoint: 0, property: 'reset' },
        metadata: { type: 'boolean', readable: false, writeable: true },
      },
    ],
  };
  const rulesForDevice = [
    {
      ruleId: 'ha-button-reset',
      layer: 'ha-derived',
      value: { commandClass: [50], property: ['reset'] },
      actions: [
        {
          type: 'capability',
          capabilityId: 'button_action',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 50, endpoint: 0, property: 'reset' },
          },
        },
      ],
    },
    {
      ruleId: 'product-remove-button',
      layer: 'project-product',
      value: { commandClass: [50], property: ['reset'] },
      actions: [{ type: 'remove-capability', capabilityId: 'button_action' }],
    },
  ];

  const { profile, report } = compiler.compileProfilePlan(deviceFacts, rulesForDevice);
  assert.equal(
    profile.capabilities.some((cap) => cap.capabilityId === 'button_action'),
    false,
  );
  assert.ok(
    report.actions.some(
      (action) =>
        action.ruleId === 'product-remove-button' &&
        action.actionType === 'remove-capability' &&
        action.applied,
    ),
  );
});

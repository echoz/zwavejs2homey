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
    suppressedFillActions: 0,
    ignoredValues: 1,
  });
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

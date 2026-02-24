const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist');

function prov(layer, ruleId, action = 'fill') {
  return { layer, ruleId, action };
}

function inboundValue(commandClass, property) {
  return {
    kind: 'value',
    selector: { commandClass, endpoint: 0, property },
  };
}

function outboundSet(commandClass, property) {
  return {
    kind: 'set_value',
    target: { commandClass, endpoint: 0, property },
  };
}

test('generic fill adds missing capability without replacing existing curated capability', () => {
  const state = compiler.createProfileBuildState();

  compiler.applyCapabilityRuleAction(
    state,
    {
      type: 'capability',
      capabilityId: 'onoff',
      inboundMapping: inboundValue(37, 'currentValue'),
      outboundMapping: outboundSet(37, 'targetValue'),
      flags: { readable: true, writeable: true },
    },
    prov('project-product', 'prod-onoff'),
  );

  compiler.applyCapabilityRuleAction(
    state,
    {
      type: 'capability',
      capabilityId: 'onoff',
      inboundMapping: inboundValue(38, 'currentValue'),
    },
    prov('project-generic', 'generic-onoff'),
  );

  compiler.applyCapabilityRuleAction(
    state,
    {
      type: 'capability',
      capabilityId: 'measure_power',
      inboundMapping: inboundValue(50, 'value'),
      flags: { readable: true, writeable: false },
    },
    prov('project-generic', 'generic-power'),
  );

  const plans = compiler.materializeCapabilityPlans(state);
  const onoff = plans.find((p) => p.capabilityId === 'onoff');
  const power = plans.find((p) => p.capabilityId === 'measure_power');

  assert.equal(onoff.inboundMapping.selector.commandClass, 37);
  assert.equal(onoff.outboundMapping.target.property, 'targetValue');
  assert.equal(power.inboundMapping.selector.commandClass, 50);
  assert.equal(state.suppressedActions.length, 1);
  assert.equal(state.suppressedActions[0].slot, 'inboundMapping');
});

test('product replace can replace generic capability mappings and preserves supersedes chain', () => {
  const state = compiler.createProfileBuildState();

  compiler.applyCapabilityRuleAction(
    state,
    {
      type: 'capability',
      capabilityId: 'dim',
      inboundMapping: inboundValue(38, 'currentValue'),
      outboundMapping: outboundSet(38, 'targetValue'),
    },
    prov('ha-derived', 'ha-dim'),
  );

  compiler.applyCapabilityRuleAction(
    state,
    {
      type: 'capability',
      mode: 'replace',
      capabilityId: 'dim',
      inboundMapping: inboundValue(38, 'currentValue'),
      outboundMapping: outboundSet(38, 'currentValue'),
      flags: { writeable: true, readable: true },
    },
    prov('project-product', 'product-dim'),
  );

  const [dim] = compiler.materializeCapabilityPlans(state);
  assert.equal(dim.outboundMapping.target.property, 'currentValue');
  assert.deepEqual(dim.provenance.supersedes, ['ha-derived:ha-dim']);
});

test('augment appends watchers and fills missing outbound mapping', () => {
  const state = compiler.createProfileBuildState();

  compiler.applyCapabilityRuleAction(
    state,
    {
      type: 'capability',
      capabilityId: 'alarm_contact',
      inboundMapping: {
        ...inboundValue(48, 'state'),
        watchers: [{ eventType: 'zwjs.event.node.notification' }],
      },
    },
    prov('ha-derived', 'ha-contact'),
  );

  compiler.applyCapabilityRuleAction(
    state,
    {
      type: 'capability',
      mode: 'augment',
      capabilityId: 'alarm_contact',
      inboundMapping: {
        ...inboundValue(48, 'state'),
        watchers: [{ eventType: 'zwjs.event.node.wake-up' }],
      },
      flags: { assumedState: true },
    },
    prov('project-product', 'prod-contact-augment', 'augment'),
  );

  const [cap] = compiler.materializeCapabilityPlans(state);
  assert.equal(cap.directionality, 'inbound-only');
  assert.equal(cap.inboundMapping.watchers.length, 2);
  assert.equal(cap.flags.assumedState, true);
});

test('generic replace is rejected by layer semantics helper during apply', () => {
  const state = compiler.createProfileBuildState();
  assert.throws(
    () =>
      compiler.applyCapabilityRuleAction(
        state,
        {
          type: 'capability',
          mode: 'replace',
          capabilityId: 'onoff',
          inboundMapping: inboundValue(37, 'currentValue'),
        },
        prov('project-generic', 'generic-replace'),
      ),
    /not allowed/,
  );
});

test('device identity actions support fill and product replace with supersedes tracking', () => {
  const state = compiler.createProfileBuildState();

  compiler.applyDeviceIdentityRuleAction(
    state,
    {
      type: 'device-identity',
      homeyClass: 'socket',
      driverTemplateId: 'ha-generic-socket',
    },
    prov('ha-derived', 'ha-device'),
  );

  compiler.applyDeviceIdentityRuleAction(
    state,
    {
      type: 'device-identity',
      mode: 'fill',
      homeyClass: 'light',
      driverTemplateId: 'fallback-light',
    },
    prov('project-generic', 'generic-device'),
  );

  compiler.applyDeviceIdentityRuleAction(
    state,
    {
      type: 'device-identity',
      mode: 'replace',
      homeyClass: 'light',
      driverTemplateId: 'product-dimmer',
    },
    prov('project-product', 'product-device'),
  );

  const identity = compiler.materializeDeviceIdentity(state);
  assert.equal(identity.homeyClass, 'light');
  assert.equal(identity.driverTemplateId, 'product-dimmer');
  assert.deepEqual(identity.provenance.supersedes, ['ha-derived:ha-device']);
  assert.ok(
    state.suppressedActions.some(
      (a) => a.ruleId === 'generic-device' && a.slot === 'deviceIdentity.homeyClass',
    ),
  );
});

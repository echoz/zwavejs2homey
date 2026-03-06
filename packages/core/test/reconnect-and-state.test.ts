const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeReconnectPolicy, computeReconnectDelayMs } = require('../dist/client/reconnect.js');
const { transitionState } = require('../dist/client/state-machine.js');

test('mergeReconnectPolicy applies defaults and overrides', () => {
  const policy = mergeReconnectPolicy({ initialDelayMs: 1000, multiplier: 3 });
  assert.equal(policy.initialDelayMs, 1000);
  assert.equal(policy.multiplier, 3);
  assert.equal(policy.maxDelayMs, 10000);
  assert.equal(policy.enabled, true);
});

test('computeReconnectDelayMs respects max cap (with zero jitter)', () => {
  const policy = {
    enabled: true,
    initialDelayMs: 500,
    maxDelayMs: 1000,
    multiplier: 2,
    jitterRatio: 0,
  };
  assert.equal(computeReconnectDelayMs(1, policy), 500);
  assert.equal(computeReconnectDelayMs(2, policy), 1000);
  assert.equal(computeReconnectDelayMs(5, policy), 1000);
});

test('transitionState allows valid transitions', () => {
  assert.equal(transitionState('idle', 'connecting'), 'connecting');
  assert.equal(transitionState('connecting', 'connected'), 'connected');
  assert.equal(transitionState('connected', 'reconnecting'), 'reconnecting');
});

test('transitionState rejects invalid transitions', () => {
  assert.throws(() => transitionState('connected', 'idle'));
});

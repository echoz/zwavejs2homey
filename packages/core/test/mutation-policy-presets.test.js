const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMutationPolicyPreset,
  getMutationPolicyPresetAllowlist,
} = require('../dist/index.js');

test('safe-ops preset includes P2.2 low-risk mutation commands', () => {
  const allowlist = getMutationPolicyPresetAllowlist('safe-ops');
  assert.deepEqual(allowlist.sort(), [
    'node.ping',
    'node.poll_value',
    'node.refresh_info',
    'node.refresh_values',
  ]);
});

test('controller-maintenance preset includes inclusion/exclusion workflow commands', () => {
  const allowlist = getMutationPolicyPresetAllowlist('controller-maintenance');
  assert.deepEqual(allowlist.sort(), [
    'controller.begin_exclusion',
    'controller.begin_inclusion',
    'controller.stop_exclusion',
    'controller.stop_inclusion',
  ]);
});

test('destructive preset defaults to empty allowlist', () => {
  const allowlist = getMutationPolicyPresetAllowlist('destructive');
  assert.deepEqual(allowlist, []);
});

test('createMutationPolicyPreset returns enabled allowlist-enforced policy and merges additions', () => {
  const policy = createMutationPolicyPreset('safe-ops', {
    additionalAllowCommands: ['controller.stop_inclusion'],
  });

  assert.equal(policy.enabled, true);
  assert.equal(policy.requireAllowList, true);
  assert.equal(policy.allowCommands.includes('node.ping'), true);
  assert.equal(policy.allowCommands.includes('controller.stop_inclusion'), true);
});

test('preset helper returns cloned allowlists', () => {
  const first = getMutationPolicyPresetAllowlist('safe-ops');
  first.push('bad.command');
  const second = getMutationPolicyPresetAllowlist('safe-ops');
  assert.equal(second.includes('bad.command'), false);
});

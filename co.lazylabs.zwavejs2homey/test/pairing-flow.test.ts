const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function requireJson(relativePath) {
  return require(path.resolve(__dirname, relativePath));
}

function assertListToAddFlow(pairViews, driverId, options = {}) {
  assert.ok(Array.isArray(pairViews), `${driverId}: pair must be an array`);

  const listView = pairViews.find((view) => view && view.id === 'list_devices');
  assert.ok(listView, `${driverId}: missing list_devices pair view`);
  assert.equal(listView.template, 'list_devices', `${driverId}: list_devices template mismatch`);
  if (typeof options.expectListNext === 'string') {
    assert.equal(
      listView.navigation?.next,
      options.expectListNext,
      `${driverId}: list_devices next navigation mismatch`,
    );
  } else {
    assert.equal(
      listView.navigation?.next,
      'add_devices',
      `${driverId}: list_devices must navigate to add_devices`,
    );
  }
  if (typeof options.expectSingular === 'boolean') {
    assert.equal(
      listView.options?.singular === true,
      options.expectSingular,
      `${driverId}: list_devices singular option mismatch`,
    );
  }
}

test('bridge and node drivers expose a list_devices -> add_devices pair flow', () => {
  const bridge = requireJson('../drivers/bridge/driver.compose.json');
  const node = requireJson('../drivers/node/driver.compose.json');

  assertListToAddFlow(bridge.pair, 'bridge', {
    expectSingular: false,
  });
  assertListToAddFlow(node.pair, 'node', {
    expectSingular: false,
  });
});

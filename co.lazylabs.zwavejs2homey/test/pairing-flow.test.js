const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function requireJson(relativePath) {
  return require(path.resolve(__dirname, relativePath));
}

function assertListToAddFlow(pairViews, driverId) {
  assert.ok(Array.isArray(pairViews), `${driverId}: pair must be an array`);

  const listView = pairViews.find((view) => view && view.id === 'list_devices');
  assert.ok(listView, `${driverId}: missing list_devices pair view`);
  assert.equal(listView.template, 'list_devices', `${driverId}: list_devices template mismatch`);
  assert.equal(
    listView.navigation?.next,
    'add_devices',
    `${driverId}: list_devices must navigate to add_devices`,
  );

  const addView = pairViews.find((view) => view && view.id === 'add_devices');
  assert.ok(addView, `${driverId}: missing add_devices pair view`);
  assert.equal(addView.template, 'add_devices', `${driverId}: add_devices template mismatch`);
}

test('bridge and node drivers expose a list_devices -> add_devices pair flow', () => {
  const bridge = requireJson('../drivers/bridge/driver.compose.json');
  const node = requireJson('../drivers/node/driver.compose.json');

  assertListToAddFlow(bridge.pair, 'bridge');
  assertListToAddFlow(node.pair, 'node');
});

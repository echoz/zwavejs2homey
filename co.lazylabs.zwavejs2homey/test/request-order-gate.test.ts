const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const requestOrderGateApi = require(path.resolve(__dirname, '../settings/request-order-gate.js'));

test('request-order gate marks only latest ticket as current per channel', () => {
  const gate = requestOrderGateApi.createRequestOrderGate();
  const first = gate.begin('diagnostics');
  const second = gate.begin('diagnostics');

  assert.equal(gate.isCurrent('diagnostics', first), false);
  assert.equal(gate.isCurrent('diagnostics', second), true);
  assert.equal(gate.isCurrent('inventory', first), false);
});

test('request-order gate tracks busy state per channel and globally', () => {
  const gate = requestOrderGateApi.createRequestOrderGate();
  assert.equal(gate.isBusy(), false);

  gate.begin('diagnostics');
  assert.equal(gate.isBusy(), true);
  assert.equal(gate.isBusy(['diagnostics']), true);
  assert.equal(gate.isBusy(['inventory']), false);

  gate.begin('inventory');
  assert.equal(gate.isBusy(['diagnostics', 'inventory']), true);

  gate.finish('diagnostics');
  assert.equal(gate.isBusy(['diagnostics']), false);
  assert.equal(gate.isBusy(['inventory']), true);

  gate.finish('inventory');
  assert.equal(gate.isBusy(), false);
});

test('request-order gate finish is safe when called more than begin', () => {
  const gate = requestOrderGateApi.createRequestOrderGate();
  gate.begin('diagnostics');
  gate.finish('diagnostics');
  gate.finish('diagnostics');
  assert.equal(gate.getInFlightCount('diagnostics'), 0);
  assert.equal(gate.isBusy(), false);
});

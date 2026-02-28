const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePanelKeypress } = require('../dist/view/panel-input');

test('parsePanelKeypress maps core keys to intents', () => {
  assert.deepEqual(parsePanelKeypress('', { name: 'q' }), { type: 'quit' });
  assert.deepEqual(parsePanelKeypress('q', {}), { type: 'quit' });
  assert.deepEqual(parsePanelKeypress('', { sequence: 'q' }), { type: 'quit' });
  assert.deepEqual(parsePanelKeypress('', { ctrl: true, name: 'c' }), { type: 'quit' });
  assert.deepEqual(parsePanelKeypress('', { name: 'up' }), { type: 'move-up' });
  assert.deepEqual(parsePanelKeypress('', { name: 'down' }), { type: 'move-down' });
  assert.deepEqual(parsePanelKeypress('', { name: 'pageup' }), { type: 'move-page-up' });
  assert.deepEqual(parsePanelKeypress('', { name: 'pagedown' }), { type: 'move-page-down' });
  assert.deepEqual(parsePanelKeypress('', { name: 'home' }), { type: 'move-first' });
  assert.deepEqual(parsePanelKeypress('', { name: 'end' }), { type: 'move-last' });
  assert.deepEqual(parsePanelKeypress('/', {}), { type: 'start-filter' });
  assert.deepEqual(parsePanelKeypress('', { name: 'm' }), { type: 'simulate', dryRun: false });
  assert.deepEqual(parsePanelKeypress('', { name: 'd' }), { type: 'simulate', dryRun: true });
  assert.deepEqual(parsePanelKeypress('W', { name: 'w' }), { type: 'scaffold-write' });
  assert.deepEqual(parsePanelKeypress('A', { name: 'a' }), { type: 'manifest-add' });
  assert.deepEqual(parsePanelKeypress('', { name: 'c' }), { type: 'cancel-operation' });
  assert.deepEqual(parsePanelKeypress('', { name: 'n' }), { type: 'toggle-neighbors' });
  assert.deepEqual(parsePanelKeypress('', { name: 'z' }), { type: 'toggle-values' });
  assert.deepEqual(parsePanelKeypress('', { name: 'b' }), { type: 'toggle-bottom-pane-size' });
  assert.deepEqual(parsePanelKeypress('', { name: 'x' }), { type: 'noop' });
});

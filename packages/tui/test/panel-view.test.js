const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePanelKeypress } = require('../dist/view/panel-input');
const { renderPanelFrame } = require('../dist/view/panel-layout');

test('parsePanelKeypress maps core keys to intents', () => {
  assert.deepEqual(parsePanelKeypress('', { name: 'q' }), { type: 'quit' });
  assert.deepEqual(parsePanelKeypress('q', {}), { type: 'quit' });
  assert.deepEqual(parsePanelKeypress('', { sequence: 'q' }), { type: 'quit' });
  assert.deepEqual(parsePanelKeypress('', { ctrl: true, name: 'c' }), { type: 'quit' });
  assert.deepEqual(parsePanelKeypress('', { name: 'up' }), { type: 'move-up' });
  assert.deepEqual(parsePanelKeypress('', { name: 'down' }), { type: 'move-down' });
  assert.deepEqual(parsePanelKeypress('', { name: 'm' }), { type: 'simulate', dryRun: false });
  assert.deepEqual(parsePanelKeypress('', { name: 'd' }), { type: 'simulate', dryRun: true });
  assert.deepEqual(parsePanelKeypress('W', { name: 'w' }), { type: 'scaffold-write' });
  assert.deepEqual(parsePanelKeypress('A', { name: 'a' }), { type: 'manifest-add' });
  assert.deepEqual(parsePanelKeypress('', { name: 'x' }), { type: 'noop' });
});

test('renderPanelFrame renders bounded panel text', () => {
  const output = renderPanelFrame({
    width: 80,
    height: 24,
    header: 'ZWJS Explorer (nodes)',
    footer: 'q quit | arrows move | enter open',
    leftTitle: 'Nodes',
    leftLines: ['1  Kitchen', '2  Office'],
    rightTitle: 'Detail',
    rightLines: ['Node 1', 'Ready: true'],
    bottomTitle: 'Run',
    bottomLines: ['Loaded 2 nodes'],
    focusedPane: 'left',
  });

  const rows = output.split('\n');
  assert.equal(rows.length >= 18, true);
  assert.equal(rows[0].startsWith('+'), true);
  assert.equal(output.includes('ZWJS Explorer (nodes)'), true);
  assert.equal(output.includes('* Nodes'), true);
  assert.equal(output.includes('Loaded 2 nodes'), true);
});

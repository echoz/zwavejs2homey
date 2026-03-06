const test = require('node:test');
const assert = require('node:assert/strict');

const { PanelLayoutPresenter } = require('../dist/presenter/panel-layout-presenter');

test('PanelLayoutPresenter builds list title with paging and filter', () => {
  const presenter = new PanelLayoutPresenter();
  const title = presenter.buildListTitle({
    sessionMode: 'nodes',
    totalItems: 120,
    visibleCapacity: 20,
    windowStart: 40,
    windowCount: 20,
    filterQuery: 'dimmer',
  });
  assert.equal(title, 'Nodes [41-60/120] | filter="dimmer"');
});

test('PanelLayoutPresenter builds detail title for node detail and edit modes', () => {
  const presenter = new PanelLayoutPresenter();
  const nodeDetail = presenter.buildDetailTitle({
    panelMode: 'detail',
    sessionMode: 'nodes',
    currentNodeId: 24,
    totalLines: 120,
    visibleCapacity: 20,
    scroll: 40,
  });
  assert.equal(nodeDetail, 'Node 24 Detail [41-60/120]');

  const editDetail = presenter.buildDetailTitle({
    panelMode: 'edit-draft',
    sessionMode: 'nodes',
    currentNodeId: 24,
    totalLines: 12,
    visibleCapacity: 20,
    scroll: 0,
  });
  assert.equal(editDetail, 'Scaffold Edit');
});

test('PanelLayoutPresenter builds output title honoring compact mode', () => {
  const presenter = new PanelLayoutPresenter();
  const expanded = presenter.buildOutputTitle({
    compact: false,
    totalLines: 50,
    visibleCapacity: 10,
    scroll: 20,
  });
  assert.equal(expanded, 'Output / Run [21-30/50]');

  const compact = presenter.buildOutputTitle({
    compact: true,
    totalLines: 50,
    visibleCapacity: 10,
    scroll: 20,
  });
  assert.equal(compact, '');
});

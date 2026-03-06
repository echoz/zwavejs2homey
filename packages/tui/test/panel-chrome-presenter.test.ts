const test = require('node:test');
const assert = require('node:assert/strict');

const { PanelChromePresenter } = require('../dist/presenter/panel-chrome-presenter');

function createState(overrides = {}) {
  return {
    sessionMode: 'nodes',
    uiMode: 'panel',
    selectedSignature: '29:66:2',
    filterMode: false,
    draftFieldEditActive: false,
    panelMode: 'detail',
    focusedPane: 'left',
    hasNodeDetail: false,
    valuesExpanded: false,
    pendingConfirmAction: undefined,
    activeOperationLabel: undefined,
    ...overrides,
  };
}

test('PanelChromePresenter renders header with signature', () => {
  const presenter = new PanelChromePresenter();
  const viewModel = presenter.build(createState());
  assert.equal(viewModel.header, 'ZWJS nodes (panel) sig=29:66:2');
});

test('PanelChromePresenter renders contextual scaffold edit footer for right pane', () => {
  const presenter = new PanelChromePresenter();
  const viewModel = presenter.build(
    createState({
      panelMode: 'edit-draft',
      focusedPane: 'right',
    }),
  );
  assert.equal(viewModel.footer.includes('Scaffold edit (right):'), true);
  assert.equal(viewModel.footer.includes('+ add'), true);
  assert.equal(viewModel.footer.includes('* clone'), true);
  assert.equal(viewModel.footer.includes('< > move'), true);
});

test('PanelChromePresenter renders nodes detail footer when right pane is focused', () => {
  const presenter = new PanelChromePresenter();
  const viewModel = presenter.build(
    createState({
      focusedPane: 'right',
      hasNodeDetail: true,
      valuesExpanded: true,
    }),
  );
  assert.equal(viewModel.footer.includes('Detail (right):'), true);
  assert.equal(viewModel.footer.includes('1-6 value sections'), true);
});

test('PanelChromePresenter appends runtime hints for confirm and cancel contexts', () => {
  const presenter = new PanelChromePresenter();
  const viewModel = presenter.build(
    createState({
      pendingConfirmAction: 'scaffold-write',
      activeOperationLabel: 'simulate 29:66:2',
    }),
  );
  assert.equal(viewModel.footer.includes('W confirm-write'), true);
  assert.equal(viewModel.footer.includes('c cancel-op'), true);
});

test('PanelChromePresenter prioritizes filter mode footer regardless of pane', () => {
  const presenter = new PanelChromePresenter();
  const viewModel = presenter.build(
    createState({
      filterMode: true,
      panelMode: 'edit-draft',
      focusedPane: 'right',
    }),
  );
  assert.equal(viewModel.footer.startsWith('Filter: type'), true);
});

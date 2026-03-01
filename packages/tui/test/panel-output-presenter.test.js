const test = require('node:test');
const assert = require('node:assert/strict');

const { PanelOutputPresenter } = require('../dist/presenter/panel-output-presenter');

test('PanelOutputPresenter builds compact output with scroll clamping', () => {
  const presenter = new PanelOutputPresenter();
  const viewModel = presenter.build({
    text: 'line-1\nline-2\nline-3',
    scroll: 99,
    compact: true,
    visibleCapacity: 2,
  });

  assert.deepEqual(viewModel.lines, ['line-1', 'line-2', 'line-3']);
  assert.equal(viewModel.clampedScroll, 1);
  assert.equal(viewModel.compactLine, 'line-2');
  assert.deepEqual(viewModel.visibleLines, ['line-2']);
});

test('PanelOutputPresenter builds expanded output slice with negative scroll clamped to zero', () => {
  const presenter = new PanelOutputPresenter();
  const viewModel = presenter.build({
    text: 'line-1\nline-2\nline-3',
    scroll: -4,
    compact: false,
    visibleCapacity: 2,
  });

  assert.equal(viewModel.clampedScroll, 0);
  assert.equal(viewModel.compactLine, 'line-1');
  assert.deepEqual(viewModel.visibleLines, ['line-1', 'line-2']);
});

test('PanelOutputPresenter handles empty text and zero visible capacity', () => {
  const presenter = new PanelOutputPresenter();
  const viewModel = presenter.build({
    text: '',
    scroll: 5,
    compact: false,
    visibleCapacity: 0,
  });

  assert.deepEqual(viewModel.lines, ['']);
  assert.equal(viewModel.clampedScroll, 0);
  assert.equal(viewModel.compactLine, '');
  assert.deepEqual(viewModel.visibleLines, ['']);
});

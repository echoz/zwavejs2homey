(function bootstrapBridgeNextStepsPage(root) {
  const presenter = root && root.Zwjs2HomeyUi && root.Zwjs2HomeyUi.bridgeNextStepsPresenter;
  if (!presenter) return;

  const stateRef = {
    current: presenter.createInitialState(),
  };

  const statusKv = document.getElementById('status-kv');
  const warningsEl = document.getElementById('warnings');
  const statusLine = document.getElementById('status-line');
  const importedTableWrap = document.getElementById('imported-table-wrap');
  const importedTableBody = document.getElementById('imported-table-body');
  const importedEmpty = document.getElementById('imported-empty');
  const importedMeta = document.getElementById('imported-meta');
  const refreshBtn = document.getElementById('refresh-btn');
  const doneBtn = document.getElementById('done-btn');

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderStatusRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      statusKv.innerHTML = '<div class="k">Status</div><div class="v">n/a</div>';
      return;
    }
    statusKv.innerHTML = rows
      .map((row) => {
        let renderedValue = escapeHtml(row.value);
        if (row.kind === 'pill' && row.value && typeof row.value === 'object') {
          const tone =
            row.value.tone === 'error' || row.value.tone === 'warn' ? row.value.tone : 'ok';
          renderedValue = `<span class="status-pill ${tone}">${escapeHtml(row.value.label)}</span>`;
        }
        return `<div class="k">${escapeHtml(row.key)}</div><div class="v">${renderedValue}</div>`;
      })
      .join('');
  }

  function recommendationClass(tone) {
    if (tone === 'warn') return 'pill-warn';
    if (tone === 'danger') return 'pill-action';
    return 'pill-ok';
  }

  function renderImportedRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      importedTableWrap.hidden = true;
      importedTableBody.innerHTML = '';
      importedEmpty.hidden = false;
      return;
    }
    importedTableWrap.hidden = false;
    importedEmpty.hidden = true;
    importedTableBody.innerHTML = rows
      .map(
        (row) => `
        <tr>
          <td>#${escapeHtml(row.nodeId)}<br /><span class="hint">${escapeHtml(row.name)}</span></td>
          <td>${escapeHtml(row.bridgeId)}</td>
          <td>
            ${escapeHtml(row.manufacturer)} / ${escapeHtml(row.product)}<br />
            <span class="hint">Location: ${escapeHtml(row.location)}</span><br />
            <span class="hint">Status: ${escapeHtml(row.status)}</span>
          </td>
          <td>
            Class: ${escapeHtml(row.profileClass)}<br />
            <span class="hint">${escapeHtml(row.profileId)}</span><br />
            <span class="hint">${escapeHtml(row.profileMatch)}</span>
          </td>
          <td>
            <span class="${recommendationClass(row.recommendation.tone)}">${escapeHtml(
              row.recommendation.label,
            )}</span><br />
            <span class="hint">${escapeHtml(row.recommendation.reason)}</span>
          </td>
        </tr>
      `,
      )
      .join('');
  }

  function renderWarnings(items) {
    if (!Array.isArray(items) || items.length === 0) {
      warningsEl.hidden = true;
      warningsEl.innerHTML = '';
      return;
    }
    warningsEl.hidden = false;
    warningsEl.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  }

  function render() {
    const viewModel = presenter.buildViewModel(stateRef.current);
    refreshBtn.disabled = viewModel.refreshDisabled === true;
    renderStatusRows(viewModel.statusRows);
    renderWarnings(viewModel.warnings);
    importedMeta.textContent = viewModel.importedMeta;
    importedEmpty.textContent = viewModel.importedEmpty;
    renderImportedRows(viewModel.importedRows);
    if (!viewModel.hasImportedRows) {
      importedTableWrap.hidden = true;
      importedEmpty.hidden = false;
    }
    statusLine.textContent = viewModel.statusLine;
  }

  async function loadStatus() {
    stateRef.current = presenter.reduce(stateRef.current, { type: 'load_start' });
    render();
    try {
      const status = await Homey.emit('next_steps:get_status');
      stateRef.current = presenter.reduce(stateRef.current, {
        type: 'load_success',
        status,
      });
    } catch (error) {
      stateRef.current = presenter.reduce(stateRef.current, {
        type: 'load_error',
        message: error && error.message ? error.message : 'Failed to load status.',
      });
    }
    render();
  }

  refreshBtn.addEventListener('click', () => {
    loadStatus();
  });
  doneBtn.addEventListener('click', () => {
    Homey.done();
  });

  Homey.ready();
  loadStatus();
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);

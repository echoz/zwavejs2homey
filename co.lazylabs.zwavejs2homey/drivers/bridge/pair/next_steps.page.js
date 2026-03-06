(function bootstrapBridgeNextStepsPage(root) {
    const PANEL_EMIT_TIMEOUT_MS = 15000;
    const maybePresenter = root && root.Zwjs2HomeyUi && root.Zwjs2HomeyUi.bridgeNextStepsPresenter;
    if (!maybePresenter)
        return;
    const presenter = maybePresenter;
    const stateRef = {
        current: presenter.createInitialState(),
    };
    function mustElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Missing page element: ${id}`);
        }
        return element;
    }
    const statusKv = mustElement('status-kv');
    const warningsEl = mustElement('warnings');
    const statusLine = mustElement('status-line');
    const importedTableWrap = mustElement('imported-table-wrap');
    const importedTableBody = mustElement('imported-table-body');
    const importedEmpty = mustElement('imported-empty');
    const importedMeta = mustElement('imported-meta');
    const guidanceTitle = mustElement('guidance-title');
    const guidanceList = mustElement('guidance-list');
    const refreshBtn = mustElement('refresh-btn');
    const doneBtn = mustElement('done-btn');
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
            if (row.kind === 'pill' && typeof row.value === 'object' && row.value !== null) {
                const pillValue = row.value;
                const tone = pillValue.tone === 'error' || pillValue.tone === 'warn' ? pillValue.tone : 'ok';
                renderedValue = `<span class="status-pill ${tone}">${escapeHtml(pillValue.label)}</span>`;
            }
            return `<div class="k">${escapeHtml(row.key)}</div><div class="v">${renderedValue}</div>`;
        })
            .join('');
    }
    function recommendationClass(tone) {
        if (tone === 'warn')
            return 'pill-warn';
        if (tone === 'danger')
            return 'pill-action';
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
            .map((row) => `
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
            <span class="hint">${escapeHtml(row.profileMatch)}</span><br />
            <span class="hint">Source: ${escapeHtml(row.profileSource)}</span><br />
            <span class="hint">Rule Match: ${escapeHtml(row.ruleMatch)}</span>
          </td>
          <td>
            <span class="${recommendationClass(row.recommendation.tone)}">${escapeHtml(row.recommendation.label)}</span><br />
            <span class="hint">${escapeHtml(row.recommendation.reason)}</span>
          </td>
        </tr>
      `)
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
    function renderGuidance(title, steps) {
        guidanceTitle.textContent = title;
        if (!Array.isArray(steps) || steps.length === 0) {
            guidanceList.innerHTML = '<li>Press Done to close this pairing step.</li>';
            return;
        }
        guidanceList.innerHTML = steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
    }
    function render() {
        const viewModel = presenter.buildViewModel(stateRef.current);
        refreshBtn.disabled = viewModel.refreshDisabled === true;
        renderStatusRows(viewModel.statusRows);
        renderWarnings(viewModel.warnings);
        renderGuidance(viewModel.guidanceTitle, viewModel.guidanceSteps);
        importedMeta.textContent = viewModel.importedMeta;
        importedEmpty.textContent = viewModel.importedEmpty;
        renderImportedRows(viewModel.importedRows);
        if (!viewModel.hasImportedRows) {
            importedTableWrap.hidden = true;
            importedEmpty.hidden = false;
        }
        statusLine.textContent = viewModel.statusLine;
    }
    function toErrorMessage(error) {
        if (error instanceof Error)
            return error.message;
        return 'Failed to load status.';
    }
    async function emitWithTimeout(event) {
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`${event} timed out after ${PANEL_EMIT_TIMEOUT_MS}ms`));
            }, PANEL_EMIT_TIMEOUT_MS);
        });
        try {
            return (await Promise.race([Homey.emit(event), timeoutPromise]));
        }
        finally {
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
        }
    }
    async function loadStatus() {
        stateRef.current = presenter.reduce(stateRef.current, { type: 'load_start' });
        render();
        try {
            const status = await emitWithTimeout('next_steps:get_status');
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'load_success',
                status,
            });
        }
        catch (error) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'load_error',
                message: toErrorMessage(error),
            });
        }
        render();
    }
    refreshBtn.addEventListener('click', () => {
        void loadStatus();
    });
    doneBtn.addEventListener('click', () => {
        Homey.done();
    });
    Homey.ready();
    void loadStatus();
})(typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
        ? global
        : {});

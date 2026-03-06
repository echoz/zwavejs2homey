(function bootstrapBridgeToolsPage(root) {
    const PANEL_EMIT_TIMEOUT_MS = 15000;
    const maybePresenter = root?.Zwjs2HomeyUi?.bridgeToolsPresenter;
    if (!maybePresenter)
        return;
    const presenter = maybePresenter;
    const stateRef = {
        current: presenter.createInitialState(),
    };
    function mustElement(id) {
        const element = document.getElementById(id);
        if (!element)
            throw new Error(`Missing repair page element: ${id}`);
        return element;
    }
    const subtitleEl = mustElement('subtitle');
    const refreshBtn = mustElement('refresh-btn');
    const filterActionNeededBtn = mustElement('filter-action-needed-btn');
    const filterAllBtn = mustElement('filter-all-btn');
    const runtimeKv = mustElement('runtime-kv');
    const runtimeAdvancedKv = mustElement('runtime-advanced-kv');
    const recommendationCodesKv = mustElement('recommendation-codes-kv');
    const mappingSkipReasonsKv = mustElement('mapping-skip-reasons-kv');
    const summaryKv = mustElement('summary-kv');
    const nodesMeta = mustElement('nodes-meta');
    const nodesTable = mustElement('nodes-table');
    const nodesEmpty = mustElement('nodes-empty');
    const nodesTbody = mustElement('nodes-tbody');
    const statusEl = mustElement('status');
    const errorPanel = mustElement('error-panel');
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function recommendationPillClass(tone) {
        if (tone === 'warn')
            return 'status-pill warn';
        if (tone === 'danger')
            return 'status-pill danger';
        return 'status-pill ok';
    }
    function setKv(container, rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            container.innerHTML =
                '<div class="k">Details</div><div class="v hint">No data available.</div>';
            return;
        }
        container.innerHTML = rows
            .map((row) => {
            const valueClass = row.valueClass ? ` ${row.valueClass}` : '';
            return `<div class="k">${escapeHtml(row.key)}</div><div class="v${valueClass}">${escapeHtml(row.value)}</div>`;
        })
            .join('');
    }
    function renderNodes(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            nodesEmpty.hidden = false;
            nodesTable.hidden = true;
            nodesTbody.innerHTML = '';
            return;
        }
        nodesEmpty.hidden = true;
        nodesTable.hidden = false;
        nodesTbody.innerHTML = rows
            .map((row) => {
            return `<tr>
          <td>${escapeHtml(row.nodeLabel)}<br/><span class="mono">${escapeHtml(row.homeyDeviceId)}</span></td>
          <td>${escapeHtml(row.identityLabel)}<br/><span class="hint">${escapeHtml(row.nodeStateLabel)}</span><br/><span class="hint">Location: ${escapeHtml(row.locationLabel)}</span></td>
          <td><span class="mono">${escapeHtml(row.profileId)}</span><br/><span class="hint">Class: ${escapeHtml(row.profileClass)}</span><br/><span class="hint">Rule Match: ${escapeHtml(row.ruleMatch)}</span><br/><span class="hint">Profile Source: ${escapeHtml(row.profileSource)}</span><br/><span class="hint">Curation: ${escapeHtml(row.curationStatus)}</span><br/><span class="hint">Match: ${escapeHtml(row.profileMatch)}</span><br/><span class="hint">Fallback: ${escapeHtml(row.fallbackReason)}</span></td>
          <td><span class="${recommendationPillClass(row.recommendationTone)}">${escapeHtml(row.recommendationLabel)}</span><br/><span class="hint">${escapeHtml(row.recommendationReason)}</span></td>
          <td>${escapeHtml(row.mappingSummary)}<br/><span class="hint">${escapeHtml(row.mappingDetail)}</span><br/><span class="hint">Skipped: ${escapeHtml(row.mappingSkippedSummary)}</span></td>
        </tr>`;
        })
            .join('');
    }
    function render() {
        const viewModel = presenter.buildViewModel(stateRef.current);
        refreshBtn.disabled = viewModel.loading;
        filterActionNeededBtn.disabled = viewModel.loading;
        filterAllBtn.disabled = viewModel.loading;
        filterActionNeededBtn.classList.toggle('is-active', stateRef.current.filterMode === 'action-needed');
        filterAllBtn.classList.toggle('is-active', stateRef.current.filterMode === 'all');
        statusEl.classList.remove('ok', 'warn', 'error');
        if (viewModel.tone === 'ok')
            statusEl.classList.add('ok');
        if (viewModel.tone === 'warn')
            statusEl.classList.add('warn');
        if (viewModel.tone === 'error')
            statusEl.classList.add('error');
        statusEl.textContent = viewModel.status;
        errorPanel.hidden = !viewModel.error;
        errorPanel.textContent = viewModel.error ? viewModel.error : '';
        subtitleEl.textContent = viewModel.subtitle;
        filterActionNeededBtn.textContent = viewModel.filterActionLabel;
        filterAllBtn.textContent = viewModel.filterAllLabel;
        setKv(runtimeKv, viewModel.runtimeRows);
        setKv(runtimeAdvancedKv, viewModel.runtimeAdvancedRows);
        setKv(recommendationCodesKv, viewModel.recommendationCodeRows);
        setKv(mappingSkipReasonsKv, viewModel.mappingSkipReasonRows);
        setKv(summaryKv, viewModel.summaryRows);
        nodesMeta.textContent = viewModel.nodesMeta;
        renderNodes(viewModel.nodes);
        if (viewModel.nodesEmptyMessage) {
            nodesEmpty.hidden = false;
            nodesEmpty.textContent = viewModel.nodesEmptyMessage;
            if (viewModel.nodes.length === 0) {
                nodesTable.hidden = true;
            }
        }
    }
    async function emitWithTimeout(eventName) {
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`${eventName} timed out after ${PANEL_EMIT_TIMEOUT_MS}ms`));
            }, PANEL_EMIT_TIMEOUT_MS);
        });
        try {
            return (await Promise.race([Homey.emit(eventName), timeoutPromise]));
        }
        finally {
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
        }
    }
    async function loadSnapshot(eventName) {
        stateRef.current = presenter.reduce(stateRef.current, { type: 'load_start' });
        render();
        try {
            const snapshot = await emitWithTimeout(eventName);
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'load_success',
                snapshot,
            });
        }
        catch (error) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'load_error',
                message: error instanceof Error ? error.message : 'Failed to load bridge diagnostics.',
            });
        }
        render();
    }
    refreshBtn.addEventListener('click', () => {
        void loadSnapshot('bridge_tools:refresh');
    });
    filterActionNeededBtn.addEventListener('click', () => {
        stateRef.current = presenter.reduce(stateRef.current, {
            type: 'set_filter',
            filterMode: 'action-needed',
        });
        render();
    });
    filterAllBtn.addEventListener('click', () => {
        stateRef.current = presenter.reduce(stateRef.current, {
            type: 'set_filter',
            filterMode: 'all',
        });
        render();
    });
    Homey.ready();
    void loadSnapshot('bridge_tools:get_snapshot');
})(typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
        ? global
        : {});

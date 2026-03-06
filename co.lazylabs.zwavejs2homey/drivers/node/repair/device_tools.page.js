(function bootstrapDeviceToolsPage(root) {
    const PANEL_EMIT_TIMEOUT_MS = 15000;
    const maybePresenter = root?.Zwjs2HomeyUi?.deviceToolsPresenter;
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
    const refreshBtn = mustElement('refresh-btn');
    const statusLine = mustElement('status-line');
    const subtitle = mustElement('device-subtitle');
    const errorPanel = mustElement('error-panel');
    const zwjsNodeKv = mustElement('zwjs-node-kv');
    const adapterKv = mustElement('adapter-kv');
    const recommendationContent = mustElement('recommendation-content');
    const profileRefKv = mustElement('profile-reference-kv');
    const mappingSkipKv = mustElement('mapping-skip-kv');
    const runtimeContextKv = mustElement('runtime-context-kv');
    const curationKv = mustElement('curation-kv');
    const whyKv = mustElement('why-kv');
    const latestActionKv = mustElement('latest-action-kv');
    const backfillBtn = mustElement('backfill-btn');
    const adoptBtn = mustElement('adopt-btn');
    const actionHint = mustElement('action-hint');
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
    function recommendationPillClass(tone) {
        if (tone === 'warn')
            return 'status-pill warn';
        if (tone === 'danger')
            return 'status-pill danger';
        return 'status-pill ok';
    }
    function renderRecommendation(recommendation) {
        recommendationContent.innerHTML = `
      <div><span class="${recommendationPillClass(recommendation.badgeTone)}">${escapeHtml(recommendation.badgeLabel)}</span></div>
      <p class="hint" style="margin:8px 0 0;">${escapeHtml(recommendation.reasonText)}</p>
      <p class="hint" style="margin:6px 0 0;">${escapeHtml(recommendation.detailText)}</p>
    `;
    }
    function render() {
        const viewModel = presenter.buildViewModel(stateRef.current);
        refreshBtn.disabled = viewModel.loading || viewModel.actionInFlight;
        backfillBtn.disabled = viewModel.backfillDisabled;
        adoptBtn.disabled = viewModel.adoptDisabled;
        subtitle.textContent = viewModel.subtitle;
        errorPanel.hidden = !viewModel.error;
        errorPanel.textContent = viewModel.error ? viewModel.error : '';
        statusLine.classList.remove('ok', 'warn', 'error');
        if (viewModel.statusTone === 'ok')
            statusLine.classList.add('ok');
        if (viewModel.statusTone === 'warn')
            statusLine.classList.add('warn');
        if (viewModel.statusTone === 'error')
            statusLine.classList.add('error');
        statusLine.textContent = viewModel.statusLine;
        setKv(zwjsNodeKv, viewModel.zwjsNodeRows);
        setKv(adapterKv, viewModel.adapterRows);
        renderRecommendation(viewModel.recommendation);
        setKv(profileRefKv, viewModel.profileRefRows);
        setKv(mappingSkipKv, viewModel.mappingSkipRows);
        setKv(runtimeContextKv, viewModel.runtimeContextRows);
        setKv(curationKv, viewModel.curationRows);
        setKv(whyKv, viewModel.decisionRows);
        setKv(latestActionKv, viewModel.latestActionRows);
        actionHint.textContent = viewModel.actionHint;
    }
    async function emitWithTimeout(eventName, payload) {
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`${eventName} timed out after ${PANEL_EMIT_TIMEOUT_MS}ms`));
            }, PANEL_EMIT_TIMEOUT_MS);
        });
        try {
            return (await Promise.race([Homey.emit(eventName, payload), timeoutPromise]));
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
                message: error instanceof Error ? error.message : 'Failed to load snapshot.',
            });
        }
        render();
    }
    async function executeAction(actionSelection, confirmationText) {
        if (!stateRef.current.snapshot)
            return;
        if (!window.confirm(confirmationText))
            return;
        stateRef.current = presenter.reduce(stateRef.current, { type: 'action_start' });
        render();
        try {
            const result = await emitWithTimeout('device_tools:execute_action', {
                action: actionSelection,
            });
            const snapshot = result && typeof result === 'object' && result.snapshot
                ? result.snapshot
                : await emitWithTimeout('device_tools:refresh');
            const actionResult = result && typeof result === 'object' && result.actionResult ? result.actionResult : null;
            const summary = presenter.describeActionResult(actionResult, snapshot);
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'action_success',
                snapshot,
                actionResult,
                summary,
            });
        }
        catch (error) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'action_error',
                message: error instanceof Error ? error.message : 'Action failed.',
            });
        }
        render();
    }
    refreshBtn.addEventListener('click', () => {
        void loadSnapshot('device_tools:refresh');
    });
    backfillBtn.addEventListener('click', () => {
        void executeAction('backfill-marker', 'Backfill Profile Reference for this device? This writes marker metadata only.');
    });
    adoptBtn.addEventListener('click', () => {
        void executeAction('adopt-recommended-baseline', 'Adopt the compiled profile update for this device? This removes current curation for this device.');
    });
    Homey.ready();
    void loadSnapshot('device_tools:get_snapshot');
})(typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
        ? global
        : {});

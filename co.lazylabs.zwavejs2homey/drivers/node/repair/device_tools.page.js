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
    const lockExtensionKv = mustElement('lock-extension-kv');
    const lockSlotInput = mustElement('lock-slot-input');
    const lockCodeInput = mustElement('lock-code-input');
    const lockStateSelect = mustElement('lock-state-select');
    const lockDryRun = mustElement('lock-dry-run');
    const lockSetCodeBtn = mustElement('lock-set-code-btn');
    const lockRemoveCodeBtn = mustElement('lock-remove-code-btn');
    const lockSetStateBtn = mustElement('lock-set-state-btn');
    const lockActionHint = mustElement('lock-action-hint');
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
        lockSetCodeBtn.disabled = viewModel.lockSetCodeDisabled;
        lockRemoveCodeBtn.disabled = viewModel.lockRemoveCodeDisabled;
        lockSetStateBtn.disabled = viewModel.lockSetStateDisabled;
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
        setKv(lockExtensionKv, viewModel.lockExtensionRows);
        actionHint.textContent = viewModel.actionHint;
        lockActionHint.textContent = viewModel.lockActionHint;
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
    async function executeAction(actionPayload, confirmationText) {
        if (!stateRef.current.snapshot)
            return;
        if (!window.confirm(confirmationText))
            return;
        stateRef.current = presenter.reduce(stateRef.current, { type: 'action_start' });
        render();
        try {
            const result = await emitWithTimeout('device_tools:execute_action', {
                ...(actionPayload && typeof actionPayload === 'object'
                    ? actionPayload
                    : {}),
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
        void executeAction({ action: 'backfill-marker' }, 'Backfill Profile Reference for this device? This writes marker metadata only.');
    });
    adoptBtn.addEventListener('click', () => {
        void executeAction({ action: 'adopt-recommended-baseline' }, 'Adopt the compiled profile update for this device? This removes current curation for this device.');
    });
    lockSetCodeBtn.addEventListener('click', () => {
        const slot = Number.parseInt(lockSlotInput.value, 10);
        const code = lockCodeInput.value.trim();
        if (!Number.isFinite(slot) || slot <= 0) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'action_error',
                message: 'Slot must be a positive integer.',
            });
            render();
            return;
        }
        if (!code) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'action_error',
                message: 'Code is required for Set Code.',
            });
            render();
            return;
        }
        void executeAction({
            kind: 'extension',
            extensionId: 'lock-user-codes',
            actionId: 'set-user-code',
            args: { slot, code },
            dryRun: lockDryRun.checked,
        }, `Set lock user code for slot ${slot}?`);
    });
    lockRemoveCodeBtn.addEventListener('click', () => {
        const slot = Number.parseInt(lockSlotInput.value, 10);
        if (!Number.isFinite(slot) || slot <= 0) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'action_error',
                message: 'Slot must be a positive integer.',
            });
            render();
            return;
        }
        void executeAction({
            kind: 'extension',
            extensionId: 'lock-user-codes',
            actionId: 'remove-user-code',
            args: { slot },
            dryRun: lockDryRun.checked,
        }, `Remove lock user code for slot ${slot}?`);
    });
    lockSetStateBtn.addEventListener('click', () => {
        const slot = Number.parseInt(lockSlotInput.value, 10);
        const state = lockStateSelect.value;
        if (!Number.isFinite(slot) || slot <= 0) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'action_error',
                message: 'Slot must be a positive integer.',
            });
            render();
            return;
        }
        void executeAction({
            kind: 'extension',
            extensionId: 'lock-user-codes',
            actionId: 'set-user-code-state',
            args: { slot, state },
            dryRun: lockDryRun.checked,
        }, `Set lock user code state for slot ${slot} to ${state}?`);
    });
    Homey.ready();
    void loadSnapshot('device_tools:get_snapshot');
})(typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
        ? global
        : {});

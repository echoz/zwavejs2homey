(function bootstrapBridgeConfigPage(root) {
    const PANEL_EMIT_TIMEOUT_MS = 15000;
    const CLOSE_AFTER_SUCCESS_DELAY_MS = 1200;
    let closingAfterSuccess = false;
    const maybePresenter = root?.Zwjs2HomeyUi?.bridgeConfigPresenter;
    if (!maybePresenter)
        return;
    const presenter = maybePresenter;
    const stateRef = {
        current: presenter.createInitialState(),
    };
    function mustElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Missing bridge config element: ${id}`);
        }
        return element;
    }
    const bridgeName = mustElement('bridge-name');
    const bridgeId = mustElement('bridge-id');
    const pairStatus = mustElement('pair-status');
    const form = mustElement('bridge-config-form');
    const urlInput = mustElement('zwjs-url');
    const authTypeSelect = mustElement('zwjs-auth-type');
    const tokenWrap = mustElement('zwjs-token-wrap');
    const tokenInput = mustElement('zwjs-token');
    const tokenHint = mustElement('zwjs-token-hint');
    const saveBtn = mustElement('save-btn');
    const doneBtn = mustElement('done-btn');
    const statusLine = mustElement('status-line');
    const errorLine = mustElement('error-line');
    function renderTokenVisibility(authType) {
        const showToken = authType === 'bearer';
        tokenWrap.hidden = !showToken;
    }
    function render() {
        const viewModel = presenter.buildViewModel(stateRef.current);
        bridgeName.textContent = viewModel.bridgeLabel;
        bridgeId.textContent = viewModel.bridgeId;
        pairStatus.innerHTML = viewModel.paired
            ? '<span class="status-pill ok">Paired</span>'
            : '<span class="status-pill warn">Not paired yet</span>';
        if (document.activeElement !== urlInput || !urlInput.value) {
            urlInput.value = viewModel.url;
        }
        if (document.activeElement !== tokenInput || !tokenInput.value) {
            tokenInput.value = viewModel.token;
        }
        authTypeSelect.value = viewModel.authType;
        renderTokenVisibility(viewModel.authType);
        tokenHint.textContent = viewModel.tokenConfigured
            ? 'A token is already configured for this bridge.'
            : 'No token configured yet.';
        form.classList.toggle('disabled', viewModel.loading || viewModel.saving || !viewModel.paired);
        saveBtn.disabled = viewModel.saveDisabled;
        doneBtn.disabled = viewModel.saving;
        statusLine.textContent = viewModel.status;
        if (viewModel.error) {
            errorLine.hidden = false;
            errorLine.textContent = viewModel.error;
        }
        else {
            errorLine.hidden = true;
            errorLine.textContent = '';
        }
    }
    async function emitWithTimeout(event, payload) {
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`${event} timed out after ${PANEL_EMIT_TIMEOUT_MS}ms`));
            }, PANEL_EMIT_TIMEOUT_MS);
        });
        try {
            return (await Promise.race([Homey.emit(event, payload), timeoutPromise]));
        }
        finally {
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
        }
    }
    function currentContextBridgeId() {
        return stateRef.current.context?.bridgeId ?? 'main';
    }
    async function loadContext() {
        stateRef.current = presenter.reduce(stateRef.current, { type: 'load_start' });
        render();
        try {
            const context = await emitWithTimeout('bridge_config:get_context');
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'load_success',
                context,
            });
        }
        catch (error) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'load_error',
                message: error instanceof Error ? error.message : 'Failed to load bridge context.',
            });
        }
        render();
    }
    async function saveSettings() {
        if (closingAfterSuccess || stateRef.current.saving) {
            return;
        }
        const validation = presenter.validateInput({
            bridgeId: currentContextBridgeId(),
            url: urlInput.value,
            authType: authTypeSelect.value,
            token: tokenInput.value,
        });
        if ('error' in validation) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'save_error',
                message: validation.error,
            });
            render();
            return;
        }
        stateRef.current = presenter.reduce(stateRef.current, { type: 'save_start' });
        render();
        try {
            await emitWithTimeout('bridge_config:save_settings', validation.payload);
            stateRef.current = presenter.reduce(stateRef.current, { type: 'save_success' });
            if (stateRef.current.context) {
                stateRef.current.context.settings.url = validation.payload.url;
                stateRef.current.context.settings.authType = validation.payload.authType;
                stateRef.current.context.settings.token =
                    validation.payload.authType === 'bearer' ? (validation.payload.token ?? '') : '';
                stateRef.current.context.settings.tokenConfigured =
                    validation.payload.authType === 'bearer';
            }
            stateRef.current = {
                ...stateRef.current,
                saving: true,
                status: 'Bridge saved. Closing pairing… Next: add ZWJS Node devices.',
            };
            closingAfterSuccess = true;
            render();
            await new Promise((resolve) => setTimeout(resolve, CLOSE_AFTER_SUCCESS_DELAY_MS));
            Homey.done();
            return;
        }
        catch (error) {
            stateRef.current = presenter.reduce(stateRef.current, {
                type: 'save_error',
                message: error instanceof Error ? error.message : 'Failed to save bridge settings.',
            });
        }
        render();
    }
    authTypeSelect.addEventListener('change', () => {
        renderTokenVisibility(authTypeSelect.value === 'bearer' ? 'bearer' : 'none');
    });
    saveBtn.addEventListener('click', () => {
        void saveSettings();
    });
    doneBtn.addEventListener('click', () => {
        Homey.done();
    });
    Homey.ready();
    void loadContext();
})(typeof window !== 'undefined' ? window : undefined);

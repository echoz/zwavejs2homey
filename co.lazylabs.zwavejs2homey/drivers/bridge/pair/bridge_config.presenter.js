(function attachBridgeConfigPresenter(root, factory) {
    const presenter = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = presenter;
    }
    const nextRoot = root || {};
    nextRoot.Zwjs2HomeyUi = nextRoot.Zwjs2HomeyUi || {};
    nextRoot.Zwjs2HomeyUi.bridgeConfigPresenter = presenter;
})(typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
        ? global
        : {}, function createPresenter() {
    function toStringOrEmpty(value) {
        if (typeof value !== 'string')
            return '';
        return value.trim();
    }
    function isWsUrl(value) {
        try {
            const parsed = new URL(value);
            return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
        }
        catch {
            return false;
        }
    }
    function normalizeContext(raw) {
        const record = raw && typeof raw === 'object' ? raw : {};
        const settings = record.settings && typeof record.settings === 'object'
            ? record.settings
            : {};
        const authType = settings.authType === 'bearer' ? 'bearer' : 'none';
        return {
            bridgeId: toStringOrEmpty(record.bridgeId) || 'main',
            homeyDeviceId: toStringOrEmpty(record.homeyDeviceId) || null,
            name: toStringOrEmpty(record.name) || null,
            paired: record.paired === true,
            settings: {
                url: toStringOrEmpty(settings.url),
                authType,
                token: authType === 'bearer' ? toStringOrEmpty(settings.token) : '',
                tokenConfigured: settings.tokenConfigured === true,
            },
        };
    }
    function createInitialState() {
        return {
            loading: false,
            saving: false,
            context: null,
            status: 'Loading bridge context...',
            error: null,
        };
    }
    function reduce(state, event) {
        if (!event || typeof event !== 'object')
            return state;
        if (event.type === 'load_start') {
            return {
                ...state,
                loading: true,
                error: null,
                status: 'Loading bridge context...',
            };
        }
        if (event.type === 'load_success') {
            const context = normalizeContext(event.context);
            return {
                ...state,
                loading: false,
                context,
                error: null,
                status: context.paired
                    ? 'Bridge paired. Configure connection settings below.'
                    : 'Bridge has not been paired yet.',
            };
        }
        if (event.type === 'load_error') {
            return {
                ...state,
                loading: false,
                error: toStringOrEmpty(event.message) || 'Failed to load bridge context.',
                status: 'Bridge context unavailable.',
            };
        }
        if (event.type === 'save_start') {
            return {
                ...state,
                saving: true,
                error: null,
                status: 'Saving bridge settings...',
            };
        }
        if (event.type === 'save_success') {
            return {
                ...state,
                saving: false,
                error: null,
                status: 'Bridge settings saved. You can now import ZWJS nodes.',
            };
        }
        if (event.type === 'save_error') {
            return {
                ...state,
                saving: false,
                error: toStringOrEmpty(event.message) || 'Failed to save bridge settings.',
                status: 'Bridge settings were not saved.',
            };
        }
        return state;
    }
    function buildViewModel(state) {
        const context = state.context;
        const bridgeLabel = context?.name || context?.homeyDeviceId || context?.bridgeId || 'Bridge';
        return {
            loading: state.loading,
            saving: state.saving,
            bridgeLabel,
            bridgeId: context?.bridgeId || 'main',
            paired: context?.paired === true,
            url: context?.settings.url || '',
            authType: context?.settings.authType || 'none',
            token: context?.settings.token || '',
            tokenConfigured: context?.settings.tokenConfigured === true,
            status: state.status,
            error: state.error,
            saveDisabled: state.loading || state.saving || context?.paired !== true,
        };
    }
    function validateInput(input) {
        const bridgeId = toStringOrEmpty(input.bridgeId);
        if (!bridgeId) {
            return { error: 'Missing bridge id.' };
        }
        const url = toStringOrEmpty(input.url);
        if (!url) {
            return { error: 'WebSocket URL is required.' };
        }
        if (!isWsUrl(url)) {
            return { error: 'URL must start with ws:// or wss://.' };
        }
        const authType = input.authType === 'bearer' ? 'bearer' : 'none';
        const token = toStringOrEmpty(input.token);
        if (authType === 'bearer' && !token) {
            return { error: 'Bearer token is required when auth type is bearer.' };
        }
        if (authType === 'bearer') {
            return {
                payload: {
                    bridgeId,
                    url,
                    authType,
                    token,
                },
            };
        }
        return {
            payload: {
                bridgeId,
                url,
                authType,
            },
        };
    }
    return {
        createInitialState,
        reduce,
        buildViewModel,
        validateInput,
    };
});

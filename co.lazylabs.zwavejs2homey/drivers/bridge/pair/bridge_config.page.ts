interface BridgeConfigState {
  loading: boolean;
  saving: boolean;
  context: {
    bridgeId: string;
    homeyDeviceId: string | null;
    name: string | null;
    paired: boolean;
    settings: {
      url: string;
      authType: 'none' | 'bearer';
      token: string;
      tokenConfigured: boolean;
    };
  } | null;
  status: string;
  error: string | null;
}

interface BridgeConfigViewModel {
  loading: boolean;
  saving: boolean;
  bridgeLabel: string;
  bridgeId: string;
  paired: boolean;
  url: string;
  authType: 'none' | 'bearer';
  token: string;
  tokenConfigured: boolean;
  status: string;
  error: string | null;
  saveDisabled: boolean;
}

interface BridgeConfigPresenter {
  createInitialState: () => BridgeConfigState;
  reduce: (
    state: BridgeConfigState,
    event: { type: string; [key: string]: unknown },
  ) => BridgeConfigState;
  buildViewModel: (state: BridgeConfigState) => BridgeConfigViewModel;
  validateInput: (input: {
    bridgeId?: unknown;
    url?: unknown;
    authType?: unknown;
    token?: unknown;
  }) =>
    | {
        payload: {
          bridgeId: string;
          url: string;
          authType: 'none' | 'bearer';
          token?: string;
        };
      }
    | { error: string };
}

interface UiRoot {
  Zwjs2HomeyUi?: {
    bridgeConfigPresenter?: BridgeConfigPresenter;
  };
}

interface PairHomey {
  emit: (event: string, payload?: unknown) => Promise<unknown>;
  done: () => void;
  ready: () => void;
  alert?: (message: string, icon?: 'error' | 'warning' | 'info' | null) => Promise<void>;
}

declare const Homey: PairHomey;

(function bootstrapBridgeConfigPage(root: UiRoot | undefined) {
  const PANEL_EMIT_TIMEOUT_MS = 15000;
  const maybePresenter = root?.Zwjs2HomeyUi?.bridgeConfigPresenter;
  if (!maybePresenter) return;
  const presenter: BridgeConfigPresenter = maybePresenter;

  const stateRef = {
    current: presenter.createInitialState(),
  };

  function mustElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing bridge config element: ${id}`);
    }
    return element as T;
  }

  const bridgeName = mustElement<HTMLElement>('bridge-name');
  const bridgeId = mustElement<HTMLElement>('bridge-id');
  const pairStatus = mustElement<HTMLElement>('pair-status');
  const form = mustElement<HTMLFormElement>('bridge-config-form');
  const urlInput = mustElement<HTMLInputElement>('zwjs-url');
  const authTypeSelect = mustElement<HTMLSelectElement>('zwjs-auth-type');
  const tokenWrap = mustElement<HTMLElement>('zwjs-token-wrap');
  const tokenInput = mustElement<HTMLInputElement>('zwjs-token');
  const tokenHint = mustElement<HTMLElement>('zwjs-token-hint');
  const saveBtn = mustElement<HTMLButtonElement>('save-btn');
  const doneBtn = mustElement<HTMLButtonElement>('done-btn');
  const statusLine = mustElement<HTMLElement>('status-line');
  const errorLine = mustElement<HTMLElement>('error-line');

  function renderTokenVisibility(authType: 'none' | 'bearer'): void {
    const showToken = authType === 'bearer';
    tokenWrap.hidden = !showToken;
  }

  function render(): void {
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
    } else {
      errorLine.hidden = true;
      errorLine.textContent = '';
    }
  }

  async function emitWithTimeout(event: string, payload?: unknown): Promise<unknown> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`${event} timed out after ${PANEL_EMIT_TIMEOUT_MS}ms`));
      }, PANEL_EMIT_TIMEOUT_MS);
    });
    try {
      return (await Promise.race([Homey.emit(event, payload), timeoutPromise])) as unknown;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  function currentContextBridgeId(): string {
    return stateRef.current.context?.bridgeId ?? 'main';
  }

  async function loadContext(): Promise<void> {
    stateRef.current = presenter.reduce(stateRef.current, { type: 'load_start' });
    render();
    try {
      const context = await emitWithTimeout('bridge_config:get_context');
      stateRef.current = presenter.reduce(stateRef.current, {
        type: 'load_success',
        context,
      });
    } catch (error) {
      stateRef.current = presenter.reduce(stateRef.current, {
        type: 'load_error',
        message: error instanceof Error ? error.message : 'Failed to load bridge context.',
      });
    }
    render();
  }

  async function saveSettings(): Promise<void> {
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
      if (typeof Homey.alert === 'function') {
        try {
          await Homey.alert('Bridge saved. Next: add your ZWJS Node devices.', 'info');
        } catch (_error) {
          // Non-fatal: continue and close the pairing flow.
        }
      }
      Homey.done();
      return;
    } catch (error) {
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
})(typeof window !== 'undefined' ? (window as unknown as UiRoot) : undefined);

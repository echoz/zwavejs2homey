interface ConnectionPill {
  label: string;
  tone: 'ok' | 'warn' | 'error';
}

interface RuntimeStatusRow {
  key: string;
  value: string | ConnectionPill;
  kind: 'text' | 'pill';
}

interface RuntimeViewModel {
  rows: RuntimeStatusRow[];
  warnings: string[];
  warningCount: number;
  runtimeHint: string;
}

interface LoadedSettings {
  url: string;
  authType: 'none' | 'bearer';
  token: string;
}

interface ValidateSettingsResult {
  payload?: {
    url: string;
    auth: {
      type: 'none' | 'bearer';
      token?: string;
    };
  };
  error?: string;
}

interface RuntimeParseResult {
  data?: Record<string, unknown>;
  error?: string;
}

interface SettingsPresenter {
  DEFAULT_URL: string;
  normalizeLoadedSettings: (raw: unknown) => LoadedSettings;
  validateSettingsInput: (input: {
    url?: unknown;
    authType?: unknown;
    token?: unknown;
  }) => ValidateSettingsResult;
  parseRuntimeResponse: (response: unknown) => RuntimeParseResult;
  buildRuntimeViewModel: (data: Record<string, unknown>) => RuntimeViewModel;
}

interface UiRoot {
  Zwjs2HomeyUi?: {
    settingsPresenter?: SettingsPresenter;
  };
  onHomeyReady?: (homey: SettingsHomey) => void;
}

interface SettingsHomey {
  api: (
    method: string,
    path: string,
    body: unknown,
    callback: (error: Error | null, response: unknown) => void,
  ) => void;
  get: (key: string, callback: (error: Error | null, value: unknown) => void) => void;
  set: (key: string, value: unknown, callback: (error: Error | null) => void) => void;
  ready: () => void;
}

(function bootstrapSettingsPage(root: UiRoot | undefined) {
  const maybePresenter = root && root.Zwjs2HomeyUi && root.Zwjs2HomeyUi.settingsPresenter;
  if (!maybePresenter) return;
  const presenter: SettingsPresenter = maybePresenter;

  const SETTINGS_KEY = 'zwjs_connection';

  function mustElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing settings element: ${id}`);
    }
    return element as T;
  }

  const urlInput = mustElement<HTMLInputElement>('url');
  const authTypeSelect = mustElement<HTMLSelectElement>('authType');
  const tokenWrap = mustElement<HTMLElement>('tokenWrap');
  const tokenInput = mustElement<HTMLInputElement>('token');
  const saveBtn = mustElement<HTMLButtonElement>('saveBtn');
  const resetBtn = mustElement<HTMLButtonElement>('resetBtn');
  const status = mustElement<HTMLElement>('status');
  const runtimeKv = mustElement<HTMLElement>('runtime-kv');
  const runtimeHint = mustElement<HTMLElement>('runtime-hint');
  const warnings = mustElement<HTMLElement>('warnings');
  const refreshDiagnosticsBtn = mustElement<HTMLButtonElement>('refreshDiagnosticsBtn');
  const openBridgeToolsBtn = mustElement<HTMLButtonElement>('openBridgeToolsBtn');

  function escapeHtml(value: unknown): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(message: string, tone: 'ok' | 'warn' | 'error' | 'muted' = 'muted'): void {
    status.textContent = message;
    status.classList.remove('ok', 'warn', 'error', 'muted');
    status.classList.add(tone);
  }

  function updateTokenVisibility(): void {
    const needsToken = authTypeSelect.value === 'bearer';
    tokenWrap.classList.toggle('hidden', !needsToken);
  }

  function renderRuntimeRows(rows: RuntimeStatusRow[]): void {
    if (!Array.isArray(rows) || rows.length === 0) {
      runtimeKv.innerHTML = '<div class="k">Status</div><div class="v">n/a</div>';
      return;
    }
    runtimeKv.innerHTML = rows
      .map((row) => {
        let renderedValue = escapeHtml(row.value);
        if (row.kind === 'pill' && typeof row.value === 'object' && row.value !== null) {
          const pill = row.value as ConnectionPill;
          const tone = pill.tone === 'error' || pill.tone === 'warn' ? pill.tone : 'ok';
          renderedValue = `<span class="status-pill ${tone}">${escapeHtml(pill.label)}</span>`;
        }
        return `<div class="k">${escapeHtml(row.key)}</div><div class="v">${renderedValue}</div>`;
      })
      .join('');
  }

  function renderWarnings(items: string[]): void {
    if (!Array.isArray(items) || items.length === 0) {
      warnings.hidden = true;
      warnings.innerHTML = '';
      return;
    }
    warnings.hidden = false;
    warnings.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  }

  function getDraftSettings(): { url: string; authType: string; token: string } {
    return {
      url: urlInput.value,
      authType: authTypeSelect.value,
      token: tokenInput.value,
    };
  }

  function renderLoadedSettings(raw: unknown): void {
    const normalized = presenter.normalizeLoadedSettings(raw);
    urlInput.value = normalized.url;
    authTypeSelect.value = normalized.authType;
    tokenInput.value = normalized.token;
    updateTokenVisibility();
  }

  function renderRuntimeDiagnostics(data: Record<string, unknown>): void {
    const viewModel = presenter.buildRuntimeViewModel(data);
    renderRuntimeRows(viewModel.rows);
    renderWarnings(viewModel.warnings);
    runtimeHint.textContent = viewModel.runtimeHint;
    if (viewModel.warningCount > 0) {
      setStatus(
        `Runtime diagnostics refreshed with ${viewModel.warningCount} warning${
          viewModel.warningCount === 1 ? '' : 's'
        }.`,
        'warn',
      );
      return;
    }
    setStatus('Runtime diagnostics refreshed.', 'ok');
  }

  function refreshDiagnostics(homey: SettingsHomey): void {
    refreshDiagnosticsBtn.disabled = true;
    runtimeHint.textContent = 'Refreshing runtime diagnostics...';
    setStatus('Refreshing runtime diagnostics...', 'muted');
    homey.api('GET', '/runtime/diagnostics', null, (error, response) => {
      refreshDiagnosticsBtn.disabled = false;
      if (error) {
        setStatus(`Failed to load runtime diagnostics: ${error.message || String(error)}`, 'error');
        renderRuntimeRows([]);
        renderWarnings(['Runtime diagnostics endpoint is unavailable.']);
        runtimeHint.textContent = 'Runtime diagnostics unavailable.';
        return;
      }
      const parsed = presenter.parseRuntimeResponse(response);
      if (parsed.error) {
        setStatus(parsed.error, 'error');
        renderRuntimeRows([]);
        renderWarnings(['Runtime diagnostics payload is invalid.']);
        runtimeHint.textContent = 'Runtime diagnostics payload is invalid.';
        return;
      }
      renderRuntimeDiagnostics(parsed.data || {});
    });
  }

  function loadSettings(homey: SettingsHomey): void {
    homey.get(SETTINGS_KEY, (error, raw) => {
      if (error) {
        setStatus(`Failed to load settings: ${error.message || String(error)}`, 'error');
        homey.ready();
        return;
      }
      renderLoadedSettings(raw);
      setStatus('Settings loaded.', 'ok');
      refreshDiagnostics(homey);
      homey.ready();
    });
  }

  function wireEvents(homey: SettingsHomey): void {
    authTypeSelect.addEventListener('change', () => {
      updateTokenVisibility();
    });

    saveBtn.addEventListener('click', () => {
      const result = presenter.validateSettingsInput(getDraftSettings());
      if (result.error || !result.payload) {
        setStatus(result.error || 'Invalid settings input.', 'error');
        return;
      }
      homey.set(SETTINGS_KEY, result.payload, (error) => {
        if (error) {
          setStatus(`Failed to save settings: ${error.message || String(error)}`, 'error');
          return;
        }
        setStatus('Saved. Connection will be reloaded automatically.', 'ok');
        refreshDiagnostics(homey);
      });
    });

    resetBtn.addEventListener('click', () => {
      const payload = {
        url: presenter.DEFAULT_URL,
        auth: { type: 'none' as const },
      };
      homey.set(SETTINGS_KEY, payload, (error) => {
        if (error) {
          setStatus(`Failed to reset settings: ${error.message || String(error)}`, 'error');
          return;
        }
        renderLoadedSettings(payload);
        setStatus('Reset to defaults. Connection will be reloaded automatically.', 'ok');
        refreshDiagnostics(homey);
      });
    });

    refreshDiagnosticsBtn.addEventListener('click', () => {
      refreshDiagnostics(homey);
    });

    openBridgeToolsBtn.addEventListener('click', () => {
      setStatus(
        'Open Devices -> ZWJS Bridge -> Repair to access Bridge Tools diagnostics.',
        'muted',
      );
    });
  }

  function onHomeyReady(homey: SettingsHomey): void {
    wireEvents(homey);
    loadSettings(homey);
  }

  root!.onHomeyReady = onHomeyReady;
})(
  typeof window !== 'undefined'
    ? (window as unknown as UiRoot)
    : typeof global !== 'undefined'
      ? (global as unknown as UiRoot)
      : ({} as UiRoot),
);

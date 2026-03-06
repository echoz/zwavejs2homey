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

interface SupportBundleExportResult {
  fileName: string;
  content: string;
  redacted: boolean;
}

interface SettingsPresenter {
  DEFAULT_URL: string;
  DEFAULT_SUPPORT_BUNDLE_FILE_NAME: string;
  normalizeLoadedSettings: (raw: unknown) => LoadedSettings;
  validateSettingsInput: (input: {
    url?: unknown;
    authType?: unknown;
    token?: unknown;
  }) => ValidateSettingsResult;
  parseRuntimeResponse: (response: unknown) => RuntimeParseResult;
  parseSupportBundleResponse: (response: unknown) => RuntimeParseResult;
  buildSupportBundleExport: (
    input: Record<string, unknown>,
    options?: { redact?: boolean },
  ) => SupportBundleExportResult;
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
  const PANEL_API_TIMEOUT_MS = 15000;
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
  const exportSupportBundleBtn = mustElement<HTMLButtonElement>('exportSupportBundleBtn');
  const redactSupportBundleCheckbox = mustElement<HTMLInputElement>('redactSupportBundle');

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

  function downloadTextFile(fileName: string, content: string): void {
    const payload = content ?? '';
    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
      const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName || presenter.DEFAULT_SUPPORT_BUNDLE_FILE_NAME;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
      return;
    }
    const encoded = encodeURIComponent(payload);
    const fallbackLink = document.createElement('a');
    fallbackLink.href = `data:application/json;charset=utf-8,${encoded}`;
    fallbackLink.download = fileName || presenter.DEFAULT_SUPPORT_BUNDLE_FILE_NAME;
    document.body.appendChild(fallbackLink);
    fallbackLink.click();
    document.body.removeChild(fallbackLink);
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

  async function apiRequestWithTimeout(
    homey: SettingsHomey,
    method: string,
    path: string,
    body: unknown,
    operationLabel: string,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`${operationLabel} timed out after ${PANEL_API_TIMEOUT_MS}ms`));
      }, PANEL_API_TIMEOUT_MS);

      try {
        homey.api(method, path, body, (error, response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          if (error) {
            reject(error);
            return;
          }
          resolve(response);
        });
      } catch (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  async function refreshDiagnostics(homey: SettingsHomey): Promise<void> {
    refreshDiagnosticsBtn.disabled = true;
    runtimeHint.textContent = 'Refreshing runtime diagnostics...';
    setStatus('Refreshing runtime diagnostics...', 'muted');
    try {
      const response = await apiRequestWithTimeout(
        homey,
        'GET',
        '/runtime/diagnostics',
        null,
        'runtime diagnostics request',
      );
      const parsed = presenter.parseRuntimeResponse(response);
      if (parsed.error) {
        setStatus(parsed.error, 'error');
        renderRuntimeRows([]);
        renderWarnings(['Runtime diagnostics payload is invalid.']);
        runtimeHint.textContent = 'Runtime diagnostics payload is invalid.';
        return;
      }
      renderRuntimeDiagnostics(parsed.data || {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Failed to load runtime diagnostics: ${message}`, 'error');
      renderRuntimeRows([]);
      renderWarnings(['Runtime diagnostics endpoint is unavailable.']);
      runtimeHint.textContent = 'Runtime diagnostics unavailable.';
    } finally {
      refreshDiagnosticsBtn.disabled = false;
    }
  }

  async function exportSupportBundle(homey: SettingsHomey): Promise<void> {
    exportSupportBundleBtn.disabled = true;
    const redact = redactSupportBundleCheckbox.checked;
    setStatus('Building support bundle...', 'muted');
    try {
      const response = await apiRequestWithTimeout(
        homey,
        'GET',
        '/runtime/support-bundle?includeNoAction=true',
        null,
        'support bundle request',
      );
      const parsed = presenter.parseSupportBundleResponse(response);
      if (parsed.error || !parsed.data) {
        setStatus(parsed.error || 'Support bundle payload is invalid.', 'error');
        return;
      }
      const bundle = presenter.buildSupportBundleExport(parsed.data, { redact });
      try {
        downloadTextFile(bundle.fileName, bundle.content);
        setStatus(`Support bundle downloaded (${bundle.redacted ? 'redacted' : 'raw'}).`, 'ok');
      } catch (downloadError) {
        const message =
          downloadError instanceof Error ? downloadError.message : String(downloadError);
        setStatus(`Failed to download support bundle: ${message}`, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Failed to build support bundle: ${message}`, 'error');
    } finally {
      exportSupportBundleBtn.disabled = false;
    }
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
      void refreshDiagnostics(homey);
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
        void refreshDiagnostics(homey);
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
        void refreshDiagnostics(homey);
      });
    });

    refreshDiagnosticsBtn.addEventListener('click', () => {
      void refreshDiagnostics(homey);
    });

    openBridgeToolsBtn.addEventListener('click', () => {
      setStatus(
        'Open Devices -> ZWJS Bridge -> Repair to access Bridge Tools diagnostics.',
        'muted',
      );
    });

    exportSupportBundleBtn.addEventListener('click', () => {
      void exportSupportBundle(homey);
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

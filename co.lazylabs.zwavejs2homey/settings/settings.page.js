(function bootstrapSettingsPage(root) {
  const presenter = root && root.Zwjs2HomeyUi && root.Zwjs2HomeyUi.settingsPresenter;
  if (!presenter) return;

  const SETTINGS_KEY = 'zwjs_connection';

  const urlInput = document.getElementById('url');
  const authTypeSelect = document.getElementById('authType');
  const tokenWrap = document.getElementById('tokenWrap');
  const tokenInput = document.getElementById('token');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const status = document.getElementById('status');
  const runtimeKv = document.getElementById('runtime-kv');
  const runtimeHint = document.getElementById('runtime-hint');
  const warnings = document.getElementById('warnings');
  const refreshDiagnosticsBtn = document.getElementById('refreshDiagnosticsBtn');
  const openBridgeToolsBtn = document.getElementById('openBridgeToolsBtn');

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(message, tone) {
    status.textContent = message;
    status.classList.remove('ok', 'warn', 'error', 'muted');
    status.classList.add(tone || 'muted');
  }

  function updateTokenVisibility() {
    const needsToken = authTypeSelect.value === 'bearer';
    tokenWrap.classList.toggle('hidden', !needsToken);
  }

  function renderRuntimeRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      runtimeKv.innerHTML = '<div class="k">Status</div><div class="v">n/a</div>';
      return;
    }
    runtimeKv.innerHTML = rows
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

  function renderWarnings(items) {
    if (!Array.isArray(items) || items.length === 0) {
      warnings.hidden = true;
      warnings.innerHTML = '';
      return;
    }
    warnings.hidden = false;
    warnings.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  }

  function getDraftSettings() {
    return {
      url: urlInput.value,
      authType: authTypeSelect.value,
      token: tokenInput.value,
    };
  }

  function renderLoadedSettings(raw) {
    const normalized = presenter.normalizeLoadedSettings(raw);
    urlInput.value = normalized.url;
    authTypeSelect.value = normalized.authType;
    tokenInput.value = normalized.token;
    updateTokenVisibility();
  }

  function renderRuntimeDiagnostics(data) {
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

  function refreshDiagnostics(Homey) {
    refreshDiagnosticsBtn.disabled = true;
    runtimeHint.textContent = 'Refreshing runtime diagnostics...';
    setStatus('Refreshing runtime diagnostics...', 'muted');
    Homey.api('GET', '/runtime/diagnostics', null, (error, response) => {
      refreshDiagnosticsBtn.disabled = false;
      if (error) {
        setStatus(`Failed to load runtime diagnostics: ${error.message || error}`, 'error');
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
      renderRuntimeDiagnostics(parsed.data);
    });
  }

  function loadSettings(Homey) {
    Homey.get(SETTINGS_KEY, (error, raw) => {
      if (error) {
        setStatus(`Failed to load settings: ${error.message || error}`, 'error');
        Homey.ready();
        return;
      }
      renderLoadedSettings(raw);
      setStatus('Settings loaded.', 'ok');
      refreshDiagnostics(Homey);
      Homey.ready();
    });
  }

  function wireEvents(Homey) {
    authTypeSelect.addEventListener('change', () => {
      updateTokenVisibility();
    });

    saveBtn.addEventListener('click', () => {
      const result = presenter.validateSettingsInput(getDraftSettings());
      if (result.error) {
        setStatus(result.error, 'error');
        return;
      }
      Homey.set(SETTINGS_KEY, result.payload, (error) => {
        if (error) {
          setStatus(`Failed to save settings: ${error.message || error}`, 'error');
          return;
        }
        setStatus('Saved. Connection will be reloaded automatically.', 'ok');
        refreshDiagnostics(Homey);
      });
    });

    resetBtn.addEventListener('click', () => {
      const payload = {
        url: presenter.DEFAULT_URL,
        auth: { type: 'none' },
      };
      Homey.set(SETTINGS_KEY, payload, (error) => {
        if (error) {
          setStatus(`Failed to reset settings: ${error.message || error}`, 'error');
          return;
        }
        renderLoadedSettings(payload);
        setStatus('Reset to defaults. Connection will be reloaded automatically.', 'ok');
        refreshDiagnostics(Homey);
      });
    });

    refreshDiagnosticsBtn.addEventListener('click', () => {
      refreshDiagnostics(Homey);
    });

    openBridgeToolsBtn.addEventListener('click', () => {
      setStatus(
        'Open Devices -> ZWJS Bridge -> Repair to access Bridge Tools diagnostics.',
        'muted',
      );
    });
  }

  function onHomeyReady(Homey) {
    wireEvents(Homey);
    loadSettings(Homey);
  }

  root.onHomeyReady = onHomeyReady;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);

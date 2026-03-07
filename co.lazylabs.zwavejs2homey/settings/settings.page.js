(function bootstrapSettingsPage(root) {
    const PANEL_API_TIMEOUT_MS = 15000;
    const maybePresenter = root && root.Zwjs2HomeyUi && root.Zwjs2HomeyUi.settingsPresenter;
    if (!maybePresenter)
        return;
    const maybeRequestOrderGate = root && root.Zwjs2HomeyUi && root.Zwjs2HomeyUi.requestOrderGate
        ? root.Zwjs2HomeyUi.requestOrderGate
        : null;
    const hasSharedRequestOrderGate = Boolean(maybeRequestOrderGate) &&
        typeof maybeRequestOrderGate?.createRequestOrderGate === 'function';
    function createLocalRequestOrderGate() {
        const latestTicketByChannel = new Map();
        const inFlightCountByChannel = new Map();
        function normalizeChannel(channel) {
            const trimmed = channel.trim();
            return trimmed.length > 0 ? trimmed : 'default';
        }
        return {
            begin(channel) {
                const key = normalizeChannel(channel);
                const nextTicket = (latestTicketByChannel.get(key) ?? 0) + 1;
                latestTicketByChannel.set(key, nextTicket);
                inFlightCountByChannel.set(key, (inFlightCountByChannel.get(key) ?? 0) + 1);
                return nextTicket;
            },
            isCurrent(channel, ticket) {
                const key = normalizeChannel(channel);
                return (latestTicketByChannel.get(key) ?? 0) === ticket;
            },
            finish(channel) {
                const key = normalizeChannel(channel);
                const current = inFlightCountByChannel.get(key) ?? 0;
                if (current <= 1) {
                    inFlightCountByChannel.delete(key);
                    return;
                }
                inFlightCountByChannel.set(key, current - 1);
            },
            isBusy(channels) {
                if (Array.isArray(channels) && channels.length > 0) {
                    return channels.some((channel) => {
                        const key = normalizeChannel(channel);
                        return (inFlightCountByChannel.get(key) ?? 0) > 0;
                    });
                }
                for (const count of inFlightCountByChannel.values()) {
                    if (count > 0)
                        return true;
                }
                return false;
            },
        };
    }
    const presenter = maybePresenter;
    const requestOrderGate = hasSharedRequestOrderGate
        ? maybeRequestOrderGate.createRequestOrderGate()
        : createLocalRequestOrderGate();
    const REQUEST_CHANNEL_DIAGNOSTICS = 'diagnostics';
    const REQUEST_CHANNEL_INVENTORY = 'inventory';
    function mustElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Missing settings element: ${id}`);
        }
        return element;
    }
    const status = mustElement('status');
    const bridgeFilter = mustElement('bridgeFilter');
    const bridgeScopeHint = mustElement('bridgeScopeHint');
    const runtimeKv = mustElement('runtime-kv');
    const runtimeHint = mustElement('runtime-hint');
    const warnings = mustElement('warnings');
    const bridgesHint = mustElement('bridges-hint');
    const bridgesTableWrap = mustElement('bridges-table-wrap');
    const bridgesTableBody = mustElement('bridges-table-body');
    const bridgesEmpty = mustElement('bridges-empty');
    const refreshDiagnosticsBtn = mustElement('refreshDiagnosticsBtn');
    const openBridgeToolsBtn = mustElement('openBridgeToolsBtn');
    const exportSupportBundleBtn = mustElement('exportSupportBundleBtn');
    const redactSupportBundleCheckbox = mustElement('redactSupportBundle');
    let bridgeInventoryItems = [];
    let activeBridgeScope = null;
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function formatDateTime(value) {
        if (typeof value !== 'string' || value.trim().length === 0)
            return 'n/a';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime()))
            return value;
        return parsed.toLocaleString();
    }
    function setStatus(message, tone = 'muted') {
        status.textContent = message;
        status.classList.remove('ok', 'warn', 'error', 'muted');
        status.classList.add(tone);
    }
    function normalizeBridgeScope(value) {
        if (typeof value !== 'string')
            return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    function buildQueryString(params) {
        const query = new URLSearchParams();
        for (const [key, rawValue] of Object.entries(params)) {
            if (typeof rawValue === 'undefined')
                continue;
            if (typeof rawValue === 'boolean') {
                query.set(key, rawValue ? 'true' : 'false');
                continue;
            }
            query.set(key, rawValue);
        }
        const output = query.toString();
        return output ? `?${output}` : '';
    }
    function bridgeScopeLabel() {
        return activeBridgeScope ? `bridge ${activeBridgeScope}` : 'all bridges';
    }
    function renderBridgeScopeHint() {
        bridgeScopeHint.textContent = `Scope: ${bridgeScopeLabel()}.`;
    }
    function syncControlsDisabledState() {
        const busy = requestOrderGate.isBusy([REQUEST_CHANNEL_DIAGNOSTICS, REQUEST_CHANNEL_INVENTORY]);
        refreshDiagnosticsBtn.disabled = busy;
        bridgeFilter.disabled = busy || bridgeInventoryItems.length === 0;
    }
    function downloadTextFile(fileName, content) {
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
    function renderRuntimeRows(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            runtimeKv.innerHTML = '<div class="k">Status</div><div class="v">n/a</div>';
            return;
        }
        runtimeKv.innerHTML = rows
            .map((row) => {
            let renderedValue = escapeHtml(row.value);
            if (row.kind === 'pill' && typeof row.value === 'object' && row.value !== null) {
                const pill = row.value;
                const tone = pill.tone === 'error' || pill.tone === 'warn' ? pill.tone : 'ok';
                renderedValue = `<span class="status-pill ${tone}">${escapeHtml(pill.label)}</span>`;
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
    function renderRuntimeDiagnostics(data) {
        const viewModel = presenter.buildRuntimeViewModel(data);
        renderRuntimeRows(viewModel.rows);
        renderWarnings(viewModel.warnings);
        runtimeHint.textContent = viewModel.runtimeHint;
        if (viewModel.warningCount > 0) {
            setStatus(`Runtime diagnostics refreshed for ${bridgeScopeLabel()} with ${viewModel.warningCount} warning${viewModel.warningCount === 1 ? '' : 's'}.`, 'warn');
            return;
        }
        setStatus(`Runtime diagnostics refreshed for ${bridgeScopeLabel()}.`, 'ok');
    }
    function toBridgeConnectionPill(item) {
        if (!item.configured) {
            return { label: 'Not Configured', tone: 'warn' };
        }
        if (item.runtime.transportConnected) {
            return { label: 'Connected', tone: 'ok' };
        }
        return { label: 'Disconnected', tone: 'warn' };
    }
    function normalizeBridgeInventoryItems(data) {
        const rawItems = Array.isArray(data.bridges) ? data.bridges : [];
        return rawItems
            .filter((item) => item && typeof item === 'object')
            .map((item) => {
            const record = item;
            const settings = record.settings && typeof record.settings === 'object'
                ? record.settings
                : {};
            const runtime = record.runtime && typeof record.runtime === 'object'
                ? record.runtime
                : {};
            const diagnosticsRefresh = record.diagnosticsRefresh && typeof record.diagnosticsRefresh === 'object'
                ? record.diagnosticsRefresh
                : {};
            const authType = settings.authType === 'bearer' ? 'bearer' : 'none';
            return {
                bridgeId: typeof record.bridgeId === 'string' ? record.bridgeId : 'unknown',
                homeyDeviceId: typeof record.homeyDeviceId === 'string' ? record.homeyDeviceId : null,
                name: typeof record.name === 'string' ? record.name : null,
                configured: record.configured === true,
                settings: {
                    url: typeof settings.url === 'string' ? settings.url : null,
                    authType,
                },
                runtime: {
                    transportConnected: runtime.transportConnected === true,
                    lifecycle: typeof runtime.lifecycle === 'string' ? runtime.lifecycle : 'stopped',
                },
                diagnosticsRefresh: {
                    lastSuccessAt: typeof diagnosticsRefresh.lastSuccessAt === 'string'
                        ? diagnosticsRefresh.lastSuccessAt
                        : null,
                    lastFailureAt: typeof diagnosticsRefresh.lastFailureAt === 'string'
                        ? diagnosticsRefresh.lastFailureAt
                        : null,
                    lastFailureReason: typeof diagnosticsRefresh.lastFailureReason === 'string'
                        ? diagnosticsRefresh.lastFailureReason
                        : null,
                    lastReason: typeof diagnosticsRefresh.lastReason === 'string'
                        ? diagnosticsRefresh.lastReason
                        : null,
                },
                importedNodeCount: typeof record.importedNodeCount === 'number' &&
                    Number.isFinite(record.importedNodeCount)
                    ? Math.max(0, Math.trunc(record.importedNodeCount))
                    : 0,
            };
        })
            .sort((left, right) => left.bridgeId.localeCompare(right.bridgeId));
    }
    function renderBridgeScopeOptions(items) {
        const previousScope = activeBridgeScope;
        const availableScopeIds = new Set(items.map((item) => item.bridgeId));
        if (activeBridgeScope && !availableScopeIds.has(activeBridgeScope)) {
            activeBridgeScope = null;
        }
        bridgeFilter.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = 'All Bridges';
        bridgeFilter.appendChild(allOption);
        for (const item of items) {
            const option = document.createElement('option');
            option.value = item.bridgeId;
            const nameLabel = item.name && item.name.trim().length > 0 ? ` (${item.name.trim()})` : '';
            option.textContent = `${item.bridgeId}${nameLabel}`;
            bridgeFilter.appendChild(option);
        }
        bridgeFilter.value = activeBridgeScope ?? '';
        renderBridgeScopeHint();
        syncControlsDisabledState();
        if (previousScope && previousScope !== activeBridgeScope) {
            setStatus(`Selected scope "${previousScope}" is no longer available. Reset to all bridges.`, 'warn');
        }
    }
    function buildBridgeToolsHint(item) {
        const deviceLabel = item.name && item.name.trim().length > 0 ? item.name.trim() : item.bridgeId;
        return `For ${deviceLabel} (${item.bridgeId}): open Devices -> ZWJS Bridge -> Device Settings for URL/auth, or Repair for diagnostics and actions.`;
    }
    function renderBridgeInventory(items) {
        if (!Array.isArray(items) || items.length === 0) {
            bridgesTableWrap.hidden = true;
            bridgesTableBody.innerHTML = '';
            bridgesEmpty.hidden = false;
            bridgesHint.textContent = 'No bridge devices are currently configured.';
            renderBridgeScopeOptions([]);
            return;
        }
        renderBridgeScopeOptions(items);
        bridgesTableWrap.hidden = false;
        bridgesEmpty.hidden = true;
        bridgesHint.textContent = `Showing ${items.length} configured bridge device(s).`;
        bridgesTableBody.innerHTML = items
            .map((item) => {
            const connectionPill = toBridgeConnectionPill(item);
            const lifecycleLabel = item.runtime.lifecycle && item.runtime.lifecycle.trim().length > 0
                ? item.runtime.lifecycle
                : 'stopped';
            const diagnosticsSuccessLabel = formatDateTime(item.diagnosticsRefresh.lastSuccessAt);
            const diagnosticsFailureLabel = formatDateTime(item.diagnosticsRefresh.lastFailureAt);
            const diagnosticsFailureReason = item.diagnosticsRefresh.lastFailureReason ?? null;
            const diagnosticsReason = item.diagnosticsRefresh.lastReason ?? null;
            const isScoped = activeBridgeScope && activeBridgeScope === item.bridgeId;
            return `
          <tr class="${isScoped ? 'is-scoped' : ''}">
            <td>
              <strong>${escapeHtml(item.bridgeId)}</strong><br />
              <span class="muted">${escapeHtml(item.name ?? item.homeyDeviceId ?? 'n/a')}</span>
            </td>
            <td>
              <span class="status-pill ${escapeHtml(connectionPill.tone)}">${escapeHtml(connectionPill.label)}</span><br />
              <span class="muted">${escapeHtml(item.settings.url ?? 'URL not set')}</span><br />
              <span class="muted">Auth: ${escapeHtml(item.settings.authType)}</span>
            </td>
            <td>
              ${escapeHtml(lifecycleLabel)}<br />
              <span class="muted">Refresh success: ${escapeHtml(diagnosticsSuccessLabel)}</span><br />
              <span class="muted">Last refresh: ${escapeHtml(diagnosticsReason ?? 'n/a')}</span><br />
              <span class="muted">Refresh failure: ${escapeHtml(diagnosticsFailureLabel)}</span>${diagnosticsFailureReason
                ? `<br /><span class="muted">Failure reason: ${escapeHtml(diagnosticsFailureReason)}</span>`
                : ''}
            </td>
            <td>${escapeHtml(item.importedNodeCount)}</td>
            <td>
              <div class="bridge-actions">
                <button type="button" data-bridge-action="scope" data-bridge-id="${escapeHtml(item.bridgeId)}">Use Scope</button>
                <button type="button" data-bridge-action="guide" data-bridge-id="${escapeHtml(item.bridgeId)}">Help</button>
              </div>
            </td>
          </tr>
        `;
        })
            .join('');
    }
    async function apiRequestWithTimeout(homey, method, path, body, operationLabel) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeoutHandle = setTimeout(() => {
                if (settled)
                    return;
                settled = true;
                reject(new Error(`${operationLabel} timed out after ${PANEL_API_TIMEOUT_MS}ms`));
            }, PANEL_API_TIMEOUT_MS);
            try {
                homey.api(method, path, body, (error, response) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timeoutHandle);
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(response);
                });
            }
            catch (error) {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timeoutHandle);
                reject(error);
            }
        });
    }
    async function refreshDiagnostics(homey) {
        const requestTicket = requestOrderGate.begin(REQUEST_CHANNEL_DIAGNOSTICS);
        syncControlsDisabledState();
        runtimeHint.textContent = `Refreshing runtime diagnostics for ${bridgeScopeLabel()}...`;
        setStatus(`Refreshing runtime diagnostics for ${bridgeScopeLabel()}...`, 'muted');
        try {
            const query = buildQueryString({ bridgeId: activeBridgeScope ?? undefined });
            const response = await apiRequestWithTimeout(homey, 'GET', `/runtime/diagnostics${query}`, null, 'runtime diagnostics request');
            if (!requestOrderGate.isCurrent(REQUEST_CHANNEL_DIAGNOSTICS, requestTicket)) {
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
        }
        catch (error) {
            if (!requestOrderGate.isCurrent(REQUEST_CHANNEL_DIAGNOSTICS, requestTicket)) {
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            setStatus(`Failed to load runtime diagnostics: ${message}`, 'error');
            renderRuntimeRows([]);
            renderWarnings(['Runtime diagnostics endpoint is unavailable.']);
            runtimeHint.textContent = `Runtime diagnostics unavailable for ${bridgeScopeLabel()}.`;
        }
        finally {
            requestOrderGate.finish(REQUEST_CHANNEL_DIAGNOSTICS);
            syncControlsDisabledState();
        }
    }
    async function refreshBridgeInventory(homey) {
        const requestTicket = requestOrderGate.begin(REQUEST_CHANNEL_INVENTORY);
        syncControlsDisabledState();
        bridgesHint.textContent = 'Refreshing bridge inventory...';
        bridgesEmpty.hidden = true;
        try {
            const response = await apiRequestWithTimeout(homey, 'GET', '/runtime/bridges', null, 'bridge inventory request');
            if (!requestOrderGate.isCurrent(REQUEST_CHANNEL_INVENTORY, requestTicket)) {
                return;
            }
            const parsed = presenter.parseRuntimeResponse(response);
            if (parsed.error || !parsed.data) {
                bridgeInventoryItems = [];
                renderBridgeInventory([]);
                bridgesHint.textContent = parsed.error || 'Bridge inventory payload is invalid.';
                return;
            }
            const items = normalizeBridgeInventoryItems(parsed.data);
            bridgeInventoryItems = items;
            renderBridgeInventory(items);
        }
        catch (error) {
            if (!requestOrderGate.isCurrent(REQUEST_CHANNEL_INVENTORY, requestTicket)) {
                return;
            }
            bridgeInventoryItems = [];
            renderBridgeInventory([]);
            const message = error instanceof Error ? error.message : String(error);
            bridgesHint.textContent = `Bridge inventory unavailable: ${message}`;
        }
        finally {
            requestOrderGate.finish(REQUEST_CHANNEL_INVENTORY);
            syncControlsDisabledState();
        }
    }
    async function exportSupportBundle(homey) {
        exportSupportBundleBtn.disabled = true;
        const redact = redactSupportBundleCheckbox.checked;
        setStatus('Building support bundle...', 'muted');
        try {
            const query = buildQueryString({
                includeNoAction: true,
                bridgeId: activeBridgeScope ?? undefined,
            });
            const response = await apiRequestWithTimeout(homey, 'GET', `/runtime/support-bundle${query}`, null, 'support bundle request');
            const parsed = presenter.parseSupportBundleResponse(response);
            if (parsed.error || !parsed.data) {
                setStatus(parsed.error || 'Support bundle payload is invalid.', 'error');
                return;
            }
            const bundle = presenter.buildSupportBundleExport(parsed.data, { redact });
            try {
                downloadTextFile(bundle.fileName, bundle.content);
                setStatus(`Support bundle downloaded (${bundle.redacted ? 'redacted' : 'raw'}).`, 'ok');
            }
            catch (downloadError) {
                const message = downloadError instanceof Error ? downloadError.message : String(downloadError);
                setStatus(`Failed to download support bundle: ${message}`, 'error');
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatus(`Failed to build support bundle: ${message}`, 'error');
        }
        finally {
            exportSupportBundleBtn.disabled = false;
        }
    }
    function wireEvents(homey) {
        refreshDiagnosticsBtn.addEventListener('click', () => {
            void refreshDiagnostics(homey);
            void refreshBridgeInventory(homey);
        });
        bridgeFilter.addEventListener('change', () => {
            activeBridgeScope = normalizeBridgeScope(bridgeFilter.value);
            renderBridgeScopeHint();
            void refreshDiagnostics(homey);
        });
        bridgesTableBody.addEventListener('click', (event) => {
            const target = event.target;
            if (!target)
                return;
            const button = target.closest('button[data-bridge-action]');
            if (!button)
                return;
            const bridgeId = normalizeBridgeScope(button.dataset.bridgeId);
            if (!bridgeId)
                return;
            const action = button.dataset.bridgeAction;
            if (action === 'scope') {
                activeBridgeScope = bridgeId;
                bridgeFilter.value = bridgeId;
                renderBridgeScopeHint();
                renderBridgeInventory(bridgeInventoryItems);
                void refreshDiagnostics(homey);
                return;
            }
            if (action === 'guide') {
                const bridge = bridgeInventoryItems.find((item) => item.bridgeId === bridgeId);
                if (bridge) {
                    setStatus(buildBridgeToolsHint(bridge), 'muted');
                }
            }
        });
        openBridgeToolsBtn.addEventListener('click', () => {
            if (activeBridgeScope) {
                const bridge = bridgeInventoryItems.find((item) => item.bridgeId === activeBridgeScope);
                if (bridge) {
                    setStatus(buildBridgeToolsHint(bridge), 'muted');
                    return;
                }
            }
            setStatus('Open Devices -> ZWJS Bridge -> Device Settings or Repair for bridge-level tooling.', 'muted');
        });
        exportSupportBundleBtn.addEventListener('click', () => {
            void exportSupportBundle(homey);
        });
    }
    function onHomeyReady(homey) {
        wireEvents(homey);
        setStatus(hasSharedRequestOrderGate
            ? 'App diagnostics ready.'
            : 'App diagnostics ready (local request guard active).', hasSharedRequestOrderGate ? 'ok' : 'warn');
        syncControlsDisabledState();
        void refreshDiagnostics(homey);
        void refreshBridgeInventory(homey);
        homey.ready();
    }
    root.onHomeyReady = onHomeyReady;
})(typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
        ? global
        : {});

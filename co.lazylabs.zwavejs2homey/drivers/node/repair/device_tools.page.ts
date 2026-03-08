interface DeviceToolsPageRoot {
  Zwjs2HomeyUi?: {
    deviceToolsPresenter?: {
      createInitialState: () => any;
      reduce: (state: any, event: any) => any;
      buildViewModel: (state: any) => any;
      describeActionResult: (actionResult: any, snapshot: any) => { message: string; tone: string };
    };
  };
}

interface HomeyRepairRuntime {
  emit: (eventName: string, payload?: unknown) => Promise<any>;
  ready: () => void;
}

declare const Homey: HomeyRepairRuntime;

(function bootstrapDeviceToolsPage(root: DeviceToolsPageRoot | undefined) {
  const PANEL_EMIT_TIMEOUT_MS = 15000;
  const maybePresenter = root?.Zwjs2HomeyUi?.deviceToolsPresenter;
  if (!maybePresenter) return;
  const presenter = maybePresenter;

  const stateRef = {
    current: presenter.createInitialState(),
  };

  function mustElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing repair page element: ${id}`);
    return element as T;
  }

  const refreshBtn = mustElement<HTMLButtonElement>('refresh-btn');
  const statusLine = mustElement<HTMLElement>('status-line');
  const subtitle = mustElement<HTMLElement>('device-subtitle');
  const errorPanel = mustElement<HTMLElement>('error-panel');
  const zwjsNodeKv = mustElement<HTMLElement>('zwjs-node-kv');
  const adapterKv = mustElement<HTMLElement>('adapter-kv');
  const recommendationContent = mustElement<HTMLElement>('recommendation-content');
  const profileRefKv = mustElement<HTMLElement>('profile-reference-kv');
  const mappingSkipKv = mustElement<HTMLElement>('mapping-skip-kv');
  const runtimeContextKv = mustElement<HTMLElement>('runtime-context-kv');
  const curationKv = mustElement<HTMLElement>('curation-kv');
  const whyKv = mustElement<HTMLElement>('why-kv');
  const latestActionKv = mustElement<HTMLElement>('latest-action-kv');
  const backfillBtn = mustElement<HTMLButtonElement>('backfill-btn');
  const adoptBtn = mustElement<HTMLButtonElement>('adopt-btn');
  const actionHint = mustElement<HTMLElement>('action-hint');
  const lockExtensionKv = mustElement<HTMLElement>('lock-extension-kv');
  const lockSlotInput = mustElement<HTMLInputElement>('lock-slot-input');
  const lockCodeInput = mustElement<HTMLInputElement>('lock-code-input');
  const lockStateSelect = mustElement<HTMLSelectElement>('lock-state-select');
  const lockDryRun = mustElement<HTMLInputElement>('lock-dry-run');
  const lockSetCodeBtn = mustElement<HTMLButtonElement>('lock-set-code-btn');
  const lockRemoveCodeBtn = mustElement<HTMLButtonElement>('lock-remove-code-btn');
  const lockSetStateBtn = mustElement<HTMLButtonElement>('lock-set-state-btn');
  const lockActionHint = mustElement<HTMLElement>('lock-action-hint');

  function escapeHtml(value: unknown): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setKv(
    container: HTMLElement,
    rows: Array<{ key: string; value: string; valueClass?: string }>,
  ): void {
    if (!Array.isArray(rows) || rows.length === 0) {
      container.innerHTML =
        '<div class="k">Details</div><div class="v hint">No data available.</div>';
      return;
    }
    container.innerHTML = rows
      .map((row) => {
        const valueClass = row.valueClass ? ` ${row.valueClass}` : '';
        return `<div class="k">${escapeHtml(row.key)}</div><div class="v${valueClass}">${escapeHtml(
          row.value,
        )}</div>`;
      })
      .join('');
  }

  function recommendationPillClass(tone: string): string {
    if (tone === 'warn') return 'status-pill warn';
    if (tone === 'danger') return 'status-pill danger';
    return 'status-pill ok';
  }

  function renderRecommendation(recommendation: {
    badgeLabel: string;
    badgeTone: string;
    reasonText: string;
    detailText: string;
  }): void {
    recommendationContent.innerHTML = `
      <div><span class="${recommendationPillClass(recommendation.badgeTone)}">${escapeHtml(
        recommendation.badgeLabel,
      )}</span></div>
      <p class="hint" style="margin:8px 0 0;">${escapeHtml(recommendation.reasonText)}</p>
      <p class="hint" style="margin:6px 0 0;">${escapeHtml(recommendation.detailText)}</p>
    `;
  }

  function render(): void {
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
    if (viewModel.statusTone === 'ok') statusLine.classList.add('ok');
    if (viewModel.statusTone === 'warn') statusLine.classList.add('warn');
    if (viewModel.statusTone === 'error') statusLine.classList.add('error');
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

  async function emitWithTimeout(eventName: string, payload?: unknown): Promise<any> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`${eventName} timed out after ${PANEL_EMIT_TIMEOUT_MS}ms`));
      }, PANEL_EMIT_TIMEOUT_MS);
    });
    try {
      return (await Promise.race([Homey.emit(eventName, payload), timeoutPromise])) as unknown;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  async function loadSnapshot(eventName: string): Promise<void> {
    stateRef.current = presenter.reduce(stateRef.current, { type: 'load_start' });
    render();
    try {
      const snapshot = await emitWithTimeout(eventName);
      stateRef.current = presenter.reduce(stateRef.current, {
        type: 'load_success',
        snapshot,
      });
    } catch (error) {
      stateRef.current = presenter.reduce(stateRef.current, {
        type: 'load_error',
        message: error instanceof Error ? error.message : 'Failed to load snapshot.',
      });
    }
    render();
  }

  async function executeAction(actionPayload: unknown, confirmationText: string): Promise<void> {
    if (!stateRef.current.snapshot) return;
    if (!window.confirm(confirmationText)) return;

    stateRef.current = presenter.reduce(stateRef.current, { type: 'action_start' });
    render();

    try {
      const result = await emitWithTimeout('device_tools:execute_action', {
        ...(actionPayload && typeof actionPayload === 'object'
          ? (actionPayload as Record<string, unknown>)
          : {}),
      });
      const snapshot =
        result && typeof result === 'object' && result.snapshot
          ? result.snapshot
          : await emitWithTimeout('device_tools:refresh');
      const actionResult =
        result && typeof result === 'object' && result.actionResult ? result.actionResult : null;
      const summary = presenter.describeActionResult(actionResult, snapshot);
      stateRef.current = presenter.reduce(stateRef.current, {
        type: 'action_success',
        snapshot,
        actionResult,
        summary,
      });
    } catch (error) {
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
    void executeAction(
      { action: 'backfill-marker' },
      'Backfill Profile Reference for this device? This writes marker metadata only.',
    );
  });
  adoptBtn.addEventListener('click', () => {
    void executeAction(
      { action: 'adopt-recommended-baseline' },
      'Adopt the compiled profile update for this device? This removes current curation for this device.',
    );
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
    void executeAction(
      {
        kind: 'extension',
        extensionId: 'lock-user-codes',
        actionId: 'set-user-code',
        args: { slot, code },
        dryRun: lockDryRun.checked,
      },
      `Set lock user code for slot ${slot}?`,
    );
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
    void executeAction(
      {
        kind: 'extension',
        extensionId: 'lock-user-codes',
        actionId: 'remove-user-code',
        args: { slot },
        dryRun: lockDryRun.checked,
      },
      `Remove lock user code for slot ${slot}?`,
    );
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
    void executeAction(
      {
        kind: 'extension',
        extensionId: 'lock-user-codes',
        actionId: 'set-user-code-state',
        args: { slot, state },
        dryRun: lockDryRun.checked,
      },
      `Set lock user code state for slot ${slot} to ${state}?`,
    );
  });

  Homey.ready();
  void loadSnapshot('device_tools:get_snapshot');
})(
  typeof window !== 'undefined'
    ? (window as unknown as DeviceToolsPageRoot)
    : typeof global !== 'undefined'
      ? (global as unknown as DeviceToolsPageRoot)
      : ({} as DeviceToolsPageRoot),
);

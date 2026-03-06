interface ConnectionPill {
  label: string;
  tone: 'ok' | 'warn' | 'error';
}

interface RecommendationViewModel {
  label: string;
  tone: 'ok' | 'warn' | 'danger';
  reason: string;
}

interface ImportedRow {
  nodeId: string;
  name: string;
  bridgeId: string;
  manufacturer: string;
  product: string;
  location: string;
  status: string;
  profileClass: string;
  profileId: string;
  profileMatch: string;
  profileSource: string;
  ruleMatch: string;
  recommendation: RecommendationViewModel;
}

interface StatusRow {
  key: string;
  value: string | ConnectionPill;
  kind: 'text' | 'pill';
}

interface PresenterState {
  loading: boolean;
  status: unknown;
  error: string | null;
}

interface PresenterViewModel {
  refreshDisabled: boolean;
  statusRows: StatusRow[];
  warnings: string[];
  guidanceTitle: string;
  guidanceSteps: string[];
  importedRows: ImportedRow[];
  importedMeta: string;
  importedEmpty: string;
  hasImportedRows: boolean;
  statusLine: string;
}

interface PairPresenter {
  createInitialState: () => PresenterState;
  reduce: (
    state: PresenterState,
    event: { type: string; [key: string]: unknown },
  ) => PresenterState;
  buildViewModel: (state: PresenterState) => PresenterViewModel;
}

interface UiRoot {
  Zwjs2HomeyUi?: {
    bridgeNextStepsPresenter?: PairPresenter;
  };
}

interface PairHomey {
  emit: (event: string) => Promise<unknown>;
  done: () => void;
  ready: () => void;
}

declare const Homey: PairHomey;

(function bootstrapBridgeNextStepsPage(root: UiRoot | undefined) {
  const maybePresenter = root && root.Zwjs2HomeyUi && root.Zwjs2HomeyUi.bridgeNextStepsPresenter;
  if (!maybePresenter) return;
  const presenter: PairPresenter = maybePresenter;

  const stateRef: { current: PresenterState } = {
    current: presenter.createInitialState(),
  };

  function mustElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing page element: ${id}`);
    }
    return element as T;
  }

  const statusKv = mustElement<HTMLElement>('status-kv');
  const warningsEl = mustElement<HTMLElement>('warnings');
  const statusLine = mustElement<HTMLElement>('status-line');
  const importedTableWrap = mustElement<HTMLElement>('imported-table-wrap');
  const importedTableBody = mustElement<HTMLElement>('imported-table-body');
  const importedEmpty = mustElement<HTMLElement>('imported-empty');
  const importedMeta = mustElement<HTMLElement>('imported-meta');
  const guidanceTitle = mustElement<HTMLElement>('guidance-title');
  const guidanceList = mustElement<HTMLElement>('guidance-list');
  const refreshBtn = mustElement<HTMLButtonElement>('refresh-btn');
  const doneBtn = mustElement<HTMLButtonElement>('done-btn');

  function escapeHtml(value: unknown): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderStatusRows(rows: StatusRow[]): void {
    if (!Array.isArray(rows) || rows.length === 0) {
      statusKv.innerHTML = '<div class="k">Status</div><div class="v">n/a</div>';
      return;
    }
    statusKv.innerHTML = rows
      .map((row) => {
        let renderedValue = escapeHtml(row.value);
        if (row.kind === 'pill' && typeof row.value === 'object' && row.value !== null) {
          const pillValue = row.value as ConnectionPill;
          const tone =
            pillValue.tone === 'error' || pillValue.tone === 'warn' ? pillValue.tone : 'ok';
          renderedValue = `<span class="status-pill ${tone}">${escapeHtml(pillValue.label)}</span>`;
        }
        return `<div class="k">${escapeHtml(row.key)}</div><div class="v">${renderedValue}</div>`;
      })
      .join('');
  }

  function recommendationClass(tone: RecommendationViewModel['tone']): string {
    if (tone === 'warn') return 'pill-warn';
    if (tone === 'danger') return 'pill-action';
    return 'pill-ok';
  }

  function renderImportedRows(rows: ImportedRow[]): void {
    if (!Array.isArray(rows) || rows.length === 0) {
      importedTableWrap.hidden = true;
      importedTableBody.innerHTML = '';
      importedEmpty.hidden = false;
      return;
    }
    importedTableWrap.hidden = false;
    importedEmpty.hidden = true;
    importedTableBody.innerHTML = rows
      .map(
        (row) => `
        <tr>
          <td>#${escapeHtml(row.nodeId)}<br /><span class="hint">${escapeHtml(row.name)}</span></td>
          <td>${escapeHtml(row.bridgeId)}</td>
          <td>
            ${escapeHtml(row.manufacturer)} / ${escapeHtml(row.product)}<br />
            <span class="hint">Location: ${escapeHtml(row.location)}</span><br />
            <span class="hint">Status: ${escapeHtml(row.status)}</span>
          </td>
          <td>
            Class: ${escapeHtml(row.profileClass)}<br />
            <span class="hint">${escapeHtml(row.profileId)}</span><br />
            <span class="hint">${escapeHtml(row.profileMatch)}</span><br />
            <span class="hint">Source: ${escapeHtml(row.profileSource)}</span><br />
            <span class="hint">Rule Match: ${escapeHtml(row.ruleMatch)}</span>
          </td>
          <td>
            <span class="${recommendationClass(row.recommendation.tone)}">${escapeHtml(
              row.recommendation.label,
            )}</span><br />
            <span class="hint">${escapeHtml(row.recommendation.reason)}</span>
          </td>
        </tr>
      `,
      )
      .join('');
  }

  function renderWarnings(items: string[]): void {
    if (!Array.isArray(items) || items.length === 0) {
      warningsEl.hidden = true;
      warningsEl.innerHTML = '';
      return;
    }
    warningsEl.hidden = false;
    warningsEl.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  }

  function renderGuidance(title: string, steps: string[]): void {
    guidanceTitle.textContent = title;
    if (!Array.isArray(steps) || steps.length === 0) {
      guidanceList.innerHTML = '<li>Press Done to close this pairing step.</li>';
      return;
    }
    guidanceList.innerHTML = steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  }

  function render(): void {
    const viewModel = presenter.buildViewModel(stateRef.current);
    refreshBtn.disabled = viewModel.refreshDisabled === true;
    renderStatusRows(viewModel.statusRows);
    renderWarnings(viewModel.warnings);
    renderGuidance(viewModel.guidanceTitle, viewModel.guidanceSteps);
    importedMeta.textContent = viewModel.importedMeta;
    importedEmpty.textContent = viewModel.importedEmpty;
    renderImportedRows(viewModel.importedRows);
    if (!viewModel.hasImportedRows) {
      importedTableWrap.hidden = true;
      importedEmpty.hidden = false;
    }
    statusLine.textContent = viewModel.statusLine;
  }

  function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Failed to load status.';
  }

  async function loadStatus(): Promise<void> {
    stateRef.current = presenter.reduce(stateRef.current, { type: 'load_start' });
    render();
    try {
      const status = await Homey.emit('next_steps:get_status');
      stateRef.current = presenter.reduce(stateRef.current, {
        type: 'load_success',
        status,
      });
    } catch (error) {
      stateRef.current = presenter.reduce(stateRef.current, {
        type: 'load_error',
        message: toErrorMessage(error),
      });
    }
    render();
  }

  refreshBtn.addEventListener('click', () => {
    void loadStatus();
  });
  doneBtn.addEventListener('click', () => {
    Homey.done();
  });

  Homey.ready();
  void loadStatus();
})(
  typeof window !== 'undefined'
    ? (window as unknown as UiRoot)
    : typeof global !== 'undefined'
      ? (global as unknown as UiRoot)
      : ({} as UiRoot),
);

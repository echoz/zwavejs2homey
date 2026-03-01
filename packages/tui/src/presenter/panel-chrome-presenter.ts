import type { SessionConfig } from '../model/types';

export type PanelChromeFocus = 'left' | 'right' | 'bottom';
export type PanelChromeMode = 'detail' | 'edit-draft';
export type PanelChromeConfirmAction = 'scaffold-write' | 'manifest-add';

export interface PanelChromeViewModel {
  header: string;
  footer: string;
}

export interface PanelChromeState {
  sessionMode: SessionConfig['mode'];
  uiMode: SessionConfig['uiMode'];
  selectedSignature?: string;
  filterMode: boolean;
  draftFieldEditActive: boolean;
  panelMode: PanelChromeMode;
  focusedPane: PanelChromeFocus;
  hasNodeDetail: boolean;
  valuesExpanded: boolean;
  pendingConfirmAction?: PanelChromeConfirmAction;
  activeOperationLabel?: string;
}

export class PanelChromePresenter {
  build(state: PanelChromeState): PanelChromeViewModel {
    const selectedSignature = state.selectedSignature ? `sig=${state.selectedSignature}` : 'sig=-';
    return {
      header: `ZWJS ${state.sessionMode} (${state.uiMode}) ${selectedSignature}`,
      footer: this.renderFooter(state),
    };
  }

  private renderFooter(state: PanelChromeState): string {
    const runtimeHints: string[] = [];
    if (state.pendingConfirmAction === 'scaffold-write') {
      runtimeHints.push('W confirm-write');
    } else if (state.pendingConfirmAction === 'manifest-add') {
      runtimeHints.push('A confirm-manifest');
    }
    if (state.activeOperationLabel) {
      runtimeHints.push('c cancel-op');
    }
    const withHints = (base: string): string =>
      runtimeHints.length > 0 ? `${base} | ${runtimeHints.join(' | ')}` : base;

    if (state.filterMode) {
      return withHints('Filter: type | backspace delete | enter/esc apply | q quit');
    }
    if (state.draftFieldEditActive) {
      return withHints('Edit field: type | backspace | enter apply | esc cancel | q quit');
    }
    if (state.panelMode === 'edit-draft') {
      if (state.focusedPane !== 'right') {
        return withHints('Scaffold edit: tab to right pane | esc save+exit | q quit');
      }
      return withHints(
        'Scaffold edit (right): up/down field | enter edit/apply | left/right cycle | + add | * clone | - remove | < > move | esc save+exit | q quit',
      );
    }
    if (state.focusedPane === 'left') {
      return withHints(
        'List (left): up/down select | pgup/pgdn page | home/end jump | enter open | / filter | tab pane | i/v/m run | e edit-draft | q quit',
      );
    }
    if (state.focusedPane === 'right') {
      if (state.sessionMode === 'nodes' && state.hasNodeDetail) {
        const valueHints = state.valuesExpanded ? ' | 1-6 value sections' : '';
        return withHints(
          `Detail (right): up/down scroll | pgup/pgdn page | enter open/fetch | n neighbors | z values${valueHints} | F fetch-full | tab pane | q quit`,
        );
      }
      return withHints('Detail (right): up/down scroll | pgup/pgdn page | tab pane | q quit');
    }
    return withHints(
      'Output (bottom): up/down scroll | pgup/pgdn page | b compact/full | tab pane | q quit',
    );
  }
}

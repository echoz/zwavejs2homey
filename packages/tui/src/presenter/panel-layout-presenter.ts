import type { SessionConfig } from '../model/types';
import type { PanelChromeMode } from './panel-chrome-presenter';

export interface PanelListTitleState {
  sessionMode: SessionConfig['mode'];
  totalItems: number;
  visibleCapacity: number;
  windowStart: number;
  windowCount: number;
  filterQuery: string;
}

export interface PanelDetailTitleState {
  panelMode: PanelChromeMode;
  sessionMode: SessionConfig['mode'];
  currentNodeId?: number;
  totalLines: number;
  visibleCapacity: number;
  scroll: number;
}

export interface PanelOutputTitleState {
  compact: boolean;
  totalLines: number;
  visibleCapacity: number;
  scroll: number;
}

export class PanelLayoutPresenter {
  buildListTitle(state: PanelListTitleState): string {
    const rangeSuffix =
      state.totalItems > state.visibleCapacity
        ? ` [${state.windowStart + 1}-${state.windowStart + state.windowCount}/${state.totalItems}]`
        : state.totalItems > 0
          ? ` [1-${state.totalItems}/${state.totalItems}]`
          : ' [0/0]';
    const filterSuffix = state.filterQuery ? ` | filter="${state.filterQuery}"` : '';
    return `${state.sessionMode === 'nodes' ? 'Nodes' : 'Rules'}${rangeSuffix}${filterSuffix}`;
  }

  buildDetailTitle(state: PanelDetailTitleState): string {
    const range = this.renderRangeSuffix(state.totalLines, state.visibleCapacity, state.scroll);
    if (state.panelMode === 'edit-draft') {
      return `Scaffold Edit${range}`;
    }
    if (state.sessionMode === 'nodes' && state.currentNodeId !== undefined) {
      return `Node ${state.currentNodeId} Detail${range}`;
    }
    return `Detail${range}`;
  }

  buildOutputTitle(state: PanelOutputTitleState): string {
    if (state.compact) return '';
    const range = this.renderRangeSuffix(state.totalLines, state.visibleCapacity, state.scroll);
    return `Output / Run${range}`;
  }

  private renderRangeSuffix(totalLines: number, visibleCapacity: number, scroll: number): string {
    if (totalLines <= visibleCapacity) return '';
    const start = totalLines > 0 ? scroll + 1 : 0;
    const end = Math.min(totalLines, scroll + visibleCapacity);
    return ` [${start}-${end}/${totalLines}]`;
  }
}

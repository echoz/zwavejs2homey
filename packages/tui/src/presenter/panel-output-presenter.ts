export interface PanelOutputState {
  text: string;
  scroll: number;
  compact: boolean;
  visibleCapacity: number;
}

export interface PanelOutputViewModel {
  lines: string[];
  clampedScroll: number;
  compactLine: string;
  visibleLines: string[];
}

function splitLines(value: string): string[] {
  if (value.length === 0) return [''];
  return value.split('\n');
}

export class PanelOutputPresenter {
  build(state: PanelOutputState): PanelOutputViewModel {
    const lines = splitLines(state.text);
    const capacity = Math.max(1, state.visibleCapacity);
    const maxScroll = Math.max(0, lines.length - capacity);
    const clampedScroll = Math.min(maxScroll, Math.max(0, state.scroll));
    const compactLine = lines[clampedScroll] ?? '';
    const visibleLines = state.compact
      ? [compactLine]
      : lines.slice(clampedScroll, clampedScroll + capacity);
    return {
      lines,
      clampedScroll,
      compactLine,
      visibleLines,
    };
  }
}

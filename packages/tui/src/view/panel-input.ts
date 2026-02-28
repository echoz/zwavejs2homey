export type PanelIntent =
  | { type: 'noop' }
  | { type: 'quit' }
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'move-page-up' }
  | { type: 'move-page-down' }
  | { type: 'move-first' }
  | { type: 'move-last' }
  | { type: 'switch-pane' }
  | { type: 'start-filter' }
  | { type: 'open' }
  | { type: 'refresh' }
  | { type: 'inspect' }
  | { type: 'validate' }
  | { type: 'simulate'; dryRun: boolean }
  | { type: 'scaffold-preview' }
  | { type: 'scaffold-write' }
  | { type: 'manifest-add' }
  | { type: 'status' }
  | { type: 'log' }
  | { type: 'cancel-operation' }
  | { type: 'toggle-neighbors' }
  | { type: 'toggle-values' }
  | { type: 'help' };

interface KeyLike {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
}

export function parsePanelDataChunk(chunk: string): PanelIntent | null {
  const value = String(chunk ?? '');
  if (!value) return null;
  if (value === '\u0003') return { type: 'quit' }; // Ctrl+C
  if (value === '\u001b') return { type: 'quit' }; // Escape
  if (value.toLowerCase() === 'q') return { type: 'quit' };
  return null;
}

export function parsePanelKeypress(char: string, key: KeyLike = {}): PanelIntent {
  const name = (key.name ?? '').toLowerCase();
  const sequence = (key.sequence ?? '').toLowerCase();
  const charLower = (char ?? '').toLowerCase();
  const token = charLower || sequence || name;
  if (key.ctrl && (name === 'c' || charLower === 'c')) return { type: 'quit' };
  if (name === 'q' || token === 'q' || name === 'escape') return { type: 'quit' };
  if (name === 'up' || token === 'k') return { type: 'move-up' };
  if (name === 'down' || token === 'j') return { type: 'move-down' };
  if (name === 'pageup') return { type: 'move-page-up' };
  if (name === 'pagedown') return { type: 'move-page-down' };
  if (name === 'home') return { type: 'move-first' };
  if (name === 'end') return { type: 'move-last' };
  if (name === 'tab') return { type: 'switch-pane' };
  if (token === '/' || name === 'slash') return { type: 'start-filter' };
  if (name === 'return' || name === 'enter') return { type: 'open' };
  if (name === 'r' || token === 'r') return { type: 'refresh' };
  if (name === 'i' || token === 'i') return { type: 'inspect' };
  if (name === 'v' || token === 'v') return { type: 'validate' };
  if (name === 'm' || token === 'm') return { type: 'simulate', dryRun: false };
  if (name === 'd' || token === 'd') return { type: 'simulate', dryRun: true };
  if (name === 'p' || token === 'p') return { type: 'scaffold-preview' };
  if (char === 'W') return { type: 'scaffold-write' };
  if (char === 'A') return { type: 'manifest-add' };
  if (name === 's' || token === 's') return { type: 'status' };
  if (name === 'l' || token === 'l') return { type: 'log' };
  if (name === 'c' || token === 'c') return { type: 'cancel-operation' };
  if (name === 'n' || token === 'n') return { type: 'toggle-neighbors' };
  if (name === 'z' || token === 'z') return { type: 'toggle-values' };
  if (name === 'h' || name === '?' || char === '?') return { type: 'help' };
  return { type: 'noop' };
}

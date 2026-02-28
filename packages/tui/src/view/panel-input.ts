export type PanelIntent =
  | { type: 'noop' }
  | { type: 'quit' }
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'switch-pane' }
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
  | { type: 'help' };

interface KeyLike {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
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
  if (name === 'tab') return { type: 'switch-pane' };
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
  if (name === 'h' || name === '?' || char === '?') return { type: 'help' };
  return { type: 'noop' };
}

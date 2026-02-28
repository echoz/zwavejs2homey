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
  const name = key.name ?? '';
  if (key.ctrl && name === 'c') return { type: 'quit' };
  if (name === 'q' || name === 'escape') return { type: 'quit' };
  if (name === 'up' || name === 'k') return { type: 'move-up' };
  if (name === 'down' || name === 'j') return { type: 'move-down' };
  if (name === 'tab') return { type: 'switch-pane' };
  if (name === 'return' || name === 'enter') return { type: 'open' };
  if (name === 'r') return { type: 'refresh' };
  if (name === 'i') return { type: 'inspect' };
  if (name === 'v') return { type: 'validate' };
  if (name === 'm') return { type: 'simulate', dryRun: false };
  if (name === 'd') return { type: 'simulate', dryRun: true };
  if (name === 'p') return { type: 'scaffold-preview' };
  if (char === 'W') return { type: 'scaffold-write' };
  if (char === 'A') return { type: 'manifest-add' };
  if (name === 's') return { type: 'status' };
  if (name === 'l') return { type: 'log' };
  if (name === 'h' || name === '?') return { type: 'help' };
  return { type: 'noop' };
}

export type ShellCommand =
  | { type: 'noop' }
  | { type: 'help' }
  | { type: 'list' }
  | { type: 'refresh' }
  | { type: 'show'; nodeId: number }
  | { type: 'quit' };

export function parseShellCommand(
  input: string,
): { ok: true; command: ShellCommand } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, command: { type: 'noop' } };
  }

  const tokens = trimmed.split(/\s+/);
  const [name, arg] = tokens;

  if (name === 'help' || name === 'h' || name === '?') {
    return { ok: true, command: { type: 'help' } };
  }
  if (name === 'list' || name === 'ls') {
    return { ok: true, command: { type: 'list' } };
  }
  if (name === 'refresh' || name === 'r') {
    return { ok: true, command: { type: 'refresh' } };
  }
  if (name === 'show' || name === 'node') {
    if (!arg) {
      return { ok: false, error: `${name} requires a nodeId` };
    }
    const nodeId = Number(arg);
    if (!Number.isInteger(nodeId) || nodeId < 1) {
      return { ok: false, error: `Invalid nodeId: ${arg}` };
    }
    return { ok: true, command: { type: 'show', nodeId } };
  }
  if (name === 'quit' || name === 'q' || name === 'exit') {
    return { ok: true, command: { type: 'quit' } };
  }

  return { ok: false, error: `Unknown command: ${name}` };
}

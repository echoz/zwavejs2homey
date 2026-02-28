export type ShellCommand =
  | { type: 'noop' }
  | { type: 'help' }
  | { type: 'list' }
  | { type: 'refresh' }
  | { type: 'show'; nodeId: number }
  | { type: 'signature'; signature?: string; fromNodeId?: number }
  | { type: 'inspect'; manifestFile?: string }
  | { type: 'validate'; manifestFile?: string }
  | { type: 'scaffold-preview'; productName?: string }
  | { type: 'scaffold-write'; filePath?: string; force: boolean }
  | { type: 'manifest-add'; manifestFile?: string; filePath?: string; force: boolean }
  | { type: 'status' }
  | { type: 'log'; limit: number }
  | { type: 'quit' };

function parsePositiveInteger(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }
  return value;
}

function parseFlagValue(tokens: string[], key: string): string | undefined {
  const keyEq = `${key}=`;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === key) {
      return tokens[index + 1];
    }
    if (token.startsWith(keyEq)) {
      return token.slice(keyEq.length);
    }
  }
  return undefined;
}

function parseFlagExists(tokens: string[], key: string): boolean {
  const keyEq = `${key}=`;
  return tokens.some((token) => token === key || token.startsWith(keyEq));
}

export function parseShellCommand(
  input: string,
): { ok: true; command: ShellCommand } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, command: { type: 'noop' } };
  }

  const tokens = trimmed.split(/\s+/);
  const [name, ...rest] = tokens;

  try {
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
      const rawNodeId = rest[0];
      if (!rawNodeId) {
        return { ok: false, error: `${name} requires a nodeId` };
      }
      return {
        ok: true,
        command: { type: 'show', nodeId: parsePositiveInteger(rawNodeId, 'nodeId') },
      };
    }
    if (name === 'signature' || name === 'sig') {
      const fromNodeRaw = parseFlagValue(rest, '--from-node');
      const explicit = rest[0] && !rest[0].startsWith('--') ? rest[0] : undefined;
      if (explicit && !/^\d+:\d+:\d+$/.test(explicit)) {
        return {
          ok: false,
          error: 'signature must be <manufacturerId:productType:productId>',
        };
      }
      return {
        ok: true,
        command: {
          type: 'signature',
          signature: explicit,
          fromNodeId: fromNodeRaw ? parsePositiveInteger(fromNodeRaw, '--from-node') : undefined,
        },
      };
    }
    if (name === 'inspect') {
      return {
        ok: true,
        command: {
          type: 'inspect',
          manifestFile: parseFlagValue(rest, '--manifest'),
        },
      };
    }
    if (name === 'validate') {
      return {
        ok: true,
        command: {
          type: 'validate',
          manifestFile: parseFlagValue(rest, '--manifest'),
        },
      };
    }
    if (name === 'scaffold') {
      const sub = rest[0];
      if (sub === 'preview') {
        const productName = parseFlagValue(rest.slice(1), '--product-name');
        return { ok: true, command: { type: 'scaffold-preview', productName } };
      }
      if (sub === 'write') {
        const filePath = rest.find((token, index) => index > 0 && !token.startsWith('--'));
        return {
          ok: true,
          command: {
            type: 'scaffold-write',
            filePath,
            force: parseFlagExists(rest, '--force'),
          },
        };
      }
      return { ok: false, error: 'scaffold requires subcommand: preview|write' };
    }
    if (name === 'manifest') {
      const sub = rest[0];
      if (sub === 'add') {
        const filePath = rest.find((token, index) => index > 0 && !token.startsWith('--'));
        return {
          ok: true,
          command: {
            type: 'manifest-add',
            manifestFile: parseFlagValue(rest.slice(1), '--manifest'),
            filePath,
            force: parseFlagExists(rest, '--force'),
          },
        };
      }
      return { ok: false, error: 'manifest requires subcommand: add' };
    }
    if (name === 'status') {
      return { ok: true, command: { type: 'status' } };
    }
    if (name === 'log') {
      const limitRaw = parseFlagValue(rest, '--limit');
      return {
        ok: true,
        command: {
          type: 'log',
          limit: limitRaw ? parsePositiveInteger(limitRaw, '--limit') : 20,
        },
      };
    }
    if (name === 'quit' || name === 'q' || name === 'exit') {
      return { ok: true, command: { type: 'quit' } };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return { ok: false, error: `Unknown command: ${name}` };
}

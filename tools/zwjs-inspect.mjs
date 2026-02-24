#!/usr/bin/env node

import { parseCliArgs, runInspectCommand } from './zwjs-inspect-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));

if (!parsed.ok) {
  console.error(parsed.error);
  process.exitCode = 1;
} else {
  runInspectCommand(parsed.command).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

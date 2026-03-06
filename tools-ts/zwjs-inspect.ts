#!/usr/bin/env node

import { parseCliArgs, runInspectCommand } from './zwjs-inspect-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));

if (!parsed.ok) {
  const isHelp = process.argv.includes('--help') || process.argv.includes('-h');
  (isHelp ? console.log : console.error)(parsed.error);
  process.exitCode = isHelp ? 0 : 1;
} else {
  runInspectCommand(parsed.command).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
import {
  formatBacklogOutput,
  getUsageText,
  parseCliArgs,
  runBacklogCommand,
} from './homey-compile-backlog-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error ?? getUsageText());
  process.exit(parsed.error === getUsageText() ? 0 : 1);
}

try {
  const result = runBacklogCommand(parsed.command);
  console.log(formatBacklogOutput(result, parsed.command.format));
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exit(1);
}

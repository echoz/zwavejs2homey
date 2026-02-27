#!/usr/bin/env node
import {
  formatLoopOutput,
  getUsageText,
  parseCliArgs,
  runLoopCommand,
} from './homey-compile-loop-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error ?? getUsageText());
  process.exit(parsed.error === getUsageText() ? 0 : 1);
}

try {
  const result = await runLoopCommand(parsed.command);
  console.log(formatLoopOutput(result, parsed.command.format));
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exit(1);
}

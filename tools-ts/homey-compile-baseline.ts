#!/usr/bin/env node
import {
  getUsageText,
  parseCliArgs,
  runBaselineWorkflowCommand,
} from './homey-compile-baseline-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error ?? getUsageText());
  process.exit(parsed.error === getUsageText() ? 0 : 1);
}

try {
  await runBaselineWorkflowCommand(parsed.command, console);
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exit(1);
}

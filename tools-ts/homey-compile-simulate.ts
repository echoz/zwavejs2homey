#!/usr/bin/env node
import {
  formatSimulationOutput,
  getUsageText,
  parseCliArgs,
  runSimulationCommand,
} from './homey-compile-simulate-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error ?? getUsageText());
  process.exit(parsed.error === getUsageText() ? 0 : 1);
}

try {
  const result = await runSimulationCommand(parsed.command);
  console.log(formatSimulationOutput(result, parsed.command.format));
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exit(1);
}

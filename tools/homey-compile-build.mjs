#!/usr/bin/env node
import { getUsageText, parseCliArgs, runBuildCommand } from './homey-compile-build-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error ?? getUsageText());
  process.exit(parsed.error === getUsageText() ? 0 : 1);
}

try {
  runBuildCommand(parsed.command, console);
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exit(1);
}

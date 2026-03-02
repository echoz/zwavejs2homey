#!/usr/bin/env node

import {
  getUsageText,
  parseCliArgs,
  runHomeyRuntimeApiSmoke,
} from './homey-runtime-api-smoke-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  const message = parsed.error ?? getUsageText();
  const isHelp = message === getUsageText();
  (isHelp ? console.log : console.error)(message);
  process.exit(isHelp ? 0 : 1);
}

try {
  await runHomeyRuntimeApiSmoke(parsed.command, console);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

#!/usr/bin/env node
import {
  compileFromFiles,
  formatCompileSummary,
  parseCliArgs,
} from './homey-compile-inspect-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(1);
}

try {
  const result = compileFromFiles(parsed.command);
  if (parsed.command.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatCompileSummary(result));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to compile profile: ${message}`);
  process.exit(1);
}

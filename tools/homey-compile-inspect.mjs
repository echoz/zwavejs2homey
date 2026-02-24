#!/usr/bin/env node
import {
  compileFromFiles,
  formatCompileOutput,
  parseCliArgs,
} from './homey-compile-inspect-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(1);
}

try {
  const result = compileFromFiles(parsed.command);
  console.log(formatCompileOutput(result, parsed.command.format));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to compile profile: ${message}`);
  process.exit(1);
}

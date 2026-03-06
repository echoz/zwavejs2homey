#!/usr/bin/env node
import {
  formatHaExtractOutput,
  getUsageText,
  parseCliArgs,
  runHaImportExtract,
} from './ha-import-extract-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error ?? getUsageText());
  process.exit(1);
}

try {
  const result = runHaImportExtract(parsed.command);
  console.log(formatHaExtractOutput(result, parsed.command.format));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to run HA import extract: ${message}`);
  process.exit(1);
}

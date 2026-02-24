#!/usr/bin/env node
import {
  formatHaExtractSummary,
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
  if (parsed.command.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatHaExtractSummary(result));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to run HA import extract: ${message}`);
  process.exit(1);
}

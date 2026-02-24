#!/usr/bin/env node
import {
  formatHaImportOutput,
  getUsageText,
  parseCliArgs,
  runHaImportReport,
} from './ha-import-report-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error ?? getUsageText());
  process.exit(1);
}

try {
  const result = runHaImportReport(parsed.command);
  console.log(formatHaImportOutput(result, parsed.command.format));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to run HA import report: ${message}`);
  process.exit(1);
}

#!/usr/bin/env node
import {
  formatCatalogOutput,
  getUsageText,
  parseCliArgs,
  runCatalogCommand,
} from './catalog-tool-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error ?? getUsageText());
  process.exit(1);
}

try {
  const result = runCatalogCommand(parsed.command);
  console.log(formatCatalogOutput(result, parsed.command.format));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to run catalog command: ${message}`);
  process.exit(1);
}

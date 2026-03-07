#!/usr/bin/env node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  getUsageText,
  parseCliArgs,
  runHomeyCapabilityCoverageAudit,
} = require('../packages/core/dist/tools/homey-capability-coverage-audit.js');

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(parsed.error === getUsageText() ? 0 : 1);
}

runHomeyCapabilityCoverageAudit(parsed.command).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

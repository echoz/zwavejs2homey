#!/usr/bin/env node
import {
  formatBenchmarkSummary,
  getUsageText,
  parseCliArgs,
  runCompileBenchmark,
} from './homey-compile-bench-lib.mjs';

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error ?? getUsageText());
  process.exit(1);
}

try {
  const result = runCompileBenchmark(parsed.command);
  console.log(formatBenchmarkSummary(result));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to run benchmark: ${message}`);
  process.exit(1);
}

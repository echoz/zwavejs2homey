import { parseCliArgs, runGuardCommand } from './hardcoding-policy-guard-lib.mjs';

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exitCode = 1;
    return;
  }
  try {
    await runGuardCommand(parsed.command, console);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();

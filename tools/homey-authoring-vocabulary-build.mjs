import { parseCliArgs, runBuildCommand } from './homey-authoring-vocabulary-build-lib.mjs';

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exitCode = 1;
    return;
  }
  try {
    await runBuildCommand(parsed.command, console);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();

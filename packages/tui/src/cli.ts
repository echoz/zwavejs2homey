#!/usr/bin/env node

import { parseCliArgs, runApp } from './app';

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    const isHelp = parsed.isHelp === true;
    (isHelp ? console.log : console.error)(parsed.error);
    process.exitCode = isHelp ? 0 : 1;
    return;
  }

  try {
    await runApp(parsed.command, console);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();

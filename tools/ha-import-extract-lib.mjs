import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadHaExtractedDiscoveryArtifact } = require('../packages/compiler/dist');

function parseFlagMap(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [key, inline] = token.split('=', 2);
    if (inline !== undefined) {
      flags.set(key, inline);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, 'true');
    }
  }
  return flags;
}

export function getUsageText() {
  return [
    'Usage:',
    '  ha-import-extract --input-file <ha-extracted.json> [--format summary|json]',
    '  ha-import-extract --source-home-assistant <checkout-path> [--format summary|json]',
    '                 [--output-extracted <validated-extracted.json>] [--timing]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const flags = parseFlagMap(argv);
  const inputFile = flags.get('--input-file');
  const sourceHomeAssistant = flags.get('--source-home-assistant');
  if (!inputFile && !sourceHomeAssistant) {
    return { ok: false, error: 'Provide --input-file or --source-home-assistant' };
  }
  if (inputFile && sourceHomeAssistant) {
    return { ok: false, error: 'Use either --input-file or --source-home-assistant, not both' };
  }
  const format = flags.get('--format') ?? 'summary';
  if (!['summary', 'json'].includes(format)) {
    return { ok: false, error: `Unsupported format: ${format}` };
  }
  const outputExtracted = flags.get('--output-extracted');
  if (outputExtracted === 'true') {
    return { ok: false, error: '--output-extracted requires a file path' };
  }
  return {
    ok: true,
    command: {
      inputFile,
      sourceHomeAssistant,
      format,
      outputExtracted,
      timing: flags.get('--timing') === 'true',
    },
  };
}

function runSourceExtractStub(command) {
  const sourceRoot = path.isAbsolute(command.sourceHomeAssistant)
    ? command.sourceHomeAssistant
    : path.resolve(process.cwd(), command.sourceHomeAssistant);
  const discoveryPy = path.join(
    sourceRoot,
    'homeassistant',
    'components',
    'zwave_js',
    'discovery.py',
  );
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Home Assistant source path not found: ${sourceRoot}`);
  }
  if (!fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`Home Assistant source path must be a directory: ${sourceRoot}`);
  }
  if (!fs.existsSync(discoveryPy)) {
    throw new Error(`Home Assistant discovery source not found: ${discoveryPy}`);
  }
  throw new Error(
    `HA source extraction parser is not implemented yet (validated source path: ${sourceRoot})`,
  );
}

export function runHaImportExtract(command) {
  const started = command.timing ? performance.now() : 0;
  if (command.sourceHomeAssistant) {
    return runSourceExtractStub(command);
  }
  const artifact = loadHaExtractedDiscoveryArtifact(command.inputFile);

  if (command.outputExtracted) {
    const outPath = path.isAbsolute(command.outputExtracted)
      ? command.outputExtracted
      : path.resolve(process.cwd(), command.outputExtracted);
    fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  }

  const result = {
    artifact,
    summary: {
      entries: artifact.entries.length,
      sourceRefCount: artifact.entries.length
        ? new Set(artifact.entries.map((entry) => entry.sourceRef)).size
        : 0,
    },
  };

  if (command.timing) {
    return {
      ...result,
      meta: {
        elapsedMs: Math.max(0, performance.now() - started),
      },
    };
  }

  return result;
}

export function formatHaExtractSummary(result) {
  const lines = [];
  lines.push(`Extracted artifact: ${result.artifact.schemaVersion}`);
  lines.push(`Entries: ${result.summary.entries}`);
  lines.push(`Source refs: ${result.summary.sourceRefCount}`);
  if (result.meta && typeof result.meta.elapsedMs === 'number') {
    lines.push(`Timing: ${result.meta.elapsedMs.toFixed(3)}ms`);
  }
  return lines.join('\n');
}

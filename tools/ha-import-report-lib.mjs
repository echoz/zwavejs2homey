import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import {
  formatJsonCompact,
  formatJsonPretty,
  formatNdjson,
  isSupportedDiagnosticFormat,
} from './output-format-lib.mjs';

const require = createRequire(import.meta.url);
const { translateHaExtractedDiscoveryToGeneratedArtifact } = require('../packages/compiler/dist');

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
    '  ha-import-report --input-file <ha-extracted.json> [--format summary|markdown|json|json-pretty|json-compact|ndjson]',
    '                 [--output-generated <ha-derived-rules.json>] [--timing]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const flags = parseFlagMap(argv);
  const inputFile = flags.get('--input-file');
  if (!inputFile) return { ok: false, error: '--input-file is required' };
  const format = flags.get('--format') ?? 'summary';
  if (!isSupportedDiagnosticFormat(format)) {
    return { ok: false, error: `Unsupported format: ${format}` };
  }
  const outputGenerated = flags.get('--output-generated');
  if (outputGenerated === 'true') {
    return { ok: false, error: '--output-generated requires a file path' };
  }
  return {
    ok: true,
    command: {
      inputFile,
      format,
      outputGenerated,
      timing: flags.get('--timing') === 'true',
    },
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function runHaImportReport(command) {
  const started = command.timing ? performance.now() : 0;
  const input = readJson(command.inputFile);
  const result = translateHaExtractedDiscoveryToGeneratedArtifact(input);

  if (command.outputGenerated) {
    const outPath = path.isAbsolute(command.outputGenerated)
      ? command.outputGenerated
      : path.resolve(process.cwd(), command.outputGenerated);
    fs.writeFileSync(outPath, `${JSON.stringify(result.artifact, null, 2)}\n`, 'utf8');
  }

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

export function formatHaImportSummary(result) {
  const lines = [];
  lines.push(`Generated artifact: ${result.artifact.schemaVersion}`);
  lines.push(`Rules translated: ${result.report.translated}`);
  lines.push(`Skipped: ${result.report.skipped}`);
  lines.push(`Unsupported: ${result.report.unsupported.length}`);
  if (result.report.unsupported.length > 0) {
    const top = result.report.unsupported
      .slice(0, 5)
      .map((item) => `${item.id}:${item.reason}`)
      .join(', ');
    lines.push(`Unsupported details: ${top}`);
  }
  lines.push(`Source refs: ${result.report.sourceRefs.length}`);
  if (result.meta && typeof result.meta.elapsedMs === 'number') {
    lines.push(`Timing: ${result.meta.elapsedMs.toFixed(3)}ms`);
  }
  return lines.join('\n');
}

export function formatHaImportMarkdown(result) {
  const lines = [];
  lines.push(`## HA Import Report`);
  lines.push(`- Generated artifact: \`${result.artifact.schemaVersion}\``);
  lines.push(`- Rules translated: ${result.report.translated}`);
  lines.push(`- Skipped: ${result.report.skipped}`);
  lines.push(`- Unsupported: ${result.report.unsupported.length}`);
  lines.push(`- Source refs: ${result.report.sourceRefs.length}`);
  if (result.meta && typeof result.meta.elapsedMs === 'number') {
    lines.push(`- Timing: ${result.meta.elapsedMs.toFixed(3)}ms`);
  }
  return lines.join('\n');
}

export function formatHaImportNdjson(result) {
  const records = [
    { type: 'reportSummary', report: result.report },
    ...result.artifact.rules.map((rule) => ({ type: 'rule', rule })),
    ...result.report.unsupported.map((unsupported) => ({ type: 'unsupported', unsupported })),
    ...(result.meta ? [{ type: 'meta', meta: result.meta }] : []),
  ];
  return formatNdjson(records);
}

export function formatHaImportOutput(result, format) {
  switch (format) {
    case 'summary':
      return formatHaImportSummary(result);
    case 'markdown':
      return formatHaImportMarkdown(result);
    case 'json':
    case 'json-pretty':
      return formatJsonPretty(result);
    case 'json-compact':
      return formatJsonCompact(result);
    case 'ndjson':
      return formatHaImportNdjson(result);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

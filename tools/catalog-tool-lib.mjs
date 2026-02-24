import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  formatJsonCompact,
  formatJsonPretty,
  formatNdjson,
  isSupportedDiagnosticFormat,
} from './output-format-lib.mjs';

const require = createRequire(import.meta.url);
const {
  diffCatalogDevicesArtifactsV1,
  loadCatalogDevicesArtifact,
  loadCatalogArtifactFromZwjsInspectNodeDetailFile,
  mergeCatalogDevicesArtifactsV1,
  normalizeCatalogDevicesArtifactV1,
} = require('../packages/compiler/dist');

function parseFlagMap(argv) {
  const flags = new Map();
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
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
  return { flags, positionals };
}

function parseConflictMode(flags, subcommand) {
  const conflictMode = flags.get('--conflict-mode') ?? 'warn';
  if (!['warn', 'error'].includes(conflictMode)) {
    return { ok: false, error: `Unsupported --conflict-mode for ${subcommand}: ${conflictMode}` };
  }
  return { ok: true, conflictMode };
}

export function getUsageText() {
  return [
    'Usage:',
    '  catalog summary --input-file <catalog-devices.json> [--format summary|markdown|json|json-pretty|json-compact|ndjson]',
    '  catalog validate --input-file <catalog-devices.json> [--format summary|json|json-pretty|json-compact|ndjson]',
    '  catalog normalize --input-file <catalog-devices.json> [--conflict-mode warn|error] [--format summary|markdown|json|json-pretty|json-compact|ndjson]',
    '  catalog merge --input-file <catalog-a.json> --input-file <catalog-b.json> [--conflict-mode warn|error] [--format summary|markdown|json|json-pretty|json-compact|ndjson]',
    '  catalog diff --from-file <catalog-old.json> --to-file <catalog-new.json> [--format summary|markdown|json|json-pretty|json-compact|ndjson]',
    '  catalog fetch --source zwjs-inspect-node-detail --input-file <node-detail.json> [--format summary|markdown|json|json-pretty|json-compact|ndjson]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const { flags, positionals } = parseFlagMap(argv);
  const subcommand = positionals[0];
  if (!subcommand) return { ok: false, error: getUsageText() };
  if (!['summary', 'validate', 'normalize', 'merge', 'diff', 'fetch'].includes(subcommand)) {
    return { ok: false, error: `Unsupported catalog subcommand: ${subcommand}` };
  }
  const format = flags.get('--format') ?? 'summary';
  if (!isSupportedDiagnosticFormat(format)) {
    return { ok: false, error: `Unsupported format: ${format}` };
  }
  if (subcommand === 'fetch') {
    const source = flags.get('--source');
    const inputFile = flags.get('--input-file');
    if (!source) return { ok: false, error: '--source is required for fetch' };
    if (!inputFile) return { ok: false, error: '--input-file is required for fetch' };
    return {
      ok: true,
      command: { subcommand, source, inputFile, format },
    };
  }
  if (subcommand === 'merge') {
    const conflict = parseConflictMode(flags, subcommand);
    if (!conflict.ok) return { ok: false, error: conflict.error };
    const inputFiles = [];
    for (let i = 0; i < argv.length; i += 1) {
      const token = argv[i];
      if (token === '--input-file') {
        const value = argv[i + 1];
        if (value && !value.startsWith('--')) inputFiles.push(value);
      } else if (token.startsWith('--input-file=')) {
        inputFiles.push(token.slice('--input-file='.length));
      }
    }
    if (inputFiles.length < 2) {
      return { ok: false, error: 'catalog merge requires at least two --input-file values' };
    }
    return {
      ok: true,
      command: { subcommand, inputFiles, format, conflictMode: conflict.conflictMode },
    };
  }
  if (subcommand === 'diff') {
    const fromFile = flags.get('--from-file');
    const toFile = flags.get('--to-file');
    if (!fromFile) return { ok: false, error: '--from-file is required for diff' };
    if (!toFile) return { ok: false, error: '--to-file is required for diff' };
    return { ok: true, command: { subcommand, fromFile, toFile, format } };
  }
  const inputFile = flags.get('--input-file');
  if (!inputFile) return { ok: false, error: '--input-file is required' };
  if (subcommand === 'normalize') {
    const conflict = parseConflictMode(flags, subcommand);
    if (!conflict.ok) return { ok: false, error: conflict.error };
    return {
      ok: true,
      command: { subcommand, inputFile, format, conflictMode: conflict.conflictMode },
    };
  }
  return {
    ok: true,
    command: { subcommand, inputFile, format },
  };
}

export function runCatalogCommand(command) {
  if (command.subcommand === 'fetch') {
    if (command.source !== 'zwjs-inspect-node-detail') {
      throw new Error(`Unsupported catalog fetch source: ${command.source}`);
    }
    const artifact = loadCatalogArtifactFromZwjsInspectNodeDetailFile(command.inputFile);
    return {
      artifact,
      summary: {
        deviceCount: artifact.devices.length,
        sourceNames: [
          ...new Set(artifact.devices.flatMap((d) => d.sources.map((s) => s.source))),
        ].sort(),
        identifiedDeviceCount: artifact.devices.filter(
          (d) =>
            d.manufacturerId !== undefined &&
            d.productType !== undefined &&
            d.productId !== undefined,
        ).length,
      },
    };
  }
  if (command.subcommand === 'merge') {
    const artifacts = command.inputFiles.map((filePath) => loadCatalogDevicesArtifact(filePath));
    const merged = mergeCatalogDevicesArtifactsV1(artifacts, {
      conflictMode: command.conflictMode,
    });
    return {
      artifact: merged.artifact,
      summary: {
        deviceCount: merged.artifact.devices.length,
        sourceNames: [
          ...new Set(merged.artifact.devices.flatMap((d) => d.sources.map((s) => s.source))),
        ].sort(),
        identifiedDeviceCount: merged.artifact.devices.filter(
          (d) =>
            d.manufacturerId !== undefined &&
            d.productType !== undefined &&
            d.productId !== undefined,
        ).length,
        merge: merged.report,
      },
    };
  }
  if (command.subcommand === 'diff') {
    const fromArtifact = loadCatalogDevicesArtifact(command.fromFile);
    const toArtifact = loadCatalogDevicesArtifact(command.toFile);
    const diff = diffCatalogDevicesArtifactsV1(fromArtifact, toArtifact);
    return {
      artifact: toArtifact,
      summary: {
        deviceCount: toArtifact.devices.length,
        sourceNames: [
          ...new Set(toArtifact.devices.flatMap((d) => d.sources.map((s) => s.source))),
        ].sort(),
        identifiedDeviceCount: toArtifact.devices.filter(
          (d) =>
            d.manufacturerId !== undefined &&
            d.productType !== undefined &&
            d.productId !== undefined,
        ).length,
        diff: diff.report,
      },
      diff,
    };
  }
  const artifact = loadCatalogDevicesArtifact(command.inputFile);
  if (command.subcommand === 'normalize') {
    const normalized = normalizeCatalogDevicesArtifactV1(artifact, {
      conflictMode: command.conflictMode,
    });
    return {
      artifact: normalized.artifact,
      summary: {
        deviceCount: normalized.artifact.devices.length,
        sourceNames: [
          ...new Set(normalized.artifact.devices.flatMap((d) => d.sources.map((s) => s.source))),
        ].sort(),
        identifiedDeviceCount: normalized.artifact.devices.filter(
          (d) =>
            d.manufacturerId !== undefined &&
            d.productType !== undefined &&
            d.productId !== undefined,
        ).length,
        normalize: normalized.report,
      },
    };
  }
  return {
    artifact,
    summary: {
      deviceCount: artifact.devices.length,
      sourceNames: [
        ...new Set(artifact.devices.flatMap((d) => d.sources.map((s) => s.source))),
      ].sort(),
      identifiedDeviceCount: artifact.devices.filter(
        (d) =>
          d.manufacturerId !== undefined &&
          d.productType !== undefined &&
          d.productId !== undefined,
      ).length,
    },
  };
}

export function formatCatalogSummary(result) {
  const lines = [];
  lines.push(`Catalog artifact: ${result.artifact.schemaVersion}`);
  lines.push(`Devices: ${result.summary.deviceCount}`);
  lines.push(`Fully identified devices: ${result.summary.identifiedDeviceCount}`);
  lines.push(`Sources: ${result.summary.sourceNames.join(', ') || '(none)'}`);
  if (result.summary.normalize) {
    lines.push(
      `Normalize: input=${result.summary.normalize.inputDevices} output=${result.summary.normalize.outputDevices} merged=${result.summary.normalize.mergedDuplicates}`,
    );
    if (result.summary.normalize.conflictsResolved) {
      lines.push(
        `Normalize conflicts: resolved=${result.summary.normalize.conflictsResolved} fields=${JSON.stringify(result.summary.normalize.conflictsByField)}`,
      );
    }
  }
  if (result.summary.merge) {
    lines.push(
      `Merge: artifacts=${result.summary.merge.inputArtifacts} input=${result.summary.merge.inputDevices} output=${result.summary.merge.outputDevices} merged=${result.summary.merge.mergedDuplicates}`,
    );
    if (result.summary.merge.conflictsResolved) {
      lines.push(
        `Merge conflicts: resolved=${result.summary.merge.conflictsResolved} fields=${JSON.stringify(result.summary.merge.conflictsByField)}`,
      );
    }
  }
  if (result.summary.diff) {
    lines.push(
      `Diff: added=${result.summary.diff.added} removed=${result.summary.diff.removed} changed=${result.summary.diff.changed} unchanged=${result.summary.diff.unchanged}`,
    );
  }
  return lines.join('\n');
}

export function formatCatalogMarkdown(result) {
  return [
    '## Catalog Summary',
    `- Artifact: \`${result.artifact.schemaVersion}\``,
    `- Devices: ${result.summary.deviceCount}`,
    `- Fully identified devices: ${result.summary.identifiedDeviceCount}`,
    `- Sources: ${result.summary.sourceNames.join(', ') || '(none)'}`,
    result.summary.normalize
      ? `- Normalize: input=${result.summary.normalize.inputDevices}, output=${result.summary.normalize.outputDevices}, merged=${result.summary.normalize.mergedDuplicates}`
      : null,
    result.summary.normalize?.conflictsResolved
      ? `- Normalize conflicts: resolved=${result.summary.normalize.conflictsResolved}, fields=${JSON.stringify(result.summary.normalize.conflictsByField)}`
      : null,
    result.summary.merge
      ? `- Merge: artifacts=${result.summary.merge.inputArtifacts}, input=${result.summary.merge.inputDevices}, output=${result.summary.merge.outputDevices}, merged=${result.summary.merge.mergedDuplicates}`
      : null,
    result.summary.merge?.conflictsResolved
      ? `- Merge conflicts: resolved=${result.summary.merge.conflictsResolved}, fields=${JSON.stringify(result.summary.merge.conflictsByField)}`
      : null,
    result.summary.diff
      ? `- Diff: added=${result.summary.diff.added}, removed=${result.summary.diff.removed}, changed=${result.summary.diff.changed}, unchanged=${result.summary.diff.unchanged}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatCatalogNdjson(result) {
  return formatNdjson([
    { type: 'summary', summary: result.summary },
    ...(result.diff ? result.diff.diffs.map((diff) => ({ type: 'diff', diff })) : []),
    ...result.artifact.devices.map((device) => ({ type: 'device', device })),
  ]);
}

export function formatCatalogOutput(result, format) {
  switch (format) {
    case 'summary':
      return formatCatalogSummary(result);
    case 'markdown':
      return formatCatalogMarkdown(result);
    case 'json':
    case 'json-pretty':
      return formatJsonPretty(result);
    case 'json-compact':
      return formatJsonCompact(result);
    case 'ndjson':
      return formatCatalogNdjson(result);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

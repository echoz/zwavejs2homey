import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { formatJsonCompact, formatJsonPretty } from './output-format-lib.mjs';

const require = createRequire(import.meta.url);
const {
  compileProfilePlanFromRuleSetManifest,
  createCompiledHomeyProfilesArtifactV1,
} = require('../packages/compiler/dist');

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function coerceManifestEntries(raw, manifestPath) {
  if (!Array.isArray(raw)) throw new Error('Manifest JSON must be an array');
  const manifestDir = path.dirname(manifestPath);
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object')
      throw new Error(`Manifest entry ${index} must be an object`);
    if (typeof entry.filePath !== 'string' || entry.filePath.length === 0) {
      throw new Error(`Manifest entry ${index} requires a non-empty filePath`);
    }
    return {
      ...entry,
      filePath: path.isAbsolute(entry.filePath)
        ? entry.filePath
        : path.resolve(manifestDir, entry.filePath),
    };
  });
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-compile-build --device-file <device.json> [--device-file <device2.json> ...]',
    '                     (--manifest-file <manifest.json> | --rules-file <rules.json> [--rules-file ...])',
    '                     [--catalog-file <catalog.json>]',
    '                     [--output-file <compiled-profiles.json>]',
    '                     [--format summary|json|json-pretty|json-compact]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const flags = parseFlagMap(argv);
  const deviceFiles = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--device-file' && argv[i + 1]) deviceFiles.push(argv[i + 1]);
    if (argv[i].startsWith('--device-file=')) deviceFiles.push(argv[i].split('=', 2)[1]);
  }
  if (deviceFiles.length === 0) return { ok: false, error: 'Provide at least one --device-file' };

  const manifestFile = flags.get('--manifest-file');
  const rulesFiles = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rules-file' && argv[i + 1]) rulesFiles.push(argv[i + 1]);
    if (argv[i].startsWith('--rules-file=')) rulesFiles.push(argv[i].split('=', 2)[1]);
  }
  if (!manifestFile && rulesFiles.length === 0) {
    return { ok: false, error: 'Provide --manifest-file or at least one --rules-file' };
  }
  if (manifestFile && rulesFiles.length > 0) {
    return { ok: false, error: 'Use either --manifest-file or --rules-file, not both' };
  }

  const format = flags.get('--format') ?? 'summary';
  if (!['summary', 'json', 'json-pretty', 'json-compact'].includes(format)) {
    return { ok: false, error: `Unsupported format: ${format}` };
  }

  return {
    ok: true,
    command: {
      deviceFiles,
      manifestFile,
      rulesFiles,
      catalogFile: flags.get('--catalog-file'),
      outputFile: flags.get('--output-file'),
      format,
    },
  };
}

export function buildCompiledProfilesArtifact(command, deps = {}) {
  const compileImpl =
    deps.compileProfilePlanFromRuleSetManifestImpl ?? compileProfilePlanFromRuleSetManifest;
  const createArtifactImpl =
    deps.createCompiledHomeyProfilesArtifactV1Impl ?? createCompiledHomeyProfilesArtifactV1;
  const devices = command.deviceFiles.map((file) => ({ file, device: readJson(file) }));
  const manifestEntries = command.manifestFile
    ? coerceManifestEntries(readJson(command.manifestFile), command.manifestFile)
    : command.rulesFiles.map((filePath) => ({ filePath }));
  const catalogArtifact = command.catalogFile ? readJson(command.catalogFile) : undefined;

  const entries = devices.map(({ file, device }) => ({
    device: {
      deviceKey: device.deviceKey,
      nodeId: device.nodeId,
      manufacturerId: device.manufacturerId,
      productType: device.productType,
      productId: device.productId,
      firmwareVersion: device.firmwareVersion,
      sourceFile: file,
    },
    compiled: compileImpl(device, manifestEntries, { catalogArtifact }),
  }));

  const artifact = createArtifactImpl(entries, {
    manifestFile: command.manifestFile,
    rulesFiles: command.manifestFile ? undefined : [...command.rulesFiles],
    catalogFile: command.catalogFile,
  });
  return artifact;
}

export function formatBuildOutput(artifact, format) {
  if (format === 'json' || format === 'json-pretty') return formatJsonPretty(artifact);
  if (format === 'json-compact') return formatJsonCompact(artifact);
  const outcomes = new Map();
  let withCatalogMatch = 0;
  for (const entry of artifact.entries) {
    const outcome = entry.compiled.report.profileOutcome;
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    if (entry.compiled.profile.catalogMatch) withCatalogMatch += 1;
  }
  const outcomeSummary = [...outcomes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  return [
    `Compiled profiles artifact: ${artifact.schemaVersion}`,
    `Entries: ${artifact.entries.length}`,
    `Catalog matches: ${withCatalogMatch}`,
    `Outcomes: ${outcomeSummary || '(none)'}`,
  ].join('\n');
}

export function runBuildCommand(command, io = console) {
  const artifact = buildCompiledProfilesArtifact(command);
  if (command.outputFile) {
    fs.writeFileSync(command.outputFile, `${formatJsonPretty(artifact)}\n`, 'utf8');
  }
  io.log(formatBuildOutput(artifact, command.format));
  return artifact;
}

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { formatJsonCompact, formatJsonPretty } from './output-format-lib.mjs';

const require = createRequire(import.meta.url);
const {
  assertHomeyAuthoringVocabularyArtifactV1,
  createHomeyAuthoringVocabularyArtifactV1,
} = require('../packages/compiler/dist');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT_FILE = path.join(REPO_ROOT, 'rules', 'homey-authoring-vocabulary.json');
const DEFAULT_COMPOSE_CAPABILITIES_DIR = path.join(
  REPO_ROOT,
  'co.lazylabs.zwavejs2homey',
  '.homeycompose',
  'capabilities',
);

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

function resolveFilePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

function toDisplayPath(filePath) {
  const rel = path.relative(REPO_ROOT, filePath);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  return filePath;
}

function findFirstExistingDirectory(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  return null;
}

function discoverHomeyLibRoot(homeyLibRootFlag) {
  if (homeyLibRootFlag) {
    const resolved = resolveFilePath(homeyLibRootFlag);
    if (!fs.existsSync(path.join(resolved, 'package.json'))) {
      throw new Error(`--homey-lib-root is not a valid package root: ${resolved}`);
    }
    return resolved;
  }

  const candidates = [];
  try {
    candidates.push(path.dirname(require.resolve('homey/node_modules/homey-lib/package.json')));
  } catch (_error) {
    // ignore
  }
  try {
    candidates.push(path.dirname(require.resolve('homey-lib/package.json')));
  } catch (_error) {
    // ignore
  }
  const nodeModuleRoot = path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules');
  candidates.push(path.join(nodeModuleRoot, 'homey', 'node_modules', 'homey-lib'));

  const found = findFirstExistingDirectory(candidates);
  if (found) return found;

  throw new Error(
    'Unable to locate homey-lib package root. Pass --homey-lib-root <path> explicitly.',
  );
}

function normalizeIdList(value, fieldLabel) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldLabel} must be an array`);
  }
  return value
    .map((item, index) => {
      if (typeof item !== 'string' || item.length === 0) {
        throw new Error(`${fieldLabel}[${index}] must be a non-empty string`);
      }
      return item;
    })
    .sort((a, b) => a.localeCompare(b));
}

function loadHomeyLibSystemVocabulary(homeyLibRoot) {
  const homeyLibPackagePath = path.join(homeyLibRoot, 'package.json');
  const homeyLibPackage = readJson(homeyLibPackagePath);
  const classesPath = path.join(homeyLibRoot, 'assets', 'device', 'classes.json');
  const capabilitiesPath = path.join(homeyLibRoot, 'assets', 'capability', 'capabilities.json');

  if (!fs.existsSync(classesPath)) {
    throw new Error(`Homey class list not found: ${classesPath}`);
  }
  if (!fs.existsSync(capabilitiesPath)) {
    throw new Error(`Homey capability list not found: ${capabilitiesPath}`);
  }

  return {
    version: typeof homeyLibPackage.version === 'string' ? homeyLibPackage.version : undefined,
    classesSourceRef: 'assets/device/classes.json',
    capabilitiesSourceRef: 'assets/capability/capabilities.json',
    classIds: normalizeIdList(readJson(classesPath), 'homey-lib classes'),
    capabilityIds: normalizeIdList(readJson(capabilitiesPath), 'homey-lib capabilities'),
  };
}

function loadComposeCapabilities(composeCapabilitiesDir) {
  if (!composeCapabilitiesDir || !fs.existsSync(composeCapabilitiesDir)) {
    return [];
  }
  const entries = fs.readdirSync(composeCapabilitiesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const id = entry.name.slice(0, -'.json'.length);
      return {
        id,
        sourceRef: toDisplayPath(path.join(composeCapabilitiesDir, entry.name)),
      };
    })
    .filter((entry) => entry.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function addSourceEntry(map, id, source, sourceRef) {
  if (typeof id !== 'string' || id.length === 0) return;
  const existing = map.get(id) ?? [];
  existing.push({ source, sourceRef });
  map.set(id, existing);
}

function mapToEntries(map) {
  return [...map.entries()].map(([id, sources]) => ({ id, sources }));
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-authoring-vocabulary-build [--output-file <rules/homey-authoring-vocabulary.json>]',
    '                        [--homey-lib-root <path/to/homey-lib>]',
    '                        [--compose-capabilities-dir <path/to/.homeycompose/capabilities>]',
    '                        [--format summary|json|json-pretty|json-compact]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { ok: false, error: getUsageText() };
  }
  const flags = parseFlagMap(argv);
  const format = flags.get('--format') ?? 'summary';
  if (!['summary', 'json', 'json-pretty', 'json-compact'].includes(format)) {
    return { ok: false, error: `Unsupported --format: ${format}` };
  }

  return {
    ok: true,
    command: {
      outputFile: resolveFilePath(flags.get('--output-file') ?? DEFAULT_OUTPUT_FILE),
      homeyLibRoot: flags.get('--homey-lib-root'),
      composeCapabilitiesDir: resolveFilePath(
        flags.get('--compose-capabilities-dir') ?? DEFAULT_COMPOSE_CAPABILITIES_DIR,
      ),
      format,
    },
  };
}

export function buildHomeyAuthoringVocabularyArtifact(command) {
  const homeyLibRoot = discoverHomeyLibRoot(command.homeyLibRoot);
  const systemVocabulary = loadHomeyLibSystemVocabulary(homeyLibRoot);
  const composeCapabilities = loadComposeCapabilities(command.composeCapabilitiesDir);

  const classSources = new Map();
  const capabilitySources = new Map();

  const homeyLibVersionTag = systemVocabulary.version
    ? `homey-lib@${systemVocabulary.version}`
    : 'homey-lib';
  for (const classId of systemVocabulary.classIds) {
    addSourceEntry(
      classSources,
      classId,
      'homey-lib-system',
      `${homeyLibVersionTag}:${systemVocabulary.classesSourceRef}`,
    );
  }

  for (const capabilityId of systemVocabulary.capabilityIds) {
    addSourceEntry(
      capabilitySources,
      capabilityId,
      'homey-lib-system',
      `${homeyLibVersionTag}:${systemVocabulary.capabilitiesSourceRef}`,
    );
  }

  for (const capability of composeCapabilities) {
    addSourceEntry(capabilitySources, capability.id, 'homey-compose-custom', capability.sourceRef);
  }

  const artifact = createHomeyAuthoringVocabularyArtifactV1(
    {
      homeyClasses: mapToEntries(classSources),
      capabilityIds: mapToEntries(capabilitySources),
    },
    {
      homeyLibVersion: systemVocabulary.version,
      homeyLibRoot: homeyLibVersionTag,
      composeCapabilitiesDir: toDisplayPath(command.composeCapabilitiesDir),
    },
  );
  assertHomeyAuthoringVocabularyArtifactV1(artifact);
  return artifact;
}

export function formatBuildOutput(artifact, format) {
  if (format === 'json' || format === 'json-pretty') return formatJsonPretty(artifact);
  if (format === 'json-compact') return formatJsonCompact(artifact);
  const customCapabilityCount = artifact.capabilityIds.filter((entry) =>
    entry.sources.some((source) => source.source === 'homey-compose-custom'),
  ).length;
  return [
    `Homey authoring vocabulary artifact: ${artifact.schemaVersion}`,
    `Homey classes: ${artifact.homeyClasses.length}`,
    `Capability IDs: ${artifact.capabilityIds.length}`,
    `Custom capability IDs: ${customCapabilityCount}`,
    `Homey-lib version: ${artifact.source.homeyLibVersion ?? 'unknown'}`,
    `Homey-lib root: ${artifact.source.homeyLibRoot ?? '(unknown)'}`,
    `Compose capabilities dir: ${artifact.source.composeCapabilitiesDir ?? '(none)'}`,
  ].join('\n');
}

export async function runBuildCommand(command, io = console) {
  const artifact = buildHomeyAuthoringVocabularyArtifact(command);
  fs.mkdirSync(path.dirname(command.outputFile), { recursive: true });
  fs.writeFileSync(command.outputFile, `${formatJsonPretty(artifact)}\n`, 'utf8');
  io.log(formatBuildOutput(artifact, command.format));
  io.log(`Wrote artifact: ${command.outputFile}`);
  return artifact;
}

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { formatJsonCompact, formatJsonPretty } from './output-format-lib.mjs';
import { connectAndInitialize, fetchNodeDetails, fetchNodesList } from './zwjs-inspect-lib.mjs';
import {
  DEFAULT_HOMEY_AUTHORING_VOCABULARY_FILE,
  resolveCompilerRuleVocabulary,
} from './homey-rule-vocabulary-lib.mjs';
import {
  isControllerLikeZwjsNodeDetail,
  normalizeCompilerDeviceFactsFromZwjsDetail,
} from './zwjs-to-compiler-facts-lib.mjs';

const require = createRequire(import.meta.url);
const {
  compileProfilePlanFromLoadedRuleSetManifest,
  createCompiledHomeyProfilesArtifactV1,
  loadJsonRuleSetManifestWithOptions,
} = require('../packages/compiler/dist');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_RULE_MANIFEST_FILE = path.join(REPO_ROOT, 'rules', 'manifest.json');

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

function assertReadableFile(filePath, contextLabel) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${contextLabel} is not readable: ${filePath} (${reason})`);
  }
}

function coerceManifestEntries(raw, manifestPath) {
  if (!Array.isArray(raw)) throw new Error('Manifest JSON must be an array');
  const manifestDir = path.dirname(manifestPath);
  const seen = new Set();
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object')
      throw new Error(`Manifest entry ${index} must be an object`);
    if (typeof entry.filePath !== 'string' || entry.filePath.length === 0) {
      throw new Error(`Manifest entry ${index} requires a non-empty filePath`);
    }
    if (
      entry.kind !== undefined &&
      entry.kind !== 'rules-json' &&
      entry.kind !== 'ha-derived-generated'
    ) {
      throw new Error(`Manifest entry ${index} has unsupported kind "${String(entry.kind)}"`);
    }
    if (
      entry.layer !== undefined &&
      entry.layer !== 'ha-derived' &&
      entry.layer !== 'project-product' &&
      entry.layer !== 'project-generic'
    ) {
      throw new Error(`Manifest entry ${index} has unsupported layer "${String(entry.layer)}"`);
    }
    const resolvedFilePath = path.isAbsolute(entry.filePath)
      ? entry.filePath
      : path.resolve(manifestDir, entry.filePath);
    if (seen.has(resolvedFilePath)) {
      throw new Error(`Manifest contains duplicate filePath: ${resolvedFilePath}`);
    }
    seen.add(resolvedFilePath);
    assertReadableFile(resolvedFilePath, `Manifest entry ${index} filePath`);
    return {
      ...entry,
      filePath: resolvedFilePath,
    };
  });
}

function normalizeRuleFiles(filePaths) {
  const seen = new Set();
  return filePaths.map((filePath, index) => {
    const resolvedFilePath = resolveFilePath(filePath);
    if (seen.has(resolvedFilePath)) {
      throw new Error(`Duplicate --rules-file entry: ${resolvedFilePath}`);
    }
    seen.add(resolvedFilePath);
    assertReadableFile(resolvedFilePath, `--rules-file[${index}]`);
    return resolvedFilePath;
  });
}

function deriveBuildProfile(command) {
  if (command.ruleInputMode === 'default-manifest') return 'default-manifest';
  if (command.ruleInputMode === 'manifest-file') return 'manifest-file';
  if (command.manifestFile) return 'manifest-file';
  return 'rules-files';
}

function buildPipelineFingerprint(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-compile-build (--device-file <device.json> [--device-file <device2.json> ...] | --url ws://host:port (--all-nodes | --node <id>))',
    '                     [--manifest-file <manifest.json> | --rules-file <rules.json> [--rules-file ...]]',
    '                     (defaults to rules/manifest.json when neither is provided)',
    '                     [--vocabulary-file <rules/homey-authoring-vocabulary.json>]',
    '                     [--catalog-file <catalog.json>]',
    '                     [--schema-version 0] [--token ...]',
    '                     [--include-values none|summary|full] [--max-values N]',
    '                     [--include-controller-nodes]',
    '                     [--output-file <compiled-profiles.json>]',
    '                     [--format summary|json|json-pretty|json-compact]',
  ].join('\n');
}

export function parseCliArgs(argv, options = {}) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const flags = parseFlagMap(argv);
  const url = flags.get('--url');
  const defaultManifestFile = resolveFilePath(
    options.defaultManifestFile ?? DEFAULT_RULE_MANIFEST_FILE,
  );

  const deviceFiles = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--device-file' && argv[i + 1]) deviceFiles.push(argv[i + 1]);
    if (argv[i].startsWith('--device-file=')) deviceFiles.push(argv[i].split('=', 2)[1]);
  }

  const allNodes = flags.has('--all-nodes');
  const nodeRaw = flags.get('--node');
  const nodeId = nodeRaw === undefined ? undefined : Number.parseInt(nodeRaw, 10);
  if (nodeRaw !== undefined && !Number.isInteger(nodeId)) {
    return { ok: false, error: `Invalid --node: ${nodeRaw}` };
  }
  const deviceSourceModeCount = (deviceFiles.length > 0 ? 1 : 0) + (url ? 1 : 0);
  if (deviceSourceModeCount === 0) {
    return { ok: false, error: 'Provide --device-file or --url with --all-nodes/--node' };
  }
  if (deviceSourceModeCount > 1) {
    return { ok: false, error: 'Use either --device-file or --url live mode, not both' };
  }
  if (url && !allNodes && nodeRaw === undefined) {
    return { ok: false, error: 'Live mode requires --all-nodes or --node <id>' };
  }
  if (url && allNodes && nodeRaw !== undefined) {
    return { ok: false, error: 'Use either --all-nodes or --node in live mode, not both' };
  }

  const manifestFlag = flags.get('--manifest-file');
  const rulesFiles = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rules-file' && argv[i + 1]) rulesFiles.push(argv[i + 1]);
    if (argv[i].startsWith('--rules-file=')) rulesFiles.push(argv[i].split('=', 2)[1]);
  }
  if (manifestFlag && rulesFiles.length > 0) {
    return { ok: false, error: 'Use either --manifest-file or --rules-file, not both' };
  }
  let manifestFile = manifestFlag ? resolveFilePath(manifestFlag) : undefined;
  let ruleInputMode = manifestFlag ? 'manifest-file' : 'rules-files';
  if (!manifestFile && rulesFiles.length === 0) {
    if (!fs.existsSync(defaultManifestFile)) {
      return {
        ok: false,
        error:
          `No rules source provided and default manifest not found: ${defaultManifestFile}. ` +
          'Provide --manifest-file or at least one --rules-file',
      };
    }
    manifestFile = defaultManifestFile;
    ruleInputMode = 'default-manifest';
  }

  const format = flags.get('--format') ?? 'summary';
  if (!['summary', 'json', 'json-pretty', 'json-compact'].includes(format)) {
    return { ok: false, error: `Unsupported format: ${format}` };
  }

  const schemaVersionRaw = flags.get('--schema-version') ?? '0';
  const schemaVersion = Number(schemaVersionRaw);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    return { ok: false, error: `Invalid --schema-version: ${schemaVersionRaw}` };
  }
  const includeValues = flags.get('--include-values') ?? (allNodes ? 'summary' : 'full');
  if (!['none', 'summary', 'full'].includes(includeValues)) {
    return { ok: false, error: `Unsupported --include-values: ${includeValues}` };
  }
  const maxValuesRaw = flags.get('--max-values') ?? (allNodes ? '100' : '200');
  const maxValues = Number(maxValuesRaw);
  if (!Number.isInteger(maxValues) || maxValues < 1) {
    return { ok: false, error: `Invalid --max-values: ${maxValuesRaw}` };
  }

  return {
    ok: true,
    command: {
      url,
      token: flags.get('--token'),
      schemaVersion,
      allNodes,
      nodeId,
      includeValues,
      maxValues,
      includeControllerNodes: flags.has('--include-controller-nodes'),
      deviceFiles,
      manifestFile,
      rulesFiles,
      ruleInputMode,
      vocabularyFile: resolveFilePath(
        flags.get('--vocabulary-file') ?? DEFAULT_HOMEY_AUTHORING_VOCABULARY_FILE,
      ),
      catalogFile: flags.get('--catalog-file'),
      outputFile: flags.get('--output-file'),
      format,
    },
  };
}

async function loadDevices(command, deps = {}) {
  if (command.deviceFiles.length > 0) {
    return command.deviceFiles.map((file) => ({ file, device: readJson(file) }));
  }
  const connect = deps.connectAndInitializeImpl ?? connectAndInitialize;
  const fetchList = deps.fetchNodesListImpl ?? fetchNodesList;
  const fetchDetail = deps.fetchNodeDetailsImpl ?? fetchNodeDetails;
  const client = await connect({
    url: command.url,
    token: command.token,
    schemaVersion: command.schemaVersion,
  });
  try {
    const nodeSummaries = command.allNodes
      ? await fetchList(client)
      : [{ nodeId: command.nodeId, name: undefined }];
    const devices = [];
    for (const node of nodeSummaries) {
      const detail = await fetchDetail(client, node.nodeId, {
        includeValues: command.includeValues,
        maxValues: command.maxValues,
      });
      if (!command.includeControllerNodes && isControllerLikeZwjsNodeDetail(detail)) {
        continue;
      }
      devices.push({
        file: `zwjs-live:node-${node.nodeId}`,
        device: normalizeCompilerDeviceFactsFromZwjsDetail(detail),
      });
    }
    return devices;
  } finally {
    await client.stop();
  }
}

export async function buildCompiledProfilesArtifact(command, deps = {}) {
  const compileLoadedRuleSetImpl =
    deps.compileProfilePlanFromLoadedRuleSetManifestImpl ??
    compileProfilePlanFromLoadedRuleSetManifest;
  const loadRuleSetImpl =
    deps.loadJsonRuleSetManifestWithOptionsImpl ??
    deps.loadJsonRuleSetManifestImpl ??
    loadJsonRuleSetManifestWithOptions;
  const createArtifactImpl =
    deps.createCompiledHomeyProfilesArtifactV1Impl ?? createCompiledHomeyProfilesArtifactV1;
  const devices = await loadDevices(command, deps);
  const ruleVocabulary = resolveCompilerRuleVocabulary(command.vocabularyFile);
  const manifestFilePath = command.manifestFile ? resolveFilePath(command.manifestFile) : undefined;
  const normalizedRulesFiles = manifestFilePath
    ? undefined
    : normalizeRuleFiles(command.rulesFiles ?? []);
  const manifestEntries = manifestFilePath
    ? coerceManifestEntries(readJson(manifestFilePath), manifestFilePath)
    : (normalizedRulesFiles ?? []).map((filePath) => ({ filePath }));
  const loadedRuleSet = loadRuleSetImpl(manifestEntries, {
    vocabulary: ruleVocabulary.vocabulary,
  });
  const catalogFilePath = command.catalogFile ? resolveFilePath(command.catalogFile) : undefined;
  if (catalogFilePath) assertReadableFile(catalogFilePath, '--catalog-file');
  const catalogArtifact = catalogFilePath ? readJson(catalogFilePath) : undefined;

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
    compiled: compileLoadedRuleSetImpl(device, loadedRuleSet, { catalogArtifact }),
  }));

  const ruleSources = loadedRuleSet.entries.map((entry) => ({
    filePath: entry.filePath,
    ruleCount: entry.rules.length,
    ...(entry.declaredLayer ? { declaredLayer: entry.declaredLayer } : {}),
    ...(entry.resolvedLayer ? { resolvedLayer: entry.resolvedLayer } : {}),
  }));
  const source = {
    ...(manifestFilePath ? { manifestFile: manifestFilePath } : {}),
    ...(manifestFilePath ? {} : { rulesFiles: normalizedRulesFiles }),
    ...(catalogFilePath ? { catalogFile: catalogFilePath } : {}),
    buildProfile: deriveBuildProfile(command),
    ruleSources,
    pipelineFingerprint: buildPipelineFingerprint({
      buildProfile: deriveBuildProfile(command),
      manifestFile: manifestFilePath,
      rulesFiles: normalizedRulesFiles,
      vocabularyFile: ruleVocabulary.vocabularyFile,
      catalogFile: catalogFilePath,
      ruleSources,
    }),
  };

  return createArtifactImpl(entries, source);
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
    `Build profile: ${artifact.source.buildProfile ?? 'unspecified'}`,
    `Rule sources: ${artifact.source.ruleSources?.length ?? 0}`,
    ...(artifact.source.pipelineFingerprint
      ? [`Pipeline fingerprint: ${artifact.source.pipelineFingerprint}`]
      : []),
    `Catalog matches: ${withCatalogMatch}`,
    `Outcomes: ${outcomeSummary || '(none)'}`,
  ].join('\n');
}

export async function runBuildCommand(command, io = console, deps = {}) {
  const artifact = await buildCompiledProfilesArtifact(command, deps);
  if (command.outputFile) {
    fs.writeFileSync(command.outputFile, `${formatJsonPretty(artifact)}\n`, 'utf8');
  }
  io.log(formatBuildOutput(artifact, command.format));
  return artifact;
}

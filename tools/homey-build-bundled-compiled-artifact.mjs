#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  sanitizeJsonPathsForRepo,
  toRepoRelativePath,
} from './repo-path-sanitization-lib.mjs';

const require = createRequire(import.meta.url);
const {
  compileProfilePlanFromLoadedRuleSetManifest,
  createCompiledHomeyProfilesArtifactV1,
  loadJsonRuleSetManifestWithOptions,
} = require('../packages/compiler/dist');

const DEFAULT_MANIFEST_FILE = path.join(REPO_ROOT, 'rules', 'manifest.json');
const DEFAULT_OUTPUT_FILE = path.join(
  REPO_ROOT,
  'co.lazylabs.zwavejs2homey',
  'assets',
  'compiled',
  'compiled-homey-profiles.v1.json',
);
const DETERMINISTIC_GENERATED_AT = new Date('1970-01-01T00:00:00.000Z');

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
    '  homey-build-bundled-compiled-artifact',
    '    [--manifest-file rules/manifest.json]',
    '    [--output-file co.lazylabs.zwavejs2homey/assets/compiled/compiled-homey-profiles.v1.json]',
    '    [--check]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const flags = parseFlagMap(argv);
  const manifestFile = path.resolve(flags.get('--manifest-file') ?? DEFAULT_MANIFEST_FILE);
  const outputFile = path.resolve(flags.get('--output-file') ?? DEFAULT_OUTPUT_FILE);
  return {
    ok: true,
    command: {
      manifestFile,
      outputFile,
      check: flags.has('--check'),
    },
  };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toRepoRelative(filePath) {
  return toRepoRelativePath(filePath, REPO_ROOT);
}

function toManifestEntries(manifestFile) {
  const raw = readJsonFile(manifestFile);
  if (!Array.isArray(raw)) {
    throw new Error(`Manifest must be an array: ${manifestFile}`);
  }
  const manifestDir = path.dirname(manifestFile);
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Manifest entry ${index} must be an object`);
    }
    if (typeof entry.filePath !== 'string' || entry.filePath.length === 0) {
      throw new Error(`Manifest entry ${index} requires non-empty filePath`);
    }
    const absoluteFilePath = path.isAbsolute(entry.filePath)
      ? entry.filePath
      : path.resolve(manifestDir, entry.filePath);
    return {
      ...entry,
      filePath: absoluteFilePath,
    };
  });
}

function toProductTripleKey(target) {
  return `product-triple:${target.manufacturerId}:${target.productType}:${target.productId}`;
}

function ensureProductBundle(filePath) {
  const parsed = readJsonFile(filePath);
  if (parsed?.schemaVersion !== 'product-rules/v1') {
    throw new Error(`Expected product-rules/v1 bundle: ${filePath}`);
  }
  const target = parsed.target;
  if (!target || typeof target !== 'object') {
    throw new Error(`Missing product-rules/v1 target: ${filePath}`);
  }
  for (const key of ['manufacturerId', 'productType', 'productId']) {
    const value = target[key];
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid ${key} in ${filePath}`);
    }
  }
  const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
  return {
    filePath,
    target,
    rules,
  };
}

function choosePropertyKey(matcher) {
  if (Array.isArray(matcher?.propertyKey) && matcher.propertyKey.length > 0) {
    const explicit = matcher.propertyKey.find((value) => value !== null);
    return explicit;
  }
  if (Array.isArray(matcher?.notPropertyKey) && matcher.notPropertyKey.includes(null)) {
    return 'synthetic';
  }
  return undefined;
}

function makeSyntheticValueFromMatcher(matcher) {
  const commandClass =
    Array.isArray(matcher?.commandClass) && matcher.commandClass.length > 0
      ? matcher.commandClass[0]
      : 37;
  const endpoint =
    Array.isArray(matcher?.endpoint) && matcher.endpoint.length > 0 ? matcher.endpoint[0] : 0;
  const property =
    Array.isArray(matcher?.property) && matcher.property.length > 0
      ? matcher.property[0]
      : 'currentValue';
  const propertyKey = choosePropertyKey(matcher);
  const metadataType =
    Array.isArray(matcher?.metadataType) && matcher.metadataType.length > 0
      ? matcher.metadataType[0]
      : 'number';

  const valueId = {
    commandClass,
    property,
  };
  if (endpoint !== 0) valueId.endpoint = endpoint;
  if (propertyKey !== undefined) valueId.propertyKey = propertyKey;

  return {
    valueId,
    metadata: {
      type: metadataType,
      readable: typeof matcher?.readable === 'boolean' ? matcher.readable : true,
      writeable: typeof matcher?.writeable === 'boolean' ? matcher.writeable : true,
    },
  };
}

function collectRuleMatchers(rule) {
  const collected = [];
  if (rule?.value && typeof rule.value === 'object') {
    collected.push(rule.value);
  }
  if (Array.isArray(rule?.constraints?.requiredValues)) {
    for (const matcher of rule.constraints.requiredValues) {
      if (matcher && typeof matcher === 'object') {
        collected.push(matcher);
      }
    }
  }
  return collected;
}

function createSyntheticDeviceForProductBundle(bundle) {
  const valueMap = new Map();
  for (const rule of bundle.rules) {
    for (const matcher of collectRuleMatchers(rule)) {
      const value = makeSyntheticValueFromMatcher(matcher);
      const stableKey = JSON.stringify(value.valueId);
      if (!valueMap.has(stableKey)) {
        valueMap.set(stableKey, value);
      }
    }
  }

  if (valueMap.size === 0) {
    const fallbackValue = makeSyntheticValueFromMatcher({});
    valueMap.set(JSON.stringify(fallbackValue.valueId), fallbackValue);
  }

  return {
    deviceKey: toProductTripleKey(bundle.target),
    manufacturerId: bundle.target.manufacturerId,
    productType: bundle.target.productType,
    productId: bundle.target.productId,
    values: [...valueMap.values()],
  };
}

function buildPipelineFingerprint(source) {
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

export function buildBundledArtifact(command) {
  const manifestEntries = toManifestEntries(command.manifestFile);
  const loaded = loadJsonRuleSetManifestWithOptions(manifestEntries);

  const productBundles = manifestEntries
    .filter((entry) => entry.layer === 'project-product')
    .map((entry) => ensureProductBundle(entry.filePath));

  if (productBundles.length === 0) {
    throw new Error(
      'No project-product bundles found in manifest; refusing to build empty artifact',
    );
  }

  const compiledEntries = productBundles.map((bundle) => {
    const syntheticDevice = createSyntheticDeviceForProductBundle(bundle);
    const compileResult = compileProfilePlanFromLoadedRuleSetManifest(syntheticDevice, loaded, {
      reportMode: 'summary',
      profileId: toProductTripleKey(bundle.target),
    });

    if (compileResult.report.summary.appliedProjectProductActions <= 0) {
      throw new Error(
        `Product bundle did not apply project-product actions: ${toRepoRelative(bundle.filePath)}`,
      );
    }

    return {
      device: {
        deviceKey: syntheticDevice.deviceKey,
        manufacturerId: syntheticDevice.manufacturerId,
        productType: syntheticDevice.productType,
        productId: syntheticDevice.productId,
      },
      compiled: compileResult,
    };
  });

  const source = {
    manifestFile: toRepoRelative(command.manifestFile),
    buildProfile: 'manifest-file',
    ruleSources: loaded.entries.map((entry) => ({
      filePath: toRepoRelative(entry.filePath),
      ruleCount: entry.rules.length,
      ...(entry.declaredLayer ? { declaredLayer: entry.declaredLayer } : {}),
      ...(entry.resolvedLayer ? { resolvedLayer: entry.resolvedLayer } : {}),
    })),
  };

  const artifact = createCompiledHomeyProfilesArtifactV1(
    compiledEntries,
    {
      ...source,
      pipelineFingerprint: buildPipelineFingerprint(source),
    },
    DETERMINISTIC_GENERATED_AT,
  );

  return {
    artifact: sanitizeJsonPathsForRepo(artifact),
    summary: {
      entries: compiledEntries.length,
      products: productBundles.length,
      manifestFile: toRepoRelative(command.manifestFile),
      outputFile: toRepoRelative(command.outputFile),
    },
  };
}

function writeArtifact(filePath, artifact) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableValuePreview(value) {
  if (typeof value === 'string') return `"${value}"`;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    typeof value === 'undefined'
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return `Array(len=${value.length})`;
  if (isObject(value)) return `Object(keys=${Object.keys(value).length})`;
  return String(value);
}

function firstJsonDiff(expected, actual, pointer = '$') {
  if (Object.is(expected, actual)) return null;

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return { pointer, expected, actual, reason: 'type-mismatch' };
    }
    if (expected.length !== actual.length) {
      return {
        pointer: `${pointer}.length`,
        expected: expected.length,
        actual: actual.length,
        reason: 'array-length-mismatch',
      };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const nested = firstJsonDiff(expected[index], actual[index], `${pointer}[${index}]`);
      if (nested) return nested;
    }
    return null;
  }

  if (isObject(expected) || isObject(actual)) {
    if (!isObject(expected) || !isObject(actual)) {
      return { pointer, expected, actual, reason: 'type-mismatch' };
    }
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    const keyCountDiff = firstJsonDiff(expectedKeys, actualKeys, `${pointer}.__keys`);
    if (keyCountDiff) return keyCountDiff;
    for (const key of expectedKeys) {
      const nested = firstJsonDiff(expected[key], actual[key], `${pointer}.${key}`);
      if (nested) return nested;
    }
    return null;
  }

  return { pointer, expected, actual, reason: 'value-mismatch' };
}

export function verifyBundledArtifactSync(command) {
  const result = buildBundledArtifact(command);
  const normalizedExpectedArtifact = JSON.parse(JSON.stringify(result.artifact));
  let committedArtifact;
  try {
    committedArtifact = readJsonFile(command.outputFile);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `error: bundled compiled artifact is missing or unreadable: ${toRepoRelative(command.outputFile)}`,
        `hint: run npm run compiler:build:bundled`,
        `detail: ${detail}`,
      ].join('\n'),
    );
  }
  const diff = firstJsonDiff(normalizedExpectedArtifact, committedArtifact);
  if (diff) {
    throw new Error(
      [
        'error: bundled compiled artifact is out of sync with manifest/rules inputs',
        `at: ${diff.pointer}`,
        `expected: ${stableValuePreview(diff.expected)}`,
        `actual: ${stableValuePreview(diff.actual)}`,
        'hint: run npm run compiler:build:bundled',
      ].join('\n'),
    );
  }
  return result;
}

export function runBundledArtifactCommand(command, io = console) {
  if (command.check) {
    const result = verifyBundledArtifactSync(command);
    io.log(`Bundled compiled artifact is in sync: ${result.summary.entries} entries`);
    io.log(`Manifest: ${result.summary.manifestFile}`);
    io.log(`Output: ${result.summary.outputFile}`);
    return result;
  }
  const result = buildBundledArtifact(command);
  writeArtifact(command.outputFile, result.artifact);
  io.log(`Bundled compiled artifact generated: ${result.summary.entries} entries`);
  io.log(`Manifest: ${result.summary.manifestFile}`);
  io.log(`Output: ${result.summary.outputFile}`);
  return result;
}

function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exit(parsed.error === getUsageText() ? 0 : 1);
  }
  try {
    runBundledArtifactCommand(parsed.command, console);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule) {
  main();
}

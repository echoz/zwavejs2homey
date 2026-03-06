const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertCompiledHomeyProfilesArtifactV1 } = require('@zwavejs2homey/compiler');

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const BUNDLED_ARTIFACT_FILE = path.join(
  APP_ROOT,
  'assets',
  'compiled',
  'compiled-homey-profiles.v1.json',
);
const RULE_MANIFEST_FILE = path.join(REPO_ROOT, 'rules', 'manifest.json');

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toProductTriple(target) {
  return `${target.manufacturerId}:${target.productType}:${target.productId}`;
}

function readExpectedProductTriplesFromManifest() {
  const manifest = readJsonFile(RULE_MANIFEST_FILE);
  if (!Array.isArray(manifest)) {
    throw new Error(`Rule manifest must be an array: ${RULE_MANIFEST_FILE}`);
  }

  const triples = new Set();
  for (const entry of manifest) {
    if (!entry || typeof entry !== 'object' || entry.layer !== 'project-product') continue;
    const filePath = path.resolve(REPO_ROOT, 'rules', entry.filePath);
    const bundle = readJsonFile(filePath);
    if (bundle?.schemaVersion !== 'product-rules/v1') continue;
    if (!bundle.target || typeof bundle.target !== 'object') continue;
    triples.add(toProductTriple(bundle.target));
  }
  return triples;
}

function readActualProductTriplesFromArtifact(artifact) {
  const triples = new Set();
  for (const entry of artifact.entries) {
    const device = entry?.device;
    if (!device || typeof device !== 'object') continue;
    if (
      Number.isInteger(device.manufacturerId) &&
      Number.isInteger(device.productType) &&
      Number.isInteger(device.productId)
    ) {
      triples.add(`${device.manufacturerId}:${device.productType}:${device.productId}`);
    }
  }
  return triples;
}

function collectAbsolutePathStrings(value, pointer = '$', output = []) {
  if (typeof value === 'string') {
    const isPosixAbsoluteUserPath = value.startsWith('/home/') || value.startsWith('/Users/');
    const isWindowsAbsolutePath = /^[A-Za-z]:\\/.test(value);
    if (isPosixAbsoluteUserPath || isWindowsAbsolutePath) {
      output.push({ pointer, value });
    }
    return output;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectAbsolutePathStrings(value[index], `${pointer}[${index}]`, output);
    }
    return output;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      collectAbsolutePathStrings(nested, `${pointer}.${key}`, output);
    }
  }
  return output;
}

function readRuntimeVerticalCapabilitiesFromArtifact(artifact) {
  const capabilityIds = new Set();
  for (const entry of artifact.entries) {
    const profile = entry?.compiled?.profile;
    const capabilities = Array.isArray(profile?.capabilities) ? profile.capabilities : [];
    for (const capability of capabilities) {
      if (!capability || typeof capability !== 'object') continue;
      const capabilityId =
        typeof capability.capabilityId === 'string' ? capability.capabilityId.trim() : '';
      if (!capabilityId) continue;
      const inboundKind = capability.inboundMapping?.kind;
      const outboundKind = capability.outboundMapping?.kind;
      if (inboundKind === 'value' || outboundKind === 'set_value') {
        capabilityIds.add(capabilityId);
      }
    }
  }
  return capabilityIds;
}

test('bundled compiled profiles artifact is valid and non-empty', () => {
  const artifact = readJsonFile(BUNDLED_ARTIFACT_FILE);
  assertCompiledHomeyProfilesArtifactV1(artifact);
  assert.ok(artifact.entries.length > 0, 'bundled artifact must not be empty');
});

test('bundled compiled profiles artifact covers all project-product targets from manifest', () => {
  const artifact = readJsonFile(BUNDLED_ARTIFACT_FILE);
  assertCompiledHomeyProfilesArtifactV1(artifact);

  const expectedTriples = readExpectedProductTriplesFromManifest();
  const actualTriples = readActualProductTriplesFromArtifact(artifact);

  const missing = [...expectedTriples].filter((triple) => !actualTriples.has(triple));
  assert.deepEqual(
    missing,
    [],
    `bundled artifact missing product triples from manifest: ${missing.join(', ')}`,
  );
});

test('bundled compiled profiles artifact does not include machine-specific absolute paths', () => {
  const artifact = readJsonFile(BUNDLED_ARTIFACT_FILE);
  const absolutePaths = collectAbsolutePathStrings(artifact);
  assert.deepEqual(
    absolutePaths,
    [],
    `artifact contains absolute paths: ${absolutePaths
      .slice(0, 5)
      .map((entry) => `${entry.pointer}=${entry.value}`)
      .join(', ')}`,
  );
});

test('bundled runtime vertical capabilities are all covered by node-runtime harness tests', () => {
  const artifact = readJsonFile(BUNDLED_ARTIFACT_FILE);
  assertCompiledHomeyProfilesArtifactV1(artifact);

  const runtimeVerticalCapabilities = readRuntimeVerticalCapabilitiesFromArtifact(artifact);
  const coveredCapabilities = new Set([
    'onoff',
    'dim',
    'windowcoverings_set',
    'measure_power',
    'meter_power',
    'measure_battery',
    'enum_select',
    'locked',
    'target_temperature',
    'alarm_contact',
    'measure_humidity',
    'thermostat_mode',
    'measure_luminance',
    'alarm_motion',
  ]);
  const missingCoverage = [...runtimeVerticalCapabilities]
    .filter((capabilityId) => !coveredCapabilities.has(capabilityId))
    .sort();

  assert.deepEqual(
    missingCoverage,
    [],
    `runtime verticals missing harness coverage: ${missingCoverage.join(', ')}`,
  );
});

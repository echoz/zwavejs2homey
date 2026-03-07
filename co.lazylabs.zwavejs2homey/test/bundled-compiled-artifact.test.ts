const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assertCompiledHomeyProfilesArtifactV1 } = require('@zwavejs2homey/compiler');
const {
  getSpecializedCapabilityCoercions,
  getSupportedInboundTransformRefs,
  getSupportedOutboundTransformRefs,
} = require('../node-runtime.js');

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const BUNDLED_ARTIFACT_FILE = path.join(
  APP_ROOT,
  'assets',
  'compiled',
  'compiled-homey-profiles.v1.json',
);
const RULE_MANIFEST_FILE = path.join(REPO_ROOT, 'rules', 'manifest.json');
const BUNDLED_BUILD_TOOL_FILE = path.join(
  REPO_ROOT,
  'tools',
  'homey-build-bundled-compiled-artifact.mjs',
);

const RUNTIME_MAPPING_COVERAGE_POLICY = {
  onoff: {
    coercionMode: 'generic',
    coverageRef: 'test/node-device-harness.test.ts:onoff + dim verticals',
  },
  dim: {
    coercionMode: 'specialized',
    coverageRef: 'test/node-device-harness.test.ts:onoff + dim verticals',
  },
  windowcoverings_set: {
    coercionMode: 'specialized',
    coverageRef: 'test/node-device-harness.test.ts:windowcoverings_set runtime mapping',
  },
  measure_power: {
    coercionMode: 'generic',
    coverageRef: 'test/node-device-harness.test.ts:measure_battery/meter_power/enum_select/locked',
  },
  meter_power: {
    coercionMode: 'generic',
    coverageRef: 'test/node-device-harness.test.ts:measure_battery/meter_power/enum_select/locked',
  },
  measure_battery: {
    coercionMode: 'specialized',
    coverageRef: 'test/node-device-harness.test.ts:measure_battery/meter_power/enum_select/locked',
  },
  enum_select: {
    coercionMode: 'specialized',
    coverageRef: 'test/node-device-harness.test.ts:measure_battery/meter_power/enum_select/locked',
  },
  locked: {
    coercionMode: 'specialized',
    coverageRef: 'test/node-device-harness.test.ts:measure_battery/meter_power/enum_select/locked',
  },
};

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

function readRuntimeVerticalCoverageFromArtifact(artifact) {
  const capabilityCoverage = new Map();
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
        if (!capabilityCoverage.has(capabilityId)) {
          capabilityCoverage.set(capabilityId, {
            inboundTransformRefs: new Set(),
            outboundTransformRefs: new Set(),
          });
        }
        const details = capabilityCoverage.get(capabilityId);
        if (
          inboundKind === 'value' &&
          typeof capability.inboundMapping?.transformRef === 'string' &&
          capability.inboundMapping.transformRef.trim().length > 0
        ) {
          details.inboundTransformRefs.add(capability.inboundMapping.transformRef.trim());
        }
        if (
          outboundKind === 'set_value' &&
          typeof capability.outboundMapping?.transformRef === 'string' &&
          capability.outboundMapping.transformRef.trim().length > 0
        ) {
          details.outboundTransformRefs.add(capability.outboundMapping.transformRef.trim());
        }
      }
    }
  }
  return capabilityCoverage;
}

test('bundled compiled profiles artifact is valid and non-empty', () => {
  const artifact = readJsonFile(BUNDLED_ARTIFACT_FILE);
  assertCompiledHomeyProfilesArtifactV1(artifact);
  assert.ok(artifact.entries.length > 0, 'bundled artifact must not be empty');
});

test('bundled compiled profiles artifact is in sync with shipping build output', async () => {
  const { buildBundledArtifact } = await import(pathToFileURL(BUNDLED_BUILD_TOOL_FILE).href);
  const committedArtifact = readJsonFile(BUNDLED_ARTIFACT_FILE);
  const rebuilt = buildBundledArtifact({
    manifestFile: RULE_MANIFEST_FILE,
    outputFile: BUNDLED_ARTIFACT_FILE,
    check: false,
  });
  const normalizedCommitted = JSON.parse(JSON.stringify(committedArtifact));
  const normalizedRebuilt = JSON.parse(JSON.stringify(rebuilt.artifact));
  assert.deepEqual(
    normalizedCommitted,
    normalizedRebuilt,
    'Bundled artifact is stale. Run npm run compiler:build:bundled and commit the updated artifact.',
  );
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

test('bundled runtime vertical capabilities are explicitly policy-registered', () => {
  const artifact = readJsonFile(BUNDLED_ARTIFACT_FILE);
  assertCompiledHomeyProfilesArtifactV1(artifact);

  const runtimeVerticalCoverage = readRuntimeVerticalCoverageFromArtifact(artifact);
  const runtimeVerticalCapabilities = [...runtimeVerticalCoverage.keys()].sort();
  const policyCapabilities = Object.keys(RUNTIME_MAPPING_COVERAGE_POLICY).sort();

  const missingPolicy = runtimeVerticalCapabilities
    .filter(
      (capabilityId) =>
        !Object.prototype.hasOwnProperty.call(RUNTIME_MAPPING_COVERAGE_POLICY, capabilityId),
    )
    .sort();
  const stalePolicy = policyCapabilities
    .filter((capabilityId) => !runtimeVerticalCoverage.has(capabilityId))
    .sort();

  assert.deepEqual(
    missingPolicy,
    [],
    `runtime verticals missing explicit mapping policy entries: ${missingPolicy.join(', ')}`,
  );
  assert.deepEqual(
    stalePolicy,
    [],
    `runtime mapping policy contains stale entries not present in bundled artifact: ${stalePolicy.join(', ')}`,
  );
});

test('bundled runtime vertical transform refs are supported by node-runtime', () => {
  const artifact = readJsonFile(BUNDLED_ARTIFACT_FILE);
  assertCompiledHomeyProfilesArtifactV1(artifact);

  const runtimeVerticalCoverage = readRuntimeVerticalCoverageFromArtifact(artifact);
  const supportedInboundTransformRefs = new Set(getSupportedInboundTransformRefs());
  const supportedOutboundTransformRefs = new Set(getSupportedOutboundTransformRefs());

  const unknownInboundTransformRefs = [];
  const unknownOutboundTransformRefs = [];
  for (const [capabilityId, details] of runtimeVerticalCoverage.entries()) {
    for (const transformRef of details.inboundTransformRefs) {
      if (!supportedInboundTransformRefs.has(transformRef)) {
        unknownInboundTransformRefs.push(`${capabilityId}:${transformRef}`);
      }
    }
    for (const transformRef of details.outboundTransformRefs) {
      if (!supportedOutboundTransformRefs.has(transformRef)) {
        unknownOutboundTransformRefs.push(`${capabilityId}:${transformRef}`);
      }
    }
  }

  assert.deepEqual(
    unknownInboundTransformRefs.sort(),
    [],
    `unsupported inbound transform refs in bundled artifact: ${unknownInboundTransformRefs.join(', ')}`,
  );
  assert.deepEqual(
    unknownOutboundTransformRefs.sort(),
    [],
    `unsupported outbound transform refs in bundled artifact: ${unknownOutboundTransformRefs.join(', ')}`,
  );
});

test('bundled runtime vertical coercion modes align with explicit policy', () => {
  const artifact = readJsonFile(BUNDLED_ARTIFACT_FILE);
  assertCompiledHomeyProfilesArtifactV1(artifact);

  const runtimeVerticalCoverage = readRuntimeVerticalCoverageFromArtifact(artifact);
  const specializedCapabilities = new Set(getSpecializedCapabilityCoercions());
  const modeMismatch = [];

  for (const [capabilityId, details] of runtimeVerticalCoverage.entries()) {
    const policy = RUNTIME_MAPPING_COVERAGE_POLICY[capabilityId];
    if (!policy) continue;
    const transformSpecialized =
      details.inboundTransformRefs.size > 0 || details.outboundTransformRefs.size > 0;
    const specialized = transformSpecialized || specializedCapabilities.has(capabilityId);
    const observedMode = specialized ? 'specialized' : 'generic';
    if (policy.coercionMode !== observedMode) {
      modeMismatch.push(
        `${capabilityId}: policy=${policy.coercionMode}, observed=${observedMode}, coverage=${policy.coverageRef}`,
      );
    }
  }

  assert.deepEqual(
    modeMismatch,
    [],
    `runtime mapping policy coercion modes are out of sync: ${modeMismatch.join(' | ')}`,
  );
});

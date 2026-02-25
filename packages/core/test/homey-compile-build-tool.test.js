const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

async function loadLib() {
  return import('../../../tools/homey-compile-build-lib.mjs');
}

const fixturesDir = path.join(__dirname, '../../compiler/test/fixtures');

test('parseCliArgs validates required inputs for compiler build', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs(['--rules-file', 'r.json']).ok, false);
  assert.equal(parseCliArgs(['--device-file', 'd.json']).ok, false);
  assert.equal(parseCliArgs(['--url', 'ws://x', '--rules-file', 'r.json']).ok, false);
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--format', 'yaml']).ok,
    false,
  );
  assert.equal(
    parseCliArgs([
      '--url',
      'ws://x',
      '--all-nodes',
      '--device-file',
      'd.json',
      '--rules-file',
      'r.json',
    ]).ok,
    false,
  );
  const parsed = parseCliArgs([
    '--device-file',
    'd.json',
    '--rules-file',
    'r.json',
    '--format',
    'summary',
  ]);
  assert.equal(parsed.ok, true);
  const liveParsed = parseCliArgs([
    '--url',
    'ws://x',
    '--all-nodes',
    '--rules-file',
    'r.json',
    '--include-values',
    'summary',
  ]);
  assert.equal(liveParsed.ok, true);
});

test('buildCompiledProfilesArtifact compiles multiple devices and emits artifact', async () => {
  const { buildCompiledProfilesArtifact } = await loadLib();
  const artifact = await buildCompiledProfilesArtifact({
    deviceFiles: [
      path.join(fixturesDir, 'device-switch-meter.json'),
      path.join(fixturesDir, 'device-unmapped.json'),
    ],
    url: undefined,
    token: undefined,
    schemaVersion: 0,
    allNodes: false,
    nodeId: undefined,
    includeValues: 'full',
    maxValues: 200,
    manifestFile: undefined,
    rulesFiles: [path.join(fixturesDir, 'rules-switch-meter.json')],
    catalogFile: path.join(fixturesDir, 'catalog-devices-v1.json'),
    outputFile: undefined,
    format: 'summary',
  });
  assert.equal(artifact.schemaVersion, 'compiled-homey-profiles/v1');
  assert.equal(artifact.entries.length, 2);
  assert.equal(typeof artifact.entries[0].compiled.profile.profileId, 'string');
});

test('runBuildCommand writes output file and summary', async () => {
  const { runBuildCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-compile-build-'));
  const outFile = path.join(tmpDir, 'compiled-profiles.json');
  const logs = [];
  await runBuildCommand(
    {
      url: undefined,
      token: undefined,
      schemaVersion: 0,
      allNodes: false,
      nodeId: undefined,
      includeValues: 'full',
      maxValues: 200,
      deviceFiles: [path.join(fixturesDir, 'device-switch-meter.json')],
      manifestFile: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
      rulesFiles: [],
      catalogFile: undefined,
      outputFile: outFile,
      format: 'summary',
    },
    { log: (line) => logs.push(line) },
  );
  assert.equal(fs.existsSync(outFile), true);
  const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(parsed.schemaVersion, 'compiled-homey-profiles/v1');
  assert.match(logs[0], /Compiled profiles artifact:/);
});

test('buildCompiledProfilesArtifact supports live ZWJS mode with mocks', async () => {
  const { buildCompiledProfilesArtifact } = await loadLib();
  const artifact = await buildCompiledProfilesArtifact(
    {
      url: 'ws://x',
      token: undefined,
      schemaVersion: 0,
      allNodes: true,
      nodeId: undefined,
      includeValues: 'summary',
      maxValues: 50,
      deviceFiles: [],
      manifestFile: undefined,
      rulesFiles: [path.join(fixturesDir, 'rules-switch-meter.json')],
      catalogFile: undefined,
      outputFile: undefined,
      format: 'summary',
      includeControllerNodes: false,
    },
    {
      connectAndInitializeImpl: async () => ({ stop: async () => {} }),
      fetchNodesListImpl: async () => [{ nodeId: 5, name: 'Kitchen Plug' }],
      fetchNodeDetailsImpl: async () => ({
        nodeId: 5,
        state: {
          name: 'Kitchen Plug',
          manufacturerId: '0x0184',
          productType: '0x4447',
          productId: '0x3034',
          firmwareVersion: '1.0',
        },
        values: [],
      }),
    },
  );
  assert.equal(artifact.entries.length, 1);
  assert.equal(artifact.entries[0].device.nodeId, 5);
  assert.match(artifact.entries[0].device.deviceKey, /^zwjs-live:/);
});

test('buildCompiledProfilesArtifact skips controller-like live nodes by default', async () => {
  const { buildCompiledProfilesArtifact } = await loadLib();
  const artifact = await buildCompiledProfilesArtifact(
    {
      url: 'ws://x',
      token: undefined,
      schemaVersion: 0,
      allNodes: true,
      nodeId: undefined,
      includeValues: 'summary',
      maxValues: 50,
      includeControllerNodes: false,
      deviceFiles: [],
      manifestFile: undefined,
      rulesFiles: [path.join(fixturesDir, 'rules-switch-meter.json')],
      catalogFile: undefined,
      outputFile: undefined,
      format: 'summary',
    },
    {
      connectAndInitializeImpl: async () => ({ stop: async () => {} }),
      fetchNodesListImpl: async () => [
        { nodeId: 1, name: 'Controller' },
        { nodeId: 5, name: 'Kitchen Plug' },
      ],
      fetchNodeDetailsImpl: async (_client, nodeId) =>
        nodeId === 1
          ? {
              nodeId: 1,
              state: {
                label: '700/800 Series',
                deviceClass: { generic: 'Static Controller', basic: 'Static Controller' },
                manufacturerId: 0,
                productType: 4,
                productId: 4,
              },
              values: [],
            }
          : {
              nodeId: 5,
              state: {
                name: 'Kitchen Plug',
                manufacturerId: '0x0184',
                productType: '0x4447',
                productId: '0x3034',
              },
              values: [],
            },
    },
  );
  assert.equal(artifact.entries.length, 1);
  assert.equal(artifact.entries[0].device.nodeId, 5);
});

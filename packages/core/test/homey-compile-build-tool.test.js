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
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--format', 'yaml']).ok,
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
});

test('buildCompiledProfilesArtifact compiles multiple devices and emits artifact', async () => {
  const { buildCompiledProfilesArtifact } = await loadLib();
  const artifact = buildCompiledProfilesArtifact({
    deviceFiles: [
      path.join(fixturesDir, 'device-switch-meter.json'),
      path.join(fixturesDir, 'device-unmapped.json'),
    ],
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
  runBuildCommand(
    {
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

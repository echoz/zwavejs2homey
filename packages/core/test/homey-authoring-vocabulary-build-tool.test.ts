const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/homey-authoring-vocabulary-build-lib.mjs');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createStubHomeyLib(tmpDir) {
  const root = path.join(tmpDir, 'homey-lib');
  writeJson(path.join(root, 'package.json'), {
    name: 'homey-lib',
    version: '2.45.0',
  });
  writeJson(path.join(root, 'assets/device/classes.json'), ['socket', 'light']);
  writeJson(path.join(root, 'assets/capability/capabilities.json'), ['onoff', 'dim']);
  return root;
}

test('parseCliArgs validates supported formats for homey-authoring-vocabulary-build', async () => {
  const { parseCliArgs } = await loadLib();
  const invalid = parseCliArgs(['--format', 'yaml']);
  assert.equal(invalid.ok, false);
  const parsed = parseCliArgs(['--format', 'json-compact']);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.format, 'json-compact');
});

test('buildHomeyAuthoringVocabularyArtifact merges homey-lib system and compose custom capabilities', async () => {
  const { buildHomeyAuthoringVocabularyArtifact } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-vocab-build-'));
  const homeyLibRoot = createStubHomeyLib(tmpDir);
  const composeDir = path.join(tmpDir, '.homeycompose', 'capabilities');
  writeJson(path.join(composeDir, 'zwjs_custom.json'), { title: { en: 'Custom' } });
  writeJson(path.join(composeDir, 'onoff.json'), { title: { en: 'Override' } });

  const artifact = buildHomeyAuthoringVocabularyArtifact({
    outputFile: path.join(tmpDir, 'out.json'),
    homeyLibRoot,
    composeCapabilitiesDir: composeDir,
    format: 'summary',
  });

  assert.equal(artifact.schemaVersion, 'homey-authoring-vocabulary/v1');
  assert.equal(artifact.homeyClasses.map((entry) => entry.id).join(','), 'light,socket');
  assert.equal(artifact.capabilityIds.map((entry) => entry.id).join(','), 'dim,onoff,zwjs_custom');

  const onoffEntry = artifact.capabilityIds.find((entry) => entry.id === 'onoff');
  assert.equal(Boolean(onoffEntry), true);
  assert.equal(
    onoffEntry.sources.some((source) => source.source === 'homey-lib-system'),
    true,
  );
  assert.equal(
    onoffEntry.sources.some((source) => source.source === 'homey-compose-custom'),
    true,
  );
});

test('runBuildCommand writes artifact file', async () => {
  const { runBuildCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-vocab-run-'));
  const homeyLibRoot = createStubHomeyLib(tmpDir);
  const composeDir = path.join(tmpDir, '.homeycompose', 'capabilities');
  fs.mkdirSync(composeDir, { recursive: true });
  const outputFile = path.join(tmpDir, 'rules', 'homey-authoring-vocabulary.json');
  const logs = [];

  await runBuildCommand(
    {
      outputFile,
      homeyLibRoot,
      composeCapabilitiesDir: composeDir,
      format: 'summary',
    },
    { log: (line) => logs.push(line) },
  );

  assert.equal(fs.existsSync(outputFile), true);
  const parsed = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  assert.equal(parsed.schemaVersion, 'homey-authoring-vocabulary/v1');
  assert.equal(
    logs.some((line) => /Homey authoring vocabulary artifact/i.test(line)),
    true,
  );
  assert.equal(
    logs.some((line) => /Wrote artifact:/i.test(line)),
    true,
  );
});

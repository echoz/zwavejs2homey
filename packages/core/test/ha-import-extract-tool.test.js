const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/ha-import-extract-lib.mjs');
}

const fixturesDir = path.join(__dirname, '../../compiler/test/fixtures');

test('parseCliArgs validates ha-import-extract args', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(['--input-file', 'x.json', '--format', 'yaml']).ok, false);
  assert.equal(parseCliArgs(['--input-file', 'x.json', '--output-extracted']).ok, false);
  assert.equal(
    parseCliArgs(['--input-file', 'x.json', '--source-home-assistant', '/tmp/ha']).ok,
    false,
  );
  const sourceParsed = parseCliArgs(['--source-home-assistant', '/tmp/ha', '--timing']);
  assert.equal(sourceParsed.ok, true);
  assert.equal(sourceParsed.command.sourceHomeAssistant, '/tmp/ha');
  const parsed = parseCliArgs(['--input-file', 'x.json', '--timing']);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.timing, true);
});

test('runHaImportExtract validates and can write extracted artifact', async () => {
  const { runHaImportExtract, formatHaExtractSummary } = await loadLib();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-import-extract-'));
  const outputExtracted = path.join(tempDir, 'ha-extracted.json');

  const result = runHaImportExtract({
    inputFile: path.join(fixturesDir, 'ha-extracted-discovery-input-v1.json'),
    format: 'summary',
    outputExtracted,
    timing: true,
  });

  assert.equal(result.artifact.schemaVersion, 'ha-extracted-discovery/v1');
  assert.equal(result.summary.entries >= 1, true);
  assert.equal(fs.existsSync(outputExtracted), true);
  assert.equal(typeof result.meta.elapsedMs, 'number');

  const written = JSON.parse(fs.readFileSync(outputExtracted, 'utf8'));
  assert.equal(written.schemaVersion, 'ha-extracted-discovery/v1');

  const summary = formatHaExtractSummary(result);
  assert.match(summary, /Extracted artifact: ha-extracted-discovery\/v1/);
  assert.match(summary, /Entries: /);
  assert.match(summary, /Timing: /);
});

test('runHaImportExtract validates source-home-assistant path before parser stub error', async () => {
  const { runHaImportExtract } = await loadLib();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-source-stub-'));
  const discoveryDir = path.join(tempDir, 'homeassistant/components/zwave_js');
  fs.mkdirSync(discoveryDir, { recursive: true });
  fs.writeFileSync(path.join(discoveryDir, 'discovery.py'), '# stub\n', 'utf8');

  assert.throws(
    () =>
      runHaImportExtract({
        sourceHomeAssistant: tempDir,
        inputFile: undefined,
        format: 'summary',
        outputExtracted: undefined,
        timing: false,
      }),
    /not implemented yet/i,
  );
});

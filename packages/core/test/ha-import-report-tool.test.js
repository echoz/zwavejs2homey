const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/ha-import-report-lib.mjs');
}

const fixturesDir = path.join(__dirname, '../../compiler/test/fixtures');

test('parseCliArgs validates required args and format', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(['--input-file', 'x.json', '--format', 'yaml']).ok, false);
  assert.equal(parseCliArgs(['--input-file', 'x.json', '--output-generated']).ok, false);
  const parsed = parseCliArgs(['--input-file', 'x.json', '--format', 'json', '--timing']);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.inputFile, 'x.json');
  assert.equal(parsed.command.format, 'json');
  assert.equal(parsed.command.timing, true);
});

test('runHaImportReport translates extracted fixture and can write generated artifact', async () => {
  const { runHaImportReport, formatHaImportSummary } = await loadLib();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-import-report-'));
  const outputGenerated = path.join(tempDir, 'ha-derived-generated.json');

  const result = runHaImportReport({
    inputFile: path.join(fixturesDir, 'ha-extracted-discovery-input-v1.json'),
    format: 'summary',
    outputGenerated,
    timing: true,
  });

  assert.equal(result.artifact.schemaVersion, 'ha-derived-rules/v1');
  assert.equal(Array.isArray(result.artifact.rules), true);
  assert.equal(fs.existsSync(outputGenerated), true);

  const written = JSON.parse(fs.readFileSync(outputGenerated, 'utf8'));
  assert.equal(written.schemaVersion, 'ha-derived-rules/v1');
  assert.equal(typeof result.meta.elapsedMs, 'number');

  const summary = formatHaImportSummary(result);
  assert.match(summary, /Generated artifact: ha-derived-rules\/v1/);
  assert.match(summary, /Rules translated:/);
  assert.match(summary, /Unsupported:/);
  assert.match(summary, /Timing: /);
});

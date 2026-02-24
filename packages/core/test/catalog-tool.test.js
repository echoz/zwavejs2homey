const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/catalog-tool-lib.mjs');
}

const fixturesDir = path.join(__dirname, '../../compiler/test/fixtures');

test('catalog parseCliArgs validates subcommands and formats', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(['unknown']).ok, false);
  assert.equal(parseCliArgs(['summary']).ok, false);
  assert.equal(
    parseCliArgs(['summary', '--input-file', 'x.json', '--format', 'markdown']).ok,
    true,
  );
  assert.equal(parseCliArgs(['validate', '--input-file', 'x.json', '--format', 'ndjson']).ok, true);
  assert.equal(parseCliArgs(['fetch', '--source', 'zwave-alliance']).ok, true);
});

test('runCatalogCommand loads catalog artifact and outputs summary/markdown/json/ndjson', async () => {
  const { runCatalogCommand, formatCatalogOutput } = await loadLib();
  const result = runCatalogCommand({
    subcommand: 'summary',
    inputFile: path.join(fixturesDir, 'catalog-devices-v1.json'),
    format: 'summary',
  });
  assert.equal(result.artifact.schemaVersion, 'catalog-devices/v1');
  assert.equal(result.summary.deviceCount, 2);
  assert.match(formatCatalogOutput(result, 'summary'), /Catalog artifact:/);
  assert.match(formatCatalogOutput(result, 'markdown'), /## Catalog Summary/);
  assert.doesNotThrow(() => JSON.parse(formatCatalogOutput(result, 'json')));
  assert.doesNotThrow(() => JSON.parse(formatCatalogOutput(result, 'json-compact')));
  assert.match(formatCatalogOutput(result, 'ndjson'), /\"type\":\"device\"/);
});

test('catalog fetch subcommand is scaffolded but not implemented', async () => {
  const { runCatalogCommand } = await loadLib();
  assert.throws(
    () => runCatalogCommand({ subcommand: 'fetch', source: 'zwave-alliance', format: 'summary' }),
    /not implemented/i,
  );
});

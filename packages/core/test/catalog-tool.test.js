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
  assert.equal(
    parseCliArgs(['normalize', '--input-file', 'x.json', '--format', 'json-compact']).ok,
    true,
  );
  assert.equal(
    parseCliArgs([
      'merge',
      '--input-file',
      'a.json',
      '--input-file',
      'b.json',
      '--format',
      'markdown',
    ]).ok,
    true,
  );
  assert.equal(
    parseCliArgs([
      'fetch',
      '--source',
      'zwjs-inspect-node-detail',
      '--input-file',
      'node-detail.json',
    ]).ok,
    true,
  );
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

test('catalog fetch converts zwjs-inspect node detail into a catalog artifact', async () => {
  const { runCatalogCommand, formatCatalogOutput } = await loadLib();
  const result = runCatalogCommand({
    subcommand: 'fetch',
    source: 'zwjs-inspect-node-detail',
    inputFile: path.join(fixturesDir, 'zwjs-inspect-node-detail-sample.json'),
    format: 'summary',
  });
  assert.equal(result.artifact.devices.length, 1);
  assert.equal(result.artifact.devices[0].catalogId, 'zwjs:0184-4447-3034');
  assert.match(formatCatalogOutput(result, 'markdown'), /Catalog Summary/);
  assert.match(formatCatalogOutput(result, 'ndjson'), /zwjs-inspect-node-detail/);
});

test('catalog normalize dedupes catalog artifact and reports merge summary', async () => {
  const { runCatalogCommand, formatCatalogOutput } = await loadLib();
  const result = runCatalogCommand({
    subcommand: 'normalize',
    inputFile: path.join(fixturesDir, 'catalog-devices-with-duplicates.json'),
    format: 'summary',
  });
  assert.equal(result.summary.deviceCount, 2);
  assert.equal(result.summary.normalize.mergedDuplicates, 1);
  assert.match(formatCatalogOutput(result, 'summary'), /Normalize: input=3 output=2 merged=1/);
  assert.doesNotThrow(() => JSON.parse(formatCatalogOutput(result, 'json')));
});

test('catalog merge combines multiple artifacts and reports merge stats', async () => {
  const { runCatalogCommand, formatCatalogOutput } = await loadLib();
  const result = runCatalogCommand({
    subcommand: 'merge',
    inputFiles: [
      path.join(fixturesDir, 'catalog-devices-with-duplicates.json'),
      path.join(fixturesDir, 'catalog-devices-extra.json'),
    ],
    format: 'summary',
  });
  assert.equal(result.summary.deviceCount, 3);
  assert.equal(result.summary.merge.inputArtifacts, 2);
  assert.equal(result.summary.merge.mergedDuplicates, 2);
  assert.match(
    formatCatalogOutput(result, 'summary'),
    /Merge: artifacts=2 input=5 output=3 merged=2/,
  );
  assert.match(formatCatalogOutput(result, 'markdown'), /Merge: artifacts=2/);
});

test('catalog fetch rejects unsupported source adapters', async () => {
  const { runCatalogCommand } = await loadLib();
  assert.throws(
    () =>
      runCatalogCommand({
        subcommand: 'fetch',
        source: 'zwave-alliance',
        inputFile: 'ignored.json',
        format: 'summary',
      }),
    /Unsupported catalog fetch source/i,
  );
});

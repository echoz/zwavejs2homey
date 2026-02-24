const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('mergeCatalogDevicesArtifactsV1 merges multiple artifacts and dedupes by catalogId', () => {
  const first = compiler.loadCatalogDevicesArtifact(
    path.join(fixturesDir, 'catalog-devices-with-duplicates.json'),
  );
  const second = compiler.loadCatalogDevicesArtifact(
    path.join(fixturesDir, 'catalog-devices-extra.json'),
  );

  const merged = compiler.mergeCatalogDevicesArtifactsV1([first, second], {
    generatedAt: '2026-02-24T12:00:00.000Z',
    sourceRef: 'test:merged',
  });

  assert.equal(merged.report.inputArtifacts, 2);
  assert.equal(merged.report.inputDevices, 5);
  assert.equal(merged.report.outputDevices, 3);
  assert.equal(merged.report.mergedDuplicates, 2);
  assert.equal(merged.artifact.source.sourceRef, 'test:merged');
  const switch7 = merged.artifact.devices.find((d) => d.catalogId === 'zwjs:0184-4447-3034');
  assert.ok(switch7);
  assert.equal(switch7.sources.length, 3);
});

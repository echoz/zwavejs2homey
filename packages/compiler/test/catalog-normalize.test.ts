const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('normalizeCatalogDevicesArtifactV1 dedupes by catalogId and merges sources', () => {
  const artifact = compiler.loadCatalogDevicesArtifact(
    path.join(fixturesDir, 'catalog-devices-with-duplicates.json'),
  );

  const normalized = compiler.normalizeCatalogDevicesArtifactV1(artifact, {
    generatedAt: '2026-02-24T12:00:00.000Z',
    sourceRef: 'test:normalized',
  });

  assert.equal(normalized.report.inputDevices, 3);
  assert.equal(normalized.report.outputDevices, 2);
  assert.equal(normalized.report.mergedDuplicates, 1);
  assert.equal(normalized.artifact.source.sourceRef, 'test:normalized');
  assert.equal(normalized.artifact.devices[0].catalogId, 'zwjs-node:9');
  assert.equal(normalized.artifact.devices[1].catalogId, 'zwjs:0184-4447-3034');
  assert.equal(normalized.artifact.devices[1].label, 'Aeotec Smart Switch 7');
  assert.equal(normalized.artifact.devices[1].sources.length, 2);
});

test('normalizeCatalogDevicesArtifactV1 resolves conflicts in warn mode and reports them', () => {
  const artifact = compiler.loadCatalogDevicesArtifact(
    path.join(fixturesDir, 'catalog-devices-conflict.json'),
  );

  const normalized = compiler.normalizeCatalogDevicesArtifactV1(artifact, {
    generatedAt: '2026-02-24T12:00:00.000Z',
    sourceRef: 'test:conflict-normalized',
    conflictMode: 'warn',
  });

  assert.equal(normalized.report.conflictsResolved, 2);
  assert.equal(normalized.report.conflictsByField.label, 1);
  assert.equal(normalized.report.conflictsByField.productId, 1);
  assert.equal(normalized.artifact.devices[0].productId, 12341);
  assert.equal(normalized.artifact.devices[0].label, 'Official Better Label');
});

test('normalizeCatalogDevicesArtifactV1 throws in error mode on id conflicts', () => {
  const artifact = compiler.loadCatalogDevicesArtifact(
    path.join(fixturesDir, 'catalog-devices-conflict.json'),
  );
  assert.throws(
    () => compiler.normalizeCatalogDevicesArtifactV1(artifact, { conflictMode: 'error' }),
    (error) => error && /CatalogNormalizeConflictError/.test(error.name),
  );
});

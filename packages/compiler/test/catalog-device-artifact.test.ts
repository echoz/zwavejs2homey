const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('loadCatalogDevicesArtifact loads valid catalog-devices/v1 fixture', () => {
  const artifact = compiler.loadCatalogDevicesArtifact(
    path.join(fixturesDir, 'catalog-devices-v1.json'),
  );
  assert.equal(artifact.schemaVersion, 'catalog-devices/v1');
  assert.equal(artifact.devices.length, 2);
  assert.equal(artifact.devices[0].catalogId, 'zwavealliance:0001-0002-0003');
});

test('loadCatalogDevicesArtifact rejects invalid catalog-devices/v1 fixture', () => {
  assert.throws(
    () =>
      compiler.loadCatalogDevicesArtifact(path.join(fixturesDir, 'catalog-devices-invalid.json')),
    (error) =>
      error &&
      error.name === 'CatalogDeviceArtifactError' &&
      /catalogId|sources/i.test(error.message),
  );
});

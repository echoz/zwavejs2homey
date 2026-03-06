const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('buildCatalogIndexV1 builds catalogId and product-triple lookups', () => {
  const artifact = compiler.loadCatalogDevicesArtifact(
    path.join(fixturesDir, 'catalog-devices-extra.json'),
  );
  const index = compiler.buildCatalogIndexV1(artifact);

  assert.equal(index.report.deviceCount, 2);
  assert.equal(index.report.productTripleIndexed, 2);
  assert.equal(index.report.productTripleConflicts, 0);

  const byId = compiler.findCatalogDeviceByCatalogId(index, 'zwjs:0001-0002-0003');
  assert.ok(byId);
  assert.equal(byId.label, 'Example Device');

  const byTriple = compiler.findCatalogDeviceByProductTriple(index, {
    manufacturerId: 388,
    productType: 17479,
    productId: 12340,
  });
  assert.ok(byTriple);
  assert.equal(byTriple.catalogId, 'zwjs:0184-4447-3034');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('loadCatalogArtifactFromZwjsInspectNodeDetailFile converts zwjs-inspect node detail to catalog artifact', () => {
  const artifact = compiler.loadCatalogArtifactFromZwjsInspectNodeDetailFile(
    path.join(fixturesDir, 'zwjs-inspect-node-detail-sample.json'),
  );

  assert.equal(artifact.schemaVersion, 'catalog-devices/v1');
  assert.equal(artifact.devices.length, 1);
  assert.equal(artifact.devices[0].catalogId, 'zwjs:0184-4447-3034');
  assert.equal(artifact.devices[0].manufacturerId, 0x0184);
  assert.equal(artifact.devices[0].productType, 0x4447);
  assert.equal(artifact.devices[0].productId, 0x3034);
  assert.equal(artifact.devices[0].label, 'Smart Switch 7');
  assert.equal(artifact.devices[0].sources[0].source, 'zwjs-inspect-node-detail');
  assert.equal(artifact.devices[0].sources[0].sourceId, '5');
});

test('catalogDeviceRecordFromZwjsInspectNodeDetail falls back to node-based catalogId when ids are missing', () => {
  const record = compiler.catalogDeviceRecordFromZwjsInspectNodeDetail({
    nodeId: 9,
    state: { name: 'Unknown Sensor' },
  });

  assert.equal(record.catalogId, 'zwjs-node:9');
  assert.equal(record.sources[0].confidence, 'low');
});

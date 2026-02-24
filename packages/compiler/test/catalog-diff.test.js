const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('diffCatalogDevicesArtifactsV1 reports added/removed/changed devices', () => {
  const fromArtifact = compiler.loadCatalogDevicesArtifact(
    path.join(fixturesDir, 'catalog-devices-with-duplicates.json'),
  );
  const toArtifact = compiler.loadCatalogDevicesArtifact(
    path.join(fixturesDir, 'catalog-devices-diff-target.json'),
  );

  const diff = compiler.diffCatalogDevicesArtifactsV1(fromArtifact, toArtifact);
  assert.equal(diff.report.fromDevices, 3);
  assert.equal(diff.report.toDevices, 2);
  assert.equal(diff.report.added, 1);
  assert.equal(diff.report.removed, 1);
  assert.equal(diff.report.changed, 1);

  const changed = diff.diffs.find((entry) => entry.catalogId === 'zwjs:0184-4447-3034');
  assert.ok(changed);
  assert.equal(changed.change, 'changed');
  assert.equal(changed.labelChanged, true);
  assert.deepEqual(changed.sourceNamesAdded, ['official-catalog']);
});

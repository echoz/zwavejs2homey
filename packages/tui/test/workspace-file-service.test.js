const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WorkspaceFileServiceImpl } = require('../dist/service/workspace-file-service');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('WorkspaceFileServiceImpl writes product file and updates manifest with dedupe', () => {
  const root = makeTempDir('zwjs2homey-tui-');
  const productDir = path.join(root, 'rules/project/product');
  fs.mkdirSync(productDir, { recursive: true });
  const manifestFile = path.join(root, 'rules/manifest.json');
  fs.writeFileSync(
    manifestFile,
    `${JSON.stringify([{ filePath: 'project/generic/base-generic.json', layer: 'project-generic' }], null, 2)}\n`,
    'utf8',
  );

  const fileService = new WorkspaceFileServiceImpl(productDir);
  fileService.writeJsonFile('product-29-66-2.json', { schemaVersion: 'product-rules/v1' });
  const result1 = fileService.addProductRuleToManifest(manifestFile, 'product-29-66-2.json');
  assert.equal(result1.updated, true);
  assert.equal(result1.entryFilePath, 'project/product/product-29-66-2.json');

  const result2 = fileService.addProductRuleToManifest(manifestFile, 'product-29-66-2.json');
  assert.equal(result2.updated, false);

  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(
    manifest.filter((entry) => entry.filePath === 'project/product/product-29-66-2.json').length,
    1,
  );
});

test('WorkspaceFileServiceImpl rejects writes outside allowed product root', () => {
  const root = makeTempDir('zwjs2homey-tui-');
  const productDir = path.join(root, 'rules/project/product');
  fs.mkdirSync(productDir, { recursive: true });
  const fileService = new WorkspaceFileServiceImpl(productDir);
  assert.throws(() => fileService.resolveAllowedProductRulePath('../outside.json'), /under/i);
});

test('WorkspaceFileServiceImpl lists manifest rules and reads rule detail', () => {
  const root = makeTempDir('zwjs2homey-tui-');
  const productDir = path.join(root, 'rules/project/product');
  fs.mkdirSync(productDir, { recursive: true });
  const ruleFile = path.join(productDir, 'product-29-66-2.json');
  fs.writeFileSync(
    ruleFile,
    `${JSON.stringify(
      {
        schemaVersion: 'product-rules/v1',
        name: 'Test Device',
        target: { manufacturerId: 29, productType: 66, productId: 2 },
        rules: [{ ruleId: 'identity', actions: [] }],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  const manifestFile = path.join(root, 'rules/manifest.json');
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(
    manifestFile,
    `${JSON.stringify(
      [{ filePath: 'project/product/product-29-66-2.json', layer: 'project-product' }],
      null,
      2,
    )}\n`,
    'utf8',
  );

  const fileService = new WorkspaceFileServiceImpl(productDir);
  const rules = fileService.listManifestRules(manifestFile);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].signature, '29:66:2');
  assert.equal(rules[0].name, 'Test Device');
  const detail = fileService.readManifestRule(manifestFile, 1);
  assert.equal(detail.signature, '29:66:2');
  assert.equal(detail.content.target.manufacturerId, 29);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { RulesPresenter } = require('../dist/presenter/rules-presenter');

function createCuration() {
  return {
    async inspectSignature(_session, signature) {
      return { signature, totalNodes: 1, outcomeCounts: { curated: 1 }, nodes: [] };
    },
    async validateSignature(_session, signature) {
      return { signature, totalNodes: 1, reviewNodes: 0, outcomes: { curated: 1 } };
    },
    async simulateSignature(_session, signature) {
      return {
        signature,
        dryRun: true,
        inspectSkipped: false,
        inspectFormat: 'list',
        inspectCommandLine: 'inspect',
        validateCommandLine: 'validate',
        gatePassed: null,
        totalNodes: 0,
        reviewNodes: 0,
        outcomes: {},
        reportFile: null,
        summaryJsonFile: null,
      };
    },
    scaffoldFromSignature(signature) {
      return {
        signature,
        fileHint: 'product-29-66-2.json',
        generatedAt: new Date().toISOString(),
        bundle: { schemaVersion: 'product-rules/v1', rules: [] },
      };
    },
    deriveSignatureFromNodeDetail() {
      return '29:66:2';
    },
  };
}

test('RulesPresenter loads rules and derives signature from selected rule', () => {
  const fileService = {
    listManifestRules() {
      return [
        {
          index: 1,
          filePath: 'project/product/product-29-66-2.json',
          layer: 'project-product',
          name: 'Device',
          signature: '29:66:2',
          ruleCount: 1,
          exists: true,
        },
      ];
    },
    readManifestRule() {
      return {
        index: 1,
        filePath: 'project/product/product-29-66-2.json',
        layer: 'project-product',
        name: 'Device',
        signature: '29:66:2',
        ruleCount: 1,
        exists: true,
        manifestFile: '/tmp/manifest.json',
        absoluteFilePath: '/tmp/product-29-66-2.json',
        content: { schemaVersion: 'product-rules/v1', rules: [] },
      };
    },
    writeJsonFile() {},
    resolveAllowedProductRulePath(filePath) {
      return filePath;
    },
    addProductRuleToManifest() {
      return { manifestFile: '/tmp/manifest.json', entryFilePath: 'x.json', updated: true };
    },
  };
  const presenter = new RulesPresenter(createCuration(), fileService);
  presenter.initialize({
    mode: 'rules',
    manifestFile: 'rules/manifest.json',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
    url: 'ws://127.0.0.1:3000',
  });

  const rules = presenter.getRules();
  assert.equal(rules.length, 1);
  const detail = presenter.showRuleDetail(1);
  assert.equal(detail.signature, '29:66:2');
  const signature = presenter.selectSignatureFromRule();
  assert.equal(signature, '29:66:2');
});

test('RulesPresenter rejects inspect/validate/simulate without url', async () => {
  const fileService = {
    listManifestRules() {
      return [];
    },
    readManifestRule() {
      throw new Error('not found');
    },
    writeJsonFile() {},
    resolveAllowedProductRulePath(filePath) {
      return filePath;
    },
    addProductRuleToManifest() {
      return { manifestFile: '/tmp/manifest.json', entryFilePath: 'x.json', updated: true };
    },
  };

  const presenter = new RulesPresenter(createCuration(), fileService);
  presenter.initialize({
    mode: 'rules',
    manifestFile: 'rules/manifest.json',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
  });
  presenter.selectSignature('29:66:2');

  await assert.rejects(() => presenter.inspectSelectedSignature(), /needs --url/i);
  await assert.rejects(() => presenter.validateSelectedSignature(), /needs --url/i);
  await assert.rejects(() => presenter.simulateSelectedSignature(), /needs --url/i);
});

test('RulesPresenter draft editor lifecycle mutates and commits scaffold draft', () => {
  const fileService = {
    listManifestRules() {
      return [];
    },
    readManifestRule() {
      throw new Error('not found');
    },
    writeJsonFile() {},
    resolveAllowedProductRulePath(filePath) {
      return filePath;
    },
    addProductRuleToManifest() {
      return { manifestFile: '/tmp/manifest.json', entryFilePath: 'x.json', updated: true };
    },
  };
  const presenter = new RulesPresenter(createCuration(), fileService);
  presenter.initialize({
    mode: 'rules',
    manifestFile: 'rules/manifest.json',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
    url: 'ws://127.0.0.1:3000',
  });
  presenter.selectSignature('29:66:2');
  presenter.createScaffoldFromSignature({});

  const editor = presenter.startDraftEdit();
  assert.equal(editor.dirty, false);
  assert.equal(editor.selectedFieldPath, 'bundle.metadata.productName');
  const mutated = presenter.setDraftEditorField(
    'fileHint',
    'rules/project/product/_scratch/rule.json',
  );
  assert.equal(mutated.dirty, true);
  assert.equal(mutated.errors.length, 0);

  const committed = presenter.commitDraftEditorState();
  assert.equal(committed.fileHint, 'rules/project/product/_scratch/rule.json');
  const written = presenter.writeScaffoldDraft(undefined, { confirm: true });
  assert.equal(written, 'rules/project/product/_scratch/rule.json');
});

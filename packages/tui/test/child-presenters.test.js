const test = require('node:test');
const assert = require('node:assert/strict');

const { ExplorerSessionPresenter } = require('../dist/presenter/explorer-session-presenter');
const { CurationWorkflowPresenter } = require('../dist/presenter/curation-workflow-presenter');

test('ExplorerSessionPresenter delegates explorer operations to service', async () => {
  const service = {
    connectCalls: 0,
    disconnectCalls: 0,
    listCalls: 0,
    detailCalls: 0,
    async connect() {
      this.connectCalls += 1;
    },
    async disconnect() {
      this.disconnectCalls += 1;
    },
    async listNodes() {
      this.listCalls += 1;
      return [{ nodeId: 1 }];
    },
    async getNodeDetail(nodeId) {
      this.detailCalls += 1;
      return { nodeId, state: {}, neighbors: [], notificationEvents: [], values: [] };
    },
  };

  const presenter = new ExplorerSessionPresenter(service);
  await presenter.connect({
    url: 'ws://127.0.0.1:3000',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 10,
  });
  const nodes = await presenter.listNodes();
  assert.equal(nodes.length, 1);
  const detail = await presenter.getNodeDetail(7);
  assert.equal(detail.nodeId, 7);
  await presenter.disconnect();
  assert.equal(service.connectCalls, 1);
  assert.equal(service.disconnectCalls, 1);
  assert.equal(service.listCalls, 1);
  assert.equal(service.detailCalls, 1);
});

test('CurationWorkflowPresenter delegates curation calls and enforces confirmations', async () => {
  const curationService = {
    deriveSignatureFromNodeDetail() {
      return '29:66:2';
    },
    async inspectSignature(_session, signature) {
      return { signature, totalNodes: 1, outcomeCounts: { curated: 1 }, nodes: [] };
    },
    async validateSignature(_session, signature) {
      return { signature, totalNodes: 1, reviewNodes: 0, outcomes: { curated: 1 } };
    },
    loadBacklogSummary(filePath) {
      return { filePath, totalSignatures: 1, totalNodes: 1, reviewNodes: 1, entries: [] };
    },
    scaffoldFromBacklog(_filePath, signature) {
      return {
        signature,
        fileHint: 'product.json',
        generatedAt: new Date().toISOString(),
        bundle: { schemaVersion: 'product-rules/v1' },
      };
    },
  };
  const writes = [];
  const fileService = {
    writeJsonFile(filePath, payload) {
      writes.push({ filePath, payload });
    },
    resolveAllowedProductRulePath(filePath) {
      return `/abs/${filePath}`;
    },
    addProductRuleToManifest(manifestFile, filePath) {
      return { manifestFile, entryFilePath: filePath, updated: true };
    },
  };

  const presenter = new CurationWorkflowPresenter(curationService, fileService);
  assert.equal(
    presenter.deriveSignatureFromNodeDetail({
      nodeId: 1,
      state: {},
      neighbors: [],
      notificationEvents: [],
    }),
    '29:66:2',
  );
  const inspect = await presenter.inspectSignature(
    { url: 'ws://127.0.0.1:3000', schemaVersion: 0, includeValues: 'summary', maxValues: 10 },
    '29:66:2',
  );
  assert.equal(inspect.totalNodes, 1);
  assert.throws(
    () =>
      presenter.writeScaffoldDraft(
        'x.json',
        {
          signature: '29:66:2',
          fileHint: 'x.json',
          generatedAt: new Date().toISOString(),
          bundle: {},
        },
        { confirm: false },
      ),
    /not confirmed/i,
  );
  const writePath = presenter.writeScaffoldDraft(
    'x.json',
    {
      signature: '29:66:2',
      fileHint: 'x.json',
      generatedAt: new Date().toISOString(),
      bundle: {},
    },
    { confirm: true },
  );
  assert.equal(writePath, '/abs/x.json');
  assert.equal(writes.length, 1);
  assert.throws(
    () => presenter.addProductRuleToManifest('rules/manifest.json', 'x.json', { confirm: false }),
    /not confirmed/i,
  );
  const manifest = presenter.addProductRuleToManifest('rules/manifest.json', 'x.json', {
    confirm: true,
  });
  assert.equal(manifest.updated, true);
});

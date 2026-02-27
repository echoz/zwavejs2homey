const test = require('node:test');
const assert = require('node:assert/strict');

const { TuiCoordinatorImpl } = require('../dist/coordinator/tui-coordinator');

test('TuiCoordinatorImpl delegates to layered services and enforces write confirmation', async () => {
  const explorerService = {
    async connect() {},
    async disconnect() {},
    async listNodes() {
      return [{ nodeId: 1 }];
    },
    async getNodeDetail(nodeId) {
      return { nodeId, state: {}, neighbors: [], notificationEvents: [], values: [] };
    },
  };
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
      return {
        filePath,
        totalSignatures: 1,
        totalNodes: 1,
        reviewNodes: 1,
        entries: [],
      };
    },
    scaffoldFromBacklog(_backlogFile, signature) {
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
    resolveAllowedProductRulePath(filePath) {
      return `/abs/${filePath}`;
    },
    writeJsonFile(filePath, payload) {
      writes.push({ filePath, payload });
    },
  };

  const coordinator = new TuiCoordinatorImpl({ explorerService, curationService, fileService });
  await coordinator.connect({
    url: 'ws://127.0.0.1:3000',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 10,
  });
  const nodes = await coordinator.listNodes();
  assert.equal(nodes.length, 1);
  const detail = await coordinator.getNodeDetail(3);
  assert.equal(detail.nodeId, 3);
  assert.equal(coordinator.deriveSignatureFromNodeDetail(detail), '29:66:2');
  const inspect = await coordinator.inspectSignature(
    { url: 'ws://127.0.0.1:3000', schemaVersion: 0, includeValues: 'summary', maxValues: 10 },
    '29:66:2',
  );
  assert.equal(inspect.totalNodes, 1);

  const draft = coordinator.scaffoldFromBacklog('/tmp/backlog.json', '29:66:2');
  assert.equal(draft.signature, '29:66:2');
  assert.throws(
    () => coordinator.writeScaffoldDraft('x.json', draft, { confirm: false }),
    /Write not confirmed/i,
  );
  const written = coordinator.writeScaffoldDraft('x.json', draft, { confirm: true });
  assert.equal(written, '/abs/x.json');
  assert.equal(writes.length, 1);
  await coordinator.disconnect();
});

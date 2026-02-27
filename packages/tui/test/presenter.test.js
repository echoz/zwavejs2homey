const test = require('node:test');
const assert = require('node:assert/strict');

const { ExplorerPresenter } = require('../dist/presenter/explorer-presenter');

function createCoordinator(overrides = {}) {
  return {
    async connect() {},
    async disconnect() {},
    async listNodes() {
      return [];
    },
    async getNodeDetail(nodeId) {
      return {
        nodeId,
        state: { name: 'Node' },
        neighbors: [],
        notificationEvents: [],
        values: [],
      };
    },
    deriveSignatureFromNodeDetail() {
      return '29:66:2';
    },
    async inspectSignature(_session, signature) {
      return {
        signature,
        totalNodes: 1,
        outcomeCounts: { curated: 1 },
        nodes: [],
      };
    },
    async validateSignature(_session, signature) {
      return {
        signature,
        totalNodes: 1,
        reviewNodes: 0,
        outcomes: { curated: 1 },
      };
    },
    loadBacklogSummary(filePath) {
      return {
        filePath,
        totalSignatures: 1,
        totalNodes: 1,
        reviewNodes: 1,
        entries: [
          {
            rank: 1,
            signature: '29:66:2',
            nodeCount: 1,
            reviewNodeCount: 1,
            genericNodeCount: 0,
            emptyNodeCount: 0,
          },
        ],
      };
    },
    scaffoldFromBacklog(_backlogFile, signature) {
      return {
        signature,
        fileHint: 'product-29-66-2.json',
        generatedAt: new Date().toISOString(),
        bundle: { schemaVersion: 'product-rules/v1', rules: [] },
      };
    },
    writeScaffoldDraft(filePath) {
      return filePath;
    },
    addProductRuleToManifest(_manifestFile, filePath) {
      return { manifestFile: '/tmp/manifest.json', entryFilePath: filePath, updated: true };
    },
    ...overrides,
  };
}

test('ExplorerPresenter connect success loads nodes and sets ready state', async () => {
  const coordinator = createCoordinator({
    connectCalls: 0,
    listNodesCalls: 0,
    async connect() {
      this.connectCalls += 1;
    },
    async listNodes() {
      this.listNodesCalls += 1;
      return [
        {
          nodeId: 3,
          name: 'Kitchen',
          ready: true,
          status: 'alive',
          manufacturer: null,
          product: null,
        },
      ];
    },
  });

  const presenter = new ExplorerPresenter(coordinator);
  const nodes = await presenter.connect({
    url: 'ws://127.0.0.1:3000',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
  });

  assert.equal(coordinator.connectCalls, 1);
  assert.equal(coordinator.listNodesCalls, 1);
  assert.equal(nodes.length, 1);
  const state = presenter.getState();
  assert.equal(state.connectionState, 'ready');
  assert.equal(state.explorer.items.length, 1);
  assert.equal(state.lastError, undefined);
});

test('ExplorerPresenter connect failure sets error state', async () => {
  const coordinator = createCoordinator({
    async connect() {
      throw new Error('boom');
    },
  });

  const presenter = new ExplorerPresenter(coordinator);
  await assert.rejects(
    () =>
      presenter.connect({
        url: 'ws://127.0.0.1:3000',
        schemaVersion: 0,
        includeValues: 'summary',
        maxValues: 200,
      }),
    /boom/,
  );

  const state = presenter.getState();
  assert.equal(state.connectionState, 'error');
  assert.match(state.lastError, /boom/);
  assert.equal(
    state.runLog.some((entry) => entry.level === 'error'),
    true,
  );
});

test('ExplorerPresenter can derive signature, inspect and validate selected signature', async () => {
  const presenter = new ExplorerPresenter(createCoordinator());
  await presenter.connect({
    url: 'ws://127.0.0.1:3000',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
  });
  await presenter.showNodeDetail(12);

  const signature = presenter.selectSignatureFromNode(12);
  assert.equal(signature, '29:66:2');
  const inspect = await presenter.inspectSelectedSignature();
  assert.equal(inspect.signature, '29:66:2');
  const validate = await presenter.validateSelectedSignature();
  assert.equal(validate.signature, '29:66:2');
});

test('ExplorerPresenter backlog + scaffold draft + write flow', async () => {
  const writes = [];
  const manifests = [];
  const coordinator = createCoordinator({
    writeScaffoldDraft(filePath, _draft, options) {
      assert.equal(options.confirm, true);
      writes.push(filePath);
      return `/abs/${filePath}`;
    },
    addProductRuleToManifest(manifestFile, filePath, options) {
      assert.equal(options.confirm, true);
      manifests.push({ manifestFile, filePath });
      return { manifestFile, entryFilePath: filePath, updated: true };
    },
  });
  const presenter = new ExplorerPresenter(coordinator);

  const backlog = presenter.loadBacklog('/tmp/backlog.json');
  assert.equal(backlog.entries.length, 1);
  presenter.selectSignature(backlog.entries[0].signature);
  const draft = presenter.createScaffoldFromBacklog({});
  assert.equal(draft.signature, '29:66:2');
  const written = presenter.writeScaffoldDraft(undefined, { confirm: true });
  assert.equal(written, '/abs/product-29-66-2.json');
  const manifestResult = presenter.addDraftToManifest({
    manifestFile: 'rules/manifest.json',
    confirm: true,
  });
  assert.equal(manifestResult.updated, true);
  const status = presenter.getStatusSnapshot();
  assert.equal(status.selectedSignature, '29:66:2');
  assert.equal(status.scaffoldFileHint, 'product-29-66-2.json');
  assert.equal(writes.length, 1);
  assert.equal(manifests.length, 1);
});

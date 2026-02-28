const test = require('node:test');
const assert = require('node:assert/strict');

const { ExplorerPresenter } = require('../dist/presenter/explorer-presenter');

function createChildren(overrides = {}) {
  const children = {
    explorer: {
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
    },
    curation: {
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
      async simulateSignature(_session, signature) {
        return {
          signature,
          dryRun: false,
          inspectSkipped: false,
          inspectFormat: 'list',
          inspectCommandLine: 'inspect',
          validateCommandLine: 'validate',
          gatePassed: true,
          totalNodes: 1,
          reviewNodes: 0,
          outcomes: { curated: 1 },
          reportFile: '/tmp/report.json',
          summaryJsonFile: '/tmp/summary.json',
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
      writeScaffoldDraft(filePath) {
        return filePath;
      },
      addProductRuleToManifest(_manifestFile, filePath) {
        return { manifestFile: '/tmp/manifest.json', entryFilePath: filePath, updated: true };
      },
    },
  };
  return {
    ...children,
    ...overrides,
  };
}

test('ExplorerPresenter connect success loads nodes and sets ready state', async () => {
  const children = createChildren({
    connectCalls: 0,
    listNodesCalls: 0,
    explorer: {
      async connect() {
        children.connectCalls += 1;
      },
      async disconnect() {},
      async listNodes() {
        children.listNodesCalls += 1;
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
      async getNodeDetail(nodeId) {
        return {
          nodeId,
          state: { name: 'Node' },
          neighbors: [],
          notificationEvents: [],
          values: [],
        };
      },
    },
  });

  const presenter = new ExplorerPresenter(children);
  const nodes = await presenter.connect({
    mode: 'nodes',
    manifestFile: 'rules/manifest.json',
    url: 'ws://127.0.0.1:3000',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
  });

  assert.equal(children.connectCalls, 1);
  assert.equal(children.listNodesCalls, 1);
  assert.equal(nodes.length, 1);
  const state = presenter.getState();
  assert.equal(state.connectionState, 'ready');
  assert.equal(state.explorer.items.length, 1);
  assert.equal(state.lastError, undefined);
});

test('ExplorerPresenter connect failure sets error state', async () => {
  const children = createChildren({
    explorer: {
      async connect() {
        throw new Error('boom');
      },
      async disconnect() {},
      async listNodes() {
        return [];
      },
      async getNodeDetail() {
        return null;
      },
    },
  });

  const presenter = new ExplorerPresenter(children);
  await assert.rejects(
    () =>
      presenter.connect({
        mode: 'nodes',
        manifestFile: 'rules/manifest.json',
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
  const presenter = new ExplorerPresenter(createChildren());
  await presenter.connect({
    mode: 'nodes',
    manifestFile: 'rules/manifest.json',
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
  const simulate = await presenter.simulateSelectedSignature();
  assert.equal(simulate.signature, '29:66:2');
});

test('ExplorerPresenter scaffold infers homey class from inspect summary unless overridden', async () => {
  let lastOptions;
  const base = createChildren();
  const children = {
    ...base,
    curation: {
      ...base.curation,
      async inspectSignature(_session, signature) {
        return {
          signature,
          totalNodes: 3,
          outcomeCounts: { curated: 1, generic: 2 },
          nodes: [
            {
              nodeId: 1,
              name: 'A',
              homeyClass: 'light',
              outcome: 'generic',
              confidence: 'generic',
              reviewReason: null,
            },
            {
              nodeId: 2,
              name: 'B',
              homeyClass: 'light',
              outcome: 'generic',
              confidence: 'generic',
              reviewReason: null,
            },
            {
              nodeId: 3,
              name: 'C',
              homeyClass: 'other',
              outcome: 'curated',
              confidence: 'curated',
              reviewReason: null,
            },
          ],
        };
      },
      scaffoldFromSignature(signature, options) {
        lastOptions = options;
        return {
          signature,
          fileHint: 'product-29-66-2.json',
          generatedAt: new Date().toISOString(),
          bundle: { schemaVersion: 'product-rules/v1', rules: [] },
        };
      },
    },
  };
  const presenter = new ExplorerPresenter(children);
  await presenter.connect({
    mode: 'nodes',
    manifestFile: 'rules/manifest.json',
    url: 'ws://127.0.0.1:3000',
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
  });
  presenter.selectSignature('29:66:2');
  await presenter.inspectSelectedSignature();

  presenter.createScaffoldFromSignature({});
  assert.equal(lastOptions.homeyClass, 'light');

  presenter.createScaffoldFromSignature({ homeyClass: 'socket' });
  assert.equal(lastOptions.homeyClass, 'socket');
});

test('ExplorerPresenter scaffold draft + write flow', async () => {
  const writes = [];
  const manifests = [];
  const base = createChildren();
  const children = {
    ...base,
    curation: {
      ...base.curation,
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
    },
  };
  const presenter = new ExplorerPresenter(children);

  presenter.selectSignature('29:66:2');
  const draft = presenter.createScaffoldFromSignature({});
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

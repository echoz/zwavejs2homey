const test = require('node:test');
const assert = require('node:assert/strict');

const { getUsageText, parseCliArgs, runApp } = require('../dist/app');

test('getUsageText includes scaffold homey-class override', () => {
  assert.match(getUsageText(), /scaffold preview .*--homey-class <class>/);
  assert.match(getUsageText(), /simulate \[--manifest <file>\]/);
});

test('parseCliArgs parses required and optional fields', () => {
  const parsed = parseCliArgs([
    '--url',
    'ws://127.0.0.1:3000',
    '--schema-version',
    '1',
    '--include-values',
    'full',
    '--max-values',
    '10',
    '--start-node',
    '5',
  ]);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.command, {
    mode: 'nodes',
    manifestFile: 'rules/manifest.json',
    url: 'ws://127.0.0.1:3000',
    token: undefined,
    schemaVersion: 1,
    includeValues: 'full',
    maxValues: 10,
    startNode: 5,
  });
});

test('parseCliArgs supports rules-only startup with optional url', () => {
  const parsed = parseCliArgs(['--rules-only', '--manifest-file', 'rules/manifest.dev.json']);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.command, {
    mode: 'rules',
    manifestFile: 'rules/manifest.dev.json',
    url: undefined,
    token: undefined,
    schemaVersion: 0,
    includeValues: 'summary',
    maxValues: 200,
    startNode: undefined,
  });
});

test('runApp executes interactive command flow through parent+child presenters', async () => {
  const commands = [
    'list',
    'show 2',
    'signature --from-node 2',
    'inspect',
    'simulate --dry-run',
    'scaffold preview --product-name TestProduct --homey-class light',
    'scaffold write test-output.json --force',
    'manifest add test-output.json --manifest rules/manifest.json --force',
    'status',
    'log --limit 5',
    'quit',
  ];
  let index = 0;
  let closeCalls = 0;

  const fakeReadline = {
    async question() {
      const value = commands[index] ?? 'quit';
      index += 1;
      return value;
    },
    close() {
      closeCalls += 1;
    },
  };

  const explorerChildPresenter = {
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
      return [
        {
          nodeId: 2,
          name: 'Desk',
          location: null,
          ready: true,
          status: 'alive',
          manufacturer: 'Vendor',
          product: 'Model',
          interviewStage: null,
          isFailed: false,
        },
      ];
    },
    async getNodeDetail(nodeId) {
      this.detailCalls += 1;
      return {
        nodeId,
        state: { name: 'Desk', ready: true, status: 'alive' },
        neighbors: [],
        notificationEvents: [],
        values: [],
      };
    },
  };
  const curationChildPresenter = {
    inspectCalls: 0,
    validateCalls: 0,
    simulateCalls: 0,
    deriveSignatureFromNodeDetail() {
      return '29:66:2';
    },
    async inspectSignature(_session, signature) {
      this.inspectCalls += 1;
      return {
        signature,
        totalNodes: 1,
        outcomeCounts: { curated: 1 },
        nodes: [],
      };
    },
    async validateSignature() {
      this.validateCalls += 1;
      return {
        signature: '29:66:2',
        totalNodes: 1,
        reviewNodes: 0,
        outcomes: { curated: 1 },
      };
    },
    async simulateSignature(_session, signature, options) {
      this.simulateCalls += 1;
      assert.equal(options.dryRun, true);
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
    scaffoldFromSignature(signature, options) {
      assert.equal(options.homeyClass, 'light');
      return {
        signature,
        fileHint: 'product-29-66-2.json',
        generatedAt: new Date().toISOString(),
        bundle: { schemaVersion: 'product-rules/v1', rules: [] },
      };
    },
    writeScaffoldDraft(filePath, _draft, options) {
      assert.equal(options.confirm, true);
      return `/abs/${filePath}`;
    },
    addProductRuleToManifest(manifestFile, filePath, options) {
      assert.equal(options.confirm, true);
      return { manifestFile, entryFilePath: filePath, updated: true };
    },
  };

  const logs = [];
  const errors = [];
  await runApp(
    {
      mode: 'nodes',
      manifestFile: 'rules/manifest.json',
      url: 'ws://127.0.0.1:3000',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 50,
    },
    {
      log: (line) => logs.push(String(line)),
      error: (line) => errors.push(String(line)),
    },
    {
      explorerChildPresenter,
      curationChildPresenter,
      createInterfaceImpl: () => fakeReadline,
      stdin: {},
      stdout: {},
    },
  );

  assert.equal(explorerChildPresenter.connectCalls, 1);
  assert.equal(explorerChildPresenter.disconnectCalls, 1);
  assert.equal(explorerChildPresenter.listCalls >= 1, true);
  assert.equal(explorerChildPresenter.detailCalls, 1);
  assert.equal(curationChildPresenter.inspectCalls, 1);
  assert.equal(curationChildPresenter.simulateCalls, 1);
  assert.equal(curationChildPresenter.validateCalls, 0);
  assert.equal(closeCalls, 1);
  assert.equal(errors.length, 0);
  assert.equal(
    logs.some((line) => line.includes('Selected signature: 29:66:2')),
    true,
  );
  assert.equal(
    logs.some((line) => line.includes('Scaffold written: /abs/test-output.json')),
    true,
  );
  assert.equal(
    logs.some((line) => line.includes('Manifest: rules/manifest.json')),
    true,
  );
  assert.equal(
    logs.some((line) => line.includes('Connection: ready')),
    true,
  );
  assert.equal(
    logs.some((line) => line.includes('Simulation signature: 29:66:2')),
    true,
  );
});

test('runApp supports rules-only root command flow', async () => {
  const commands = ['list', 'show 1', 'signature --from-rule 1', 'status', 'quit'];
  let index = 0;
  let closeCalls = 0;
  const fakeReadline = {
    async question() {
      const value = commands[index] ?? 'quit';
      index += 1;
      return value;
    },
    close() {
      closeCalls += 1;
    },
  };

  const rulesPresenter = {
    initializeCalls: 0,
    initialize() {
      this.initializeCalls += 1;
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
    getRules() {
      return this.initialize();
    },
    showRuleDetail() {
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
        content: { schemaVersion: 'product-rules/v1' },
      };
    },
    selectSignature() {},
    selectSignatureFromRule() {
      return '29:66:2';
    },
    getStatusSnapshot() {
      return {
        mode: 'rules',
        connectionState: 'disconnected',
        selectedRuleIndex: 1,
        selectedSignature: '29:66:2',
        cachedNodeCount: 1,
      };
    },
    getRunLog() {
      return [];
    },
  };

  const logs = [];
  const errors = [];
  await runApp(
    {
      mode: 'rules',
      manifestFile: 'rules/manifest.json',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 50,
    },
    {
      log: (line) => logs.push(String(line)),
      error: (line) => errors.push(String(line)),
    },
    {
      rulesPresenter,
      createInterfaceImpl: () => fakeReadline,
      stdin: {},
      stdout: {},
    },
  );

  assert.equal(rulesPresenter.initializeCalls >= 1, true);
  assert.equal(closeCalls, 1);
  assert.equal(errors.length, 0);
  assert.equal(
    logs.some((line) => line.includes('Selected signature: 29:66:2')),
    true,
  );
  assert.equal(
    logs.some((line) => line.includes('Mode: rules')),
    true,
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCliArgs, runApp } = require('../dist/app');

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
    url: 'ws://127.0.0.1:3000',
    token: undefined,
    schemaVersion: 1,
    includeValues: 'full',
    maxValues: 10,
    startNode: 5,
  });
});

test('runApp executes interactive command flow through presenter/coordinator', async () => {
  const commands = [
    'list',
    'show 2',
    'signature --from-node 2',
    'inspect',
    'backlog load /tmp/backlog.json --top 5',
    'backlog pick 1',
    'scaffold preview --product-name TestProduct',
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

  const coordinator = {
    connectCalls: 0,
    disconnectCalls: 0,
    listCalls: 0,
    detailCalls: 0,
    inspectCalls: 0,
    validateCalls: 0,
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
    scaffoldFromBacklog(_filePath, signature) {
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
      coordinator,
      createInterfaceImpl: () => fakeReadline,
      stdin: {},
      stdout: {},
    },
  );

  assert.equal(coordinator.connectCalls, 1);
  assert.equal(coordinator.disconnectCalls, 1);
  assert.equal(coordinator.listCalls >= 1, true);
  assert.equal(coordinator.detailCalls, 1);
  assert.equal(coordinator.inspectCalls, 1);
  assert.equal(coordinator.validateCalls, 0);
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
});

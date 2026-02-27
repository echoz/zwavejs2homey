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

test('runApp executes list/show/quit happy path', async () => {
  const commands = ['list', 'show 2', 'quit'];
  let idx = 0;
  let closed = 0;
  const fakeReadline = {
    async question() {
      const command = commands[idx] ?? 'quit';
      idx += 1;
      return command;
    },
    close() {
      closed += 1;
    },
  };

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
      service,
      createInterfaceImpl: () => fakeReadline,
      stdin: {},
      stdout: {},
    },
  );

  assert.equal(service.connectCalls, 1);
  assert.equal(service.disconnectCalls, 1);
  assert.equal(service.listCalls >= 1, true);
  assert.equal(service.detailCalls, 1);
  assert.equal(closed, 1);
  assert.equal(errors.length, 0);
  assert.equal(
    logs.some((line) => line.includes('Node 2')),
    true,
  );
});

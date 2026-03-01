const test = require('node:test');
const assert = require('node:assert/strict');

async function loadLib() {
  return import('../../../tools/zwjs-inspect-lib.mjs');
}

test('parseCliArgs parses nodes list command with defaults', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs(['nodes', 'list', '--url', 'ws://127.0.0.1:3000']);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.command, {
    group: 'nodes',
    action: 'list',
    nodeId: undefined,
    url: 'ws://127.0.0.1:3000',
    token: undefined,
    format: 'table',
    schemaVersion: 0,
    maxValues: 200,
    includeValues: 'full',
  });
});

test('parseCliArgs validates show command and required node id', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs(['nodes', 'show', '--url', 'ws://127.0.0.1:3000']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /nodeId/);
});

test('parseCliArgs returns usage text for help flag', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs(['--help']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Usage:/);
  assert.match(parsed.error, /nodes show/);
});

test('parseCliArgs parses logs capture command with defaults', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs(['logs', 'capture', '--url', 'ws://127.0.0.1:3000']);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.command, {
    group: 'logs',
    action: 'capture',
    url: 'ws://127.0.0.1:3000',
    token: undefined,
    format: 'summary',
    schemaVersion: 0,
    durationSeconds: 30,
    maxEvents: 200,
    sampleSize: 10,
    startListeningLogs: true,
    filter: undefined,
    outputFile: undefined,
    eventsFile: undefined,
  });
});

test('parseCliArgs parses logs capture command with filter and output files', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs([
    'logs',
    'capture',
    '--url',
    'ws://127.0.0.1:3000',
    '--format',
    'json',
    '--duration-seconds',
    '60',
    '--max-events',
    '20',
    '--sample-size',
    '5',
    '--no-start-listening-logs',
    '--filter-source',
    'controller',
    '--filter-label',
    'ZW*',
    '--output-file',
    '/tmp/report.json',
    '--events-file',
    '/tmp/events.ndjson',
  ]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.startListeningLogs, false);
  assert.deepEqual(parsed.command.filter, { source: 'controller', label: 'ZW*' });
  assert.equal(parsed.command.durationSeconds, 60);
  assert.equal(parsed.command.maxEvents, 20);
  assert.equal(parsed.command.sampleSize, 5);
  assert.equal(parsed.command.format, 'json');
  assert.equal(parsed.command.outputFile, '/tmp/report.json');
  assert.equal(parsed.command.eventsFile, '/tmp/events.ndjson');
});

test('formatNodeListTable renders expected headers and rows', async () => {
  const { formatNodeListTable } = await loadLib();
  const output = formatNodeListTable([
    {
      nodeId: 5,
      name: 'Kitchen Dimmer',
      ready: true,
      status: 'alive',
      manufacturer: 'Inovelli',
      product: 'Dimmer',
    },
  ]);
  assert.match(output, /Node\s+Name\s+Ready/);
  assert.match(output, /Kitchen Dimmer/);
  assert.match(output, /alive/);
});

test('fetchNodesList normalizes and sorts nodes', async () => {
  const { fetchNodesList } = await loadLib();
  const client = {
    async getNodeList() {
      return {
        nodes: [
          { nodeId: 8, name: 'B', ready: false },
          { nodeId: 2, name: 'A', ready: true, manufacturer: 'X' },
        ],
      };
    },
  };
  const nodes = await fetchNodesList(client);
  assert.deepEqual(
    nodes.map((n) => n.nodeId),
    [2, 8],
  );
  assert.equal(nodes[0].manufacturer, 'X');
});

test('fetchNodesList supports wrapped command result shape for compatibility', async () => {
  const { fetchNodesList } = await loadLib();
  const client = {
    async getNodeList() {
      return {
        success: true,
        result: {
          nodes: [{ nodeId: 1, name: 'Only' }],
        },
      };
    },
  };
  const nodes = await fetchNodesList(client);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].nodeId, 1);
});

test('fetchNodeDetails collects node state, neighbors and value details', async () => {
  const { fetchNodeDetails } = await loadLib();
  const valueId = { commandClass: 37, endpoint: 0, property: 'currentValue' };
  const client = {
    async getNodeState(nodeId) {
      assert.equal(nodeId, 5);
      return { success: true, result: { state: { nodeId, name: 'Switch', ready: true } } };
    },
    async getControllerNodeNeighbors() {
      return { success: true, result: { neighbors: [1, 2] } };
    },
    async getNodeSupportedNotificationEvents() {
      return { success: false, error: { errorCode: 'not_supported' } };
    },
    async getNodeDefinedValueIds() {
      return { success: true, result: [valueId] };
    },
    async getNodeValueMetadata() {
      return { success: true, result: { label: 'Current value', type: 'boolean' } };
    },
    async getNodeValue() {
      return { success: true, result: { value: true } };
    },
    async getNodeValueTimestamp() {
      return { success: true, result: { timestamp: 123 } };
    },
  };

  const detail = await fetchNodeDetails(client, 5, { includeValues: 'full', maxValues: 10 });
  assert.equal(detail.nodeId, 5);
  assert.deepEqual(detail.neighbors, [1, 2]);
  assert.ok(detail.notificationEvents._error);
  assert.equal(detail.values.length, 1);
  assert.equal(detail.values[0].value, true);
  assert.deepEqual(detail.values[0].timestamp, { timestamp: 123 });
});

test('fetchNodeDetails summary mode omits value/timestamp fetches and returns metadata previews', async () => {
  const { fetchNodeDetails, formatNodeDetailTable } = await loadLib();
  const valueId = { commandClass: 37, endpoint: 0, property: 'currentValue' };
  let valueCalls = 0;
  const client = {
    async getNodeState() {
      return { success: true, result: { state: { nodeId: 5, name: 'Switch' } } };
    },
    async getControllerNodeNeighbors() {
      return { success: true, result: [] };
    },
    async getNodeSupportedNotificationEvents() {
      return { success: true, result: {} };
    },
    async getNodeDefinedValueIds() {
      return { success: true, result: [valueId] };
    },
    async getNodeValueMetadata() {
      return { success: true, result: { type: 'boolean' } };
    },
    async getNodeValue() {
      valueCalls += 1;
      return { success: true, result: { value: true } };
    },
    async getNodeValueTimestamp() {
      valueCalls += 1;
      return { success: true, result: { timestamp: 1 } };
    },
  };
  const detail = await fetchNodeDetails(client, 5, { includeValues: 'summary', maxValues: 5 });
  assert.equal(valueCalls, 0);
  const table = formatNodeDetailTable(detail);
  assert.match(table, /\"type\":\"boolean\"/);
});

test('formatNodeDetailTable falls back to deviceConfig manufacturer/label', async () => {
  const { formatNodeDetailTable } = await loadLib();
  const table = formatNodeDetailTable({
    nodeId: 9,
    state: {
      name: 'Example',
      ready: true,
      status: 4,
      manufacturerId: 29,
      productType: 1,
      productId: 2,
      deviceConfig: { manufacturer: 'Leviton', label: 'DZ15S' },
    },
    neighbors: [],
    notificationEvents: {},
    values: [],
  });
  assert.match(table, /Manufacturer: Leviton/);
  assert.match(table, /Product: DZ15S/);
});

test('summarizeDriverLoggingCapture classifies typed fields and payload shapes', async () => {
  const { summarizeDriverLoggingCapture } = await loadLib();
  const report = summarizeDriverLoggingCapture(
    [
      {
        event: {
          source: 'driver',
          event: 'logging',
          formattedMessage: '[driver] hello',
          message: 'hello',
          level: 'info',
        },
      },
      {
        event: {
          source: 'driver',
          event: 'logging',
          formattedMessage: '[driver] warn',
          message: ['warn', 'details'],
          level: 'warn',
        },
      },
      {
        event: {
          source: 'driver',
          event: 'logging',
          message: { raw: true },
        },
      },
    ],
    { sampleSize: 2 },
  );

  assert.equal(report.total, 3);
  assert.equal(report.typedValidation.formattedMessageString, 2);
  assert.equal(report.typedValidation.formattedMessageMissing, 1);
  assert.equal(report.typedValidation.messageString, 1);
  assert.equal(report.typedValidation.messageStringArray, 1);
  assert.equal(report.typedValidation.messageOtherType, 1);
  assert.equal(report.samples.length, 2);
  assert.equal(report.payloadShapes.length > 0, true);
});

test('captureDriverLoggingEvents collects specialized events and stops at max events', async () => {
  const { captureDriverLoggingEvents } = await loadLib();
  const handlers = [];
  const client = {
    async startListeningLogs(filter) {
      assert.deepEqual(filter, { source: 'driver' });
      return { success: true, result: { started: true } };
    },
    async stopListeningLogs() {
      return { success: true, result: { stopped: true } };
    },
    onEvent(handler) {
      handlers.push(handler);
      return () => {};
    },
  };

  const capturePromise = captureDriverLoggingEvents(client, {
    durationSeconds: 30,
    maxEvents: 2,
    sampleSize: 10,
    startListeningLogs: true,
    filter: { source: 'driver' },
  });

  handlers[0]({
    type: 'zwjs.event.driver',
    ts: '2026-03-01T00:00:00.000Z',
    source: 'zwjs-client',
    event: { source: 'driver', event: 'noop' },
  });
  handlers[0]({
    type: 'zwjs.event.driver.logging',
    ts: '2026-03-01T00:00:01.000Z',
    source: 'zwjs-client',
    event: {
      source: 'driver',
      event: 'logging',
      formattedMessage: '[driver] one',
      message: 'one',
    },
  });
  handlers[0]({
    type: 'zwjs.event.driver.logging',
    ts: '2026-03-01T00:00:02.000Z',
    source: 'zwjs-client',
    event: {
      source: 'driver',
      event: 'logging',
      formattedMessage: '[driver] two',
      message: 'two',
    },
  });

  const report = await capturePromise;
  assert.equal(report.eventCounts.totalClientEvents, 3);
  assert.equal(report.eventCounts.totalDriverEvents, 1);
  assert.equal(report.eventCounts.driverLoggingEvents, 2);
  assert.equal(report.eventCounts.cappedByMaxEvents, true);
  assert.equal(report.startListeningLogsResult.success, true);
  assert.equal(report.stopListeningLogsResult.success, true);
});

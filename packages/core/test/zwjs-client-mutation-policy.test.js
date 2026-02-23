const test = require('node:test');
const assert = require('node:assert/strict');

const { ZwjsClientImpl } = require('../dist/client/zwjs-client.js');
const { loadFixture } = require('./fixtures/_load-fixture.js');

class FakeTransport {
  constructor() {
    this.open = false;
    this.currentEvents = undefined;
    this.sent = [];
  }
  connect(_url, events) {
    this.currentEvents = events;
    return Promise.resolve();
  }
  send(data) {
    if (!this.open) throw new Error('WebSocket is not connected');
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.open = false;
    this.currentEvents?.onClose?.({ code: 1000, reason: 'closed', wasClean: true });
  }
  isOpen() {
    return this.open;
  }
  triggerOpen() {
    this.open = true;
    this.currentEvents?.onOpen?.();
  }
  triggerMessage(frame) {
    this.currentEvents?.onMessage?.(JSON.stringify(frame));
  }
}

function makeClient(mutationPolicy) {
  const client = new ZwjsClientImpl({
    url: 'ws://example.test:3000',
    reconnect: { enabled: false },
    timeouts: { connectTimeoutMs: 100, requestTimeoutMs: 100 },
    ...(mutationPolicy ? { mutationPolicy } : {}),
  });
  const transport = new FakeTransport();
  client.transport = transport;
  return { client, transport };
}

async function startConnected(client, transport) {
  const startPromise = client.start();
  transport.triggerOpen();
  transport.triggerMessage(loadFixture('zwjs-server', 'version.frame.json'));
  await startPromise;
}

function withMessageId(frame, messageId) {
  return { ...frame, messageId };
}

test('sendMutationCommand is blocked by default mutation policy', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  await assert.rejects(
    () =>
      client.sendMutationCommand({
        command: 'node.set_value',
        args: {
          nodeId: 5,
          valueId: { commandClass: 37, property: 'targetValue', endpoint: 0 },
          value: true,
        },
      }),
    (err) => err && err.code === 'UNSUPPORTED_OPERATION' && /blocked by policy/.test(err.message),
  );
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('sendMutationCommand enforces explicit allowlist when enabled', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['driver.update_log_config'],
  });
  await startConnected(client, transport);

  await assert.rejects(
    () =>
      client.sendMutationCommand({
        command: 'node.set_value',
        args: {
          nodeId: 5,
          valueId: { commandClass: 37, property: 'targetValue', endpoint: 0 },
          value: true,
        },
      }),
    (err) => err && err.code === 'UNSUPPORTED_OPERATION' && /allowlist/.test(err.message),
  );
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('sendMutationCommand sends allowed mutation command and returns result', async () => {
  const { client, transport } = makeClient({ enabled: true, allowCommands: ['node.set_value'] });
  await startConnected(client, transport);

  const args = {
    nodeId: 5,
    valueId: { commandClass: 37, property: 'targetValue', endpoint: 0 },
    value: true,
  };
  const pending = client.sendMutationCommand({ command: 'node.set_value', args });
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.node.set_value.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.node.set_value.success.json'), sent.messageId),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.success, true);
  await client.stop();
});

test('beginInclusion sends mutation-gated protocol command and returns result', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['controller.begin_inclusion'],
  });
  await startConnected(client, transport);

  const pending = client.beginInclusion();
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.controller.begin_inclusion.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.command.success.empty.json'), sent.messageId),
  );
  const result = await pending;
  assert.equal(result.success, true);
  await client.stop();
});

test('beginInclusion flattens option args into protocol command frame', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['controller.begin_inclusion'],
  });
  await startConnected(client, transport);

  const pending = client.beginInclusion({ strategy: 'default', forceSecurity: false });
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.controller.begin_inclusion.with-options.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.controller.workflow.started.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.started, true);
  assert.equal(result.result.status, 'started');
  await client.stop();
});

test('beginExclusion sends mutation-gated protocol command and returns result', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['controller.begin_exclusion'],
  });
  await startConnected(client, transport);

  const pending = client.beginExclusion();
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.controller.begin_exclusion.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.command.success.empty.json'), sent.messageId),
  );
  const result = await pending;
  assert.equal(result.success, true);
  await client.stop();
});

test('beginExclusion flattens option args into protocol command frame', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['controller.begin_exclusion'],
  });
  await startConnected(client, transport);

  const pending = client.beginExclusion({ strategy: 'default' });
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.controller.begin_exclusion.with-options.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.controller.workflow.started.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.started, true);
  await client.stop();
});

test('stopInclusion sends mutation-gated protocol command and returns result', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['controller.stop_inclusion'],
  });
  await startConnected(client, transport);

  const pending = client.stopInclusion();
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.controller.stop_inclusion.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.command.success.empty.json'), sent.messageId),
  );
  const result = await pending;
  assert.equal(result.success, true);
  await client.stop();
});

test('stopExclusion sends mutation-gated protocol command and returns result', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['controller.stop_exclusion'],
  });
  await startConnected(client, transport);

  const pending = client.stopExclusion();
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.controller.stop_exclusion.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.command.success.empty.json'), sent.messageId),
  );
  const result = await pending;
  assert.equal(result.success, true);
  await client.stop();
});

test('inclusion wrappers are blocked by default mutation policy', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  await assert.rejects(() => client.beginInclusion(), /blocked by policy/);
  await assert.rejects(() => client.beginExclusion(), /blocked by policy/);
  await assert.rejects(() => client.stopInclusion(), /blocked by policy/);
  await assert.rejects(() => client.stopExclusion(), /blocked by policy/);
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('pingNode sends mutation-gated protocol command and returns success', async () => {
  const { client, transport } = makeClient({ enabled: true, allowCommands: ['node.ping'] });
  await startConnected(client, transport);

  const pending = client.pingNode(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.node.ping.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.node.ping.success.json'), sent.messageId),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.success, true);
  await client.stop();
});

test('refreshNodeInfo sends mutation-gated protocol command and returns success', async () => {
  const { client, transport } = makeClient({ enabled: true, allowCommands: ['node.refresh_info'] });
  await startConnected(client, transport);

  const pending = client.refreshNodeInfo(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.node.refresh_info.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.refresh_info.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.success, true);
  await client.stop();
});

test('refreshNodeValues sends mutation-gated protocol command and returns success', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['node.refresh_values'],
  });
  await startConnected(client, transport);

  const pending = client.refreshNodeValues(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.node.refresh_values.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.refresh_values.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.success, true);
  await client.stop();
});

test('pollNodeValue sends mutation-gated protocol command and returns result', async () => {
  const { client, transport } = makeClient({ enabled: true, allowCommands: ['node.poll_value'] });
  await startConnected(client, transport);

  const pending = client.pollNodeValue({
    nodeId: 5,
    valueId: { commandClass: 37, property: 'currentValue', endpoint: 0 },
  });
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.node.poll_value.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.poll_value.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.success, true);
  assert.equal(result.result.value, true);
  await client.stop();
});

test('P2.2 low-risk mutating wrappers are blocked by default mutation policy', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  await assert.rejects(() => client.pingNode(5), /blocked by policy/);
  await assert.rejects(() => client.refreshNodeInfo(5), /blocked by policy/);
  await assert.rejects(() => client.refreshNodeValues(5), /blocked by policy/);
  await assert.rejects(
    () =>
      client.pollNodeValue({
        nodeId: 5,
        valueId: { commandClass: 37, property: 'currentValue', endpoint: 0 },
      }),
    /blocked by policy/,
  );
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('invoke_cc_api wrappers are blocked by default mutation policy', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  await assert.rejects(
    () =>
      client.endpointInvokeCcApi({
        nodeId: 5,
        endpoint: 1,
        commandClass: 37,
        methodName: 'set',
        args: [true],
      }),
    /blocked by policy/,
  );
  await assert.rejects(
    () =>
      client.broadcastNodeInvokeCcApi({
        index: 1,
        commandClass: 37,
        methodName: 'set',
        args: [true],
      }),
    /blocked by policy/,
  );
  await assert.rejects(
    () =>
      client.multicastGroupInvokeCcApi({
        nodeIDs: [5, 7],
        index: 1,
        commandClass: 37,
        methodName: 'set',
        args: [true],
      }),
    /blocked by policy/,
  );
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('invoke_cc_api wrappers send when explicitly allowlisted', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: [
      'endpoint.invoke_cc_api',
      'broadcast_node.invoke_cc_api',
      'multicast_group.invoke_cc_api',
    ],
  });
  await startConnected(client, transport);

  const endpointPending = client.endpointInvokeCcApi({
    nodeId: 5,
    endpoint: 1,
    commandClass: 37,
    methodName: 'get',
    args: [],
  });
  let sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.endpoint.invoke_cc_api.json'),
      sent.messageId,
    ),
  );
  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.endpoint.invoke_cc_api.success.json'),
      sent.messageId,
    ),
  );
  const endpointResult = await endpointPending;
  assert.equal(endpointResult.success, true);

  const broadcastPending = client.broadcastNodeInvokeCcApi({
    index: 1,
    commandClass: 37,
    methodName: 'get',
    args: [],
  });
  sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.broadcast_node.invoke_cc_api.json'),
      sent.messageId,
    ),
  );
  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.broadcast_node.invoke_cc_api.success.json'),
      sent.messageId,
    ),
  );
  const broadcastResult = await broadcastPending;
  assert.equal(broadcastResult.success, true);

  const multicastPending = client.multicastGroupInvokeCcApi({
    nodeIDs: [5, 7],
    index: 1,
    commandClass: 37,
    methodName: 'get',
    args: [],
  });
  sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.multicast_group.invoke_cc_api.json'),
      sent.messageId,
    ),
  );
  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.multicast_group.invoke_cc_api.success.json'),
      sent.messageId,
    ),
  );
  const multicastResult = await multicastPending;
  assert.equal(multicastResult.success, true);

  await client.stop();
});

test('zniffer mutation wrappers send exact protocol commands when allowlisted', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: [
      'zniffer.init',
      'zniffer.start',
      'zniffer.stop',
      'zniffer.destroy',
      'zniffer.clear_captured_frames',
      'zniffer.set_frequency',
    ],
  });
  await startConnected(client, transport);

  const checks = [
    [
      () =>
        client.initZniffer({
          devicePath: '/dev/ttyUSB0',
          options: { region: 0, baudrate: 230400 },
        }),
      'command.zniffer.init.json',
    ],
    [() => client.startZniffer(), 'command.zniffer.start.json'],
    [() => client.stopZniffer(), 'command.zniffer.stop.json'],
    [() => client.destroyZniffer(), 'command.zniffer.destroy.json'],
    [() => client.clearZnifferCapturedFrames(), 'command.zniffer.clear_captured_frames.json'],
    [() => client.setZnifferFrequency({ frequency: 1 }), 'command.zniffer.set_frequency.json'],
  ];

  for (const [call, commandFixture] of checks) {
    const pending = call();
    const sent = transport.sent.at(-1);
    assert.deepEqual(
      sent,
      withMessageId(loadFixture('zwjs-server', commandFixture), sent.messageId),
    );
    transport.triggerMessage(
      withMessageId(
        loadFixture('zwjs-server', 'result.command.success.empty.json'),
        sent.messageId,
      ),
    );
    const result = await pending;
    assert.equal(result.success, true);
  }

  await client.stop();
});

test('zniffer mutation wrappers are blocked by default mutation policy', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  await assert.rejects(
    () => client.initZniffer({ devicePath: '/dev/ttyUSB0', options: { region: 0 } }),
    /blocked by policy/,
  );
  await assert.rejects(() => client.startZniffer(), /blocked by policy/);
  await assert.rejects(() => client.stopZniffer(), /blocked by policy/);
  await assert.rejects(() => client.destroyZniffer(), /blocked by policy/);
  await assert.rejects(() => client.clearZnifferCapturedFrames(), /blocked by policy/);
  await assert.rejects(() => client.setZnifferFrequency({ frequency: 1 }), /blocked by policy/);
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('driver firmware mutation wrapper sends exact protocol command when allowlisted', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['driver.firmware_update_otw'],
  });
  await startConnected(client, transport);

  const pending = client.driverFirmwareUpdateOtw({
    filename: 'controller.gbl',
    file: 'AQID',
    fileFormat: 'gbl',
  });
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.driver.firmware_update_otw.raw-file.json'),
      sent.messageId,
    ),
  );
  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.firmware_update.command.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.status, 'started');

  await client.stop();
});

test('controller firmware mutation wrappers send exact protocol commands when allowlisted', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['controller.firmware_update_ota', 'controller.firmware_update_otw'],
  });
  await startConnected(client, transport);

  const otaPending = client.controllerFirmwareUpdateOta({
    nodeId: 5,
    updateInfo: { version: '1.2.3', files: [] },
  });
  let sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.controller.firmware_update_ota.json'),
      sent.messageId,
    ),
  );
  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.firmware_update.command.success.json'),
      sent.messageId,
    ),
  );
  const otaResult = await otaPending;
  assert.equal(otaResult.success, true);
  assert.equal(typeof otaResult.result.status !== 'undefined', true);

  const otwPending = client.controllerFirmwareUpdateOtw({
    filename: 'controller.gbl',
    file: 'AQID',
    fileFormat: 'gbl',
  });
  sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.controller.firmware_update_otw.json'),
      sent.messageId,
    ),
  );
  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.firmware_update.command.success.variant.json'),
      sent.messageId,
    ),
  );
  const otwResult = await otwPending;
  assert.equal(otwResult.success, true);
  assert.equal(otwResult.result.success, true);

  await client.stop();
});

test('node firmware mutation wrappers send exact protocol commands when allowlisted', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: [
      'node.begin_firmware_update',
      'node.update_firmware',
      'node.abort_firmware_update',
    ],
  });
  await startConnected(client, transport);

  const beginPending = client.beginNodeFirmwareUpdate({
    nodeId: 5,
    firmwareFilename: 'device.otz',
    firmwareFile: 'AQID',
    firmwareFileFormat: 'otz',
    target: 0,
  });
  let sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.begin_firmware_update.json'),
      sent.messageId,
    ),
  );
  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.firmware_update.command.success.json'),
      sent.messageId,
    ),
  );
  const beginResult = await beginPending;
  assert.equal(beginResult.success, true);

  const updatePending = client.updateNodeFirmware({
    nodeId: 5,
    updates: [{ filename: 'device.otz', file: 'AQID', fileFormat: 'otz', firmwareTarget: 0 }],
  });
  sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.node.update_firmware.json'), sent.messageId),
  );
  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.firmware_update.command.success.variant.json'),
      sent.messageId,
    ),
  );
  const updateResult = await updatePending;
  assert.equal(updateResult.success, true);
  assert.equal(typeof updateResult.result.status !== 'undefined', true);

  const abortPending = client.abortNodeFirmwareUpdate(5);
  sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.abort_firmware_update.json'),
      sent.messageId,
    ),
  );
  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.firmware_update.command.success.json'),
      sent.messageId,
    ),
  );
  const abortResult = await abortPending;
  assert.equal(abortResult.success, true);

  await client.stop();
});

test('driverFirmwareUpdateOtw supports updateInfo command variant and protocol-native result passthrough', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['driver.firmware_update_otw'],
  });
  await startConnected(client, transport);

  const pending = client.driverFirmwareUpdateOtw({
    updateInfo: { version: '2.0.0', channel: 'stable', files: [] },
  });
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.driver.firmware_update_otw.update-info.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.firmware_update.command.success.variant.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.success, true);
  assert.equal(result.result.status, 0);
  assert.equal(result.result.details.scheduled, true);
  await client.stop();
});

test('driverFirmwareUpdateOtw rejects ambiguous payload mode before sending', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['driver.firmware_update_otw'],
  });
  await startConnected(client, transport);

  await assert.rejects(
    () =>
      client.driverFirmwareUpdateOtw({
        filename: 'controller.gbl',
        file: 'AQID',
        updateInfo: { version: '2.0.0' },
      }),
    /requires exactly one payload mode/,
  );
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('updateNodeFirmware rejects empty updates array before sending', async () => {
  const { client, transport } = makeClient({
    enabled: true,
    allowCommands: ['node.update_firmware'],
  });
  await startConnected(client, transport);

  await assert.rejects(
    () => client.updateNodeFirmware({ nodeId: 5, updates: [] }),
    /non-empty `updates` array/,
  );
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('driverFirmwareUpdateOtw returns policy error before payload validation when blocked', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  await assert.rejects(
    () =>
      client.driverFirmwareUpdateOtw({
        filename: 'controller.gbl',
        file: 'AQID',
        updateInfo: { version: '2.0.0' },
      }),
    (err) => err && err.code === 'UNSUPPORTED_OPERATION' && /blocked by policy/.test(err.message),
  );
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('updateNodeFirmware returns policy error before payload validation when blocked', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  await assert.rejects(
    () => client.updateNodeFirmware({ nodeId: 5, updates: [] }),
    (err) => err && err.code === 'UNSUPPORTED_OPERATION' && /blocked by policy/.test(err.message),
  );
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

test('firmware mutation wrappers are blocked by default mutation policy', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  await assert.rejects(
    () => client.driverFirmwareUpdateOtw({ filename: 'x.gbl', file: 'AQID' }),
    /blocked by policy/,
  );
  await assert.rejects(
    () => client.controllerFirmwareUpdateOta({ nodeId: 5, updateInfo: { version: '1.2.3' } }),
    /blocked by policy/,
  );
  await assert.rejects(
    () => client.controllerFirmwareUpdateOtw({ filename: 'x.gbl', file: 'AQID' }),
    /blocked by policy/,
  );
  await assert.rejects(
    () =>
      client.beginNodeFirmwareUpdate({
        nodeId: 5,
        firmwareFilename: 'x.otz',
        firmwareFile: 'AQID',
      }),
    /blocked by policy/,
  );
  await assert.rejects(
    () => client.updateNodeFirmware({ nodeId: 5, updates: [{ filename: 'x.otz', file: 'AQID' }] }),
    /blocked by policy/,
  );
  await assert.rejects(() => client.abortNodeFirmwareUpdate(5), /blocked by policy/);
  assert.equal(transport.sent.length, 0);
  await client.stop();
});

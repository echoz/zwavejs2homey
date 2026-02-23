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

function makeClient() {
  const client = new ZwjsClientImpl({
    url: 'ws://example.test:3000',
    reconnect: { enabled: false },
    timeouts: { connectTimeoutMs: 100, requestTimeoutMs: 100 },
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

test('getControllerNodeNeighbors sends correct command and returns result array', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getControllerNodeNeighbors(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.controller.get_node_neighbors.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.controller.get_node_neighbors.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.deepEqual(result.result, [2, 7, 12]);
  await client.stop();
});

test('getNodeDefinedValueIds sends correct command and returns result array', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getNodeDefinedValueIds(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.get_defined_value_ids.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.get_defined_value_ids.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(Array.isArray(result.result), true);
  assert.equal(result.result[0].commandClass, 37);
  await client.stop();
});

test('getNodeValue sends correct command and returns raw value result', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const valueId = { commandClass: 37, property: 'currentValue', endpoint: 0 };
  const pending = client.getNodeValue(5, valueId);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.node.get_value.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.node.get_value.success.json'), sent.messageId),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(result.result, true);
  await client.stop();
});

test('getNodeValueMetadata sends correct command and returns metadata object', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const valueId = { commandClass: 37, property: 'currentValue', endpoint: 0 };
  const pending = client.getNodeValueMetadata(5, valueId);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.get_value_metadata.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.get_value_metadata.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(result.result.label, 'Current value');
  assert.equal(result.result.max, 99);
  await client.stop();
});

test('getNodeValueTimestamp sends correct command and returns timestamp result', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const valueId = { commandClass: 37, property: 'currentValue', endpoint: 0 };
  const pending = client.getNodeValueTimestamp(5, valueId);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.get_value_timestamp.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.get_value_timestamp.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(result.result, 1730000000000);
  await client.stop();
});

test('getNodeValueTimestamp supports object timestamp result shape', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const valueId = { commandClass: 37, property: 'currentValue', endpoint: 0 };
  const pending = client.getNodeValueTimestamp(5, valueId);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.get_value_timestamp.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.get_value_timestamp.success.object.json'),
      sent.messageId,
    ),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(result.result.timestamp, 1771647088830);
  await client.stop();
});

test('getDriverLogConfig sends correct command and returns log config', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getDriverLogConfig();
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.driver.get_log_config.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.driver.get_log_config.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(result.result.config.level, 'info');
  assert.equal(result.result.config.enabled, true);
  await client.stop();
});

test('isDriverStatisticsEnabled sends correct command and returns statisticsEnabled', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.isDriverStatisticsEnabled();
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.driver.is_statistics_enabled.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.driver.is_statistics_enabled.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(result.result.statisticsEnabled, true);
  await client.stop();
});

test('getNodeSupportedNotificationEvents sends correct command and returns protocol-native payload', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getNodeSupportedNotificationEvents(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.get_supported_notification_events.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.get_supported_notification_events.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.deepEqual(result.result['113']['1'], [0, 2, 8]);
  await client.stop();
});

test('getNodeFirmwareUpdateCapabilities sends correct command and returns protocol-native payload', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getNodeFirmwareUpdateCapabilities(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.get_firmware_update_capabilities.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.get_firmware_update_capabilities.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.firmwareUpgradable, true);
  await client.stop();
});

test('getNodeFirmwareUpdateCapabilitiesCached sends correct command and returns protocol-native payload', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getNodeFirmwareUpdateCapabilitiesCached(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.get_firmware_update_capabilities_cached.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture(
        'zwjs-server',
        'result.node.get_firmware_update_capabilities_cached.success.json',
      ),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.cached, true);
  await client.stop();
});

test('getNodeDateAndTime sends correct command and returns protocol-native payload', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getNodeDateAndTime(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.get_date_and_time.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.get_date_and_time.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.year, 2026);
  await client.stop();
});

test('isNodeFirmwareUpdateInProgress sends correct command and returns inProgress flag', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.isNodeFirmwareUpdateInProgress(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.is_firmware_update_in_progress.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.is_firmware_update_in_progress.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.inProgress, false);
  await client.stop();
});

test('getNodeFirmwareUpdateProgress sends correct command and returns protocol-native payload', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.getNodeFirmwareUpdateProgress(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.get_firmware_update_progress.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.get_firmware_update_progress.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.progress, 25);
  await client.stop();
});

test('isNodeHealthCheckInProgress sends correct command and returns inProgress flag', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.isNodeHealthCheckInProgress(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.is_health_check_in_progress.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.is_health_check_in_progress.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.inProgress, true);
  await client.stop();
});

test('hasNodeDeviceConfigChanged sends correct command and returns changed flag', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.hasNodeDeviceConfigChanged(5);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.node.has_device_config_changed.json'),
      sent.messageId,
    ),
  );

  transport.triggerMessage(
    withMessageId(
      loadFixture('zwjs-server', 'result.node.has_device_config_changed.success.json'),
      sent.messageId,
    ),
  );
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.result.hasChanged, false);
  await client.stop();
});

test('P1.2 diagnostic wrappers support observed nested result key shapes from live validation', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const checks = [
    [
      () => client.getNodeFirmwareUpdateCapabilities(5),
      'command.node.get_firmware_update_capabilities.json',
      'result.node.get_firmware_update_capabilities.success.observed.json',
      (result) => assert.equal(typeof result.capabilities, 'object'),
    ],
    [
      () => client.getNodeFirmwareUpdateCapabilitiesCached(5),
      'command.node.get_firmware_update_capabilities_cached.json',
      'result.node.get_firmware_update_capabilities_cached.success.observed.json',
      (result) => assert.equal(typeof result.capabilities, 'object'),
    ],
    [
      () => client.getNodeDateAndTime(5),
      'command.node.get_date_and_time.json',
      'result.node.get_date_and_time.success.observed.json',
      (result) => assert.equal(typeof result.dateAndTime, 'string'),
    ],
    [
      () => client.isNodeFirmwareUpdateInProgress(5),
      'command.node.is_firmware_update_in_progress.json',
      'result.node.is_firmware_update_in_progress.success.observed.json',
      (result) => assert.equal(result.progress, false),
    ],
    [
      () => client.getNodeFirmwareUpdateProgress(5),
      'command.node.get_firmware_update_progress.json',
      'result.node.get_firmware_update_progress.success.observed.json',
      (result) => assert.equal(result.progress, 0),
    ],
    [
      () => client.isNodeHealthCheckInProgress(5),
      'command.node.is_health_check_in_progress.json',
      'result.node.is_health_check_in_progress.success.observed.json',
      (result) => assert.equal(result.progress, false),
    ],
    [
      () => client.hasNodeDeviceConfigChanged(5),
      'command.node.has_device_config_changed.json',
      'result.node.has_device_config_changed.success.observed.json',
      (result) => assert.equal(result.changed, false),
    ],
  ];

  for (const [call, commandFixture, resultFixture, assertResult] of checks) {
    const pending = call();
    const sent = transport.sent.at(-1);
    assert.deepEqual(
      sent,
      withMessageId(loadFixture('zwjs-server', commandFixture), sent.messageId),
    );
    transport.triggerMessage(
      withMessageId(loadFixture('zwjs-server', resultFixture), sent.messageId),
    );
    const response = await pending;
    assert.equal(response.success, true);
    assertResult(response.result);
  }

  await client.stop();
});

test('endpoint support-check and node-helper wrappers send exact protocol commands and return results', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const endpointCcArgs = { nodeId: 5, endpoint: 1, commandClass: 37 };
  const endpointTargetArgs = { nodeId: 5, endpoint: 1 };

  const checks = [
    [
      () => client.endpointSupportsCc(endpointCcArgs),
      'command.endpoint.supports_cc.json',
      'result.endpoint.supports_cc.success.json',
      (result) => assert.equal(result, true),
    ],
    [
      () => client.endpointSupportsCcApi(endpointCcArgs),
      'command.endpoint.supports_cc_api.json',
      'result.endpoint.supports_cc_api.success.json',
      (result) => assert.equal(result, true),
    ],
    [
      () => client.endpointControlsCc(endpointCcArgs),
      'command.endpoint.controls_cc.json',
      'result.endpoint.controls_cc.success.json',
      (result) => assert.equal(result, false),
    ],
    [
      () => client.endpointIsCcSecure(endpointCcArgs),
      'command.endpoint.is_cc_secure.json',
      'result.endpoint.is_cc_secure.success.json',
      (result) => assert.equal(result, true),
    ],
    [
      () => client.endpointGetCcVersion(endpointCcArgs),
      'command.endpoint.get_cc_version.json',
      'result.endpoint.get_cc_version.success.json',
      (result) => assert.equal(result, 4),
    ],
    [
      () => client.endpointTryGetNode(endpointTargetArgs),
      'command.endpoint.try_get_node.json',
      'result.endpoint.try_get_node.success.json',
      (result) => assert.equal(result.id, 5),
    ],
    [
      () => client.endpointGetNodeUnsafe(endpointTargetArgs),
      'command.endpoint.get_node_unsafe.json',
      'result.endpoint.get_node_unsafe.success.json',
      (result) => assert.equal(result.id, 5),
    ],
  ];

  for (const [call, commandFixture, resultFixture, assertResult] of checks) {
    const pending = call();
    const sent = transport.sent.at(-1);
    assert.deepEqual(
      sent,
      withMessageId(loadFixture('zwjs-server', commandFixture), sent.messageId),
    );
    transport.triggerMessage(
      withMessageId(loadFixture('zwjs-server', resultFixture), sent.messageId),
    );
    const response = await pending;
    assert.equal(response.success, true);
    assertResult(response.result);
  }

  await client.stop();
});

test('virtual endpoint read wrappers send exact broadcast/multicast protocol commands and return results', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const checks = [
    [
      () => client.broadcastNodeGetEndpointCount(),
      'command.broadcast_node.get_endpoint_count.json',
      'result.broadcast_node.get_endpoint_count.success.json',
      (result) => assert.equal(result, 3),
    ],
    [
      () => client.broadcastNodeSupportsCc({ index: 1, commandClass: 37 }),
      'command.broadcast_node.supports_cc.json',
      'result.broadcast_node.supports_cc.success.json',
      (result) => assert.equal(result, true),
    ],
    [
      () => client.broadcastNodeSupportsCcApi({ index: 1, commandClass: 37 }),
      'command.broadcast_node.supports_cc_api.json',
      'result.broadcast_node.supports_cc_api.success.json',
      (result) => assert.equal(result, false),
    ],
    [
      () => client.broadcastNodeGetCcVersion({ index: 1, commandClass: 37 }),
      'command.broadcast_node.get_cc_version.json',
      'result.broadcast_node.get_cc_version.success.json',
      (result) => assert.equal(result, 4),
    ],
    [
      () => client.multicastGroupGetEndpointCount({ nodeIDs: [5, 7] }),
      'command.multicast_group.get_endpoint_count.json',
      'result.multicast_group.get_endpoint_count.success.json',
      (result) => assert.equal(result, 4),
    ],
    [
      () => client.multicastGroupSupportsCc({ nodeIDs: [5, 7], index: 1, commandClass: 37 }),
      'command.multicast_group.supports_cc.json',
      'result.multicast_group.supports_cc.success.json',
      (result) => assert.equal(result, false),
    ],
    [
      () => client.multicastGroupSupportsCcApi({ nodeIDs: [5, 7], index: 1, commandClass: 37 }),
      'command.multicast_group.supports_cc_api.json',
      'result.multicast_group.supports_cc_api.success.json',
      (result) => assert.equal(result, true),
    ],
    [
      () => client.multicastGroupGetCcVersion({ nodeIDs: [5, 7], index: 1, commandClass: 37 }),
      'command.multicast_group.get_cc_version.json',
      'result.multicast_group.get_cc_version.success.json',
      (result) => assert.equal(result, 5),
    ],
    [
      () => client.multicastGroupGetDefinedValueIds({ nodeIDs: [5, 7] }),
      'command.multicast_group.get_defined_value_ids.json',
      'result.multicast_group.get_defined_value_ids.success.json',
      (result) => assert.equal(Array.isArray(result), true),
    ],
  ];

  for (const [call, commandFixture, resultFixture, assertResult] of checks) {
    const pending = call();
    const sent = transport.sent.at(-1);
    assert.deepEqual(
      sent,
      withMessageId(loadFixture('zwjs-server', commandFixture), sent.messageId),
    );
    transport.triggerMessage(
      withMessageId(loadFixture('zwjs-server', resultFixture), sent.messageId),
    );
    const response = await pending;
    assert.equal(response.success, true);
    assertResult(response.result);
  }

  await client.stop();
});

test('setApiSchema sends correct command and returns success result', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.setApiSchema(44);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.set_api_schema.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.set_api_schema.success.json'), sent.messageId),
  );
  const result = await pending;

  assert.equal(result.success, true);
  assert.equal(result.result.ok, true);
  await client.stop();
});

test('startListeningLogs sends correct command without filter', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.startListeningLogs();
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.start_listening_logs.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.command.success.empty.json'), sent.messageId),
  );
  const result = await pending;
  assert.equal(result.success, true);
  await client.stop();
});

test('startListeningLogs sends correct command with filter', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const filter = { source: 'driver', label: 'ZWAVE' };
  const pending = client.startListeningLogs(filter);
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(
      loadFixture('zwjs-server', 'command.start_listening_logs.with-filter.json'),
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

test('stopListeningLogs sends correct command', async () => {
  const { client, transport } = makeClient();
  await startConnected(client, transport);

  const pending = client.stopListeningLogs();
  const sent = transport.sent.at(-1);
  assert.deepEqual(
    sent,
    withMessageId(loadFixture('zwjs-server', 'command.stop_listening_logs.json'), sent.messageId),
  );

  transport.triggerMessage(
    withMessageId(loadFixture('zwjs-server', 'result.command.success.empty.json'), sent.messageId),
  );
  const result = await pending;
  assert.equal(result.success, true);
  await client.stop();
});

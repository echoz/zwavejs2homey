const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');

const { ZwjsClientImpl } = require('../dist/client/zwjs-client.js');
const { loadFixture } = require('./fixtures/_load-fixture.ts');

function makeServer() {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  return new Promise((resolve, reject) => {
    wss.once('listening', () => {
      const address = wss.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      resolve({ wss, port: address.port });
    });
    wss.once('error', reject);
  });
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('real ws transport handles version, initialize/start_listening, success and failure results', async (t) => {
  let server;
  try {
    server = await makeServer();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EPERM') {
      t.skip('sandbox blocks local listen() for ws integration harness');
      return;
    }
    throw error;
  }
  const { wss, port } = server;
  const received = [];

  t.after(async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify(loadFixture('zwjs-server', 'version.frame.json')));

    socket.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      received.push(msg);

      if (msg.command === 'initialize') {
        socket.send(
          JSON.stringify({
            type: 'result',
            messageId: msg.messageId,
            success: true,
            result: { ok: true },
          }),
        );
        return;
      }

      if (msg.command === 'start_listening') {
        const result = clone(
          loadFixture('zwjs-server', 'result.start-listening.state.minimal.json'),
        );
        result.messageId = msg.messageId;
        socket.send(JSON.stringify(result));
        return;
      }

      if (msg.command === 'driver.get_config') {
        socket.send(
          JSON.stringify({
            type: 'result',
            messageId: msg.messageId,
            success: true,
            result: {
              config: {
                statisticsEnabled: true,
                logConfig: { enabled: true, level: 'info' },
              },
            },
          }),
        );
        return;
      }

      if (msg.command === 'set_api_schema') {
        socket.send(
          JSON.stringify({
            type: 'result',
            messageId: msg.messageId,
            success: false,
            errorCode: 'schema_incompatible',
          }),
        );
        return;
      }

      socket.send(
        JSON.stringify({
          type: 'result',
          messageId: msg.messageId,
          success: false,
          errorCode: 'unknown_command',
        }),
      );
    });
  });

  const client = new ZwjsClientImpl({
    url: `ws://127.0.0.1:${port}`,
    reconnect: { enabled: false },
    timeouts: { connectTimeoutMs: 500, requestTimeoutMs: 500 },
  });

  await client.start();
  assert.equal(client.getStatus().transportConnected, true);
  assert.equal(client.getStatus().versionReceived, true);

  const init = await client.initialize({ schemaVersion: 0 });
  assert.equal(init.success, true);
  assert.equal(client.getStatus().initialized, true);

  const listening = await client.startListening();
  assert.equal(listening.success, true);
  assert.equal(client.getStatus().listening, true);

  const nodeList = await client.getNodeList();
  assert.equal(nodeList.nodes.length, 2);
  assert.equal(nodeList.nodes[0].nodeId, 2);

  const driverConfig = await client.getDriverConfig();
  assert.equal(driverConfig.success, true);
  assert.equal(driverConfig.result.config.statisticsEnabled, true);

  const schemaFail = await client.sendCommand({
    command: 'set_api_schema',
    args: { schemaVersion: 999 },
  });
  assert.equal(schemaFail.success, false);
  assert.equal(schemaFail.error.errorCode, 'schema_incompatible');
  assert.equal(schemaFail.error.raw.errorCode, 'schema_incompatible');

  assert.equal(
    received.some((m) => m.command === 'initialize'),
    true,
  );
  assert.equal(
    received.some((m) => m.command === 'start_listening'),
    true,
  );
  assert.equal(
    received.some((m) => m.command === 'driver.get_config'),
    true,
  );

  await client.stop();
  assert.equal(client.getStatus().lifecycle, 'stopped');
});

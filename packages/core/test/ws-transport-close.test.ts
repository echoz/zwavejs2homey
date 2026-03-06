const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');

const { WsTransport } = require('../dist/transport/ws-transport.js');

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

test('WsTransport propagates clean close as wasClean=true', async (t) => {
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
  t.after(async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  let socketRef;
  wss.on('connection', (socket) => {
    socketRef = socket;
  });

  const transport = new WsTransport();
  let closeEvent;
  await transport.connect(`ws://127.0.0.1:${port}`, {
    onClose: (evt) => {
      closeEvent = evt;
    },
  });

  assert.equal(transport.isOpen(), true);
  socketRef.close(1000, 'normal');

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(closeEvent.code, 1000);
  assert.equal(closeEvent.wasClean, true);
});

test('WsTransport propagates abnormal close as wasClean=false', async (t) => {
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
  t.after(async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  let socketRef;
  wss.on('connection', (socket) => {
    socketRef = socket;
  });

  const transport = new WsTransport();
  let closeEvent;
  await transport.connect(`ws://127.0.0.1:${port}`, {
    onClose: (evt) => {
      closeEvent = evt;
    },
  });

  assert.equal(transport.isOpen(), true);
  socketRef.terminate();

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(closeEvent.code, 1006);
  assert.equal(closeEvent.wasClean, false);
});

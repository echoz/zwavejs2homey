const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { runPanelApp } = require('../dist/app');

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.rawModes = [];
  }

  setRawMode(value) {
    this.rawModes.push(value);
  }
}

class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.columns = 96;
    this.rows = 28;
    this.writes = [];
  }

  write(value) {
    this.writes.push(String(value));
    return true;
  }
}

test('runPanelApp renders panel UI and exits on q', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const presenter = {
    connectCalls: 0,
    disconnectCalls: 0,
    async connect() {
      this.connectCalls += 1;
    },
    async disconnect() {
      this.disconnectCalls += 1;
    },
    getState() {
      return {
        explorer: {
          items: [
            { nodeId: 1, name: 'Kitchen', product: 'Switch' },
            { nodeId: 2, name: 'Office', product: 'Sensor' },
          ],
        },
      };
    },
    getStatusSnapshot() {
      return {
        mode: 'nodes',
        connectionState: 'ready',
        selectedSignature: undefined,
        cachedNodeCount: 2,
      };
    },
  };

  const runPromise = runPanelApp(
    {
      mode: 'nodes',
      uiMode: 'panel',
      manifestFile: 'rules/manifest.json',
      url: 'ws://127.0.0.1:3000',
      schemaVersion: 0,
      includeValues: 'summary',
      maxValues: 100,
    },
    { log: () => {}, error: () => {} },
    { presenter, stdin: input, stdout: output },
  );

  setTimeout(() => {
    input.emit('keypress', '', { name: 'h' });
    input.emit('keypress', '', { name: 'q' });
  }, 5);

  await runPromise;

  assert.equal(presenter.connectCalls, 1);
  assert.equal(presenter.disconnectCalls, 1);
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(
    output.writes.some((line) => line.includes('ZWJS nodes (panel)')),
    true,
  );
});

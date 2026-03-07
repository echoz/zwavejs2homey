const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function collectTimedSessionEvents(source) {
  const events = [];
  const pattern = /registerTimedSessionHandler\s*\(\s*session\s*,\s*'([^']+)'/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    events.push(match[1]);
  }
  return events;
}

test('driver session handlers are registered through timed helper', () => {
  const driverFiles = ['drivers/bridge/driver.ts', 'drivers/node/driver.ts'];

  for (const relativePath of driverFiles) {
    const source = readFile(relativePath);
    assert.match(source, /\basync\s+onPair\s*\(/, `${relativePath}: expected custom onPair`);
    const helperMatches = source.match(/registerTimedSessionHandler\s*\(/g) ?? [];
    assert.ok(helperMatches.length >= 2, `${relativePath}: expected timed session helper usage`);

    const rawSetHandlerMatches = source.match(/\bsession\.setHandler\s*\(/g) ?? [];
    assert.equal(
      rawSetHandlerMatches.length,
      1,
      `${relativePath}: raw session.setHandler should only exist inside timed helper`,
    );

    assert.doesNotMatch(
      source,
      /\bsession\.emit\s*\(\s*['"]list_devices['"]/,
      `${relativePath}: do not emit list_devices directly from driver`,
    );
  }
});

test('driver session handler inventory matches active panel contracts', () => {
  const expectedByDriver = {
    'drivers/bridge/driver.ts': [
      'list_devices',
      'bridge_config:get_context',
      'bridge_config:save_settings',
      'bridge_tools:get_snapshot',
      'bridge_tools:refresh',
    ],
    'drivers/node/driver.ts': [
      'list_devices',
      'device_tools:get_snapshot',
      'device_tools:refresh',
      'device_tools:execute_action',
    ],
  };

  for (const [relativePath, expectedEvents] of Object.entries(expectedByDriver)) {
    const source = readFile(relativePath);
    const actualEvents = collectTimedSessionEvents(source);
    assert.deepEqual(
      actualEvents.sort(),
      [...expectedEvents].sort(),
      `${relativePath}: timed session handler events drifted from active panel contracts`,
    );
  }
});

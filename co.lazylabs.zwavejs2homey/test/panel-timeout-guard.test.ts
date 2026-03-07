const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

test('panel scripts wrap Homey.emit calls with emitWithTimeout helper', () => {
  const pageFiles = [
    'drivers/bridge/pair/bridge_config.page.ts',
    'drivers/node/pair/import_summary.page.ts',
    'drivers/bridge/repair/bridge_tools.page.ts',
    'drivers/node/repair/device_tools.page.ts',
  ];

  for (const relativePath of pageFiles) {
    const source = readFile(relativePath);
    assert.match(source, /async function emitWithTimeout\s*\(/, `${relativePath}: missing helper`);
    const rawEmitCalls = source.match(/\bHomey\.emit\s*\(/g) ?? [];
    assert.equal(
      rawEmitCalls.length,
      1,
      `${relativePath}: Homey.emit should only appear inside emitWithTimeout`,
    );
  }
});

test('settings page wraps Homey.api calls with apiRequestWithTimeout helper', () => {
  const relativePath = 'settings/settings.page.ts';
  const source = readFile(relativePath);
  assert.match(
    source,
    /async function apiRequestWithTimeout\s*\(/,
    `${relativePath}: missing api timeout helper`,
  );
  const rawApiCalls = source.match(/\bhomey\.api\s*\(/g) ?? [];
  assert.equal(
    rawApiCalls.length,
    1,
    `${relativePath}: homey.api should only appear inside apiRequestWithTimeout`,
  );

  assert.match(
    source,
    /const bridgeFilter = mustElement<HTMLSelectElement>\('bridgeFilter'\)/,
    `${relativePath}: missing bridge scope selector wiring`,
  );
  assert.match(
    source,
    /\/runtime\/diagnostics\$\{query\}/,
    `${relativePath}: diagnostics request should support scoped query`,
  );
  assert.match(
    source,
    /\/runtime\/support-bundle\$\{query\}/,
    `${relativePath}: support bundle request should support scoped query`,
  );
  assert.match(
    source,
    /requestOrderGate\.begin\(REQUEST_CHANNEL_DIAGNOSTICS\)/,
    `${relativePath}: diagnostics path should start request-order ticket`,
  );
  assert.match(
    source,
    /requestOrderGate\.isCurrent\(REQUEST_CHANNEL_DIAGNOSTICS,\s*requestTicket\)/,
    `${relativePath}: diagnostics path should ignore stale responses`,
  );
  assert.match(
    source,
    /requestOrderGate\.begin\(REQUEST_CHANNEL_INVENTORY\)/,
    `${relativePath}: inventory path should start request-order ticket`,
  );
  assert.match(
    source,
    /requestOrderGate\.isCurrent\(REQUEST_CHANNEL_INVENTORY,\s*requestTicket\)/,
    `${relativePath}: inventory path should ignore stale responses`,
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

test('driver session handlers are registered through timed helper', () => {
  const driverFiles = ['drivers/bridge/driver.ts', 'drivers/node/driver.ts'];

  for (const relativePath of driverFiles) {
    const source = readFile(relativePath);
    const helperMatches = source.match(/registerTimedSessionHandler\s*\(/g) ?? [];
    assert.ok(helperMatches.length >= 2, `${relativePath}: expected timed session helper usage`);

    const rawSetHandlerMatches = source.match(/\bsession\.setHandler\s*\(/g) ?? [];
    assert.equal(
      rawSetHandlerMatches.length,
      1,
      `${relativePath}: raw session.setHandler should only exist inside timed helper`,
    );
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

const RUNTIME_ENTRYPOINT_FILES = [
  'app.js',
  'drivers/bridge/driver.js',
  'drivers/bridge/device.js',
  'drivers/node/driver.js',
  'drivers/node/device.js',
];

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('homey runtime js entrypoints are committed and synced with build output', () => {
  const packageJsonPath = path.join(appRoot, 'package.json');
  const packageJson = JSON.parse(readUtf8(packageJsonPath));
  assert.match(
    packageJson.scripts?.build ?? '',
    /sync-runtime-js\.mjs/,
    'Expected package build script to run scripts/sync-runtime-js.mjs',
  );

  for (const relativePath of RUNTIME_ENTRYPOINT_FILES) {
    const sourcePath = path.join(appRoot, relativePath);
    const homeyBuildPath = path.join(appRoot, '.homeybuild', relativePath);

    assert.ok(
      fs.existsSync(sourcePath),
      `Missing runtime entrypoint in app source: ${relativePath}`,
    );
    assert.ok(
      fs.existsSync(homeyBuildPath),
      `Missing runtime entrypoint in .homeybuild output: ${relativePath}`,
    );

    assert.equal(
      readUtf8(sourcePath),
      readUtf8(homeyBuildPath),
      `Runtime entrypoint out of sync: ${relativePath}. Run npm run build in the Homey app package.`,
    );
  }
});

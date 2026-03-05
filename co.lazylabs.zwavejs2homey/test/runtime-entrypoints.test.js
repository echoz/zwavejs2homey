const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = new Set(['.homeybuild', 'node_modules', 'test', 'vendor']);

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function collectRuntimeTsFiles(currentDir, relativeDir = '') {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...collectRuntimeTsFiles(absolutePath, relativePath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    files.push(relativePath);
  }
  return files;
}

test('homey runtime js entrypoints are committed and synced with build output', () => {
  const packageJsonPath = path.join(appRoot, 'package.json');
  const packageJson = JSON.parse(readUtf8(packageJsonPath));
  assert.match(
    packageJson.scripts?.build ?? '',
    /sync-runtime-js\.mjs/,
    'Expected package build script to run scripts/sync-runtime-js.mjs',
  );

  const runtimeTsFiles = collectRuntimeTsFiles(appRoot);
  assert.ok(runtimeTsFiles.length > 0, 'Expected at least one runtime TypeScript source file.');

  for (const relativeTsPath of runtimeTsFiles) {
    const relativeJsPath = relativeTsPath.replace(/\.ts$/u, '.js');
    const sourcePath = path.join(appRoot, relativeJsPath);
    const homeyBuildPath = path.join(appRoot, '.homeybuild', relativeJsPath);

    assert.ok(
      fs.existsSync(sourcePath),
      `Missing runtime JS artifact in app source: ${relativeJsPath}`,
    );
    assert.ok(
      fs.existsSync(homeyBuildPath),
      `Missing runtime JS artifact in .homeybuild output: ${relativeJsPath}`,
    );

    assert.equal(
      readUtf8(sourcePath),
      readUtf8(homeyBuildPath),
      `Runtime entrypoint out of sync: ${relativeJsPath}. Run npm run build in the Homey app package.`,
    );
  }
});

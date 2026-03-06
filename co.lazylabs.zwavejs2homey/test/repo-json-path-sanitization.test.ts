const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');

function listRepoJsonFiles() {
  const results = [];
  const skipDirNames = new Set(['.git', 'node_modules', '.homeybuild']);
  const skipPrefixes = ['docs/external/'];

  function walk(relativeDir) {
    const absoluteDir = path.join(REPO_ROOT, relativeDir);
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (skipPrefixes.some((prefix) => relativePath.startsWith(prefix))) continue;
      if (entry.isDirectory()) {
        if (skipDirNames.has(entry.name)) continue;
        walk(relativePath);
        continue;
      }
      if (entry.isFile() && relativePath.endsWith('.json')) {
        results.push(relativePath);
      }
    }
  }

  walk('');
  return results;
}

function findAbsolutePathStrings(value, pointer = '$', matches = []) {
  if (typeof value === 'string') {
    const isPosixUserPath = value.startsWith('/home/') || value.startsWith('/Users/');
    const isWindowsPath = /^[A-Za-z]:\\/.test(value);
    if (isPosixUserPath || isWindowsPath) {
      matches.push({ pointer, value });
    }
    return matches;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      findAbsolutePathStrings(value[index], `${pointer}[${index}]`, matches);
    }
    return matches;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      findAbsolutePathStrings(nested, `${pointer}.${key}`, matches);
    }
  }
  return matches;
}

test('tracked JSON files do not contain machine-specific absolute paths', () => {
  const violations = [];
  const trackedJsonFiles = listRepoJsonFiles();

  for (const relativePath of trackedJsonFiles) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue;
    }
    const matches = findAbsolutePathStrings(parsed);
    for (const match of matches) {
      violations.push({
        filePath: relativePath,
        pointer: match.pointer,
        value: match.value,
      });
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found machine-specific absolute paths in tracked JSON files: ${violations
      .slice(0, 10)
      .map((entry) => `${entry.filePath}:${entry.pointer}=${entry.value}`)
      .join(', ')}`,
  );
});

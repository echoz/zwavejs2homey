const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function collectHtmlFiles(currentDir, relativeDir = '') {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'test' || entry.name === 'vendor') {
        continue;
      }
      files.push(...collectHtmlFiles(absolutePath, relativePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(relativePath);
    }
  }
  return files;
}

function collectLocalScriptRefs(htmlSource) {
  const refs = [];
  const scriptTagPattern = /<script[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gim;
  let match;
  while ((match = scriptTagPattern.exec(htmlSource)) !== null) {
    const src = match[1];
    if (src.startsWith('./')) refs.push(src);
  }
  return refs;
}

test('browser-loaded page scripts do not contain CommonJS prelude', () => {
  const htmlFiles = collectHtmlFiles(appRoot);
  assert.ok(htmlFiles.length > 0, 'Expected at least one HTML file.');

  const checkedScripts = new Set();

  for (const htmlRelativePath of htmlFiles) {
    const htmlAbsolutePath = path.join(appRoot, htmlRelativePath);
    const htmlSource = readUtf8(htmlAbsolutePath);
    const scriptRefs = collectLocalScriptRefs(htmlSource);
    for (const scriptRef of scriptRefs) {
      const scriptAbsolutePath = path.resolve(path.dirname(htmlAbsolutePath), scriptRef);
      const scriptRelativePath = path.relative(appRoot, scriptAbsolutePath);
      assert.ok(
        fs.existsSync(scriptAbsolutePath),
        `Missing browser script referenced by ${htmlRelativePath}: ${scriptRef}`,
      );
      if (checkedScripts.has(scriptRelativePath)) continue;
      checkedScripts.add(scriptRelativePath);

      const scriptSource = readUtf8(scriptAbsolutePath);
      assert.ok(
        !/Object\.defineProperty\(exports,\s*"__esModule"/u.test(scriptSource),
        `Browser script should not include CommonJS exports prelude: ${scriptRelativePath}`,
      );
      assert.ok(
        !/\bexports\./u.test(scriptSource),
        `Browser script should not reference CommonJS exports object: ${scriptRelativePath}`,
      );
    }
  }

  assert.ok(checkedScripts.size > 0, 'Expected at least one browser script to validate.');
});

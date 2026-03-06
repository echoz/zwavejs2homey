import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = new Set(['.homeybuild', 'node_modules', 'test', 'vendor']);
const BROWSER_SCRIPT_TAG_PATTERN = /<script[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gim;
const COMMONJS_ESMODULE_PRELUDE =
  /^"use strict";\s*[\r\n]+Object\.defineProperty\(exports,\s*"__esModule",\s*\{\s*value:\s*true\s*\}\);\s*[\r\n]*/u;

async function collectRuntimeTsFiles(currentDir, relativeDir = '') {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const nested = await collectRuntimeTsFiles(absolutePath, relativePath);
      files.push(...nested);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    files.push(relativePath);
  }

  return files;
}

const runtimeTsFiles = await collectRuntimeTsFiles(appRoot);

const entries = runtimeTsFiles.map((relativeTsPath) => {
  const relativeJsPath = relativeTsPath.replace(/\.ts$/u, '.js');
  return {
    from: path.join(appRoot, '.homeybuild', relativeJsPath),
    to: path.join(appRoot, relativeJsPath),
  };
});

for (const entry of entries) {
  await fs.access(entry.from);
  await fs.copyFile(entry.from, entry.to);
}

async function collectHtmlFiles(currentDir, relativeDir = '') {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const nested = await collectHtmlFiles(absolutePath, relativePath);
      files.push(...nested);
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
  let match;
  while ((match = BROWSER_SCRIPT_TAG_PATTERN.exec(htmlSource)) !== null) {
    const src = match[1];
    if (src.startsWith('./')) refs.push(src);
  }
  return refs;
}

async function collectBrowserScriptRelativePaths() {
  const htmlFiles = await collectHtmlFiles(appRoot);
  const results = new Set();
  for (const htmlRelativePath of htmlFiles) {
    const htmlAbsolutePath = path.join(appRoot, htmlRelativePath);
    const htmlSource = await fs.readFile(htmlAbsolutePath, 'utf8');
    const refs = collectLocalScriptRefs(htmlSource);
    for (const scriptRef of refs) {
      const scriptAbsolutePath = path.resolve(path.dirname(htmlAbsolutePath), scriptRef);
      const scriptRelativePath = path.relative(appRoot, scriptAbsolutePath);
      results.add(scriptRelativePath);
    }
  }
  return [...results];
}

function sanitizeBrowserScriptSource(source) {
  return source.replace(COMMONJS_ESMODULE_PRELUDE, '');
}

const browserScriptRelativePaths = await collectBrowserScriptRelativePaths();
for (const relativePath of browserScriptRelativePaths) {
  for (const baseDir of [appRoot, path.join(appRoot, '.homeybuild')]) {
    const scriptPath = path.join(baseDir, relativePath);
    try {
      const source = await fs.readFile(scriptPath, 'utf8');
      const sanitized = sanitizeBrowserScriptSource(source);
      if (sanitized !== source) {
        await fs.writeFile(scriptPath, sanitized, 'utf8');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }
}

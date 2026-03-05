import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = new Set(['.homeybuild', 'node_modules', 'test', 'vendor']);

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

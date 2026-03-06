import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function toRepoRelativePath(filePath, repoRoot = REPO_ROOT) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) return relative;
  return filePath;
}

export function sanitizeRepoAbsolutePathString(value, repoRoot = REPO_ROOT) {
  if (typeof value !== 'string') return value;
  if (value === repoRoot) return '.';

  const repoRootPrefix = `${repoRoot}${path.sep}`;
  if (value.startsWith(repoRootPrefix)) {
    return toRepoRelativePath(value, repoRoot);
  }

  return value;
}

export function sanitizeJsonPathsForRepo(value, repoRoot = REPO_ROOT) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonPathsForRepo(entry, repoRoot));
  }
  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const [key, entryValue] of Object.entries(value)) {
      sanitized[key] = sanitizeJsonPathsForRepo(entryValue, repoRoot);
    }
    return sanitized;
  }
  return sanitizeRepoAbsolutePathString(value, repoRoot);
}

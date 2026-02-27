import fs from 'node:fs';
import path from 'node:path';

export interface WorkspaceFileService {
  resolveAllowedProductRulePath(filePath: string): string;
  writeJsonFile(filePath: string, payload: Record<string, unknown>): void;
}

function ensureInsideDirectory(filePath: string, allowedDir: string): void {
  const normalized = path.resolve(filePath);
  const allowed = path.resolve(allowedDir);
  const relative = path.relative(allowed, normalized);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`File path must be under ${allowed}`);
  }
}

export class WorkspaceFileServiceImpl implements WorkspaceFileService {
  private readonly allowedRoot: string;

  constructor(allowedRoot = path.resolve(process.cwd(), 'rules/project/product')) {
    this.allowedRoot = allowedRoot;
  }

  resolveAllowedProductRulePath(filePath: string): string {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.allowedRoot, filePath);
    ensureInsideDirectory(resolved, this.allowedRoot);
    return resolved;
  }

  writeJsonFile(filePath: string, payload: Record<string, unknown>): void {
    const resolved = this.resolveAllowedProductRulePath(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
}

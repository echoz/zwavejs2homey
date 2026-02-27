import fs from 'node:fs';
import path from 'node:path';

export interface WorkspaceFileService {
  resolveAllowedProductRulePath(filePath: string): string;
  writeJsonFile(filePath: string, payload: Record<string, unknown>): void;
  addProductRuleToManifest(
    manifestFile: string,
    productRuleFilePath: string,
  ): {
    manifestFile: string;
    entryFilePath: string;
    updated: boolean;
  };
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

  addProductRuleToManifest(
    manifestFile: string,
    productRuleFilePath: string,
  ): {
    manifestFile: string;
    entryFilePath: string;
    updated: boolean;
  } {
    const resolvedManifestFile = path.resolve(manifestFile);
    const resolvedRuleFile = this.resolveAllowedProductRulePath(productRuleFilePath);
    if (!fs.existsSync(resolvedManifestFile)) {
      throw new Error(`Manifest file not found: ${resolvedManifestFile}`);
    }

    const raw = JSON.parse(fs.readFileSync(resolvedManifestFile, 'utf8'));
    if (!Array.isArray(raw)) {
      throw new Error('Manifest JSON must be an array');
    }

    const manifestDir = path.dirname(resolvedManifestFile);
    const relativePath = path.relative(manifestDir, resolvedRuleFile).split(path.sep).join('/');
    const existing = raw.find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        entry.filePath === relativePath,
    );

    if (existing && existing.layer !== 'project-product') {
      throw new Error(
        `Manifest entry "${relativePath}" already exists with non-project-product layer`,
      );
    }
    if (existing) {
      return {
        manifestFile: resolvedManifestFile,
        entryFilePath: relativePath,
        updated: false,
      };
    }

    raw.push({
      filePath: relativePath,
      layer: 'project-product',
    });
    fs.writeFileSync(resolvedManifestFile, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    return {
      manifestFile: resolvedManifestFile,
      entryFilePath: relativePath,
      updated: true,
    };
  }
}

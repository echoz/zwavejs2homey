import fs from 'node:fs';
import path from 'node:path';

import type { RuleDetail, RuleSummary } from '../model/types';

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
  listManifestRules(manifestFile: string): RuleSummary[];
  readManifestRule(manifestFile: string, ruleIndex: number): RuleDetail;
  resolveManifestFile(manifestFile?: string): string;
}

function ensureInsideDirectory(filePath: string, allowedDir: string): void {
  const normalized = path.resolve(filePath);
  const allowed = path.resolve(allowedDir);
  const relative = path.relative(allowed, normalized);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`File path must be under ${allowed}`);
  }
}

function normalizeRuleSignature(content: unknown): string | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const target = (content as Record<string, unknown>).target;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return null;
  const manufacturerId = Number((target as Record<string, unknown>).manufacturerId);
  const productType = Number((target as Record<string, unknown>).productType);
  const productId = Number((target as Record<string, unknown>).productId);
  if (
    !Number.isInteger(manufacturerId) ||
    !Number.isInteger(productType) ||
    !Number.isInteger(productId)
  ) {
    return null;
  }
  return `${manufacturerId}:${productType}:${productId}`;
}

function toRuleSummary(
  manifestFile: string,
  manifestDir: string,
  entry: Record<string, unknown>,
  index: number,
): RuleSummary {
  const filePath = typeof entry.filePath === 'string' ? entry.filePath : '';
  const layer = typeof entry.layer === 'string' ? entry.layer : '';
  const absoluteFilePath = path.resolve(manifestDir, filePath);
  if (!filePath || !layer) {
    return {
      index: index + 1,
      filePath: filePath || '<missing>',
      layer: layer || '<missing>',
      name: null,
      signature: null,
      ruleCount: 0,
      exists: false,
      loadError: `Invalid manifest entry in ${manifestFile}`,
    };
  }
  if (!fs.existsSync(absoluteFilePath)) {
    return {
      index: index + 1,
      filePath,
      layer,
      name: null,
      signature: null,
      ruleCount: 0,
      exists: false,
      loadError: 'Rule file not found',
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(absoluteFilePath, 'utf8'));
    const name = typeof raw?.name === 'string' ? raw.name : null;
    const signature = normalizeRuleSignature(raw);
    const rules = Array.isArray(raw?.rules) ? raw.rules : [];
    return {
      index: index + 1,
      filePath,
      layer,
      name,
      signature,
      ruleCount: rules.length,
      exists: true,
    };
  } catch (error) {
    return {
      index: index + 1,
      filePath,
      layer,
      name: null,
      signature: null,
      ruleCount: 0,
      exists: true,
      loadError: error instanceof Error ? error.message : String(error),
    };
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

  resolveManifestFile(manifestFile = 'rules/manifest.json'): string {
    return path.resolve(manifestFile);
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

  listManifestRules(manifestFile: string): RuleSummary[] {
    const resolvedManifestFile = this.resolveManifestFile(manifestFile);
    if (!fs.existsSync(resolvedManifestFile)) {
      throw new Error(`Manifest file not found: ${resolvedManifestFile}`);
    }
    const raw = JSON.parse(fs.readFileSync(resolvedManifestFile, 'utf8'));
    if (!Array.isArray(raw)) {
      throw new Error('Manifest JSON must be an array');
    }
    const manifestDir = path.dirname(resolvedManifestFile);
    return raw
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry, index) =>
        toRuleSummary(resolvedManifestFile, manifestDir, entry as Record<string, unknown>, index),
      );
  }

  readManifestRule(manifestFile: string, ruleIndex: number): RuleDetail {
    const rules = this.listManifestRules(manifestFile);
    const selected = rules.find((item) => item.index === ruleIndex);
    if (!selected) {
      throw new Error(`Rule index ${ruleIndex} is out of range`);
    }
    const resolvedManifestFile = this.resolveManifestFile(manifestFile);
    const absoluteFilePath = path.resolve(path.dirname(resolvedManifestFile), selected.filePath);
    if (!fs.existsSync(absoluteFilePath)) {
      return {
        ...selected,
        manifestFile: resolvedManifestFile,
        absoluteFilePath,
        content: null,
      };
    }
    const content = JSON.parse(fs.readFileSync(absoluteFilePath, 'utf8'));
    return {
      ...selected,
      manifestFile: resolvedManifestFile,
      absoluteFilePath,
      content: content && typeof content === 'object' && !Array.isArray(content) ? content : null,
    };
  }
}

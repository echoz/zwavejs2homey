declare const require: (id: string) => unknown;

const fs = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
};

import type { MappingRule } from '../rules/types';
import { loadHaDerivedGeneratedRuleArtifact } from '../importers/ha/generated-rule-artifact';
import {
  RuleFileLoadError,
  type RuleValidationOptions,
  validateJsonRuleArray,
  validateJsonRuleArrayWithOptions,
} from './rule-validation';
import { getRuleLayerOrder } from './layer-semantics';

export class RuleSetLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleSetLoadError';
  }
}

export interface RuleSetManifestEntry {
  filePath: string;
  layer?: MappingRule['layer'];
  kind?: 'rules-json' | 'ha-derived-generated';
}

export interface LoadedRuleFile {
  filePath: string;
  rules: MappingRule[];
}

export interface LoadedRuleSetManifest {
  entries: Array<
    LoadedRuleFile & {
      declaredLayer?: MappingRule['layer'];
      resolvedLayer?: MappingRule['layer'];
    }
  >;
  duplicateRuleIds: string[];
}

interface ProductRulesBundleV1Target {
  manufacturerId: number;
  productType: number;
  productId: number;
}

interface ProductRulesBundleV1 {
  schemaVersion: 'product-rules/v1';
  name?: string;
  target: ProductRulesBundleV1Target;
  rules: unknown[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseProductRulesBundleV1(
  parsed: unknown,
  filePath: string,
  options?: RuleValidationOptions,
): MappingRule[] {
  if (!isObject(parsed)) {
    throw new RuleFileLoadError('product-rules/v1 file must be a JSON object', filePath);
  }

  if (options?.declaredLayer && options.declaredLayer !== 'project-product') {
    throw new RuleFileLoadError(
      `product-rules/v1 file can only be loaded with manifest layer "project-product" (got "${options.declaredLayer}")`,
      filePath,
    );
  }

  const allowedTopLevelKeys = new Set(['schemaVersion', 'name', 'target', 'rules']);
  for (const key of Object.keys(parsed)) {
    if (!allowedTopLevelKeys.has(key)) {
      throw new RuleFileLoadError(
        `product-rules/v1 file has unsupported top-level field "${key}"`,
        filePath,
      );
    }
  }

  if (parsed.schemaVersion !== 'product-rules/v1') {
    throw new RuleFileLoadError('schemaVersion must be "product-rules/v1"', filePath);
  }
  if (
    parsed.name !== undefined &&
    (typeof parsed.name !== 'string' || parsed.name.trim().length === 0)
  ) {
    throw new RuleFileLoadError(
      'product-rules/v1 name must be a non-empty string when provided',
      filePath,
    );
  }

  const target = parsed.target;
  if (!isObject(target)) {
    throw new RuleFileLoadError('product-rules/v1 target must be an object', filePath);
  }
  for (const key of Object.keys(target)) {
    if (!['manufacturerId', 'productType', 'productId'].includes(key)) {
      throw new RuleFileLoadError(
        `product-rules/v1 target has unsupported field "${key}"`,
        filePath,
      );
    }
  }

  const hasValidTargetId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;

  if (!hasValidTargetId(target.manufacturerId)) {
    throw new RuleFileLoadError(
      'product-rules/v1 target.manufacturerId must be a non-negative integer',
      filePath,
    );
  }
  if (!hasValidTargetId(target.productType)) {
    throw new RuleFileLoadError(
      'product-rules/v1 target.productType must be a non-negative integer',
      filePath,
    );
  }
  if (!hasValidTargetId(target.productId)) {
    throw new RuleFileLoadError(
      'product-rules/v1 target.productId must be a non-negative integer',
      filePath,
    );
  }

  if (!Array.isArray(parsed.rules)) {
    throw new RuleFileLoadError('product-rules/v1 rules must be an array', filePath);
  }

  const expandedRules = parsed.rules.map((rule, index) => {
    if (!isObject(rule)) {
      throw new RuleFileLoadError(`product-rules/v1 rules[${index}] must be an object`, filePath);
    }
    if (rule.layer !== undefined) {
      throw new RuleFileLoadError(
        `product-rules/v1 rules[${index}] must not define layer`,
        filePath,
      );
    }
    if (rule.device !== undefined) {
      throw new RuleFileLoadError(
        `product-rules/v1 rules[${index}] must not define device`,
        filePath,
      );
    }
    return {
      ...rule,
      layer: 'project-product',
      device: {
        manufacturerId: [target.manufacturerId],
        productType: [target.productType],
        productId: [target.productId],
      },
    };
  });

  return validateJsonRuleArray(expandedRules, filePath);
}

export function loadJsonRuleFile(filePath: string, options?: RuleValidationOptions): MappingRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse/read error';
    throw new RuleFileLoadError(`Failed to read or parse JSON rule file: ${message}`, filePath);
  }

  if (isObject(parsed) && parsed.schemaVersion === 'product-rules/v1') {
    return parseProductRulesBundleV1(parsed, filePath, options);
  }

  if (options?.declaredLayer === 'project-product') {
    throw new RuleFileLoadError(
      'Manifest layer "project-product" requires schemaVersion "product-rules/v1" bundle files',
      filePath,
    );
  }

  if (options?.declaredLayer) {
    return validateJsonRuleArrayWithOptions(parsed, filePath, options);
  }
  return validateJsonRuleArray(parsed, filePath, options);
}

export function loadJsonRuleFiles(filePaths: string[]): LoadedRuleFile[] {
  return filePaths.map((filePath) => ({ filePath, rules: loadJsonRuleFile(filePath) }));
}

export function loadJsonRuleSetManifest(entries: RuleSetManifestEntry[]): LoadedRuleSetManifest {
  return loadJsonRuleSetManifestWithOptions(entries);
}

export function loadJsonRuleSetManifestWithOptions(
  entries: RuleSetManifestEntry[],
  options?: RuleValidationOptions,
): LoadedRuleSetManifest {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new RuleSetLoadError('Manifest must include at least one entry');
  }

  const seenFilePaths = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (typeof entry.filePath !== 'string' || entry.filePath.length === 0) {
      throw new RuleSetLoadError(`Manifest entry ${index} requires a non-empty filePath`);
    }
    if (seenFilePaths.has(entry.filePath)) {
      throw new RuleSetLoadError(
        `Duplicate manifest filePath detected at entry ${index}: ${entry.filePath}`,
      );
    }
    seenFilePaths.add(entry.filePath);
  }

  for (const [index, entry] of entries.entries()) {
    if (
      entry.kind !== undefined &&
      entry.kind !== 'rules-json' &&
      entry.kind !== 'ha-derived-generated'
    ) {
      throw new RuleSetLoadError(
        `Manifest entry ${index} has unsupported kind "${String(entry.kind)}"`,
      );
    }
  }

  const layerOrder = getRuleLayerOrder();
  let previousDeclaredLayerIndex = -1;
  for (const [index, entry] of entries.entries()) {
    if (!entry.layer) continue;
    const currentLayerIndex = layerOrder.indexOf(entry.layer);
    if (currentLayerIndex === -1) {
      throw new RuleSetLoadError(
        `Manifest entry ${index} has unsupported layer "${String(entry.layer)}"`,
      );
    }
    if (currentLayerIndex < previousDeclaredLayerIndex) {
      throw new RuleSetLoadError(
        `Manifest entry ${index} layer "${entry.layer}" is out of order; expected non-decreasing layer order ${layerOrder.join(' -> ')}`,
      );
    }
    previousDeclaredLayerIndex = currentLayerIndex;
  }

  const loaded: LoadedRuleSetManifest['entries'] = entries.map((entry) => ({
    filePath: entry.filePath,
    declaredLayer: entry.layer,
    resolvedLayer: undefined,
    rules:
      entry.kind === 'ha-derived-generated'
        ? loadHaDerivedGeneratedRuleArtifact(entry.filePath).rules
        : loadJsonRuleFile(entry.filePath, {
            declaredLayer: entry.layer,
            vocabulary: options?.vocabulary,
          }),
  }));

  const ruleIdCounts = new Map<string, number>();

  for (const file of loaded) {
    const layersInFile = new Set<MappingRule['layer']>();
    for (const rule of file.rules) {
      if (file.declaredLayer && rule.layer !== file.declaredLayer) {
        throw new RuleSetLoadError(
          `Rule "${rule.ruleId}" in ${file.filePath} has layer "${rule.layer}" but manifest declares "${file.declaredLayer}"`,
        );
      }
      if (!layerOrder.includes(rule.layer)) {
        throw new RuleSetLoadError(
          `Rule "${rule.ruleId}" has unsupported layer "${String(rule.layer)}"`,
        );
      }
      layersInFile.add(rule.layer);
      ruleIdCounts.set(rule.ruleId, (ruleIdCounts.get(rule.ruleId) ?? 0) + 1);
    }
    if (layersInFile.size === 1) {
      file.resolvedLayer = [...layersInFile][0];
    }
  }

  const duplicateRuleIds = [...ruleIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ruleId]) => ruleId)
    .sort();

  if (duplicateRuleIds.length > 0) {
    throw new RuleSetLoadError(`Duplicate ruleId(s) detected: ${duplicateRuleIds.join(', ')}`);
  }

  return {
    entries: loaded,
    duplicateRuleIds,
  };
}

export { RuleFileLoadError, validateJsonRuleArray } from './rule-validation';

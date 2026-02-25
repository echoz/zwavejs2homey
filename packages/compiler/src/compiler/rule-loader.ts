declare const require: (id: string) => unknown;

const fs = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
};

import type { MappingRule } from '../rules/types';
import { loadHaDerivedGeneratedRuleArtifact } from '../importers/ha/generated-rule-artifact';
import { RuleFileLoadError, validateJsonRuleArray } from './rule-validation';
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

export function loadJsonRuleFile(filePath: string): MappingRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse/read error';
    throw new RuleFileLoadError(`Failed to read or parse JSON rule file: ${message}`, filePath);
  }

  return validateJsonRuleArray(parsed, filePath);
}

export function loadJsonRuleFiles(filePaths: string[]): LoadedRuleFile[] {
  return filePaths.map((filePath) => ({ filePath, rules: loadJsonRuleFile(filePath) }));
}

export function loadJsonRuleSetManifest(entries: RuleSetManifestEntry[]): LoadedRuleSetManifest {
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
        : loadJsonRuleFile(entry.filePath),
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

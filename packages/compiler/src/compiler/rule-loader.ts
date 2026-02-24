declare const require: (id: string) => unknown;

const fs = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
};

import type { MappingRule } from '../rules/types';
import { getRuleLayerOrder } from './layer-semantics';

export class RuleFileLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(message);
    this.name = 'RuleFileLoadError';
  }
}

export class RuleSetLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleSetLoadError';
  }
}

export interface RuleSetManifestEntry {
  filePath: string;
  layer?: MappingRule['layer'];
}

export interface LoadedRuleFile {
  filePath: string;
  rules: MappingRule[];
}

export interface LoadedRuleSetManifest {
  entries: Array<
    LoadedRuleFile & {
      declaredLayer?: MappingRule['layer'];
    }
  >;
  duplicateRuleIds: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidRuleActionShape(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (value.type === 'capability') {
    return typeof value.capabilityId === 'string';
  }
  return value.type === 'ignore-value';
}

function validateRuleShape(
  rule: unknown,
  filePath: string,
  index: number,
): asserts rule is MappingRule {
  if (!isObject(rule)) {
    throw new RuleFileLoadError(`Rule at index ${index} must be an object`, filePath);
  }
  if (typeof rule.ruleId !== 'string' || rule.ruleId.length === 0) {
    throw new RuleFileLoadError(`Rule at index ${index} is missing a valid ruleId`, filePath);
  }
  if (
    rule.layer !== 'ha-derived' &&
    rule.layer !== 'project-product' &&
    rule.layer !== 'project-generic'
  ) {
    throw new RuleFileLoadError(
      `Rule "${String(rule.ruleId)}" has invalid layer "${String(rule.layer)}"`,
      filePath,
    );
  }
  if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
    throw new RuleFileLoadError(
      `Rule "${String(rule.ruleId)}" must define at least one action`,
      filePath,
    );
  }
  for (const [actionIndex, action] of rule.actions.entries()) {
    if (!isValidRuleActionShape(action)) {
      throw new RuleFileLoadError(
        `Rule "${String(rule.ruleId)}" has invalid action at index ${actionIndex}`,
        filePath,
      );
    }
  }
}

export function loadJsonRuleFile(filePath: string): MappingRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse/read error';
    throw new RuleFileLoadError(`Failed to read or parse JSON rule file: ${message}`, filePath);
  }

  if (!Array.isArray(parsed)) {
    throw new RuleFileLoadError('Rule file must contain a JSON array of rules', filePath);
  }

  parsed.forEach((rule, index) => validateRuleShape(rule, filePath, index));
  return parsed as MappingRule[];
}

export function loadJsonRuleFiles(filePaths: string[]): LoadedRuleFile[] {
  return filePaths.map((filePath) => ({ filePath, rules: loadJsonRuleFile(filePath) }));
}

export function loadJsonRuleSetManifest(entries: RuleSetManifestEntry[]): LoadedRuleSetManifest {
  const loaded = entries.map((entry) => ({
    filePath: entry.filePath,
    declaredLayer: entry.layer,
    rules: loadJsonRuleFile(entry.filePath),
  }));

  const layerOrder = getRuleLayerOrder();
  const ruleIdCounts = new Map<string, number>();

  for (const file of loaded) {
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
      ruleIdCounts.set(rule.ruleId, (ruleIdCounts.get(rule.ruleId) ?? 0) + 1);
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

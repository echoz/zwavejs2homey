declare const require: (id: string) => unknown;

const fs = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
};

import type { MappingRule } from '../rules/types';
import { loadHaDerivedGeneratedRuleArtifact } from '../importers/ha/generated-rule-artifact';
import {
  getRuleLayerOrder,
  isRuleActionModeAllowedForLayer,
  normalizeRuleActionMode,
} from './layer-semantics';

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
    }
  >;
  duplicateRuleIds: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidValueIdShape(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (typeof value.commandClass !== 'number') return false;
  if (!['string', 'number'].includes(typeof value.property)) return false;
  if (value.endpoint !== undefined && typeof value.endpoint !== 'number') return false;
  if (value.propertyKey !== undefined && !['string', 'number'].includes(typeof value.propertyKey)) {
    return false;
  }
  return true;
}

function validateRuleActionShape(
  action: unknown,
  filePath: string,
  ruleId: string,
  layer: MappingRule['layer'],
  actionIndex: number,
): void {
  if (!isObject(action) || typeof action.type !== 'string') {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" has invalid action at index ${actionIndex}`,
      filePath,
    );
  }

  const mode = normalizeRuleActionMode(
    action.mode === 'fill' || action.mode === 'augment' || action.mode === 'replace'
      ? action.mode
      : undefined,
  );
  if (!isRuleActionModeAllowedForLayer(layer, mode)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" action ${actionIndex} uses mode "${mode}" not allowed in layer "${layer}"`,
      filePath,
    );
  }

  if (action.type === 'capability') {
    if (typeof action.capabilityId !== 'string' || action.capabilityId.length === 0) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} requires a non-empty capabilityId`,
        filePath,
      );
    }
    return;
  }

  if (action.type === 'device-identity') {
    if (
      (typeof action.homeyClass !== 'string' || action.homeyClass.length === 0) &&
      (typeof action.driverTemplateId !== 'string' || action.driverTemplateId.length === 0)
    ) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" device-identity action ${actionIndex} must define homeyClass or driverTemplateId`,
        filePath,
      );
    }
    return;
  }

  if (action.type === 'ignore-value') {
    if (action.valueId !== undefined && !isValidValueIdShape(action.valueId)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" ignore-value action ${actionIndex} has invalid valueId shape`,
        filePath,
      );
    }
    return;
  }

  throw new RuleFileLoadError(
    `Rule "${ruleId}" has unsupported action type "${action.type}"`,
    filePath,
  );
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
    validateRuleActionShape(action, filePath, String(rule.ruleId), rule.layer, actionIndex);
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

  return validateJsonRuleArray(parsed, filePath);
}

export function loadJsonRuleFiles(filePaths: string[]): LoadedRuleFile[] {
  return filePaths.map((filePath) => ({ filePath, rules: loadJsonRuleFile(filePath) }));
}

export function validateJsonRuleArray(value: unknown, filePath: string): MappingRule[] {
  if (!Array.isArray(value)) {
    throw new RuleFileLoadError('Rule file must contain a JSON array of rules', filePath);
  }

  value.forEach((rule, index) => validateRuleShape(rule, filePath, index));
  return value as MappingRule[];
}

export function loadJsonRuleSetManifest(entries: RuleSetManifestEntry[]): LoadedRuleSetManifest {
  const loaded = entries.map((entry) => ({
    filePath: entry.filePath,
    declaredLayer: entry.layer,
    rules:
      entry.kind === 'ha-derived-generated'
        ? loadHaDerivedGeneratedRuleArtifact(entry.filePath).rules
        : loadJsonRuleFile(entry.filePath),
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

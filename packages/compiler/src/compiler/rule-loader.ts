declare const require: (id: string) => unknown;

const fs = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
};

import type { MappingRule } from '../rules/types';

export class RuleFileLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(message);
    this.name = 'RuleFileLoadError';
  }
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

export function loadJsonRuleFiles(
  filePaths: string[],
): Array<{ filePath: string; rules: MappingRule[] }> {
  return filePaths.map((filePath) => ({ filePath, rules: loadJsonRuleFile(filePath) }));
}

import type { MappingRule } from '../rules/types';
import { isRuleActionModeAllowedForLayer, normalizeRuleActionMode } from './layer-semantics';

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

  const requestedMode =
    action.mode === 'fill' || action.mode === 'augment' || action.mode === 'replace'
      ? action.mode
      : undefined;
  const mode =
    action.type === 'remove-capability'
      ? (requestedMode ?? 'replace')
      : normalizeRuleActionMode(requestedMode);

  if (
    action.type === 'remove-capability' &&
    requestedMode !== undefined &&
    requestedMode !== 'replace'
  ) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" remove-capability action ${actionIndex} only supports mode "replace"`,
      filePath,
    );
  }

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
    if (action.conflict !== undefined) {
      if (!isObject(action.conflict)) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} conflict must be an object`,
          filePath,
        );
      }
      if (typeof action.conflict.key !== 'string' || action.conflict.key.length === 0) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} conflict.key must be a non-empty string`,
          filePath,
        );
      }
      if (
        action.conflict.mode !== undefined &&
        action.conflict.mode !== 'exclusive' &&
        action.conflict.mode !== 'allow-multi'
      ) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} conflict.mode must be "exclusive" or "allow-multi"`,
          filePath,
        );
      }
      const priority = action.conflict.priority;
      if (
        priority !== undefined &&
        (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 0)
      ) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} conflict.priority must be a non-negative integer`,
          filePath,
        );
      }
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

  if (action.type === 'remove-capability') {
    if (typeof action.capabilityId !== 'string' || action.capabilityId.length === 0) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" remove-capability action ${actionIndex} requires a non-empty capabilityId`,
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

export function validateJsonRuleArray(value: unknown, filePath: string): MappingRule[] {
  if (!Array.isArray(value)) {
    throw new RuleFileLoadError('Rule file must contain a JSON array of rules', filePath);
  }

  value.forEach((rule, index) => validateRuleShape(rule, filePath, index));
  return value as MappingRule[];
}

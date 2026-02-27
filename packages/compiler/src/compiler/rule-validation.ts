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

export interface RuleValidationOptions {
  declaredLayer?: MappingRule['layer'];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isArrayOfNumbers(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'number')
  );
}

function isArrayOfNonEmptyStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.length > 0)
  );
}

function isArrayOfStringOrNumber(value: unknown): value is Array<string | number> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' || typeof item === 'number')
  );
}

function isArrayOfStringNumberOrNull(value: unknown): value is Array<string | number | null> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item === null || typeof item === 'string' || typeof item === 'number')
  );
}

function normalizeNumberList(value: unknown): number[] | undefined {
  if (typeof value === 'number') {
    return [value];
  }
  if (isArrayOfNumbers(value)) {
    return value;
  }
  return undefined;
}

function normalizeNonEmptyStringList(value: unknown): string[] | undefined {
  if (isNonEmptyString(value)) {
    return [value];
  }
  if (isArrayOfNonEmptyStrings(value)) {
    return value;
  }
  return undefined;
}

function normalizeStringOrNumberList(value: unknown): Array<string | number> | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return [value];
  }
  if (isArrayOfStringOrNumber(value)) {
    return value;
  }
  return undefined;
}

function normalizeStringNumberOrNullList(
  value: unknown,
): Array<string | number | null> | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number') {
    return [value];
  }
  if (isArrayOfStringNumberOrNull(value)) {
    return value;
  }
  return undefined;
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

function validateDeviceMatcherShape(
  rule: Record<string, unknown>,
  filePath: string,
  ruleId: string,
): void {
  const device = rule.device;
  if (device === undefined) return;
  if (!isObject(device)) {
    throw new RuleFileLoadError(`Rule "${ruleId}" device matcher must be an object`, filePath);
  }

  const allowedKeys = new Set([
    'manufacturerId',
    'productType',
    'productId',
    'firmwareVersionRange',
    'deviceClassGeneric',
    'deviceClassSpecific',
  ]);
  for (const key of Object.keys(device)) {
    if (!allowedKeys.has(key)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" device matcher has unsupported field "${key}"`,
        filePath,
      );
    }
  }

  for (const key of ['manufacturerId', 'productType', 'productId'] as const) {
    const value = device[key];
    if (value === undefined) continue;
    const normalized = normalizeNumberList(value);
    if (!normalized) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" device.${key} must be a number or non-empty number array`,
        filePath,
      );
    }
    device[key] = normalized;
  }

  if (device.firmwareVersionRange !== undefined) {
    const range = device.firmwareVersionRange;
    if (!isObject(range)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" device.firmwareVersionRange must be an object`,
        filePath,
      );
    }
    for (const key of Object.keys(range)) {
      if (!['min', 'max'].includes(key)) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" device.firmwareVersionRange has unsupported field "${key}"`,
          filePath,
        );
      }
    }
    if (range.min !== undefined && !isNonEmptyString(range.min)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" device.firmwareVersionRange.min must be a non-empty string`,
        filePath,
      );
    }
    if (range.max !== undefined && !isNonEmptyString(range.max)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" device.firmwareVersionRange.max must be a non-empty string`,
        filePath,
      );
    }
  }

  for (const key of ['deviceClassGeneric', 'deviceClassSpecific'] as const) {
    const value = device[key];
    if (value === undefined) continue;
    const normalized = normalizeNonEmptyStringList(value);
    if (!normalized) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" device.${key} must be a string or non-empty string array`,
        filePath,
      );
    }
    device[key] = normalized;
  }
}

function validateValueMatcherShape(
  matcher: unknown,
  filePath: string,
  ruleId: string,
  label: string,
): void {
  if (!isObject(matcher)) {
    throw new RuleFileLoadError(`Rule "${ruleId}" ${label} must be an object`, filePath);
  }

  const allowedKeys = new Set([
    'commandClass',
    'endpoint',
    'property',
    'propertyKey',
    'notPropertyKey',
    'metadataType',
    'readable',
    'writeable',
  ]);
  for (const key of Object.keys(matcher)) {
    if (!allowedKeys.has(key)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" ${label} has unsupported field "${key}"`,
        filePath,
      );
    }
  }

  if (matcher.commandClass !== undefined) {
    const normalized = normalizeNumberList(matcher.commandClass);
    if (!normalized) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" ${label}.commandClass must be a number or non-empty number array`,
        filePath,
      );
    }
    matcher.commandClass = normalized;
  }
  if (matcher.endpoint !== undefined) {
    const normalized = normalizeNumberList(matcher.endpoint);
    if (!normalized) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" ${label}.endpoint must be a number or non-empty number array`,
        filePath,
      );
    }
    matcher.endpoint = normalized;
  }
  if (matcher.property !== undefined) {
    const normalized = normalizeStringOrNumberList(matcher.property);
    if (!normalized) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" ${label}.property must be a string/number or non-empty string/number array`,
        filePath,
      );
    }
    matcher.property = normalized;
  }
  if (matcher.propertyKey !== undefined) {
    const normalized = normalizeStringNumberOrNullList(matcher.propertyKey);
    if (!normalized) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" ${label}.propertyKey must be a string/number/null or non-empty string/number/null array`,
        filePath,
      );
    }
    matcher.propertyKey = normalized;
  }
  if (matcher.notPropertyKey !== undefined) {
    const normalized = normalizeStringNumberOrNullList(matcher.notPropertyKey);
    if (!normalized) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" ${label}.notPropertyKey must be a string/number/null or non-empty string/number/null array`,
        filePath,
      );
    }
    matcher.notPropertyKey = normalized;
  }
  if (matcher.metadataType !== undefined) {
    const normalized = normalizeNonEmptyStringList(matcher.metadataType);
    if (!normalized) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" ${label}.metadataType must be a string or non-empty string array`,
        filePath,
      );
    }
    matcher.metadataType = normalized;
  }
  if (matcher.readable !== undefined && typeof matcher.readable !== 'boolean') {
    throw new RuleFileLoadError(`Rule "${ruleId}" ${label}.readable must be a boolean`, filePath);
  }
  if (matcher.writeable !== undefined && typeof matcher.writeable !== 'boolean') {
    throw new RuleFileLoadError(`Rule "${ruleId}" ${label}.writeable must be a boolean`, filePath);
  }
}

function validateRuleConstraintsShape(
  rule: Record<string, unknown>,
  filePath: string,
  ruleId: string,
): void {
  const constraints = rule.constraints;
  if (constraints === undefined) return;
  if (!isObject(constraints)) {
    throw new RuleFileLoadError(`Rule "${ruleId}" constraints must be an object`, filePath);
  }

  const allowedConstraintKeys = new Set(['requiredValues', 'absentValues']);
  for (const key of Object.keys(constraints)) {
    if (!allowedConstraintKeys.has(key)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" constraints has unsupported field "${key}"`,
        filePath,
      );
    }
  }

  for (const key of ['requiredValues', 'absentValues'] as const) {
    const list = constraints[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      throw new RuleFileLoadError(`Rule "${ruleId}" constraints.${key} must be an array`, filePath);
    }
    for (const [index, matcher] of list.entries()) {
      validateValueMatcherShape(matcher, filePath, ruleId, `constraints.${key}[${index}]`);
    }
  }
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
  options?: RuleValidationOptions,
): asserts rule is MappingRule {
  if (!isObject(rule)) {
    throw new RuleFileLoadError(`Rule at index ${index} must be an object`, filePath);
  }
  if (typeof rule.ruleId !== 'string' || rule.ruleId.length === 0) {
    throw new RuleFileLoadError(`Rule at index ${index} is missing a valid ruleId`, filePath);
  }
  const declaredLayer = options?.declaredLayer;
  if (declaredLayer) {
    if (rule.layer !== undefined) {
      throw new RuleFileLoadError(
        `Rule "${String(rule.ruleId)}" must not define layer when manifest declares "${declaredLayer}"`,
        filePath,
      );
    }
    rule.layer = declaredLayer;
  } else if (rule.layer === undefined) {
    throw new RuleFileLoadError(`Rule "${String(rule.ruleId)}" is missing layer`, filePath);
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
  validateDeviceMatcherShape(rule, filePath, String(rule.ruleId));
  if (rule.value !== undefined) {
    validateValueMatcherShape(rule.value, filePath, String(rule.ruleId), 'value');
  }
  validateRuleConstraintsShape(rule, filePath, String(rule.ruleId));
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

export function validateJsonRuleArrayWithOptions(
  value: unknown,
  filePath: string,
  options?: RuleValidationOptions,
): MappingRule[] {
  if (!Array.isArray(value)) {
    throw new RuleFileLoadError('Rule file must contain a JSON array of rules', filePath);
  }

  value.forEach((rule, index) => validateRuleShape(rule, filePath, index, options));
  return value as MappingRule[];
}

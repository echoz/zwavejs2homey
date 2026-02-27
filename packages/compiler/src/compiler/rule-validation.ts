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

interface ValueIdShape {
  commandClass: number;
  endpoint?: number;
  property: string | number;
  propertyKey?: string | number;
}

interface CommandTargetShape {
  command: string;
  argsTemplate?: Record<string, unknown>;
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

function isValidValueIdShape(value: unknown): value is ValueIdShape {
  if (!isObject(value)) return false;
  if (typeof value.commandClass !== 'number') return false;
  if (!['string', 'number'].includes(typeof value.property)) return false;
  if (value.endpoint !== undefined && typeof value.endpoint !== 'number') return false;
  if (value.propertyKey !== undefined && !['string', 'number'].includes(typeof value.propertyKey)) {
    return false;
  }
  return true;
}

function isValidCommandTargetShape(value: unknown): value is CommandTargetShape {
  if (!isObject(value)) return false;
  if (!isNonEmptyString(value.command)) return false;
  if (value.argsTemplate !== undefined && !isObject(value.argsTemplate)) return false;
  return true;
}

function isValidInboundWatcherShape(value: unknown): boolean {
  if (isValidValueIdShape(value)) return true;
  return isObject(value) && isNonEmptyString(value.eventType);
}

function assertNoUnsupportedFields(
  value: object,
  allowedKeys: ReadonlySet<string>,
  fieldPath: string,
  filePath: string,
  ruleId: string,
  actionIndex: number,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} ${fieldPath} has unsupported field "${key}"`,
        filePath,
      );
    }
  }
}

function validateEventSelectorShape(
  value: unknown,
  filePath: string,
  ruleId: string,
  actionIndex: number,
  fieldPath: string,
): void {
  if (!isObject(value) || !isNonEmptyString(value.eventType)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} ${fieldPath}.eventType must be a non-empty string`,
      filePath,
    );
  }

  assertNoUnsupportedFields(
    value,
    new Set(['eventType']),
    fieldPath,
    filePath,
    ruleId,
    actionIndex,
  );
}

function validateValueIdShapeStrict(
  value: unknown,
  filePath: string,
  ruleId: string,
  actionIndex: number,
  fieldPath: string,
): void {
  if (!isValidValueIdShape(value)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} ${fieldPath} must be a value-id shape`,
      filePath,
    );
  }

  assertNoUnsupportedFields(
    value,
    new Set(['commandClass', 'endpoint', 'property', 'propertyKey']),
    fieldPath,
    filePath,
    ruleId,
    actionIndex,
  );
}

function validateCommandTargetShapeStrict(
  value: unknown,
  filePath: string,
  ruleId: string,
  actionIndex: number,
  fieldPath: string,
): void {
  if (!isValidCommandTargetShape(value)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} ${fieldPath} must be a command target shape`,
      filePath,
    );
  }

  assertNoUnsupportedFields(
    value,
    new Set(['command', 'argsTemplate']),
    fieldPath,
    filePath,
    ruleId,
    actionIndex,
  );
}

function validateCapabilityInboundMappingShape(
  action: Record<string, unknown>,
  filePath: string,
  ruleId: string,
  actionIndex: number,
): void {
  const mapping = action.inboundMapping;
  if (mapping === undefined) return;
  if (!isObject(mapping)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} inboundMapping must be an object`,
      filePath,
    );
  }

  const allowedKeys = new Set(['kind', 'selector', 'transformRef', 'transformParams', 'watchers']);
  for (const key of Object.keys(mapping)) {
    if (!allowedKeys.has(key)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} inboundMapping has unsupported field "${key}"`,
        filePath,
      );
    }
  }

  if (!isNonEmptyString(mapping.kind) || (mapping.kind !== 'value' && mapping.kind !== 'event')) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} inboundMapping.kind must be "value" or "event"`,
      filePath,
    );
  }

  if (mapping.kind === 'value' && !isValidValueIdShape(mapping.selector)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} inboundMapping selector must be a value-id shape when kind is "value"`,
      filePath,
    );
  }

  if (mapping.kind === 'value') {
    validateValueIdShapeStrict(
      mapping.selector,
      filePath,
      ruleId,
      actionIndex,
      'inboundMapping selector',
    );
  }

  if (mapping.kind === 'event') {
    validateEventSelectorShape(
      mapping.selector,
      filePath,
      ruleId,
      actionIndex,
      'inboundMapping selector',
    );
  }

  if (mapping.transformRef !== undefined && !isNonEmptyString(mapping.transformRef)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} inboundMapping.transformRef must be a non-empty string`,
      filePath,
    );
  }

  if (mapping.transformParams !== undefined && !isObject(mapping.transformParams)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} inboundMapping.transformParams must be an object`,
      filePath,
    );
  }

  if (mapping.watchers !== undefined) {
    if (!Array.isArray(mapping.watchers)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} inboundMapping.watchers must be an array`,
        filePath,
      );
    }
    for (let watcherIndex = 0; watcherIndex < mapping.watchers.length; watcherIndex += 1) {
      const watcher = mapping.watchers[watcherIndex];
      if (!isValidInboundWatcherShape(watcher)) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} inboundMapping.watchers must contain value-id or eventType watcher shapes`,
          filePath,
        );
      }

      const watcherPath = `inboundMapping.watchers[${watcherIndex}]`;
      if (isValidValueIdShape(watcher)) {
        validateValueIdShapeStrict(watcher, filePath, ruleId, actionIndex, watcherPath);
      } else {
        validateEventSelectorShape(watcher, filePath, ruleId, actionIndex, watcherPath);
      }
    }
  }
}

function validateCapabilityOutboundMappingShape(
  action: Record<string, unknown>,
  filePath: string,
  ruleId: string,
  actionIndex: number,
): void {
  const mapping = action.outboundMapping;
  if (mapping === undefined) return;
  if (!isObject(mapping)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} outboundMapping must be an object`,
      filePath,
    );
  }

  const allowedKeys = new Set([
    'kind',
    'target',
    'transformRef',
    'transformParams',
    'validation',
    'executionHints',
  ]);
  for (const key of Object.keys(mapping)) {
    if (!allowedKeys.has(key)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} outboundMapping has unsupported field "${key}"`,
        filePath,
      );
    }
  }

  if (
    !isNonEmptyString(mapping.kind) ||
    (mapping.kind !== 'set_value' &&
      mapping.kind !== 'invoke_cc_api' &&
      mapping.kind !== 'zwjs_command')
  ) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.kind is invalid`,
      filePath,
    );
  }

  if (mapping.target === undefined) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} outboundMapping requires target`,
      filePath,
    );
  }

  if (mapping.kind === 'set_value') {
    validateValueIdShapeStrict(
      mapping.target,
      filePath,
      ruleId,
      actionIndex,
      'outboundMapping target',
    );
  }

  if (mapping.kind === 'invoke_cc_api' || mapping.kind === 'zwjs_command') {
    if (isValidValueIdShape(mapping.target)) {
      validateValueIdShapeStrict(
        mapping.target,
        filePath,
        ruleId,
        actionIndex,
        'outboundMapping target',
      );
    } else if (isValidCommandTargetShape(mapping.target)) {
      validateCommandTargetShapeStrict(
        mapping.target,
        filePath,
        ruleId,
        actionIndex,
        'outboundMapping target',
      );
    } else {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} outboundMapping target must be a value-id shape or command target`,
        filePath,
      );
    }
  }

  if (mapping.transformRef !== undefined && !isNonEmptyString(mapping.transformRef)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.transformRef must be a non-empty string`,
      filePath,
    );
  }

  if (mapping.transformParams !== undefined && !isObject(mapping.transformParams)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.transformParams must be an object`,
      filePath,
    );
  }

  if (mapping.validation !== undefined) {
    if (!isObject(mapping.validation)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.validation must be an object`,
        filePath,
      );
    }
    for (const key of Object.keys(mapping.validation)) {
      if (!['min', 'max', 'step', 'enum'].includes(key)) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.validation has unsupported field "${key}"`,
          filePath,
        );
      }
    }
    for (const key of ['min', 'max', 'step'] as const) {
      if (mapping.validation[key] !== undefined && typeof mapping.validation[key] !== 'number') {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.validation.${key} must be a number`,
          filePath,
        );
      }
    }
    if (mapping.validation.enum !== undefined && !Array.isArray(mapping.validation.enum)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.validation.enum must be an array`,
        filePath,
      );
    }
  }

  if (mapping.executionHints !== undefined) {
    if (!isObject(mapping.executionHints)) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.executionHints must be an object`,
        filePath,
      );
    }
    for (const key of Object.keys(mapping.executionHints)) {
      if (!['optimisticState', 'debounceMs', 'throttleMs'].includes(key)) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.executionHints has unsupported field "${key}"`,
          filePath,
        );
      }
    }
    if (
      mapping.executionHints.optimisticState !== undefined &&
      typeof mapping.executionHints.optimisticState !== 'boolean'
    ) {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.executionHints.optimisticState must be a boolean`,
        filePath,
      );
    }
    for (const key of ['debounceMs', 'throttleMs'] as const) {
      if (
        mapping.executionHints[key] !== undefined &&
        typeof mapping.executionHints[key] !== 'number'
      ) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} outboundMapping.executionHints.${key} must be a number`,
          filePath,
        );
      }
    }
  }
}

function normalizeCapabilityInboundMapping(
  action: Record<string, unknown>,
  filePath: string,
  ruleId: string,
  actionIndex: number,
): void {
  const mapping = action.inboundMapping;
  if (mapping === undefined) return;
  if (!isObject(mapping)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} inboundMapping must be an object`,
      filePath,
    );
  }

  const kind = mapping.kind;

  if (kind === undefined) {
    if (isValidValueIdShape(mapping)) {
      const { commandClass, endpoint, property, propertyKey, ...rest } = mapping;
      action.inboundMapping = {
        ...rest,
        kind: 'value',
        selector: {
          commandClass,
          ...(endpoint !== undefined ? { endpoint } : {}),
          property,
          ...(propertyKey !== undefined ? { propertyKey } : {}),
        },
      };
    } else if (isNonEmptyString(mapping.eventType)) {
      const { eventType, ...rest } = mapping;
      action.inboundMapping = {
        ...rest,
        kind: 'event',
        selector: { eventType },
      };
    } else {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} inboundMapping shorthand must be a value-id object or eventType`,
        filePath,
      );
    }
  }

  validateCapabilityInboundMappingShape(action, filePath, ruleId, actionIndex);
}

function normalizeCapabilityOutboundMapping(
  action: Record<string, unknown>,
  filePath: string,
  ruleId: string,
  actionIndex: number,
): void {
  const mapping = action.outboundMapping;
  if (mapping === undefined) return;
  if (!isObject(mapping)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" capability action ${actionIndex} outboundMapping must be an object`,
      filePath,
    );
  }

  const kind = mapping.kind;

  if (kind === undefined) {
    if (isValidValueIdShape(mapping)) {
      const { commandClass, endpoint, property, propertyKey, ...rest } = mapping;
      action.outboundMapping = {
        ...rest,
        kind: 'set_value',
        target: {
          commandClass,
          ...(endpoint !== undefined ? { endpoint } : {}),
          property,
          ...(propertyKey !== undefined ? { propertyKey } : {}),
        },
      };
    } else if (isNonEmptyString(mapping.command)) {
      const { command, argsTemplate, ...rest } = mapping;
      if (argsTemplate !== undefined && !isObject(argsTemplate)) {
        throw new RuleFileLoadError(
          `Rule "${ruleId}" capability action ${actionIndex} outboundMapping argsTemplate must be an object`,
          filePath,
        );
      }
      action.outboundMapping = {
        ...rest,
        kind: 'zwjs_command',
        target: {
          command,
          ...(argsTemplate !== undefined ? { argsTemplate } : {}),
        },
      };
    } else {
      throw new RuleFileLoadError(
        `Rule "${ruleId}" capability action ${actionIndex} outboundMapping shorthand must be a value-id object or command target`,
        filePath,
      );
    }
  }

  validateCapabilityOutboundMappingShape(action, filePath, ruleId, actionIndex);
}

function normalizeDeviceIdentityAliases(
  action: Record<string, unknown>,
  filePath: string,
  ruleId: string,
  actionIndex: number,
): void {
  if (!('driverId' in action)) return;
  const driverId = action.driverId;
  if (!isNonEmptyString(driverId)) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" device-identity action ${actionIndex} driverId must be a non-empty string`,
      filePath,
    );
  }
  if (
    action.driverTemplateId !== undefined &&
    (typeof action.driverTemplateId !== 'string' || action.driverTemplateId !== driverId)
  ) {
    throw new RuleFileLoadError(
      `Rule "${ruleId}" device-identity action ${actionIndex} driverId and driverTemplateId must match when both are provided`,
      filePath,
    );
  }
  action.driverTemplateId = driverId;
  delete action.driverId;
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
    normalizeCapabilityInboundMapping(action, filePath, ruleId, actionIndex);
    normalizeCapabilityOutboundMapping(action, filePath, ruleId, actionIndex);
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
    normalizeDeviceIdentityAliases(action, filePath, ruleId, actionIndex);
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
    if (action.valueId !== undefined) {
      try {
        validateValueIdShapeStrict(
          action.valueId,
          filePath,
          ruleId,
          actionIndex,
          'ignore-value valueId',
        );
      } catch (error) {
        if (error instanceof RuleFileLoadError) {
          throw new RuleFileLoadError(
            `Rule "${ruleId}" ignore-value action ${actionIndex} has invalid valueId shape`,
            filePath,
          );
        }
        throw error;
      }
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

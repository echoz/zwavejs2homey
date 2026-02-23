import type { ZwjsDefinedValueId, ZwjsDefinedValueIdsResult, ZwjsValueId } from '../client/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValueKey(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

export function isZwjsValueId(value: unknown): value is ZwjsValueId {
  return (
    isRecord(value) &&
    isValueKey(value.commandClass) &&
    isValueKey(value.property) &&
    (value.endpoint === undefined || typeof value.endpoint === 'number') &&
    (value.propertyKey === undefined || isValueKey(value.propertyKey))
  );
}

export function isZwjsDefinedValueId(value: unknown): value is ZwjsDefinedValueId {
  return isZwjsValueId(value);
}

export function extractZwjsDefinedValueIds(
  result: ZwjsDefinedValueIdsResult | unknown,
): ZwjsDefinedValueId[] {
  if (Array.isArray(result)) {
    return result.filter(isZwjsDefinedValueId);
  }
  if (isRecord(result)) {
    if (Array.isArray(result.values)) {
      return result.values.filter(isZwjsDefinedValueId);
    }
    if (Array.isArray(result.valueIds)) {
      return result.valueIds.filter(isZwjsDefinedValueId);
    }
  }
  return [];
}

import type {
  ZwjsDurationValue,
  ZwjsFirmwareVersionsValue,
  ZwjsLockHandleFlagsValue,
  ZwjsNodeValueEnvelopeResult,
  ZwjsNodeValueResult,
  ZwjsValueId,
} from '../client/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCommandClass(commandClass: ZwjsValueId['commandClass']): number | undefined {
  if (typeof commandClass === 'number' && Number.isInteger(commandClass)) {
    return commandClass;
  }
  if (typeof commandClass !== 'string') return undefined;
  const trimmed = commandClass.trim();
  if (!trimmed) return undefined;
  const parsed = trimmed.startsWith('0x')
    ? Number.parseInt(trimmed.slice(2), 16)
    : Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function matchesProperty(property: ZwjsValueId['property'], expected: string): boolean {
  return String(property) === expected;
}

export function isZwjsNodeValueEnvelopeResult(
  value: unknown,
): value is ZwjsNodeValueEnvelopeResult {
  return isRecord(value);
}

export function extractZwjsNodeValue(result: ZwjsNodeValueResult | unknown): unknown {
  if (isZwjsNodeValueEnvelopeResult(result)) {
    return 'value' in result ? result.value : undefined;
  }
  return result;
}

export function hasZwjsNodeValue(result: ZwjsNodeValueResult | unknown): boolean {
  if (isZwjsNodeValueEnvelopeResult(result)) {
    return 'value' in result;
  }
  return result !== undefined;
}

export function isZwjsDurationValue(value: unknown): value is ZwjsDurationValue {
  return (
    isRecord(value) &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    typeof value.unit === 'string'
  );
}

export function isZwjsLockHandleFlagsValue(value: unknown): value is ZwjsLockHandleFlagsValue {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'boolean');
}

export function isZwjsFirmwareVersionsValue(value: unknown): value is ZwjsFirmwareVersionsValue {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function extractZwjsDurationValue(
  result: ZwjsNodeValueResult | unknown,
): ZwjsDurationValue | undefined {
  const value = extractZwjsNodeValue(result);
  return isZwjsDurationValue(value) ? value : undefined;
}

export function extractZwjsLockHandleFlagsValue(
  result: ZwjsNodeValueResult | unknown,
): ZwjsLockHandleFlagsValue | undefined {
  const value = extractZwjsNodeValue(result);
  return isZwjsLockHandleFlagsValue(value) ? value : undefined;
}

export function extractZwjsFirmwareVersionsValue(
  result: ZwjsNodeValueResult | unknown,
): ZwjsFirmwareVersionsValue | undefined {
  const value = extractZwjsNodeValue(result);
  return isZwjsFirmwareVersionsValue(value) ? value : undefined;
}

export function isZwjsSwitchDurationValueSample(
  valueId: ZwjsValueId,
  result: ZwjsNodeValueResult | unknown,
): boolean {
  const commandClass = normalizeCommandClass(valueId.commandClass);
  if (commandClass !== 37 && commandClass !== 38) return false;
  if (!matchesProperty(valueId.property, 'duration')) return false;
  return extractZwjsDurationValue(result) !== undefined;
}

export function isZwjsLockHandleFlagsValueSample(
  valueId: ZwjsValueId,
  result: ZwjsNodeValueResult | unknown,
): boolean {
  const commandClass = normalizeCommandClass(valueId.commandClass);
  if (commandClass !== 98) return false;
  const property = String(valueId.property);
  const isHandleFlagsProperty =
    property === 'insideHandlesCanOpenDoor' ||
    property === 'insideHandlesCanOpenDoorConfiguration' ||
    property === 'outsideHandlesCanOpenDoor' ||
    property === 'outsideHandlesCanOpenDoorConfiguration';
  if (!isHandleFlagsProperty) return false;
  return extractZwjsLockHandleFlagsValue(result) !== undefined;
}

export function isZwjsFirmwareVersionsValueSample(
  valueId: ZwjsValueId,
  result: ZwjsNodeValueResult | unknown,
): boolean {
  const commandClass = normalizeCommandClass(valueId.commandClass);
  if (commandClass !== 134) return false;
  if (!matchesProperty(valueId.property, 'firmwareVersions')) return false;
  return extractZwjsFirmwareVersionsValue(result) !== undefined;
}

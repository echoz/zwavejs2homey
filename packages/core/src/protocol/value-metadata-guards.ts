import type { ZwjsNodeValueMetadataResult } from '../client/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObjectOrArray(value: unknown): boolean {
  return (typeof value === 'object' && value !== null) || Array.isArray(value);
}

export function isZwjsNodeValueMetadataResult(
  value: unknown,
): value is ZwjsNodeValueMetadataResult {
  if (!isRecord(value)) return false;

  const stringKeys = ['type', 'label', 'description', 'info', 'name', 'unit', 'format'];
  for (const key of stringKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== 'string') {
      return false;
    }
  }

  const booleanKeys = ['readable', 'writeable', 'allowManualEntry', 'isFromConfig'];
  for (const key of booleanKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== 'boolean') {
      return false;
    }
  }

  const numberKeys = ['min', 'max', 'steps', 'minLength', 'maxLength', 'valueSize'];
  for (const key of numberKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== 'number') {
      return false;
    }
  }

  const objectOrArrayKeys = ['states', 'valueChangeOptions', 'ccSpecific'];
  for (const key of objectOrArrayKeys) {
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      value[key] !== null &&
      !isObjectOrArray(value[key])
    ) {
      return false;
    }
  }

  return true;
}

export function hasZwjsNodeValueMetadataBounds(metadata: ZwjsNodeValueMetadataResult): boolean {
  return (
    typeof metadata.min === 'number' &&
    Number.isFinite(metadata.min) &&
    typeof metadata.max === 'number' &&
    Number.isFinite(metadata.max)
  );
}

export function isZwjsNodeValueMetadataDuration(metadata: ZwjsNodeValueMetadataResult): boolean {
  return metadata.type === 'duration';
}

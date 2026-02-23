import type { ZwjsNodeValueEnvelopeResult, ZwjsNodeValueResult } from '../client/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

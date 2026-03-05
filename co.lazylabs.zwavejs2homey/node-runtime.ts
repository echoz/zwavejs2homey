export interface CapabilityRuntimeValueSelector {
  commandClass: number | string;
  endpoint?: number;
  property: number | string;
  propertyKey?: number | string;
}

export interface CapabilityRuntimeVerticalSlice {
  capabilityId: string;
  inboundSelector?: CapabilityRuntimeValueSelector;
  inboundTransformRef?: string;
  outboundTarget?: CapabilityRuntimeValueSelector;
  outboundTransformRef?: string;
}

type PrimitiveCapabilityValue = string | number | boolean;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseNumericIdentity(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const parsedHex = Number.parseInt(trimmed.slice(2), 16);
    return Number.isInteger(parsedHex) && Number.isFinite(parsedHex) ? parsedHex : undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    const parsedDec = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsedDec) && Number.isFinite(parsedDec) ? parsedDec : undefined;
  }
  return undefined;
}

function normalizeComparableValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function isSupportedCapabilityRuntimeValue(value: unknown): value is PrimitiveCapabilityValue {
  if (typeof value === 'string') return true;
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  if (typeof value === 'boolean') return true;
  return false;
}

function normalizeCapabilityId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed;
}

function isValidRuntimeValueIdShape(valueId: unknown): valueId is CapabilityRuntimeValueSelector {
  if (!isObject(valueId)) return false;
  const commandClass = parseNumericIdentity(valueId.commandClass);
  if (commandClass === undefined) return false;
  if (normalizeComparableValue(valueId.property) === undefined) return false;
  if (valueId.endpoint !== undefined && parseNumericIdentity(valueId.endpoint) === undefined) {
    return false;
  }
  const { propertyKey } = valueId;
  if (propertyKey !== undefined && normalizeComparableValue(propertyKey) === undefined) {
    return false;
  }
  return true;
}

export function extractCapabilityRuntimeVerticals(
  profile: unknown,
): CapabilityRuntimeVerticalSlice[] {
  if (!isObject(profile) || !Array.isArray(profile.capabilities)) {
    return [];
  }

  const slices: CapabilityRuntimeVerticalSlice[] = [];
  for (const capability of profile.capabilities) {
    if (!isObject(capability)) {
      continue;
    }
    const capabilityId = normalizeCapabilityId(capability.capabilityId);
    if (!capabilityId) {
      continue;
    }

    const inbound = capability.inboundMapping;
    const outbound = capability.outboundMapping;

    let inboundCandidate: CapabilityRuntimeValueSelector | undefined;
    if (isObject(inbound) && inbound.kind === 'value') {
      if (isValidRuntimeValueIdShape(inbound.selector)) {
        inboundCandidate = inbound.selector;
      }
    }

    let outboundTargetCandidate: CapabilityRuntimeValueSelector | undefined;
    if (isObject(outbound) && outbound.kind === 'set_value' && isObject(outbound.target)) {
      if (isValidRuntimeValueIdShape(outbound.target)) {
        outboundTargetCandidate = outbound.target;
      }
    }

    const inboundSelector = inboundCandidate;
    const inboundTransformRef = inboundSelector
      ? normalizeComparableValue(isObject(inbound) ? inbound.transformRef : undefined)
      : undefined;

    const outboundTarget = outboundTargetCandidate;
    const outboundTransformRef = outboundTarget
      ? normalizeComparableValue(isObject(outbound) ? outbound.transformRef : undefined)
      : undefined;

    if (!inboundSelector && !outboundTarget) continue;

    slices.push({
      capabilityId,
      inboundSelector,
      inboundTransformRef,
      outboundTarget,
      outboundTransformRef,
    });
  }
  return slices;
}

export function extractValueResultPayload(value: unknown): unknown {
  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value;
  }
  return value;
}

function normalizeNumericValue(value: unknown): number | undefined {
  const payload = extractValueResultPayload(value);
  if (typeof payload === 'number' && Number.isFinite(payload)) return payload;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeBooleanValue(value: unknown): boolean | undefined {
  const payload = extractValueResultPayload(value);
  if (typeof payload === 'boolean') return payload;
  if (typeof payload === 'number') {
    if (payload === 0) return false;
    if (payload === 1 || payload === 255) return true;
    return undefined;
  }
  if (typeof payload === 'string') {
    const normalized = payload.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'on' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'off' || normalized === '0') return false;
  }
  return undefined;
}

function coerceByValueType(
  value: unknown,
  valueTypeHint: unknown,
): PrimitiveCapabilityValue | undefined {
  const normalizedType = normalizeComparableValue(valueTypeHint);
  if (!normalizedType) return undefined;
  const lower = normalizedType.toLowerCase();
  if (lower === 'boolean') return normalizeBooleanValue(value);
  if (lower === 'number') {
    const numeric = normalizeNumericValue(value);
    return numeric;
  }
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coerceDimInboundTransform(value: unknown): number | undefined {
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  return clamp(numeric, 0, 99) / 99;
}

function coerceNumericInboundFallback(value: unknown): number | undefined {
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  if (numeric >= 0 && numeric <= 1) return numeric;
  if (numeric >= 0 && numeric <= 99) return numeric / 99;
  if (numeric === 255) return 1;
  return clamp(numeric, 0, 1);
}

function coerceDimOutboundTransform(value: unknown): number | undefined {
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  return Math.round(clamp(numeric, 0, 1) * 99);
}

function coerceNumericOutboundFallback(value: unknown): number | undefined {
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  if (numeric >= 0 && numeric <= 1) return Math.round(numeric * 99);
  if (numeric >= 0 && numeric <= 99) return Math.round(numeric);
  return Math.round(clamp(numeric, 0, 99));
}

const INBOUND_TRANSFORMERS: Record<
  string,
  (value: unknown) => PrimitiveCapabilityValue | undefined
> = {
  zwave_level_0_99_to_homey_dim: coerceDimInboundTransform,
};

const OUTBOUND_TRANSFORMERS: Record<
  string,
  (value: unknown) => PrimitiveCapabilityValue | undefined
> = {
  homey_dim_to_zwave_level_0_99: coerceDimOutboundTransform,
};

export function coerceCapabilityInboundValue(
  _capabilityId: string,
  value: unknown,
  transformRef?: string,
  valueTypeHint?: string,
): PrimitiveCapabilityValue | undefined {
  const normalizedTransformRef = normalizeComparableValue(transformRef);
  if (normalizedTransformRef) {
    const transform = INBOUND_TRANSFORMERS[normalizedTransformRef];
    if (transform) {
      return transform(value);
    }
  }

  const typedValue = coerceByValueType(value, valueTypeHint);
  if (typedValue !== undefined) return typedValue;

  const payload = extractValueResultPayload(value);
  if (!isSupportedCapabilityRuntimeValue(payload)) {
    if (normalizedTransformRef === 'zwave_level_0_99_to_homey_dim') {
      return coerceNumericInboundFallback(value);
    }
    return undefined;
  }
  return payload;
}

export function coerceCapabilityOutboundValue(
  _capabilityId: string,
  value: unknown,
  transformRef?: string,
  valueTypeHint?: string,
): PrimitiveCapabilityValue | undefined {
  const normalizedTransformRef = normalizeComparableValue(transformRef);
  if (normalizedTransformRef) {
    const transform = OUTBOUND_TRANSFORMERS[normalizedTransformRef];
    if (transform) {
      return transform(value);
    }
  }

  const typedValue = coerceByValueType(value, valueTypeHint);
  if (typedValue !== undefined) return typedValue;

  const payload = extractValueResultPayload(value);
  if (!isSupportedCapabilityRuntimeValue(payload)) {
    if (normalizedTransformRef === 'homey_dim_to_zwave_level_0_99') {
      return coerceNumericOutboundFallback(value);
    }
    return undefined;
  }
  return payload;
}

export function selectorMatchesNodeValueUpdatedEvent(
  selector: unknown,
  eventPayload: unknown,
): boolean {
  if (!isObject(selector) || !isObject(eventPayload) || !isObject(eventPayload.args)) {
    return false;
  }
  const args = eventPayload.args;

  if (selector.endpoint !== undefined && args.endpoint !== undefined) {
    const selectorEndpoint = parseNumericIdentity(selector.endpoint);
    const argsEndpoint = parseNumericIdentity(args.endpoint);
    if (selectorEndpoint !== undefined && argsEndpoint !== undefined) {
      if (selectorEndpoint !== argsEndpoint) {
        return false;
      }
    }
  }

  if (selector.commandClass !== undefined && args.commandClass !== undefined) {
    const selectorCc = parseNumericIdentity(selector.commandClass);
    const argsCc = parseNumericIdentity(args.commandClass);
    if (selectorCc !== undefined && argsCc !== undefined && selectorCc !== argsCc) {
      return false;
    }
  }

  if (selector.property !== undefined) {
    const selectorProperty = normalizeComparableValue(selector.property);
    const argProperty = normalizeComparableValue(args.property);
    const argPropertyName = normalizeComparableValue(args.propertyName);
    if (selectorProperty && argProperty && selectorProperty !== argProperty) {
      return false;
    }
    if (selectorProperty && argPropertyName && selectorProperty !== argPropertyName) {
      return false;
    }
    if (selectorProperty && !argProperty && !argPropertyName) {
      return false;
    }
  }

  if (selector.propertyKey !== undefined) {
    const selectorPropertyKey = normalizeComparableValue(selector.propertyKey);
    const argPropertyKey = normalizeComparableValue(args.propertyKey);
    const argPropertyKeyName = normalizeComparableValue(args.propertyKeyName);
    if (selectorPropertyKey && argPropertyKey && selectorPropertyKey !== argPropertyKey) {
      return false;
    }
    if (selectorPropertyKey && argPropertyKeyName && selectorPropertyKey !== argPropertyKeyName) {
      return false;
    }
    if (selectorPropertyKey && !argPropertyKey && !argPropertyKeyName) {
      return false;
    }
  }

  return true;
}

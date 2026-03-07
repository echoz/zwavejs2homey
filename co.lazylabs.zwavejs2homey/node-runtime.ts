export interface CapabilityRuntimeValueSelector {
  commandClass: number | string;
  endpoint?: number;
  property: number | string;
  propertyKey?: number | string;
}

export interface CapabilityRuntimeEventSelector {
  eventType: string;
}

export interface CapabilityRuntimeVerticalSlice {
  capabilityId: string;
  inboundSelector?: CapabilityRuntimeValueSelector;
  inboundEventSelector?: CapabilityRuntimeEventSelector;
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

function normalizeEventTypeSelector(value: unknown): CapabilityRuntimeEventSelector | undefined {
  if (!isObject(value)) return undefined;
  const eventType = normalizeComparableValue(value.eventType);
  if (!eventType) return undefined;
  return { eventType };
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
    let inboundEventCandidate: CapabilityRuntimeEventSelector | undefined;
    if (isObject(inbound) && inbound.kind === 'value') {
      if (isValidRuntimeValueIdShape(inbound.selector)) {
        inboundCandidate = inbound.selector;
      }
    } else if (isObject(inbound) && inbound.kind === 'event') {
      inboundEventCandidate = normalizeEventTypeSelector(inbound.selector);
    }

    let outboundTargetCandidate: CapabilityRuntimeValueSelector | undefined;
    if (isObject(outbound) && outbound.kind === 'set_value' && isObject(outbound.target)) {
      if (isValidRuntimeValueIdShape(outbound.target)) {
        outboundTargetCandidate = outbound.target;
      }
    }

    const inboundSelector = inboundCandidate;
    const inboundEventSelector = inboundEventCandidate;
    const inboundTransformRef =
      inboundSelector || inboundEventSelector
        ? normalizeComparableValue(isObject(inbound) ? inbound.transformRef : undefined)
        : undefined;

    const outboundTarget = outboundTargetCandidate;
    const outboundTransformRef = outboundTarget
      ? normalizeComparableValue(isObject(outbound) ? outbound.transformRef : undefined)
      : undefined;

    if (!inboundSelector && !inboundEventSelector && !outboundTarget) continue;

    slices.push({
      capabilityId,
      inboundSelector,
      ...(inboundEventSelector ? { inboundEventSelector } : {}),
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

function coerceOnOffInboundTransform(value: unknown): boolean | undefined {
  const booleanValue = normalizeBooleanValue(value);
  if (booleanValue !== undefined) return booleanValue;
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  return numeric > 0;
}

function coerceOnOffOutboundTransform(value: unknown): number | undefined {
  const booleanValue = normalizeBooleanValue(value);
  if (booleanValue === undefined) return undefined;
  return booleanValue ? 99 : 0;
}

function coerceAlarmBatteryInboundTransform(value: unknown): boolean | undefined {
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  if (numeric === 255) return true;
  return clamp(numeric, 0, 100) <= 20;
}

function coerceAlarmContactDoorStatusTransform(value: unknown): boolean | undefined {
  const payload = extractValueResultPayload(value);
  if (typeof payload === 'boolean') return payload;
  if (typeof payload === 'number' && Number.isFinite(payload)) {
    if (payload === 0) return false;
    if (payload === 255) return true;
  }
  if (typeof payload !== 'string') return undefined;
  const normalized = payload.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  if (
    normalized === 'open' ||
    normalized === 'opening' ||
    normalized === 'ajar' ||
    normalized.includes('open')
  ) {
    return true;
  }
  if (
    normalized === 'closed' ||
    normalized === 'closing' ||
    normalized.includes('closed') ||
    normalized.includes('close')
  ) {
    return false;
  }
  return undefined;
}

function collectNotificationTextCandidates(value: unknown): string[] {
  const candidates: string[] = [];
  const visited = new Set<unknown>();
  const queue: unknown[] = [value];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null || visited.has(current)) continue;
    visited.add(current);

    if (typeof current === 'string') {
      const normalized = current.trim();
      if (normalized.length > 0) candidates.push(normalized);
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    if (!isObject(current)) continue;
    const record = current;
    for (const key of [
      'label',
      'eventLabel',
      'notificationLabel',
      'statusLabel',
      'stateLabel',
      'alarmLabel',
      'description',
    ]) {
      if (record[key] !== undefined) queue.push(record[key]);
    }
    if (record.args !== undefined) queue.push(record.args);
    if (record.event !== undefined) queue.push(record.event);
    if (record.eventPayload !== undefined) queue.push(record.eventPayload);
  }

  return candidates;
}

function extractNotificationNumericArgs(value: unknown): {
  alarmType?: number;
  notificationType?: number;
  notificationEvent?: number;
} {
  const result: { alarmType?: number; notificationType?: number; notificationEvent?: number } = {};
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null || visited.has(current)) continue;
    visited.add(current);
    if (!isObject(current)) continue;

    const alarmType = parseNumericIdentity(current.alarmType);
    if (alarmType !== undefined && result.alarmType === undefined) result.alarmType = alarmType;
    const notificationType = parseNumericIdentity(current.notificationType);
    if (notificationType !== undefined && result.notificationType === undefined) {
      result.notificationType = notificationType;
    }
    const notificationEvent = parseNumericIdentity(current.notificationEvent);
    if (notificationEvent !== undefined && result.notificationEvent === undefined) {
      result.notificationEvent = notificationEvent;
    }

    if (current.args !== undefined) queue.push(current.args);
    if (current.event !== undefined) queue.push(current.event);
    if (current.eventPayload !== undefined) queue.push(current.eventPayload);
  }

  return result;
}

function coerceAlarmTamperNotificationTransform(value: unknown): boolean | undefined {
  const textCandidates = collectNotificationTextCandidates(value).map((candidate) =>
    candidate.toLowerCase(),
  );
  for (const candidate of textCandidates) {
    if (
      candidate.includes('tamper') ||
      candidate.includes('jam') ||
      candidate.includes('forced') ||
      candidate.includes('intrusion') ||
      candidate.includes('cover removed')
    ) {
      return true;
    }
    if (
      candidate.includes('idle') ||
      candidate.includes('cleared') ||
      candidate.includes('clear') ||
      candidate.includes('normal') ||
      candidate.includes('no event') ||
      candidate.includes('inactive')
    ) {
      return false;
    }
  }

  const { alarmType, notificationType, notificationEvent } = extractNotificationNumericArgs(value);
  if (alarmType !== undefined) {
    if ([24, 25, 27].includes(alarmType)) return true;
    if (alarmType === 0) return false;
  }
  if (notificationType !== undefined && notificationEvent !== undefined) {
    if (notificationType === 6 && [3, 4, 9].includes(notificationEvent)) return true;
    if (notificationEvent === 0) return false;
  }
  return undefined;
}

function coerceNumericOutboundFallback(value: unknown): number | undefined {
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  if (numeric >= 0 && numeric <= 1) return Math.round(numeric * 99);
  if (numeric >= 0 && numeric <= 99) return Math.round(numeric);
  return Math.round(clamp(numeric, 0, 99));
}

function coerceLockedValue(value: unknown): boolean | undefined {
  const booleanValue = normalizeBooleanValue(value);
  if (booleanValue !== undefined) return booleanValue;

  const payload = extractValueResultPayload(value);
  if (typeof payload !== 'string') return undefined;
  const normalized = payload.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  if (normalized.includes('unsecured') || normalized.includes('unlocked')) return false;
  if (normalized.includes('secured') || normalized.includes('locked')) return true;
  return undefined;
}

function coerceLockedOutboundValue(
  value: unknown,
  valueTypeHint?: string,
): PrimitiveCapabilityValue | undefined {
  const booleanValue = coerceLockedValue(value);
  if (booleanValue === undefined) return undefined;
  const normalizedType = normalizeComparableValue(valueTypeHint)?.toLowerCase();
  if (normalizedType === 'string') return booleanValue ? 'secured' : 'unsecured';
  if (normalizedType === 'number') return booleanValue ? 255 : 0;
  return booleanValue;
}

function coerceMeasureBatteryValue(value: unknown): number | undefined {
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  if (numeric === 255) return 1;
  return clamp(Math.round(numeric), 0, 100);
}

function coerceEnumSelectInboundValue(value: unknown): string | undefined {
  const payload = extractValueResultPayload(value);
  if (typeof payload === 'string') {
    const normalized = payload.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  if (typeof payload === 'number' && Number.isFinite(payload)) {
    return String(payload);
  }
  return undefined;
}

function coerceEnumSelectOutboundValue(
  value: unknown,
  valueTypeHint?: string,
): PrimitiveCapabilityValue | undefined {
  const selected = coerceEnumSelectInboundValue(value);
  if (!selected) return undefined;
  const normalizedType = normalizeComparableValue(valueTypeHint)?.toLowerCase();
  if (normalizedType === 'number') {
    const parsed = Number(selected);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return selected;
}

const INBOUND_TRANSFORMERS: Record<
  string,
  (value: unknown) => PrimitiveCapabilityValue | undefined
> = {
  zwave_level_0_99_to_homey_dim: coerceDimInboundTransform,
  zwave_level_nonzero_to_homey_onoff: coerceOnOffInboundTransform,
  zwave_battery_level_to_homey_alarm_battery: coerceAlarmBatteryInboundTransform,
  zwave_door_status_to_homey_alarm_contact: coerceAlarmContactDoorStatusTransform,
  zwjs_notification_to_homey_alarm_tamper: coerceAlarmTamperNotificationTransform,
};

const OUTBOUND_TRANSFORMERS: Record<
  string,
  (value: unknown) => PrimitiveCapabilityValue | undefined
> = {
  homey_dim_to_zwave_level_0_99: coerceDimOutboundTransform,
  homey_onoff_to_zwave_level_0_99: coerceOnOffOutboundTransform,
};

const SPECIALIZED_CAPABILITY_COERCIONS = new Set([
  'enum_select',
  'lock_mode',
  'locked',
  'measure_battery',
]);

export function getSupportedInboundTransformRefs(): string[] {
  return Object.keys(INBOUND_TRANSFORMERS).sort();
}

export function getSupportedOutboundTransformRefs(): string[] {
  return Object.keys(OUTBOUND_TRANSFORMERS).sort();
}

export function getSpecializedCapabilityCoercions(): string[] {
  return [...SPECIALIZED_CAPABILITY_COERCIONS].sort();
}

export function coerceCapabilityInboundValue(
  capabilityId: string,
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

  if (SPECIALIZED_CAPABILITY_COERCIONS.has(capabilityId)) {
    if (capabilityId === 'locked') {
      const lockedValue = coerceLockedValue(value);
      if (lockedValue !== undefined) return lockedValue;
    } else if (capabilityId === 'measure_battery') {
      const batteryValue = coerceMeasureBatteryValue(value);
      if (batteryValue !== undefined) return batteryValue;
    } else if (capabilityId === 'enum_select' || capabilityId === 'lock_mode') {
      const enumValue = coerceEnumSelectInboundValue(value);
      if (enumValue !== undefined) return enumValue;
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
  capabilityId: string,
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

  if (SPECIALIZED_CAPABILITY_COERCIONS.has(capabilityId)) {
    if (capabilityId === 'locked') {
      const lockedValue = coerceLockedOutboundValue(value, valueTypeHint);
      if (lockedValue !== undefined) return lockedValue;
    } else if (capabilityId === 'measure_battery') {
      const batteryValue = coerceMeasureBatteryValue(value);
      if (batteryValue !== undefined) return batteryValue;
    } else if (capabilityId === 'enum_select' || capabilityId === 'lock_mode') {
      const enumValue = coerceEnumSelectOutboundValue(value, valueTypeHint);
      if (enumValue !== undefined) return enumValue;
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

import type {
  NormalizedZwaveDeviceFacts,
  NormalizedZwaveValueFacts,
  NormalizedZwaveValueId,
} from '../models/zwave-facts';
import type { MappingRule, RuleDeviceMatcher, RuleValueMatcher } from '../rules/types';

function includesIfPresent<T>(values: T[] | undefined, actual: T | undefined): boolean {
  if (!values) return true;
  return actual !== undefined && values.includes(actual);
}

function normalizeDeviceClassToken(token: string | undefined): string | undefined {
  if (typeof token !== 'string') return undefined;
  const normalized = token.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : undefined;
}

function includesNormalizedStringIfPresent(
  values: string[] | undefined,
  actual: string | undefined,
): boolean {
  if (!values) return true;
  const normalizedActual = normalizeDeviceClassToken(actual);
  if (!normalizedActual) return false;
  return values.some((value) => normalizeDeviceClassToken(value) === normalizedActual);
}

function compareFirmwareRange(
  firmwareVersion: string | undefined,
  range: RuleDeviceMatcher['firmwareVersionRange'],
): boolean {
  if (!range) return true;
  if (!firmwareVersion) return false;
  // v1 pragmatic compare: dotted numeric string lexical by numeric parts
  const parse = (v: string) => v.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const cmp = (a: number[], b: number[]) => {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  };
  const actual = parse(firmwareVersion);
  if (range.min && cmp(actual, parse(range.min)) < 0) return false;
  if (range.max && cmp(actual, parse(range.max)) > 0) return false;
  return true;
}

export function matchesDevice(
  device: NormalizedZwaveDeviceFacts,
  matcher?: RuleDeviceMatcher,
): boolean {
  if (!matcher) return true;
  return (
    includesIfPresent(matcher.manufacturerId, device.manufacturerId) &&
    includesIfPresent(matcher.productType, device.productType) &&
    includesIfPresent(matcher.productId, device.productId) &&
    compareFirmwareRange(device.firmwareVersion, matcher.firmwareVersionRange) &&
    includesNormalizedStringIfPresent(matcher.deviceClassGeneric, device.deviceClassGeneric) &&
    includesNormalizedStringIfPresent(matcher.deviceClassSpecific, device.deviceClassSpecific)
  );
}

function propertyKeyAsComparable(valueId: NormalizedZwaveValueId): string | number | null {
  return valueId.propertyKey ?? null;
}

export function matchesValue(
  value: NormalizedZwaveValueFacts,
  matcher?: RuleValueMatcher,
): boolean {
  if (!matcher) return true;
  const key = propertyKeyAsComparable(value.valueId);
  if (!includesIfPresent(matcher.commandClass, value.valueId.commandClass)) return false;
  if (!includesIfPresent(matcher.endpoint, value.valueId.endpoint ?? 0)) return false;
  if (!includesIfPresent(matcher.property, value.valueId.property)) return false;
  if (matcher.propertyKey && !matcher.propertyKey.includes(key)) return false;
  if (matcher.notPropertyKey && matcher.notPropertyKey.includes(key)) return false;
  if (!includesIfPresent(matcher.metadataType, value.metadata.type)) return false;
  if (matcher.readable !== undefined && value.metadata.readable !== matcher.readable) return false;
  if (matcher.writeable !== undefined && value.metadata.writeable !== matcher.writeable)
    return false;
  return true;
}

export function valueMatcherMatchesAny(
  values: NormalizedZwaveValueFacts[],
  matcher: RuleValueMatcher,
): boolean {
  return values.some((value) => matchesValue(value, matcher));
}

export function matchesRuleCompanionConstraints(
  device: NormalizedZwaveDeviceFacts,
  rule: MappingRule,
): boolean {
  if (rule.constraints?.requiredValues) {
    const allPresent = rule.constraints.requiredValues.every((matcher) =>
      valueMatcherMatchesAny(device.values, matcher),
    );
    if (!allPresent) return false;
  }
  if (rule.constraints?.absentValues) {
    const anyPresent = rule.constraints.absentValues.some((matcher) =>
      valueMatcherMatchesAny(device.values, matcher),
    );
    if (anyPresent) return false;
  }
  return true;
}

export function matchesRuleForValue(
  device: NormalizedZwaveDeviceFacts,
  value: NormalizedZwaveValueFacts,
  rule: MappingRule,
): boolean {
  return (
    matchesDevice(device, rule.device) &&
    matchesValue(value, rule.value) &&
    matchesRuleCompanionConstraints(device, rule)
  );
}

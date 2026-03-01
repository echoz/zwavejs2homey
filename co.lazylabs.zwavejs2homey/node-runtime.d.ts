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

export function extractCapabilityRuntimeVerticals(
  profile: unknown,
): CapabilityRuntimeVerticalSlice[];

export function extractValueResultPayload(value: unknown): unknown;

export function coerceCapabilityInboundValue(
  capabilityId: string,
  value: unknown,
  transformRef?: string,
  valueTypeHint?: string,
): string | number | boolean | undefined;

export function coerceCapabilityOutboundValue(
  capabilityId: string,
  value: unknown,
  transformRef?: string,
  valueTypeHint?: string,
): string | number | boolean | undefined;

export function selectorMatchesNodeValueUpdatedEvent(
  selector: unknown,
  eventPayload: unknown,
): boolean;

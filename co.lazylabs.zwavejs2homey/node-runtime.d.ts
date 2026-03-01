export interface OnOffCapabilityVerticalSlice {
  capabilityId: 'onoff';
  inboundSelector: {
    commandClass: number | string;
    endpoint?: number;
    property: number | string;
    propertyKey?: number | string;
  };
  outboundTarget: {
    commandClass: number | string;
    endpoint?: number;
    property: number | string;
    propertyKey?: number | string;
  };
}

export interface DimCapabilityVerticalSlice {
  capabilityId: 'dim';
  inboundSelector: {
    commandClass: number | string;
    endpoint?: number;
    property: number | string;
    propertyKey?: number | string;
  };
  inboundTransformRef?: string;
  outboundTarget: {
    commandClass: number | string;
    endpoint?: number;
    property: number | string;
    propertyKey?: number | string;
  };
  outboundTransformRef?: string;
}

export function extractOnOffCapabilityVertical(
  profile: unknown,
): OnOffCapabilityVerticalSlice | null;

export function extractDimCapabilityVertical(profile: unknown): DimCapabilityVerticalSlice | null;

export function extractValueResultPayload(value: unknown): unknown;

export function coerceOnOffValue(value: unknown): boolean | undefined;

export function coerceDimInboundValue(value: unknown, transformRef?: string): number | undefined;

export function coerceDimOutboundValue(value: unknown, transformRef?: string): number | undefined;

export function selectorMatchesNodeValueUpdatedEvent(
  selector: unknown,
  eventPayload: unknown,
): boolean;

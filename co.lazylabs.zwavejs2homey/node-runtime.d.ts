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

export function extractOnOffCapabilityVertical(
  profile: unknown,
): OnOffCapabilityVerticalSlice | null;

export function extractValueResultPayload(value: unknown): unknown;

export function coerceOnOffValue(value: unknown): boolean | undefined;

export function selectorMatchesNodeValueUpdatedEvent(
  selector: unknown,
  eventPayload: unknown,
): boolean;

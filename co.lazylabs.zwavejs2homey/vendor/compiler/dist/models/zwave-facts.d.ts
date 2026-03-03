export interface NormalizedZwaveValueId {
    commandClass: number;
    endpoint?: number;
    property: string | number;
    propertyKey?: string | number;
}
export interface NormalizedZwaveValueMetadata {
    type?: string;
    label?: string;
    unit?: string;
    readable?: boolean;
    writeable?: boolean;
    stateful?: boolean;
    min?: number;
    max?: number;
    states?: Record<string, string>;
}
export interface NormalizedZwaveValueFacts {
    valueId: NormalizedZwaveValueId;
    metadata: NormalizedZwaveValueMetadata;
    propertyName?: string;
    propertyKeyName?: string;
    commandClassName?: string;
    ccSpecific?: Record<string, unknown>;
}
export interface NormalizedZwaveDeviceFacts {
    deviceKey: string;
    nodeId?: number;
    manufacturerId?: number;
    productType?: number;
    productId?: number;
    firmwareVersion?: string;
    deviceClassGeneric?: string;
    deviceClassSpecific?: string;
    values: NormalizedZwaveValueFacts[];
}

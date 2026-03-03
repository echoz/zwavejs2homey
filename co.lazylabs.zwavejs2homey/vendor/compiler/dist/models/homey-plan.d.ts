import type { NormalizedZwaveValueId } from './zwave-facts';
export type HomeyMappingDirectionality = 'inbound-only' | 'outbound-only' | 'bidirectional';
export type HomeyInboundMappingKind = 'value' | 'event';
export interface HomeyInboundMapping {
    kind: HomeyInboundMappingKind;
    selector: NormalizedZwaveValueId | {
        eventType: string;
    };
    transformRef?: string;
    transformParams?: Record<string, unknown>;
    watchers?: Array<NormalizedZwaveValueId | {
        eventType: string;
    }>;
}
export type HomeyOutboundMappingKind = 'set_value' | 'invoke_cc_api' | 'zwjs_command';
export interface HomeyOutboundMapping {
    kind: HomeyOutboundMappingKind;
    target: NormalizedZwaveValueId | {
        command: string;
        argsTemplate?: Record<string, unknown>;
    };
    transformRef?: string;
    transformParams?: Record<string, unknown>;
    validation?: {
        min?: number;
        max?: number;
        step?: number;
        enum?: unknown[];
    };
    executionHints?: {
        optimisticState?: boolean;
        debounceMs?: number;
        throttleMs?: number;
    };
}
export type ProvenanceLayer = 'ha-derived' | 'project-product' | 'project-generic' | 'user-curation';
export type ProvenanceAction = 'fill' | 'augment' | 'replace';
export interface ProvenanceRecord {
    layer: ProvenanceLayer;
    ruleId: string;
    action: ProvenanceAction;
    sourceRef?: string;
    reason?: string;
    supersedes?: string[];
}
export interface HomeyCapabilityPlan {
    capabilityId: string;
    inboundMapping?: HomeyInboundMapping;
    outboundMapping?: HomeyOutboundMapping;
    directionality: HomeyMappingDirectionality;
    flags?: {
        readable?: boolean;
        writeable?: boolean;
        assumedState?: boolean;
        allowMulti?: boolean;
        entityRegistryEnabledDefault?: boolean;
        debounceMs?: number;
    };
    provenance: ProvenanceRecord;
}
export interface CompiledHomeyProfilePlan {
    profileId: string;
    match: Record<string, unknown>;
    catalogMatch?: {
        by: 'product-triple';
        catalogId: string;
        label?: string;
    };
    classification: {
        homeyClass: string;
        driverTemplateId?: string;
        confidence: 'curated' | 'ha-derived' | 'generic';
        uncurated: boolean;
    };
    capabilities: HomeyCapabilityPlan[];
    subscriptions?: Array<{
        eventType: string;
    } | NormalizedZwaveValueId>;
    ignoredValues?: NormalizedZwaveValueId[];
    provenance: ProvenanceRecord;
}

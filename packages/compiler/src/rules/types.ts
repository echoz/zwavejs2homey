import type { NormalizedZwaveValueId } from '../models/zwave-facts';
import type {
  HomeyInboundMapping,
  HomeyOutboundMapping,
  ProvenanceLayer,
} from '../models/homey-plan';

export type RuleLayer = Exclude<ProvenanceLayer, 'user-curation'>;
export type RuleActionMode = 'fill' | 'augment' | 'replace';

export interface RuleValueMatcher {
  commandClass?: number[];
  endpoint?: number[];
  property?: Array<string | number>;
  propertyKey?: Array<string | number | null>;
  notPropertyKey?: Array<string | number | null>;
  metadataType?: string[];
  readable?: boolean;
  writeable?: boolean;
}

export interface RuleDeviceMatcher {
  manufacturerId?: number[];
  productType?: number[];
  productId?: number[];
  firmwareVersionRange?: { min?: string; max?: string };
}

export interface RuleCompanionConstraints {
  requiredValues?: RuleValueMatcher[];
  absentValues?: RuleValueMatcher[];
}

export interface CapabilityRuleAction {
  type: 'capability';
  mode?: RuleActionMode;
  capabilityId: string;
  conflict?: {
    key: string;
    mode?: 'exclusive' | 'allow-multi';
    priority?: number;
  };
  inboundMapping?: HomeyInboundMapping;
  outboundMapping?: HomeyOutboundMapping;
  flags?: {
    readable?: boolean;
    writeable?: boolean;
    assumedState?: boolean;
    allowMulti?: boolean;
    entityRegistryEnabledDefault?: boolean;
    debounceMs?: number;
  };
  ignore?: boolean;
}

export interface DeviceIdentityRuleAction {
  type: 'device-identity';
  mode?: RuleActionMode;
  homeyClass?: string;
  driverTemplateId?: string;
}

export interface IgnoreValueRuleAction {
  type: 'ignore-value';
  mode?: RuleActionMode;
  valueId?: NormalizedZwaveValueId;
}

export type RuleAction = CapabilityRuleAction | DeviceIdentityRuleAction | IgnoreValueRuleAction;

export interface MappingRule {
  ruleId: string;
  layer: RuleLayer;
  device?: RuleDeviceMatcher;
  value?: RuleValueMatcher;
  constraints?: RuleCompanionConstraints;
  actions: RuleAction[];
}

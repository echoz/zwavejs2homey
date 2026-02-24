import type { HaDerivedGeneratedRuleArtifactV1 } from './generated-rule-artifact';
import type { MappingRule } from '../../rules/types';

export interface HaMockDiscoveryInputV1 {
  schemaVersion: 'ha-mock-discovery/v1';
  source: {
    generatedAt: string;
    sourceRef: string;
  };
  definitions: HaMockDiscoveryDefinitionV1[];
}

export interface HaMockDiscoveryDefinitionV1 {
  id: string;
  sourceRef: string;
  match: {
    commandClass: number;
    endpoint?: number;
    property: string | number;
    propertyKey?: string | number;
  };
  output: {
    homeyClass?: string;
    driverTemplateId?: string;
    capabilityId?: string;
  };
}

export interface HaMockTranslationReport {
  translated: number;
  skipped: number;
  unsupported: Array<{ id: string; reason: string }>;
  sourceRefs: string[];
}

export interface HaMockTranslationResult {
  artifact: HaDerivedGeneratedRuleArtifactV1;
  report: HaMockTranslationReport;
}

function toRule(definition: HaMockDiscoveryDefinitionV1): MappingRule | null {
  const actions: MappingRule['actions'] = [];
  if (definition.output.homeyClass || definition.output.driverTemplateId) {
    actions.push({
      type: 'device-identity',
      homeyClass: definition.output.homeyClass,
      driverTemplateId: definition.output.driverTemplateId,
    });
  }
  if (definition.output.capabilityId) {
    actions.push({
      type: 'capability',
      capabilityId: definition.output.capabilityId,
      inboundMapping: {
        kind: 'value',
        selector: {
          commandClass: definition.match.commandClass,
          endpoint: definition.match.endpoint ?? 0,
          property: definition.match.property,
          ...(definition.match.propertyKey !== undefined
            ? { propertyKey: definition.match.propertyKey }
            : {}),
        },
      },
    });
  }
  if (actions.length === 0) return null;

  return {
    ruleId: `ha:${definition.id}`,
    layer: 'ha-derived',
    value: {
      commandClass: [definition.match.commandClass],
      endpoint: [definition.match.endpoint ?? 0],
      property: [definition.match.property],
      ...(definition.match.propertyKey !== undefined
        ? { propertyKey: [definition.match.propertyKey] }
        : {}),
    },
    actions,
  };
}

export function translateHaMockDiscoveryToGeneratedArtifact(
  input: HaMockDiscoveryInputV1,
): HaMockTranslationResult {
  const unsupported: HaMockTranslationReport['unsupported'] = [];
  const rules: MappingRule[] = [];

  for (const definition of input.definitions) {
    const rule = toRule(definition);
    if (!rule) {
      unsupported.push({ id: definition.id, reason: 'no-supported-output' });
      continue;
    }
    rules.push(rule);
  }

  return {
    artifact: {
      schemaVersion: 'ha-derived-rules/v1',
      source: {
        upstream: 'home-assistant',
        component: 'zwave_js',
        generatedAt: input.source.generatedAt,
        sourceRef: input.source.sourceRef,
      },
      rules,
    },
    report: {
      translated: rules.length,
      skipped: 0,
      unsupported,
      sourceRefs: [...new Set(input.definitions.map((d) => d.sourceRef))].sort(),
    },
  };
}

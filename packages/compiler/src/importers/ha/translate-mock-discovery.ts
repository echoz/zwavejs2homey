import type { HaDerivedGeneratedRuleArtifactV1 } from './generated-rule-artifact';
import type { MappingRule } from '../../rules/types';

export class HaMockTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HaMockTranslationError';
  }
}

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
  unsupported: Array<{ id: string; reason: HaMockUnsupportedReason }>;
  sourceRefs: string[];
}

export interface HaMockTranslationResult {
  artifact: HaDerivedGeneratedRuleArtifactV1;
  report: HaMockTranslationReport;
}

export type HaMockUnsupportedReason =
  | 'unsupported-output-shape'
  | 'unsupported-match-field'
  | 'no-supported-output';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateInputShape(input: unknown): asserts input is HaMockDiscoveryInputV1 {
  if (!isObject(input)) {
    throw new HaMockTranslationError('HA mock discovery input must be an object');
  }
  if (input.schemaVersion !== 'ha-mock-discovery/v1') {
    throw new HaMockTranslationError(
      `Unsupported HA mock discovery schemaVersion: ${String(input.schemaVersion)}`,
    );
  }
  if (!isObject(input.source)) {
    throw new HaMockTranslationError('HA mock discovery input is missing source metadata');
  }
  if (!isNonEmptyString(input.source.generatedAt) || !isNonEmptyString(input.source.sourceRef)) {
    throw new HaMockTranslationError(
      'HA mock discovery input source.generatedAt and source.sourceRef must be non-empty strings',
    );
  }
  if (!Array.isArray(input.definitions)) {
    throw new HaMockTranslationError('HA mock discovery input definitions must be an array');
  }
  for (const [index, definition] of input.definitions.entries()) {
    if (!isObject(definition)) {
      throw new HaMockTranslationError(`HA mock discovery definition ${index} must be an object`);
    }
    if (!isNonEmptyString(definition.id) || !isNonEmptyString(definition.sourceRef)) {
      throw new HaMockTranslationError(
        `HA mock discovery definition ${index} requires non-empty id and sourceRef`,
      );
    }
    if (!isObject(definition.match)) {
      throw new HaMockTranslationError(
        `HA mock discovery definition ${definition.id} missing match`,
      );
    }
    if (typeof definition.match.commandClass !== 'number') {
      throw new HaMockTranslationError(
        `HA mock discovery definition ${definition.id} match.commandClass must be a number`,
      );
    }
    if (definition.match.endpoint !== undefined && typeof definition.match.endpoint !== 'number') {
      throw new HaMockTranslationError(
        `HA mock discovery definition ${definition.id} match.endpoint must be a number`,
      );
    }
    if (
      !['string', 'number'].includes(typeof definition.match.property) ||
      (definition.match.property !== 0 && !definition.match.property)
    ) {
      throw new HaMockTranslationError(
        `HA mock discovery definition ${definition.id} match.property must be string or number`,
      );
    }
    if (
      definition.match.propertyKey !== undefined &&
      !['string', 'number'].includes(typeof definition.match.propertyKey)
    ) {
      throw new HaMockTranslationError(
        `HA mock discovery definition ${definition.id} match.propertyKey must be string or number`,
      );
    }
    if (!isObject(definition.output)) {
      throw new HaMockTranslationError(
        `HA mock discovery definition ${definition.id} missing output object`,
      );
    }
  }
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
  input: unknown,
): HaMockTranslationResult {
  validateInputShape(input);
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

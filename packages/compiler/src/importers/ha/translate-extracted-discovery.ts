import type { HaMockTranslationResult } from './translate-mock-discovery';
import { translateHaMockDiscoveryToGeneratedArtifact } from './translate-mock-discovery';

export class HaExtractedTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HaExtractedTranslationError';
  }
}

export interface HaExtractedDiscoveryInputV1 {
  schemaVersion: 'ha-extracted-discovery/v1';
  source: {
    generatedAt: string;
    sourceRef: string;
  };
  entries: HaExtractedDiscoveryEntryV1[];
}

export interface HaExtractedDiscoveryEntryV1 {
  id: string;
  sourceRef: string;
  valueMatch: {
    commandClass: number;
    endpoint?: number;
    property: string | number;
    propertyKey?: string | number;
    metadata?: {
      type?: string;
      readable?: boolean;
      writeable?: boolean;
    };
    // Parser-free v1 escape hatch to test unsupported reporting downstream.
    [key: string]: unknown;
  };
  companions?: {
    requiredValues?: Array<{
      commandClass: number;
      endpoint?: number;
      property: string | number;
      propertyKey?: string | number;
      [key: string]: unknown;
    }>;
    absentValues?: Array<{
      commandClass: number;
      endpoint?: number;
      property: string | number;
      propertyKey?: string | number;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  output: {
    homeyClass?: string;
    driverTemplateId?: string;
    capabilityId?: string;
    [key: string]: unknown;
  };
}

type ExtractedCompanionMatcher = {
  commandClass: number;
  endpoint?: number;
  property: string | number;
  propertyKey?: string | number;
  [key: string]: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateExtractedInput(input: unknown): asserts input is HaExtractedDiscoveryInputV1 {
  if (!isObject(input)) {
    throw new HaExtractedTranslationError('HA extracted discovery input must be an object');
  }
  if (input.schemaVersion !== 'ha-extracted-discovery/v1') {
    throw new HaExtractedTranslationError(
      `Unsupported HA extracted discovery schemaVersion: ${String(input.schemaVersion)}`,
    );
  }
  if (!isObject(input.source)) {
    throw new HaExtractedTranslationError('HA extracted discovery input is missing source');
  }
  if (!isNonEmptyString(input.source.generatedAt) || !isNonEmptyString(input.source.sourceRef)) {
    throw new HaExtractedTranslationError(
      'HA extracted discovery input source.generatedAt and source.sourceRef must be non-empty strings',
    );
  }
  if (!Array.isArray(input.entries)) {
    throw new HaExtractedTranslationError('HA extracted discovery input entries must be an array');
  }
  for (const [index, entry] of input.entries.entries()) {
    if (!isObject(entry)) {
      throw new HaExtractedTranslationError(
        `HA extracted discovery entry ${index} must be an object`,
      );
    }
    if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.sourceRef)) {
      throw new HaExtractedTranslationError(
        `HA extracted discovery entry ${index} requires non-empty id and sourceRef`,
      );
    }
    if (!isObject(entry.valueMatch)) {
      throw new HaExtractedTranslationError(
        `HA extracted discovery entry ${entry.id} requires valueMatch object`,
      );
    }
    if (typeof entry.valueMatch.commandClass !== 'number') {
      throw new HaExtractedTranslationError(
        `HA extracted discovery entry ${entry.id} valueMatch.commandClass must be a number`,
      );
    }
    if (
      !['string', 'number'].includes(typeof entry.valueMatch.property) ||
      (entry.valueMatch.property !== 0 && !entry.valueMatch.property)
    ) {
      throw new HaExtractedTranslationError(
        `HA extracted discovery entry ${entry.id} valueMatch.property must be string or number`,
      );
    }
    if (entry.valueMatch.endpoint !== undefined && typeof entry.valueMatch.endpoint !== 'number') {
      throw new HaExtractedTranslationError(
        `HA extracted discovery entry ${entry.id} valueMatch.endpoint must be a number`,
      );
    }
    if (
      entry.valueMatch.propertyKey !== undefined &&
      !['string', 'number'].includes(typeof entry.valueMatch.propertyKey)
    ) {
      throw new HaExtractedTranslationError(
        `HA extracted discovery entry ${entry.id} valueMatch.propertyKey must be string or number`,
      );
    }
    if (entry.valueMatch.metadata !== undefined && !isObject(entry.valueMatch.metadata)) {
      throw new HaExtractedTranslationError(
        `HA extracted discovery entry ${entry.id} valueMatch.metadata must be an object`,
      );
    }
    if (!isObject(entry.output)) {
      throw new HaExtractedTranslationError(
        `HA extracted discovery entry ${entry.id} output must be an object`,
      );
    }
  }
}

function mapCompanionValues(values?: ExtractedCompanionMatcher[]) {
  if (!values) return undefined;
  return values.map((matcher) => ({
    commandClass: matcher.commandClass,
    endpoint: matcher.endpoint,
    property: matcher.property,
    ...(matcher.propertyKey !== undefined ? { propertyKey: matcher.propertyKey } : {}),
    // Preserve unknown keys so downstream mock translator unsupported detection is exercised.
    ...Object.fromEntries(
      Object.entries(matcher).filter(
        ([key]) => !['commandClass', 'endpoint', 'property', 'propertyKey'].includes(key),
      ),
    ),
  }));
}

export function translateHaExtractedDiscoveryToGeneratedArtifact(
  input: unknown,
): HaMockTranslationResult {
  validateExtractedInput(input);
  return translateHaMockDiscoveryToGeneratedArtifact({
    schemaVersion: 'ha-mock-discovery/v1',
    source: input.source,
    definitions: input.entries.map((entry) => ({
      id: entry.id,
      sourceRef: entry.sourceRef,
      match: {
        commandClass: entry.valueMatch.commandClass,
        endpoint: entry.valueMatch.endpoint,
        property: entry.valueMatch.property,
        ...(entry.valueMatch.propertyKey !== undefined
          ? { propertyKey: entry.valueMatch.propertyKey }
          : {}),
        ...(entry.valueMatch.metadata?.type !== undefined
          ? { metadataType: entry.valueMatch.metadata.type }
          : {}),
        ...(entry.valueMatch.metadata?.readable !== undefined
          ? { readable: entry.valueMatch.metadata.readable }
          : {}),
        ...(entry.valueMatch.metadata?.writeable !== undefined
          ? { writeable: entry.valueMatch.metadata.writeable }
          : {}),
        ...Object.fromEntries(
          Object.entries(entry.valueMatch).filter(
            ([key]) =>
              !['commandClass', 'endpoint', 'property', 'propertyKey', 'metadata'].includes(key),
          ),
        ),
      },
      ...(entry.companions
        ? {
            constraints: {
              ...(entry.companions.requiredValues
                ? { requiredValues: mapCompanionValues(entry.companions.requiredValues) }
                : {}),
              ...(entry.companions.absentValues
                ? { absentValues: mapCompanionValues(entry.companions.absentValues) }
                : {}),
              ...Object.fromEntries(
                Object.entries(entry.companions).filter(
                  ([key]) => !['requiredValues', 'absentValues'].includes(key),
                ),
              ),
            },
          }
        : {}),
      output: entry.output,
    })),
  });
}

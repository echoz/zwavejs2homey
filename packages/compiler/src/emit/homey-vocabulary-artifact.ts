import fs from 'node:fs';

export const HOMEY_VOCABULARY_ARTIFACT_V1 = 'homey-vocabulary/v1' as const;

export type HomeyVocabularySourceKind = 'homey-lib-system' | 'homey-compose-custom';

export interface HomeyVocabularySourceRefV1 {
  source: HomeyVocabularySourceKind;
  sourceRef: string;
}

export interface HomeyVocabularyEntryV1 {
  id: string;
  sources: HomeyVocabularySourceRefV1[];
}

export interface HomeyVocabularyArtifactV1 {
  schemaVersion: typeof HOMEY_VOCABULARY_ARTIFACT_V1;
  generatedAt: string;
  source: {
    homeyLibVersion?: string;
    homeyLibRoot?: string;
    composeCapabilitiesDir?: string;
  };
  homeyClasses: HomeyVocabularyEntryV1[];
  capabilityIds: HomeyVocabularyEntryV1[];
}

export interface HomeyVocabularyLookupV1 {
  homeyClasses: ReadonlySet<string>;
  capabilityIds: ReadonlySet<string>;
}

export class HomeyVocabularyArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomeyVocabularyArtifactError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSourceRef(
  value: unknown,
  fieldPath: string,
): asserts value is HomeyVocabularySourceRefV1 {
  if (!isObject(value)) {
    throw new HomeyVocabularyArtifactError(`${fieldPath} must be an object`);
  }
  if (value.source !== 'homey-lib-system' && value.source !== 'homey-compose-custom') {
    throw new HomeyVocabularyArtifactError(
      `${fieldPath}.source must be "homey-lib-system" or "homey-compose-custom"`,
    );
  }
  if (typeof value.sourceRef !== 'string' || value.sourceRef.length === 0) {
    throw new HomeyVocabularyArtifactError(`${fieldPath}.sourceRef must be a non-empty string`);
  }
}

function assertEntry(value: unknown, fieldPath: string): asserts value is HomeyVocabularyEntryV1 {
  if (!isObject(value)) {
    throw new HomeyVocabularyArtifactError(`${fieldPath} must be an object`);
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new HomeyVocabularyArtifactError(`${fieldPath}.id must be a non-empty string`);
  }
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    throw new HomeyVocabularyArtifactError(`${fieldPath}.sources must be a non-empty array`);
  }
  value.sources.forEach((source, index) => {
    assertSourceRef(source, `${fieldPath}.sources[${index}]`);
  });
}

function normalizeEntry(entry: HomeyVocabularyEntryV1): HomeyVocabularyEntryV1 {
  const seenSources = new Set<string>();
  const sources = entry.sources
    .filter((source) => {
      const key = `${source.source}|${source.sourceRef}`;
      if (seenSources.has(key)) return false;
      seenSources.add(key);
      return true;
    })
    .sort((a, b) =>
      a.source === b.source
        ? a.sourceRef.localeCompare(b.sourceRef)
        : a.source.localeCompare(b.source),
    );
  return {
    id: entry.id,
    sources,
  };
}

function normalizeEntries(entries: HomeyVocabularyEntryV1[]): HomeyVocabularyEntryV1[] {
  return entries.map((entry) => normalizeEntry(entry)).sort((a, b) => a.id.localeCompare(b.id));
}

export function assertHomeyVocabularyArtifactV1(
  input: unknown,
): asserts input is HomeyVocabularyArtifactV1 {
  if (!isObject(input)) {
    throw new HomeyVocabularyArtifactError('artifact must be an object');
  }
  if (input.schemaVersion !== HOMEY_VOCABULARY_ARTIFACT_V1) {
    throw new HomeyVocabularyArtifactError(`schemaVersion must be ${HOMEY_VOCABULARY_ARTIFACT_V1}`);
  }
  if (typeof input.generatedAt !== 'string' || input.generatedAt.length === 0) {
    throw new HomeyVocabularyArtifactError('generatedAt must be a non-empty string');
  }
  if (!isObject(input.source)) {
    throw new HomeyVocabularyArtifactError('source must be an object');
  }
  if (
    input.source.homeyLibVersion !== undefined &&
    typeof input.source.homeyLibVersion !== 'string'
  ) {
    throw new HomeyVocabularyArtifactError('source.homeyLibVersion must be a string');
  }
  if (input.source.homeyLibRoot !== undefined && typeof input.source.homeyLibRoot !== 'string') {
    throw new HomeyVocabularyArtifactError('source.homeyLibRoot must be a string');
  }
  if (
    input.source.composeCapabilitiesDir !== undefined &&
    typeof input.source.composeCapabilitiesDir !== 'string'
  ) {
    throw new HomeyVocabularyArtifactError('source.composeCapabilitiesDir must be a string');
  }
  if (!Array.isArray(input.homeyClasses)) {
    throw new HomeyVocabularyArtifactError('homeyClasses must be an array');
  }
  if (!Array.isArray(input.capabilityIds)) {
    throw new HomeyVocabularyArtifactError('capabilityIds must be an array');
  }
  input.homeyClasses.forEach((entry, index) => assertEntry(entry, `homeyClasses[${index}]`));
  input.capabilityIds.forEach((entry, index) => assertEntry(entry, `capabilityIds[${index}]`));
}

export function createHomeyVocabularyArtifactV1(
  entries: {
    homeyClasses: HomeyVocabularyEntryV1[];
    capabilityIds: HomeyVocabularyEntryV1[];
  },
  source: HomeyVocabularyArtifactV1['source'],
  now = new Date(),
): HomeyVocabularyArtifactV1 {
  return {
    schemaVersion: HOMEY_VOCABULARY_ARTIFACT_V1,
    generatedAt: now.toISOString(),
    source,
    homeyClasses: normalizeEntries(entries.homeyClasses),
    capabilityIds: normalizeEntries(entries.capabilityIds),
  };
}

export function loadHomeyVocabularyArtifact(filePath: string): HomeyVocabularyArtifactV1 {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assertHomeyVocabularyArtifactV1(parsed);
  return parsed;
}

export function createHomeyVocabularyLookupV1(
  artifact: HomeyVocabularyArtifactV1,
): HomeyVocabularyLookupV1 {
  return {
    homeyClasses: new Set(artifact.homeyClasses.map((entry) => entry.id)),
    capabilityIds: new Set(artifact.capabilityIds.map((entry) => entry.id)),
  };
}

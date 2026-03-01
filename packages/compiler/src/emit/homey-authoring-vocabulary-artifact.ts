import fs from 'node:fs';

export const HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1 = 'homey-authoring-vocabulary/v1' as const;

export type HomeyAuthoringVocabularySourceKind = 'homey-lib-system' | 'homey-compose-custom';

export interface HomeyAuthoringVocabularySourceRefV1 {
  source: HomeyAuthoringVocabularySourceKind;
  sourceRef: string;
}

export interface HomeyAuthoringVocabularyEntryV1 {
  id: string;
  sources: HomeyAuthoringVocabularySourceRefV1[];
}

export interface HomeyAuthoringVocabularyArtifactV1 {
  schemaVersion: typeof HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1;
  generatedAt: string;
  source: {
    homeyLibVersion?: string;
    homeyLibRoot?: string;
    composeCapabilitiesDir?: string;
  };
  homeyClasses: HomeyAuthoringVocabularyEntryV1[];
  capabilityIds: HomeyAuthoringVocabularyEntryV1[];
}

export interface HomeyAuthoringVocabularyLookupV1 {
  homeyClasses: ReadonlySet<string>;
  capabilityIds: ReadonlySet<string>;
}

export class HomeyAuthoringVocabularyArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomeyAuthoringVocabularyArtifactError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSourceRef(
  value: unknown,
  fieldPath: string,
): asserts value is HomeyAuthoringVocabularySourceRefV1 {
  if (!isObject(value)) {
    throw new HomeyAuthoringVocabularyArtifactError(`${fieldPath} must be an object`);
  }
  if (value.source !== 'homey-lib-system' && value.source !== 'homey-compose-custom') {
    throw new HomeyAuthoringVocabularyArtifactError(
      `${fieldPath}.source must be "homey-lib-system" or "homey-compose-custom"`,
    );
  }
  if (typeof value.sourceRef !== 'string' || value.sourceRef.length === 0) {
    throw new HomeyAuthoringVocabularyArtifactError(
      `${fieldPath}.sourceRef must be a non-empty string`,
    );
  }
}

function assertEntry(
  value: unknown,
  fieldPath: string,
): asserts value is HomeyAuthoringVocabularyEntryV1 {
  if (!isObject(value)) {
    throw new HomeyAuthoringVocabularyArtifactError(`${fieldPath} must be an object`);
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new HomeyAuthoringVocabularyArtifactError(`${fieldPath}.id must be a non-empty string`);
  }
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    throw new HomeyAuthoringVocabularyArtifactError(
      `${fieldPath}.sources must be a non-empty array`,
    );
  }
  value.sources.forEach((source, index) => {
    assertSourceRef(source, `${fieldPath}.sources[${index}]`);
  });
}

function normalizeEntry(entry: HomeyAuthoringVocabularyEntryV1): HomeyAuthoringVocabularyEntryV1 {
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

function normalizeAuthoringEntries(
  entries: HomeyAuthoringVocabularyEntryV1[],
): HomeyAuthoringVocabularyEntryV1[] {
  return entries.map((entry) => normalizeEntry(entry)).sort((a, b) => a.id.localeCompare(b.id));
}

export function assertHomeyAuthoringVocabularyArtifactV1(
  input: unknown,
): asserts input is HomeyAuthoringVocabularyArtifactV1 {
  if (!isObject(input)) {
    throw new HomeyAuthoringVocabularyArtifactError('artifact must be an object');
  }
  if (input.schemaVersion !== HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1) {
    throw new HomeyAuthoringVocabularyArtifactError(
      `schemaVersion must be ${HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1}`,
    );
  }
  if (typeof input.generatedAt !== 'string' || input.generatedAt.length === 0) {
    throw new HomeyAuthoringVocabularyArtifactError('generatedAt must be a non-empty string');
  }
  if (!isObject(input.source)) {
    throw new HomeyAuthoringVocabularyArtifactError('source must be an object');
  }
  if (
    input.source.homeyLibVersion !== undefined &&
    typeof input.source.homeyLibVersion !== 'string'
  ) {
    throw new HomeyAuthoringVocabularyArtifactError('source.homeyLibVersion must be a string');
  }
  if (input.source.homeyLibRoot !== undefined && typeof input.source.homeyLibRoot !== 'string') {
    throw new HomeyAuthoringVocabularyArtifactError('source.homeyLibRoot must be a string');
  }
  if (
    input.source.composeCapabilitiesDir !== undefined &&
    typeof input.source.composeCapabilitiesDir !== 'string'
  ) {
    throw new HomeyAuthoringVocabularyArtifactError(
      'source.composeCapabilitiesDir must be a string',
    );
  }
  if (!Array.isArray(input.homeyClasses)) {
    throw new HomeyAuthoringVocabularyArtifactError('homeyClasses must be an array');
  }
  if (!Array.isArray(input.capabilityIds)) {
    throw new HomeyAuthoringVocabularyArtifactError('capabilityIds must be an array');
  }
  input.homeyClasses.forEach((entry, index) => assertEntry(entry, `homeyClasses[${index}]`));
  input.capabilityIds.forEach((entry, index) => assertEntry(entry, `capabilityIds[${index}]`));
}

export function createHomeyAuthoringVocabularyArtifactV1(
  entries: {
    homeyClasses: HomeyAuthoringVocabularyEntryV1[];
    capabilityIds: HomeyAuthoringVocabularyEntryV1[];
  },
  source: HomeyAuthoringVocabularyArtifactV1['source'],
  now = new Date(),
): HomeyAuthoringVocabularyArtifactV1 {
  return {
    schemaVersion: HOMEY_AUTHORING_VOCABULARY_ARTIFACT_V1,
    generatedAt: now.toISOString(),
    source,
    homeyClasses: normalizeAuthoringEntries(entries.homeyClasses),
    capabilityIds: normalizeAuthoringEntries(entries.capabilityIds),
  };
}

export function loadHomeyAuthoringVocabularyArtifact(
  filePath: string,
): HomeyAuthoringVocabularyArtifactV1 {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assertHomeyAuthoringVocabularyArtifactV1(parsed);
  return parsed;
}

export function createHomeyAuthoringVocabularyLookupV1(
  artifact: HomeyAuthoringVocabularyArtifactV1,
): HomeyAuthoringVocabularyLookupV1 {
  return {
    homeyClasses: new Set(artifact.homeyClasses.map((entry) => entry.id)),
    capabilityIds: new Set(artifact.capabilityIds.map((entry) => entry.id)),
  };
}

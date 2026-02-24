import type { CompileProfilePlanFromFilesResult } from '../compiler/compile-profile-plan-from-files';

export const COMPILED_HOMEY_PROFILES_ARTIFACT_V1 = 'compiled-homey-profiles/v1' as const;

export interface CompiledHomeyProfilesArtifactEntryV1 {
  device: {
    deviceKey: string;
    nodeId?: number;
    manufacturerId?: number;
    productType?: number;
    productId?: number;
    firmwareVersion?: string;
  };
  compiled: CompileProfilePlanFromFilesResult;
}

export interface CompiledHomeyProfilesArtifactV1 {
  schemaVersion: typeof COMPILED_HOMEY_PROFILES_ARTIFACT_V1;
  generatedAt: string;
  source: {
    manifestFile?: string;
    rulesFiles?: string[];
    catalogFile?: string;
  };
  entries: CompiledHomeyProfilesArtifactEntryV1[];
}

export class CompiledHomeyProfilesArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompiledHomeyProfilesArtifactError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertCompiledHomeyProfilesArtifactV1(
  input: unknown,
): asserts input is CompiledHomeyProfilesArtifactV1 {
  if (!isObject(input)) throw new CompiledHomeyProfilesArtifactError('artifact must be an object');
  if (input.schemaVersion !== COMPILED_HOMEY_PROFILES_ARTIFACT_V1) {
    throw new CompiledHomeyProfilesArtifactError(
      `schemaVersion must be ${COMPILED_HOMEY_PROFILES_ARTIFACT_V1}`,
    );
  }
  if (typeof input.generatedAt !== 'string' || input.generatedAt.length === 0) {
    throw new CompiledHomeyProfilesArtifactError('generatedAt must be a non-empty string');
  }
  if (!isObject(input.source)) {
    throw new CompiledHomeyProfilesArtifactError('source must be an object');
  }
  if (!Array.isArray(input.entries)) {
    throw new CompiledHomeyProfilesArtifactError('entries must be an array');
  }
  for (let i = 0; i < input.entries.length; i += 1) {
    const entry = input.entries[i];
    if (!isObject(entry)) {
      throw new CompiledHomeyProfilesArtifactError(`entries[${i}] must be an object`);
    }
    if (!isObject(entry.device) || typeof entry.device.deviceKey !== 'string') {
      throw new CompiledHomeyProfilesArtifactError(`entries[${i}].device.deviceKey is required`);
    }
    if (
      !isObject(entry.compiled) ||
      !isObject(entry.compiled.profile) ||
      !isObject(entry.compiled.report)
    ) {
      throw new CompiledHomeyProfilesArtifactError(
        `entries[${i}].compiled must include profile and report objects`,
      );
    }
  }
}

export function createCompiledHomeyProfilesArtifactV1(
  entries: CompiledHomeyProfilesArtifactEntryV1[],
  source: CompiledHomeyProfilesArtifactV1['source'],
  now = new Date(),
): CompiledHomeyProfilesArtifactV1 {
  return {
    schemaVersion: COMPILED_HOMEY_PROFILES_ARTIFACT_V1,
    generatedAt: now.toISOString(),
    source,
    entries,
  };
}

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertCompiledHomeyProfilesArtifactV1,
  buildCompiledProfileResolverIndexV1,
  resolveCompiledProfileEntryFromIndexV1,
  type CompiledHomeyProfilesArtifactV1,
  type CompiledProfileResolverIndexV1,
  type CompiledProfileResolverMatchV1,
  type CompiledProfileResolverSelector,
  type ResolveCompiledProfileEntryOptionsV1,
} from '@zwavejs2homey/compiler';

export type {
  CompiledProfileResolverMatchV1,
  CompiledProfileResolverSelector,
  ResolveCompiledProfileEntryOptionsV1,
};

export const COMPILED_PROFILES_PATH_SETTINGS_KEY = 'compiled_profiles_file' as const;
export const DEFAULT_COMPILED_PROFILES_RELATIVE_PATH =
  './assets/compiled/compiled-homey-profiles.v1.json' as const;

export interface CompiledProfilesDuplicateSummary {
  productTriple: number;
  nodeId: number;
  deviceKey: number;
}

export interface CompiledProfilesRuntimeStatus {
  sourcePath: string;
  loaded: boolean;
  generatedAt: string | null;
  pipelineFingerprint: string | null;
  entryCount: number;
  duplicateKeys: CompiledProfilesDuplicateSummary;
  errorMessage: string | null;
}

export interface CompiledProfilesRuntime {
  artifact?: CompiledHomeyProfilesArtifactV1;
  index?: CompiledProfileResolverIndexV1;
  status: CompiledProfilesRuntimeStatus;
}

export interface NodeContext {
  bridgeId: string;
  nodeId: number;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') return error.message;
  return String(error);
}

export function resolveCompiledProfilesArtifactPath(
  appDirname: string,
  settingsValue: unknown,
): string {
  let fromSettings: string | null = null;
  if (typeof settingsValue === 'string' && settingsValue.trim().length > 0) {
    fromSettings = settingsValue.trim();
  }
  if (!fromSettings) {
    return path.resolve(appDirname, DEFAULT_COMPILED_PROFILES_RELATIVE_PATH);
  }
  return path.isAbsolute(fromSettings) ? fromSettings : path.resolve(appDirname, fromSettings);
}

function toDuplicateSummary(
  index: CompiledProfileResolverIndexV1,
): CompiledProfilesDuplicateSummary {
  return {
    productTriple: index.duplicates.productTriple.length,
    nodeId: index.duplicates.nodeId.length,
    deviceKey: index.duplicates.deviceKey.length,
  };
}

function createCompiledProfilesRuntimeStatus(sourcePath: string): CompiledProfilesRuntimeStatus {
  return {
    sourcePath,
    loaded: false,
    generatedAt: null,
    pipelineFingerprint: null,
    entryCount: 0,
    duplicateKeys: {
      productTriple: 0,
      nodeId: 0,
      deviceKey: 0,
    },
    errorMessage: null,
  };
}

export async function tryLoadCompiledProfilesRuntimeFromFile(
  sourcePath: string,
): Promise<CompiledProfilesRuntime> {
  const baseStatus = createCompiledProfilesRuntimeStatus(sourcePath);
  try {
    const raw = await fs.readFile(sourcePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    assertCompiledHomeyProfilesArtifactV1(parsed);
    const artifact = parsed as CompiledHomeyProfilesArtifactV1;
    const index = buildCompiledProfileResolverIndexV1(artifact);
    return {
      artifact,
      index,
      status: {
        sourcePath: baseStatus.sourcePath,
        loaded: true,
        generatedAt: artifact.generatedAt,
        pipelineFingerprint:
          typeof artifact.source?.pipelineFingerprint === 'string'
            ? artifact.source.pipelineFingerprint
            : null,
        entryCount: artifact.entries.length,
        duplicateKeys: toDuplicateSummary(index),
        errorMessage: null,
      },
    };
  } catch (error) {
    return {
      artifact: undefined,
      index: undefined,
      status: {
        sourcePath: baseStatus.sourcePath,
        loaded: false,
        generatedAt: null,
        pipelineFingerprint: null,
        entryCount: 0,
        duplicateKeys: {
          productTriple: 0,
          nodeId: 0,
          deviceKey: 0,
        },
        errorMessage: toErrorMessage(error),
      },
    };
  }
}

export function parseZwjsIdentityId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const parsedHex = Number.parseInt(trimmed.slice(2), 16);
    return Number.isInteger(parsedHex) && Number.isFinite(parsedHex) ? parsedHex : undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    const parsedDec = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsedDec) && Number.isFinite(parsedDec) ? parsedDec : undefined;
  }
  return undefined;
}

export function buildNodeResolverSelector(
  nodeContext: NodeContext,
  nodeState: unknown,
): CompiledProfileResolverSelector {
  const state =
    nodeState && typeof nodeState === 'object' ? (nodeState as Record<string, unknown>) : {};
  return {
    nodeId: nodeContext.nodeId,
    deviceKey: `${nodeContext.bridgeId}:${nodeContext.nodeId}`,
    manufacturerId: parseZwjsIdentityId(state.manufacturerId),
    productType: parseZwjsIdentityId(state.productType),
    productId: parseZwjsIdentityId(state.productId),
  };
}

export function resolveCompiledProfileEntryFromRuntime(
  runtime: CompiledProfilesRuntime | undefined,
  selector: CompiledProfileResolverSelector,
  options?: ResolveCompiledProfileEntryOptionsV1,
): CompiledProfileResolverMatchV1 {
  if (!runtime?.index) return { by: 'none' };
  return resolveCompiledProfileEntryFromIndexV1(runtime.index, selector, options);
}

export function resolveNodeProfileClassification(
  match: CompiledProfileResolverMatchV1,
  runtimeStatus: CompiledProfilesRuntimeStatus | undefined,
): {
  matchBy: CompiledProfileResolverMatchV1['by'];
  matchKey: string | number | null;
  profileId: string | null;
  classification: {
    homeyClass: string;
    driverTemplateId?: string;
    confidence: 'curated' | 'ha-derived' | 'generic';
    uncurated: boolean;
  };
  fallbackReason: string | null;
} {
  if (match.by !== 'none' && match.entry) {
    return {
      matchBy: match.by,
      matchKey: match.key ?? null,
      profileId: match.entry.compiled.profile.profileId,
      classification: match.entry.compiled.profile.classification,
      fallbackReason: null,
    };
  }

  return {
    matchBy: 'none',
    matchKey: null,
    profileId: null,
    classification: {
      homeyClass: 'other',
      confidence: 'generic',
      uncurated: true,
    },
    fallbackReason: runtimeStatus?.loaded
      ? 'no_compiled_profile_match'
      : 'compiled_profile_artifact_unavailable',
  };
}

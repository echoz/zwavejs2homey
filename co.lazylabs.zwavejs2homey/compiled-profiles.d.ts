import type {
  CompiledHomeyProfilesArtifactV1,
  CompiledProfileResolverIndexV1,
  CompiledProfileResolverMatchV1,
  CompiledProfileResolverSelector,
  ResolveCompiledProfileEntryOptionsV1,
} from '@zwavejs2homey/compiler';

export type {
  CompiledProfileResolverMatchV1,
  CompiledProfileResolverSelector,
  ResolveCompiledProfileEntryOptionsV1,
};

export const COMPILED_PROFILES_PATH_SETTINGS_KEY: 'compiled_profiles_file';
export const DEFAULT_COMPILED_PROFILES_RELATIVE_PATH: './assets/compiled/compiled-homey-profiles.v1.json';

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

export function resolveCompiledProfilesArtifactPath(
  appDirname: string,
  settingsValue: unknown,
): string;

export function tryLoadCompiledProfilesRuntimeFromFile(
  sourcePath: string,
): Promise<CompiledProfilesRuntime>;

export function resolveCompiledProfileEntryFromRuntime(
  runtime: CompiledProfilesRuntime | undefined,
  selector: CompiledProfileResolverSelector,
  options?: ResolveCompiledProfileEntryOptionsV1,
): CompiledProfileResolverMatchV1;

export function buildNodeResolverSelector(
  nodeContext: NodeContext,
  nodeState: unknown,
): CompiledProfileResolverSelector;

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
};

export function parseZwjsIdentityId(value: unknown): number | undefined;

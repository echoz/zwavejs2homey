import type { MutationPolicy } from './types';
export type MutationPolicyPresetName = 'safe-ops' | 'node-maintenance' | 'controller-maintenance' | 'zniffer-maintenance' | 'destructive';
export declare function getMutationPolicyPresetAllowlist(preset: MutationPolicyPresetName): string[];
export declare function createMutationPolicyPreset(preset: MutationPolicyPresetName, options?: {
    additionalAllowCommands?: string[];
}): MutationPolicy;
//# sourceMappingURL=mutation-policy-presets.d.ts.map
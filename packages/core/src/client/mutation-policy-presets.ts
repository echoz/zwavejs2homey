import type { MutationPolicy } from './types';

export type MutationPolicyPresetName =
  | 'safe-ops'
  | 'node-maintenance'
  | 'controller-maintenance'
  | 'destructive';

const SAFE_OPS_COMMANDS = [
  'node.ping',
  'node.refresh_info',
  'node.refresh_values',
  'node.poll_value',
] as const;

const NODE_MAINTENANCE_COMMANDS = [...SAFE_OPS_COMMANDS] as const;

const CONTROLLER_MAINTENANCE_COMMANDS = [
  'controller.begin_inclusion',
  'controller.begin_exclusion',
  'controller.stop_inclusion',
  'controller.stop_exclusion',
] as const;

const PRESET_ALLOWLISTS: Record<MutationPolicyPresetName, readonly string[]> = {
  'safe-ops': SAFE_OPS_COMMANDS,
  'node-maintenance': NODE_MAINTENANCE_COMMANDS,
  'controller-maintenance': CONTROLLER_MAINTENANCE_COMMANDS,
  // Destructive is intentionally empty by default to force explicit opt-in commands.
  destructive: [],
};

export function getMutationPolicyPresetAllowlist(preset: MutationPolicyPresetName): string[] {
  return [...PRESET_ALLOWLISTS[preset]];
}

export function createMutationPolicyPreset(
  preset: MutationPolicyPresetName,
  options?: { additionalAllowCommands?: string[] },
): MutationPolicy {
  const additional = options?.additionalAllowCommands ?? [];
  const allowCommands = [...PRESET_ALLOWLISTS[preset], ...additional];
  return {
    enabled: true,
    requireAllowList: true,
    allowCommands,
  };
}

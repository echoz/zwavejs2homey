"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMutationPolicyPresetAllowlist = getMutationPolicyPresetAllowlist;
exports.createMutationPolicyPreset = createMutationPolicyPreset;
const SAFE_OPS_COMMANDS = [
    'node.ping',
    'node.refresh_info',
    'node.refresh_values',
    'node.poll_value',
];
const NODE_MAINTENANCE_COMMANDS = [...SAFE_OPS_COMMANDS];
const CONTROLLER_MAINTENANCE_COMMANDS = [
    'controller.begin_inclusion',
    'controller.begin_exclusion',
    'controller.stop_inclusion',
    'controller.stop_exclusion',
];
const ZNIFFER_MAINTENANCE_COMMANDS = [
    'zniffer.init',
    'zniffer.start',
    'zniffer.stop',
    'zniffer.destroy',
    'zniffer.clear_captured_frames',
    'zniffer.set_frequency',
];
const PRESET_ALLOWLISTS = {
    'safe-ops': SAFE_OPS_COMMANDS,
    'node-maintenance': NODE_MAINTENANCE_COMMANDS,
    'controller-maintenance': CONTROLLER_MAINTENANCE_COMMANDS,
    'zniffer-maintenance': ZNIFFER_MAINTENANCE_COMMANDS,
    // Destructive is intentionally empty by default to force explicit opt-in commands.
    destructive: [],
};
function getMutationPolicyPresetAllowlist(preset) {
    return [...PRESET_ALLOWLISTS[preset]];
}
function createMutationPolicyPreset(preset, options) {
    const additional = options?.additionalAllowCommands ?? [];
    const allowCommands = [...PRESET_ALLOWLISTS[preset], ...additional];
    return {
        enabled: true,
        requireAllowList: true,
        allowCommands,
    };
}

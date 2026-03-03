"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHaPlatformOutput = resolveHaPlatformOutput;
exports.resolveHaCapabilityConflict = resolveHaCapabilityConflict;
const HA_PLATFORM_OUTPUT_POLICIES = {
    FAN: {
        homeyClass: 'fan',
        driverTemplateId: 'ha-import-fan',
        defaultCapabilityId: 'dim',
    },
    CLIMATE: {
        homeyClass: 'thermostat',
        driverTemplateId: 'ha-import-thermostat',
        defaultCapabilityId: 'target_temperature',
    },
    SWITCH: {
        homeyClass: 'socket',
        driverTemplateId: 'ha-import-switch',
        defaultCapabilityId: 'onoff',
    },
    LIGHT: {
        homeyClass: 'light',
        driverTemplateId: 'ha-import-light',
        defaultCapabilityId: 'onoff',
        capabilityByPrimaryCommandClass: {
            38: 'dim',
        },
    },
    BINARY_SENSOR: {
        homeyClass: 'sensor',
        driverTemplateId: 'ha-import-binary-sensor',
        defaultCapabilityId: 'alarm_generic',
    },
    LOCK: {
        homeyClass: 'lock',
        driverTemplateId: 'ha-import-lock',
        defaultCapabilityId: 'locked',
    },
    SELECT: {
        homeyClass: 'other',
        driverTemplateId: 'ha-import-select',
        defaultCapabilityId: 'enum_select',
    },
    COVER: {
        homeyClass: 'curtain',
        driverTemplateId: 'ha-import-cover',
        defaultCapabilityId: 'windowcoverings_set',
    },
    SENSOR: {
        homeyClass: 'sensor',
        driverTemplateId: 'ha-import-sensor',
        defaultCapabilityId: 'measure_generic',
    },
    NUMBER: {
        homeyClass: 'other',
        driverTemplateId: 'ha-import-number',
        defaultCapabilityId: 'number_value',
    },
    BUTTON: {
        homeyClass: 'button',
        driverTemplateId: 'ha-import-button',
        defaultCapabilityId: 'button_action',
    },
    SIREN: {
        homeyClass: 'alarm',
        driverTemplateId: 'ha-import-siren',
        defaultCapabilityId: 'alarm_siren',
    },
    HUMIDIFIER: {
        homeyClass: 'humidifier',
        driverTemplateId: 'ha-import-humidifier',
        defaultCapabilityId: 'dim',
    },
};
const HA_CAPABILITY_CONFLICT_POLICIES = [
    {
        commandClass: 38,
        property: 'currentValue',
        capabilityId: 'windowcoverings_set',
        conflict: { key: 'cover.position_control', mode: 'exclusive', priority: 90 },
    },
    {
        commandClass: 38,
        property: 'currentValue',
        capabilityId: 'dim',
        conflict: { key: 'cover.position_control', mode: 'exclusive', priority: 40 },
    },
    {
        commandClass: 38,
        property: 'currentValue',
        capabilityId: 'number_value',
        conflict: { key: 'cover.position_control', mode: 'exclusive', priority: 10 },
    },
];
function normalizePropertyToken(property) {
    if (property === undefined)
        return '';
    return String(property).trim();
}
function resolveHaPlatformOutput(platform, primaryValue) {
    const policy = HA_PLATFORM_OUTPUT_POLICIES[platform];
    if (!policy)
        return null;
    const capabilityId = policy.capabilityByPrimaryCommandClass?.[primaryValue.commandClass] ??
        policy.defaultCapabilityId;
    return {
        homeyClass: policy.homeyClass,
        driverTemplateId: policy.driverTemplateId,
        capabilityId,
    };
}
function resolveHaCapabilityConflict(primaryValue, capabilityId) {
    if (!capabilityId)
        return undefined;
    const property = normalizePropertyToken(primaryValue.property);
    const policy = HA_CAPABILITY_CONFLICT_POLICIES.find((candidate) => candidate.commandClass === primaryValue.commandClass &&
        candidate.property === property &&
        candidate.capabilityId === capabilityId);
    if (!policy)
        return undefined;
    return { ...policy.conflict };
}

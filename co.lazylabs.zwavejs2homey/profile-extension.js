"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROFILE_EXTENSION_CONTRACTS_V1 = exports.ProfileExtensionRegistry = exports.ProfileExtensionRegistryError = exports.PROFILE_EXTENSION_SCHEMA_VERSION = void 0;
exports.createProfileExtensionRegistry = createProfileExtensionRegistry;
exports.PROFILE_EXTENSION_SCHEMA_VERSION = 'homey-profile-extension-contract/v1';
class ProfileExtensionRegistryError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = 'ProfileExtensionRegistryError';
        this.code = code;
        this.details = details;
    }
}
exports.ProfileExtensionRegistryError = ProfileExtensionRegistryError;
const ACTION_ARGUMENT_TYPES = new Set([
    'string',
    'number',
    'integer',
    'boolean',
    'enum',
]);
const SAFETY_CHECKS = new Set([
    'requires-supported-profile',
    'requires-node-ready',
    'requires-write-access',
    'requires-selector-writeability',
    'requires-explicit-confirmation',
]);
function assertObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label} must be an object`, label);
    }
}
function normalizeNonEmptyString(value, label) {
    if (typeof value !== 'string') {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label} must be a string`, label);
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label} must be a non-empty string`, label);
    }
    return trimmed;
}
function normalizeStringList(value, label) {
    if (typeof value === 'undefined')
        return [];
    if (!Array.isArray(value)) {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label} must be an array`, label);
    }
    const output = [];
    const seen = new Set();
    for (const item of value) {
        const normalized = normalizeNonEmptyString(item, label);
        if (seen.has(normalized)) {
            throw new ProfileExtensionRegistryError('invalid-contract', `${label} contains duplicate value: ${normalized}`, { label, value: normalized });
        }
        seen.add(normalized);
        output.push(normalized);
    }
    return output;
}
function normalizeBoolean(value, label) {
    if (typeof value !== 'boolean') {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label} must be a boolean`, label);
    }
    return value;
}
function normalizeOptionalDescription(value, label) {
    if (typeof value === 'undefined')
        return undefined;
    return normalizeNonEmptyString(value, label);
}
function normalizeMatchPredicate(value, label) {
    assertObject(value, label);
    const profileIds = normalizeStringList(value.profileIds, `${label}.profileIds`);
    const driverTemplateIds = normalizeStringList(value.driverTemplateIds, `${label}.driverTemplateIds`);
    const homeyClasses = normalizeStringList(value.homeyClasses, `${label}.homeyClasses`);
    if (profileIds.length === 0 && driverTemplateIds.length === 0 && homeyClasses.length === 0) {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label} must define at least one predicate list`, label);
    }
    return {
        profileIds,
        driverTemplateIds,
        homeyClasses,
    };
}
function normalizeActionArgument(value, extensionId, actionId, index) {
    const label = `extension(${extensionId}).actions(${actionId}).arguments[${index}]`;
    assertObject(value, label);
    const name = normalizeNonEmptyString(value.name, `${label}.name`);
    const rawType = normalizeNonEmptyString(value.type, `${label}.type`);
    if (!ACTION_ARGUMENT_TYPES.has(rawType)) {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label}.type must be one of: ${Array.from(ACTION_ARGUMENT_TYPES).join(', ')}`, { label: `${label}.type`, value: rawType });
    }
    const type = rawType;
    const description = normalizeOptionalDescription(value.description, `${label}.description`);
    const required = typeof value.required === 'undefined'
        ? false
        : normalizeBoolean(value.required, `${label}.required`);
    const enumValues = normalizeStringList(value.enumValues, `${label}.enumValues`);
    if (type === 'enum' && enumValues.length === 0) {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label}.enumValues must be defined when argument type is enum`, label);
    }
    if (type !== 'enum' && enumValues.length > 0) {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label}.enumValues is only valid when argument type is enum`, label);
    }
    return {
        name,
        type,
        description,
        required,
        enumValues: enumValues.length > 0 ? enumValues : undefined,
    };
}
function normalizeActionContract(value, extensionId, index) {
    const label = `extension(${extensionId}).actions[${index}]`;
    assertObject(value, label);
    const actionId = normalizeNonEmptyString(value.actionId, `${label}.actionId`);
    const title = normalizeNonEmptyString(value.title, `${label}.title`);
    const description = normalizeNonEmptyString(value.description, `${label}.description`);
    const dryRunSupported = normalizeBoolean(value.dryRunSupported, `${label}.dryRunSupported`);
    const safetyChecks = normalizeStringList(value.safetyChecks, `${label}.safetyChecks`);
    if (safetyChecks.length === 0) {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label}.safetyChecks must contain at least one entry`, label);
    }
    for (const check of safetyChecks) {
        if (!SAFETY_CHECKS.has(check)) {
            throw new ProfileExtensionRegistryError('invalid-contract', `${label}.safetyChecks includes unsupported check: ${check}`, { label: `${label}.safetyChecks`, value: check });
        }
    }
    const argumentsValue = value.arguments;
    let normalizedArguments = [];
    if (typeof argumentsValue !== 'undefined') {
        if (!Array.isArray(argumentsValue)) {
            throw new ProfileExtensionRegistryError('invalid-contract', `${label}.arguments must be an array`, `${label}.arguments`);
        }
        const seenArgumentNames = new Set();
        normalizedArguments = argumentsValue.map((entry, argumentIndex) => normalizeActionArgument(entry, extensionId, actionId, argumentIndex));
        for (const entry of normalizedArguments) {
            if (seenArgumentNames.has(entry.name)) {
                throw new ProfileExtensionRegistryError('invalid-contract', `${label}.arguments contains duplicate name: ${entry.name}`, { label: `${label}.arguments`, value: entry.name });
            }
            seenArgumentNames.add(entry.name);
        }
    }
    return {
        actionId,
        title,
        description,
        dryRunSupported,
        safetyChecks: safetyChecks,
        arguments: normalizedArguments.length > 0 ? normalizedArguments : undefined,
    };
}
function normalizeReadSections(value, extensionId) {
    const label = `extension(${extensionId}).read.sections`;
    if (!Array.isArray(value) || value.length === 0) {
        throw new ProfileExtensionRegistryError('invalid-contract', `${label} must be a non-empty array`, label);
    }
    const seenSectionIds = new Set();
    return value.map((entry, index) => {
        const sectionLabel = `${label}[${index}]`;
        assertObject(entry, sectionLabel);
        const sectionId = normalizeNonEmptyString(entry.sectionId, `${sectionLabel}.sectionId`);
        if (seenSectionIds.has(sectionId)) {
            throw new ProfileExtensionRegistryError('invalid-contract', `${label} contains duplicate sectionId: ${sectionId}`, { label, value: sectionId });
        }
        seenSectionIds.add(sectionId);
        return {
            sectionId,
            title: normalizeNonEmptyString(entry.title, `${sectionLabel}.title`),
            description: normalizeNonEmptyString(entry.description, `${sectionLabel}.description`),
        };
    });
}
function normalizeContract(value) {
    assertObject(value, 'extension');
    const extensionId = normalizeNonEmptyString(value.extensionId, 'extension.extensionId');
    const schemaVersion = normalizeNonEmptyString(value.schemaVersion, `extension(${extensionId}).schemaVersion`);
    if (schemaVersion !== exports.PROFILE_EXTENSION_SCHEMA_VERSION) {
        throw new ProfileExtensionRegistryError('invalid-contract', `extension(${extensionId}).schemaVersion must be ${exports.PROFILE_EXTENSION_SCHEMA_VERSION}`, { extensionId, schemaVersion });
    }
    const title = normalizeNonEmptyString(value.title, `extension(${extensionId}).title`);
    const description = normalizeNonEmptyString(value.description, `extension(${extensionId}).description`);
    const match = normalizeMatchPredicate(value.match, `extension(${extensionId}).match`);
    assertObject(value.read, `extension(${extensionId}).read`);
    const sections = normalizeReadSections(value.read.sections, extensionId);
    if (!Array.isArray(value.actions)) {
        throw new ProfileExtensionRegistryError('invalid-contract', `extension(${extensionId}).actions must be an array`, `extension(${extensionId}).actions`);
    }
    const normalizedActions = value.actions.map((entry, index) => normalizeActionContract(entry, extensionId, index));
    const seenActionIds = new Set();
    for (const action of normalizedActions) {
        if (seenActionIds.has(action.actionId)) {
            throw new ProfileExtensionRegistryError('invalid-contract', `extension(${extensionId}).actions contains duplicate actionId: ${action.actionId}`, { extensionId, actionId: action.actionId });
        }
        seenActionIds.add(action.actionId);
    }
    return {
        schemaVersion: exports.PROFILE_EXTENSION_SCHEMA_VERSION,
        extensionId,
        title,
        description,
        match,
        read: {
            sections,
        },
        actions: normalizedActions,
    };
}
function normalizeMatchContextValue(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function isAllowedValue(value, allowed) {
    if (allowed.length === 0)
        return true;
    if (!value)
        return false;
    return allowed.includes(value);
}
function explainPredicateMatch(contract, context) {
    const profileId = normalizeMatchContextValue(context.profileId);
    if (!isAllowedValue(profileId, contract.match.profileIds ?? [])) {
        return {
            extensionId: contract.extensionId,
            matched: false,
            reason: profileId ? 'profile-id-mismatch' : 'missing-profile-id',
        };
    }
    const driverTemplateId = normalizeMatchContextValue(context.driverTemplateId);
    if (!isAllowedValue(driverTemplateId, contract.match.driverTemplateIds ?? [])) {
        return {
            extensionId: contract.extensionId,
            matched: false,
            reason: driverTemplateId ? 'driver-template-id-mismatch' : 'missing-driver-template-id',
        };
    }
    const homeyClass = normalizeMatchContextValue(context.homeyClass);
    if (!isAllowedValue(homeyClass, contract.match.homeyClasses ?? [])) {
        return {
            extensionId: contract.extensionId,
            matched: false,
            reason: homeyClass ? 'homey-class-mismatch' : 'missing-homey-class',
        };
    }
    return {
        extensionId: contract.extensionId,
        matched: true,
        reason: 'matched',
    };
}
class ProfileExtensionRegistry {
    constructor(contracts) {
        if (!Array.isArray(contracts)) {
            throw new ProfileExtensionRegistryError('invalid-contract-list', 'profile extension contracts must be an array');
        }
        const normalizedContracts = contracts.map((contract) => normalizeContract(contract));
        const byId = new Map();
        for (const contract of normalizedContracts) {
            if (byId.has(contract.extensionId)) {
                throw new ProfileExtensionRegistryError('duplicate-extension-id', `Duplicate profile extension id: ${contract.extensionId}`, contract.extensionId);
            }
            byId.set(contract.extensionId, contract);
        }
        this.contracts = Object.freeze(normalizedContracts.map((entry) => Object.freeze(entry)));
        this.contractsById = byId;
    }
    list() {
        return this.contracts;
    }
    get(extensionId) {
        const normalized = normalizeMatchContextValue(extensionId);
        if (!normalized)
            return undefined;
        return this.contractsById.get(normalized);
    }
    explain(context) {
        return this.contracts.map((contract) => explainPredicateMatch(contract, context));
    }
    explainMatch(extensionId, context) {
        const contract = this.get(extensionId);
        if (!contract) {
            return {
                extensionId: normalizeMatchContextValue(extensionId) ?? '',
                matched: false,
                reason: 'extension-not-found',
            };
        }
        return explainPredicateMatch(contract, context);
    }
    resolve(context) {
        return this.explain(context)
            .filter((entry) => entry.matched)
            .map((entry) => this.contractsById.get(entry.extensionId))
            .filter((entry) => Boolean(entry));
    }
    resolveAction(extensionId, actionId) {
        const contract = this.get(extensionId);
        if (!contract)
            return undefined;
        const normalizedActionId = normalizeMatchContextValue(actionId);
        if (!normalizedActionId)
            return undefined;
        return contract.actions.find((action) => action.actionId === normalizedActionId);
    }
}
exports.ProfileExtensionRegistry = ProfileExtensionRegistry;
function createProfileExtensionRegistry(contracts = []) {
    return new ProfileExtensionRegistry(contracts);
}
const LOCK_USER_CODES_EXTENSION_CONTRACT_V1 = {
    schemaVersion: exports.PROFILE_EXTENSION_SCHEMA_VERSION,
    extensionId: 'lock-user-codes',
    title: 'Lock User Codes',
    description: 'Inspect and manage lock user-code slots for supported lock profiles.',
    match: {
        driverTemplateIds: ['product-yale-lock'],
        homeyClasses: ['lock'],
    },
    read: {
        sections: [
            {
                sectionId: 'user-code-slots',
                title: 'User Code Slots',
                description: 'Current user-code slot status and occupancy summary.',
            },
            {
                sectionId: 'lockout-diagnostics',
                title: 'Lockout Diagnostics',
                description: 'Current keypad/lockout status derived from runtime values.',
            },
        ],
    },
    actions: [
        {
            actionId: 'set-user-code',
            title: 'Set User Code',
            description: 'Set or update a user-code slot.',
            dryRunSupported: true,
            safetyChecks: [
                'requires-supported-profile',
                'requires-node-ready',
                'requires-write-access',
                'requires-explicit-confirmation',
            ],
            arguments: [
                {
                    name: 'slot',
                    type: 'integer',
                    description: 'User-code slot number to set.',
                    required: true,
                },
                {
                    name: 'code',
                    type: 'string',
                    description: 'PIN code to assign to the slot.',
                    required: true,
                },
            ],
        },
        {
            actionId: 'remove-user-code',
            title: 'Remove User Code',
            description: 'Remove the PIN assigned to a user-code slot.',
            dryRunSupported: true,
            safetyChecks: [
                'requires-supported-profile',
                'requires-node-ready',
                'requires-write-access',
                'requires-explicit-confirmation',
            ],
            arguments: [
                {
                    name: 'slot',
                    type: 'integer',
                    description: 'User-code slot number to clear.',
                    required: true,
                },
            ],
        },
        {
            actionId: 'set-user-code-state',
            title: 'Set User Code State',
            description: 'Enable or disable a user-code slot without changing the PIN.',
            dryRunSupported: true,
            safetyChecks: [
                'requires-supported-profile',
                'requires-node-ready',
                'requires-write-access',
                'requires-explicit-confirmation',
            ],
            arguments: [
                {
                    name: 'slot',
                    type: 'integer',
                    description: 'User-code slot number to update.',
                    required: true,
                },
                {
                    name: 'state',
                    type: 'enum',
                    description: 'Target slot state.',
                    required: true,
                    enumValues: ['enabled', 'disabled'],
                },
            ],
        },
    ],
};
exports.PROFILE_EXTENSION_CONTRACTS_V1 = Object.freeze([
    LOCK_USER_CODES_EXTENSION_CONTRACT_V1,
]);

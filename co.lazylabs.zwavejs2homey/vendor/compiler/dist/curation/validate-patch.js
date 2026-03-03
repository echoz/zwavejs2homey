"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeCurationPatchValidationError = void 0;
exports.assertRuntimeCurationPatchSetV1 = assertRuntimeCurationPatchSetV1;
exports.validateRuntimeCurationPatchSetV1 = validateRuntimeCurationPatchSetV1;
const COLLECTION_PROFILE_SLOTS = new Set(['capabilities', 'subscriptions', 'ignoredValues']);
const DEVICE_SLOTS = new Set(['identity.homeyClass', 'identity.driverTemplateId']);
const CAPABILITY_SLOTS = new Set(['inboundMapping', 'outboundMapping', 'flags']);
class RuntimeCurationPatchValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RuntimeCurationPatchValidationError';
    }
}
exports.RuntimeCurationPatchValidationError = RuntimeCurationPatchValidationError;
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertTarget(target, context) {
    if (!isObject(target)) {
        throw new RuntimeCurationPatchValidationError(`${context}.target must be an object`);
    }
    if (target.scope === 'device') {
        if (typeof target.slot !== 'string' || !DEVICE_SLOTS.has(target.slot)) {
            throw new RuntimeCurationPatchValidationError(`${context}.target.slot is not a supported device slot`);
        }
        return;
    }
    if (target.scope === 'capability') {
        if (typeof target.capabilityId !== 'string' || target.capabilityId.trim() === '') {
            throw new RuntimeCurationPatchValidationError(`${context}.target.capabilityId is required`);
        }
        if (typeof target.slot !== 'string' || !CAPABILITY_SLOTS.has(target.slot)) {
            throw new RuntimeCurationPatchValidationError(`${context}.target.slot is not a supported capability slot`);
        }
        return;
    }
    if (target.scope === 'profile') {
        if (typeof target.slot !== 'string' || !COLLECTION_PROFILE_SLOTS.has(target.slot)) {
            throw new RuntimeCurationPatchValidationError(`${context}.target.slot is not a supported profile slot`);
        }
        return;
    }
    throw new RuntimeCurationPatchValidationError(`${context}.target.scope is not supported`);
}
function allowsCollectionMutation(target) {
    return target.scope === 'profile' && COLLECTION_PROFILE_SLOTS.has(target.slot);
}
function assertOperation(operation, context) {
    if (!isObject(operation)) {
        throw new RuntimeCurationPatchValidationError(`${context} must be an object`);
    }
    if (operation.op !== 'replace' &&
        operation.op !== 'add' &&
        operation.op !== 'remove' &&
        operation.op !== 'disable') {
        throw new RuntimeCurationPatchValidationError(`${context}.op is not supported`);
    }
    assertTarget(operation.target, context);
    const target = operation.target;
    if (operation.op === 'add' || operation.op === 'remove') {
        if (!allowsCollectionMutation(target)) {
            throw new RuntimeCurationPatchValidationError(`${context}.${operation.op} is only supported for profile collection targets`);
        }
    }
    if ((operation.op === 'replace' || operation.op === 'disable') && target.scope === 'profile') {
        throw new RuntimeCurationPatchValidationError(`${context}.${operation.op} is not supported for profile collection targets`);
    }
    if ((operation.op === 'replace' || operation.op === 'add') && !('value' in operation)) {
        throw new RuntimeCurationPatchValidationError(`${context}.value is required for ${operation.op}`);
    }
    if (operation.op === 'disable' && 'value' in operation) {
        throw new RuntimeCurationPatchValidationError(`${context}.disable must not include value`);
    }
}
function assertPatch(patch, index) {
    const context = `patches[${index}]`;
    if (!isObject(patch)) {
        throw new RuntimeCurationPatchValidationError(`${context} must be an object`);
    }
    if (typeof patch.patchId !== 'string' || patch.patchId.trim() === '') {
        throw new RuntimeCurationPatchValidationError(`${context}.patchId is required`);
    }
    if (!isObject(patch.targetDevice)) {
        throw new RuntimeCurationPatchValidationError(`${context}.targetDevice must be an object`);
    }
    const hasCatalogId = typeof patch.targetDevice.catalogId === 'string' && patch.targetDevice.catalogId.trim() !== '';
    const hasDiagnosticKey = typeof patch.targetDevice.diagnosticDeviceKey === 'string' &&
        patch.targetDevice.diagnosticDeviceKey.trim() !== '';
    if (!hasCatalogId && !hasDiagnosticKey) {
        throw new RuntimeCurationPatchValidationError(`${context}.targetDevice requires catalogId or diagnosticDeviceKey`);
    }
    if (!Array.isArray(patch.operations) || patch.operations.length === 0) {
        throw new RuntimeCurationPatchValidationError(`${context}.operations must be a non-empty array`);
    }
    patch.operations.forEach((op, opIndex) => assertOperation(op, `${context}.operations[${opIndex}]`));
}
function assertRuntimeCurationPatchSetV1(input) {
    if (!isObject(input)) {
        throw new RuntimeCurationPatchValidationError('patch set must be an object');
    }
    if (input.schemaVersion !== 'runtime-curation-patches/v1') {
        throw new RuntimeCurationPatchValidationError('schemaVersion must be runtime-curation-patches/v1');
    }
    if (!Array.isArray(input.patches)) {
        throw new RuntimeCurationPatchValidationError('patches must be an array');
    }
    input.patches.forEach((patch, index) => assertPatch(patch, index));
}
function validateRuntimeCurationPatchSetV1(input) {
    try {
        assertRuntimeCurationPatchSetV1(input);
        return { ok: true, value: input };
    }
    catch (error) {
        if (error instanceof RuntimeCurationPatchValidationError) {
            return { ok: false, error };
        }
        throw error;
    }
}

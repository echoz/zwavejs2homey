"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isZwjsNodeValueEnvelopeResult = isZwjsNodeValueEnvelopeResult;
exports.extractZwjsNodeValue = extractZwjsNodeValue;
exports.hasZwjsNodeValue = hasZwjsNodeValue;
exports.isZwjsDurationValue = isZwjsDurationValue;
exports.isZwjsLockHandleFlagsValue = isZwjsLockHandleFlagsValue;
exports.isZwjsFirmwareVersionsValue = isZwjsFirmwareVersionsValue;
exports.extractZwjsDurationValue = extractZwjsDurationValue;
exports.extractZwjsLockHandleFlagsValue = extractZwjsLockHandleFlagsValue;
exports.extractZwjsFirmwareVersionsValue = extractZwjsFirmwareVersionsValue;
exports.isZwjsSwitchDurationValueSample = isZwjsSwitchDurationValueSample;
exports.isZwjsLockHandleFlagsValueSample = isZwjsLockHandleFlagsValueSample;
exports.isZwjsFirmwareVersionsValueSample = isZwjsFirmwareVersionsValueSample;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeCommandClass(commandClass) {
    if (typeof commandClass === 'number' && Number.isInteger(commandClass)) {
        return commandClass;
    }
    if (typeof commandClass !== 'string')
        return undefined;
    const trimmed = commandClass.trim();
    if (!trimmed)
        return undefined;
    const parsed = trimmed.startsWith('0x')
        ? Number.parseInt(trimmed.slice(2), 16)
        : Number.parseInt(trimmed, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
}
function matchesProperty(property, expected) {
    return String(property) === expected;
}
function isZwjsNodeValueEnvelopeResult(value) {
    return isRecord(value);
}
function extractZwjsNodeValue(result) {
    if (isZwjsNodeValueEnvelopeResult(result)) {
        return 'value' in result ? result.value : undefined;
    }
    return result;
}
function hasZwjsNodeValue(result) {
    if (isZwjsNodeValueEnvelopeResult(result)) {
        return 'value' in result;
    }
    return result !== undefined;
}
function isZwjsDurationValue(value) {
    return (isRecord(value) &&
        typeof value.value === 'number' &&
        Number.isFinite(value.value) &&
        typeof value.unit === 'string');
}
function isZwjsLockHandleFlagsValue(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'boolean');
}
function isZwjsFirmwareVersionsValue(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
function extractZwjsDurationValue(result) {
    const value = extractZwjsNodeValue(result);
    return isZwjsDurationValue(value) ? value : undefined;
}
function extractZwjsLockHandleFlagsValue(result) {
    const value = extractZwjsNodeValue(result);
    return isZwjsLockHandleFlagsValue(value) ? value : undefined;
}
function extractZwjsFirmwareVersionsValue(result) {
    const value = extractZwjsNodeValue(result);
    return isZwjsFirmwareVersionsValue(value) ? value : undefined;
}
function isZwjsSwitchDurationValueSample(valueId, result) {
    const commandClass = normalizeCommandClass(valueId.commandClass);
    if (commandClass !== 37 && commandClass !== 38)
        return false;
    if (!matchesProperty(valueId.property, 'duration'))
        return false;
    return extractZwjsDurationValue(result) !== undefined;
}
function isZwjsLockHandleFlagsValueSample(valueId, result) {
    const commandClass = normalizeCommandClass(valueId.commandClass);
    if (commandClass !== 98)
        return false;
    const property = String(valueId.property);
    const isHandleFlagsProperty = property === 'insideHandlesCanOpenDoor' ||
        property === 'insideHandlesCanOpenDoorConfiguration' ||
        property === 'outsideHandlesCanOpenDoor' ||
        property === 'outsideHandlesCanOpenDoorConfiguration';
    if (!isHandleFlagsProperty)
        return false;
    return extractZwjsLockHandleFlagsValue(result) !== undefined;
}
function isZwjsFirmwareVersionsValueSample(valueId, result) {
    const commandClass = normalizeCommandClass(valueId.commandClass);
    if (commandClass !== 134)
        return false;
    if (!matchesProperty(valueId.property, 'firmwareVersions'))
        return false;
    return extractZwjsFirmwareVersionsValue(result) !== undefined;
}

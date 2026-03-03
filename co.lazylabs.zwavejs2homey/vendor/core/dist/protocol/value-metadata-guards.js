"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isZwjsNodeValueMetadataResult = isZwjsNodeValueMetadataResult;
exports.hasZwjsNodeValueMetadataBounds = hasZwjsNodeValueMetadataBounds;
exports.isZwjsNodeValueMetadataDuration = isZwjsNodeValueMetadataDuration;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isObjectOrArray(value) {
    return (typeof value === 'object' && value !== null) || Array.isArray(value);
}
function isZwjsNodeValueMetadataResult(value) {
    if (!isRecord(value))
        return false;
    const stringKeys = ['type', 'label', 'description', 'info', 'name', 'unit', 'format'];
    for (const key of stringKeys) {
        if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== 'string') {
            return false;
        }
    }
    const booleanKeys = ['readable', 'writeable', 'allowManualEntry', 'isFromConfig'];
    for (const key of booleanKeys) {
        if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== 'boolean') {
            return false;
        }
    }
    const numberKeys = ['min', 'max', 'steps', 'minLength', 'maxLength', 'valueSize'];
    for (const key of numberKeys) {
        if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== 'number') {
            return false;
        }
    }
    const objectOrArrayKeys = ['states', 'valueChangeOptions', 'ccSpecific'];
    for (const key of objectOrArrayKeys) {
        if (Object.prototype.hasOwnProperty.call(value, key) &&
            value[key] !== null &&
            !isObjectOrArray(value[key])) {
            return false;
        }
    }
    return true;
}
function hasZwjsNodeValueMetadataBounds(metadata) {
    return (typeof metadata.min === 'number' &&
        Number.isFinite(metadata.min) &&
        typeof metadata.max === 'number' &&
        Number.isFinite(metadata.max));
}
function isZwjsNodeValueMetadataDuration(metadata) {
    return metadata.type === 'duration';
}

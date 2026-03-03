"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isZwjsValueId = isZwjsValueId;
exports.isZwjsDefinedValueId = isZwjsDefinedValueId;
exports.extractZwjsDefinedValueIds = extractZwjsDefinedValueIds;
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function isValueKey(value) {
    return typeof value === 'string' || typeof value === 'number';
}
function isZwjsValueId(value) {
    return (isRecord(value) &&
        isValueKey(value.commandClass) &&
        isValueKey(value.property) &&
        (value.endpoint === undefined || typeof value.endpoint === 'number') &&
        (value.propertyKey === undefined || isValueKey(value.propertyKey)));
}
function isZwjsDefinedValueId(value) {
    return isZwjsValueId(value);
}
function extractZwjsDefinedValueIds(result) {
    if (Array.isArray(result)) {
        return result.filter(isZwjsDefinedValueId);
    }
    if (isRecord(result)) {
        if (Array.isArray(result.values)) {
            return result.values.filter(isZwjsDefinedValueId);
        }
        if (Array.isArray(result.valueIds)) {
            return result.valueIds.filter(isZwjsDefinedValueId);
        }
    }
    return [];
}

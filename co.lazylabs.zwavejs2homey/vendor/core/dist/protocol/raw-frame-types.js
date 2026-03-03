"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRecord = isRecord;
exports.isZwjsVersionFrame = isZwjsVersionFrame;
exports.isZwjsEventFrame = isZwjsEventFrame;
exports.isZwjsResultFrame = isZwjsResultFrame;
exports.isZwjsResultSuccessFrame = isZwjsResultSuccessFrame;
exports.isZwjsResultErrorFrame = isZwjsResultErrorFrame;
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function isZwjsVersionFrame(value) {
    return (isRecord(value) &&
        value.type === 'version' &&
        typeof value.driverVersion === 'string' &&
        typeof value.serverVersion === 'string' &&
        typeof value.minSchemaVersion === 'number' &&
        typeof value.maxSchemaVersion === 'number');
}
function isZwjsEventFrame(value) {
    return (isRecord(value) &&
        value.type === 'event' &&
        isRecord(value.event) &&
        typeof value.event.source === 'string' &&
        typeof value.event.event === 'string');
}
function isZwjsResultFrame(value) {
    return (isRecord(value) &&
        value.type === 'result' &&
        typeof value.messageId === 'string' &&
        typeof value.success === 'boolean');
}
function isZwjsResultSuccessFrame(value) {
    return isZwjsResultFrame(value) && value.success === true && 'result' in value;
}
function isZwjsResultErrorFrame(value) {
    return isZwjsResultFrame(value) && value.success === false;
}

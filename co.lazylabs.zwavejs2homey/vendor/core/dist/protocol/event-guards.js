"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isZwjsNodeValueUpdatedEvent = isZwjsNodeValueUpdatedEvent;
exports.isZwjsNodeValueAddedEvent = isZwjsNodeValueAddedEvent;
exports.isZwjsNodeValueRemovedEvent = isZwjsNodeValueRemovedEvent;
exports.isZwjsNodeValueNotificationEvent = isZwjsNodeValueNotificationEvent;
exports.isZwjsNodeInterviewStartedEvent = isZwjsNodeInterviewStartedEvent;
exports.isZwjsNodeInterviewCompletedEvent = isZwjsNodeInterviewCompletedEvent;
exports.isZwjsNodeInterviewFailedEvent = isZwjsNodeInterviewFailedEvent;
exports.isZwjsNodeInterviewStageCompletedEvent = isZwjsNodeInterviewStageCompletedEvent;
exports.isZwjsNodeMetadataUpdatedEvent = isZwjsNodeMetadataUpdatedEvent;
exports.isZwjsNodeNotificationEvent = isZwjsNodeNotificationEvent;
exports.isZwjsNodeWakeUpEvent = isZwjsNodeWakeUpEvent;
exports.isZwjsNodeSleepEvent = isZwjsNodeSleepEvent;
exports.isZwjsDriverLoggingEvent = isZwjsDriverLoggingEvent;
exports.isZwjsDriverLogConfigUpdatedEvent = isZwjsDriverLogConfigUpdatedEvent;
exports.isZwjsDriverFirmwareUpdateProgressEvent = isZwjsDriverFirmwareUpdateProgressEvent;
exports.isZwjsDriverFirmwareUpdateFinishedEvent = isZwjsDriverFirmwareUpdateFinishedEvent;
exports.isZwjsControllerGrantSecurityClassesEvent = isZwjsControllerGrantSecurityClassesEvent;
exports.isZwjsControllerValidateDskAndEnterPinEvent = isZwjsControllerValidateDskAndEnterPinEvent;
exports.isZwjsControllerInclusionAbortedEvent = isZwjsControllerInclusionAbortedEvent;
exports.isZwjsControllerNvmConvertProgressEvent = isZwjsControllerNvmConvertProgressEvent;
exports.isZwjsControllerNvmBackupProgressEvent = isZwjsControllerNvmBackupProgressEvent;
exports.isZwjsControllerNvmRestoreProgressEvent = isZwjsControllerNvmRestoreProgressEvent;
exports.isZwjsControllerFirmwareUpdateProgressEvent = isZwjsControllerFirmwareUpdateProgressEvent;
exports.isZwjsControllerFirmwareUpdateFinishedEvent = isZwjsControllerFirmwareUpdateFinishedEvent;
exports.isZwjsNodeTestPowerlevelProgressEvent = isZwjsNodeTestPowerlevelProgressEvent;
exports.isZwjsNodeCheckLifelineHealthProgressEvent = isZwjsNodeCheckLifelineHealthProgressEvent;
exports.isZwjsNodeCheckRouteHealthProgressEvent = isZwjsNodeCheckRouteHealthProgressEvent;
exports.isZwjsNodeFirmwareUpdateProgressEvent = isZwjsNodeFirmwareUpdateProgressEvent;
exports.isZwjsNodeFirmwareUpdateFinishedEvent = isZwjsNodeFirmwareUpdateFinishedEvent;
exports.isZwjsZnifferReadyEvent = isZwjsZnifferReadyEvent;
exports.isZwjsZnifferCorruptedFrameEvent = isZwjsZnifferCorruptedFrameEvent;
exports.isZwjsZnifferFrameEvent = isZwjsZnifferFrameEvent;
exports.isZwjsZnifferErrorEvent = isZwjsZnifferErrorEvent;
function isNodeEventBase(event, expectedName) {
    return (event.source === 'node' && event.event === expectedName && typeof event.nodeId === 'number');
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
function isZwjsNodeValueUpdatedEvent(event) {
    return isNodeEventBase(event, 'value updated');
}
function isZwjsNodeValueAddedEvent(event) {
    return isNodeEventBase(event, 'value added');
}
function isZwjsNodeValueRemovedEvent(event) {
    return isNodeEventBase(event, 'value removed');
}
function isZwjsNodeValueNotificationEvent(event) {
    return isNodeEventBase(event, 'value notification');
}
function isZwjsNodeInterviewStartedEvent(event) {
    return isNodeEventBase(event, 'interview started');
}
function isZwjsNodeInterviewCompletedEvent(event) {
    return isNodeEventBase(event, 'interview completed');
}
function isZwjsNodeInterviewFailedEvent(event) {
    return isNodeEventBase(event, 'interview failed');
}
function isZwjsNodeInterviewStageCompletedEvent(event) {
    return (event.source === 'node' &&
        event.event === 'interview stage completed' &&
        typeof event.nodeId === 'number' &&
        typeof event.stageName === 'string');
}
function isZwjsNodeMetadataUpdatedEvent(event) {
    return isNodeEventBase(event, 'metadata updated');
}
function isZwjsNodeNotificationEvent(event) {
    return isNodeEventBase(event, 'notification');
}
function isZwjsNodeWakeUpEvent(event) {
    return isNodeEventBase(event, 'wake up');
}
function isZwjsNodeSleepEvent(event) {
    return isNodeEventBase(event, 'sleep');
}
function isZwjsDriverLoggingEvent(event) {
    const hasMessage = typeof event.message === 'string' || isStringArray(event.message);
    const contextOk = !Object.prototype.hasOwnProperty.call(event, 'context') ||
        (typeof event.context === 'object' && event.context !== null);
    return (event.source === 'driver' &&
        event.event === 'logging' &&
        typeof event.formattedMessage === 'string' &&
        hasMessage &&
        contextOk);
}
function isZwjsDriverLogConfigUpdatedEvent(event) {
    return (event.source === 'driver' &&
        event.event === 'log config updated' &&
        typeof event.config === 'object' &&
        event.config !== null);
}
function isZwjsDriverFirmwareUpdateProgressEvent(event) {
    return event.source === 'driver' && event.event === 'firmware update progress';
}
function isZwjsDriverFirmwareUpdateFinishedEvent(event) {
    return event.source === 'driver' && event.event === 'firmware update finished';
}
function isZwjsControllerGrantSecurityClassesEvent(event) {
    return (event.source === 'controller' &&
        event.event === 'grant security classes' &&
        typeof event.requested === 'object' &&
        event.requested !== null);
}
function isZwjsControllerValidateDskAndEnterPinEvent(event) {
    return (event.source === 'controller' &&
        event.event === 'validate dsk and enter pin' &&
        typeof event.dsk === 'string');
}
function isZwjsControllerInclusionAbortedEvent(event) {
    return event.source === 'controller' && event.event === 'inclusion aborted';
}
function isZwjsControllerNvmConvertProgressEvent(event) {
    return (event.source === 'controller' &&
        event.event === 'nvm convert progress' &&
        typeof event.bytesRead === 'number' &&
        typeof event.total === 'number');
}
function isZwjsControllerNvmBackupProgressEvent(event) {
    return (event.source === 'controller' &&
        event.event === 'nvm backup progress' &&
        typeof event.bytesRead === 'number' &&
        typeof event.total === 'number');
}
function isZwjsControllerNvmRestoreProgressEvent(event) {
    return (event.source === 'controller' &&
        event.event === 'nvm restore progress' &&
        typeof event.bytesWritten === 'number' &&
        typeof event.total === 'number');
}
function isZwjsControllerFirmwareUpdateProgressEvent(event) {
    return event.source === 'controller' && event.event === 'firmware update progress';
}
function isZwjsControllerFirmwareUpdateFinishedEvent(event) {
    return event.source === 'controller' && event.event === 'firmware update finished';
}
function isZwjsNodeTestPowerlevelProgressEvent(event) {
    return (event.source === 'node' &&
        event.event === 'test powerlevel progress' &&
        typeof event.nodeId === 'number' &&
        typeof event.acknowledged === 'number' &&
        typeof event.total === 'number');
}
function isZwjsNodeCheckLifelineHealthProgressEvent(event) {
    return (event.source === 'node' &&
        event.event === 'check lifeline health progress' &&
        typeof event.nodeId === 'number' &&
        typeof event.round === 'number' &&
        typeof event.totalRounds === 'number' &&
        typeof event.lastRating === 'number');
}
function isZwjsNodeCheckRouteHealthProgressEvent(event) {
    return (event.source === 'node' &&
        event.event === 'check route health progress' &&
        typeof event.nodeId === 'number' &&
        typeof event.rounds === 'number' &&
        typeof event.totalRounds === 'number' &&
        typeof event.lastRating === 'number');
}
function isZwjsNodeFirmwareUpdateProgressEvent(event) {
    return (event.source === 'node' &&
        event.event === 'firmware update progress' &&
        typeof event.nodeId === 'number');
}
function isZwjsNodeFirmwareUpdateFinishedEvent(event) {
    return (event.source === 'node' &&
        event.event === 'firmware update finished' &&
        typeof event.nodeId === 'number');
}
function isZwjsZnifferReadyEvent(event) {
    return event.source === 'zniffer' && event.event === 'ready';
}
function isZwjsZnifferCorruptedFrameEvent(event) {
    return event.source === 'zniffer' && event.event === 'corrupted frame';
}
function isZwjsZnifferFrameEvent(event) {
    return event.source === 'zniffer' && event.event === 'frame';
}
function isZwjsZnifferErrorEvent(event) {
    return event.source === 'zniffer' && event.event === 'error';
}

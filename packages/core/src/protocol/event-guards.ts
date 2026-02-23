import type {
  ZwjsControllerGrantSecurityClassesEventPayload,
  ZwjsControllerInclusionAbortedEventPayload,
  ZwjsControllerNvmBackupProgressEventPayload,
  ZwjsControllerNvmConvertProgressEventPayload,
  ZwjsControllerNvmRestoreProgressEventPayload,
  ZwjsControllerValidateDskAndEnterPinEventPayload,
  ZwjsDriverLogConfigUpdatedEventPayload,
  ZwjsDriverLoggingEventPayload,
  ZwjsDriverFirmwareUpdateFinishedEventPayload,
  ZwjsDriverFirmwareUpdateProgressEventPayload,
  ZwjsControllerFirmwareUpdateFinishedEventPayload,
  ZwjsControllerFirmwareUpdateProgressEventPayload,
  ZwjsNodeCheckLifelineHealthProgressEventPayload,
  ZwjsNodeCheckRouteHealthProgressEventPayload,
  ZwjsNodeFirmwareUpdateFinishedEventPayload,
  ZwjsNodeFirmwareUpdateProgressEventPayload,
  ZwjsNodeInterviewCompletedEventPayload,
  ZwjsNodeInterviewFailedEventPayload,
  ZwjsNodeInterviewStageCompletedEventPayload,
  ZwjsNodeInterviewStartedEventPayload,
  ZwjsNodeMetadataUpdatedEventPayload,
  ZwjsNodeNotificationEventPayload,
  ZwjsNodeSleepEventPayload,
  ZwjsNodeTestPowerlevelProgressEventPayload,
  ZwjsNodeValueAddedEventPayload,
  ZwjsNodeValueNotificationEventPayload,
  ZwjsNodeValueRemovedEventPayload,
  ZwjsNodeValueUpdatedEventPayload,
  ZwjsNodeWakeUpEventPayload,
  ZwjsProtocolEventPayload,
  ZwjsZnifferCorruptedFrameEventPayload,
  ZwjsZnifferErrorEventPayload,
  ZwjsZnifferFrameEventPayload,
  ZwjsZnifferReadyEventPayload,
} from '../client/types';

function isNodeEventBase(
  event: ZwjsProtocolEventPayload,
  expectedName: string,
): event is ZwjsProtocolEventPayload & { source: 'node'; event: string; nodeId: number } {
  return (
    event.source === 'node' && event.event === expectedName && typeof event.nodeId === 'number'
  );
}

export function isZwjsNodeValueUpdatedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeValueUpdatedEventPayload {
  return isNodeEventBase(event, 'value updated');
}

export function isZwjsNodeValueAddedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeValueAddedEventPayload {
  return isNodeEventBase(event, 'value added');
}

export function isZwjsNodeValueRemovedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeValueRemovedEventPayload {
  return isNodeEventBase(event, 'value removed');
}

export function isZwjsNodeValueNotificationEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeValueNotificationEventPayload {
  return isNodeEventBase(event, 'value notification');
}

export function isZwjsNodeInterviewStartedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeInterviewStartedEventPayload {
  return isNodeEventBase(event, 'interview started');
}

export function isZwjsNodeInterviewCompletedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeInterviewCompletedEventPayload {
  return isNodeEventBase(event, 'interview completed');
}

export function isZwjsNodeInterviewFailedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeInterviewFailedEventPayload {
  return isNodeEventBase(event, 'interview failed');
}

export function isZwjsNodeInterviewStageCompletedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeInterviewStageCompletedEventPayload {
  return (
    event.source === 'node' &&
    event.event === 'interview stage completed' &&
    typeof event.nodeId === 'number' &&
    typeof event.stageName === 'string'
  );
}

export function isZwjsNodeMetadataUpdatedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeMetadataUpdatedEventPayload {
  return isNodeEventBase(event, 'metadata updated');
}

export function isZwjsNodeNotificationEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeNotificationEventPayload {
  return isNodeEventBase(event, 'notification');
}

export function isZwjsNodeWakeUpEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeWakeUpEventPayload {
  return isNodeEventBase(event, 'wake up');
}

export function isZwjsNodeSleepEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeSleepEventPayload {
  return isNodeEventBase(event, 'sleep');
}

export function isZwjsDriverLoggingEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsDriverLoggingEventPayload {
  return (
    event.source === 'driver' &&
    event.event === 'logging' &&
    typeof event.formattedMessage === 'string'
  );
}

export function isZwjsDriverLogConfigUpdatedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsDriverLogConfigUpdatedEventPayload {
  return (
    event.source === 'driver' &&
    event.event === 'log config updated' &&
    typeof event.config === 'object' &&
    event.config !== null
  );
}

export function isZwjsDriverFirmwareUpdateProgressEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsDriverFirmwareUpdateProgressEventPayload {
  return event.source === 'driver' && event.event === 'firmware update progress';
}

export function isZwjsDriverFirmwareUpdateFinishedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsDriverFirmwareUpdateFinishedEventPayload {
  return event.source === 'driver' && event.event === 'firmware update finished';
}

export function isZwjsControllerGrantSecurityClassesEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsControllerGrantSecurityClassesEventPayload {
  return (
    event.source === 'controller' &&
    event.event === 'grant security classes' &&
    typeof event.requested === 'object' &&
    event.requested !== null
  );
}

export function isZwjsControllerValidateDskAndEnterPinEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsControllerValidateDskAndEnterPinEventPayload {
  return (
    event.source === 'controller' &&
    event.event === 'validate dsk and enter pin' &&
    typeof event.dsk === 'string'
  );
}

export function isZwjsControllerInclusionAbortedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsControllerInclusionAbortedEventPayload {
  return event.source === 'controller' && event.event === 'inclusion aborted';
}

export function isZwjsControllerNvmConvertProgressEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsControllerNvmConvertProgressEventPayload {
  return (
    event.source === 'controller' &&
    event.event === 'nvm convert progress' &&
    typeof event.bytesRead === 'number' &&
    typeof event.total === 'number'
  );
}

export function isZwjsControllerNvmBackupProgressEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsControllerNvmBackupProgressEventPayload {
  return (
    event.source === 'controller' &&
    event.event === 'nvm backup progress' &&
    typeof event.bytesRead === 'number' &&
    typeof event.total === 'number'
  );
}

export function isZwjsControllerNvmRestoreProgressEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsControllerNvmRestoreProgressEventPayload {
  return (
    event.source === 'controller' &&
    event.event === 'nvm restore progress' &&
    typeof event.bytesWritten === 'number' &&
    typeof event.total === 'number'
  );
}

export function isZwjsControllerFirmwareUpdateProgressEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsControllerFirmwareUpdateProgressEventPayload {
  return event.source === 'controller' && event.event === 'firmware update progress';
}

export function isZwjsControllerFirmwareUpdateFinishedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsControllerFirmwareUpdateFinishedEventPayload {
  return event.source === 'controller' && event.event === 'firmware update finished';
}

export function isZwjsNodeTestPowerlevelProgressEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeTestPowerlevelProgressEventPayload {
  return (
    event.source === 'node' &&
    event.event === 'test powerlevel progress' &&
    typeof event.nodeId === 'number' &&
    typeof event.acknowledged === 'number' &&
    typeof event.total === 'number'
  );
}

export function isZwjsNodeCheckLifelineHealthProgressEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeCheckLifelineHealthProgressEventPayload {
  return (
    event.source === 'node' &&
    event.event === 'check lifeline health progress' &&
    typeof event.nodeId === 'number' &&
    typeof event.round === 'number' &&
    typeof event.totalRounds === 'number' &&
    typeof event.lastRating === 'number'
  );
}

export function isZwjsNodeCheckRouteHealthProgressEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeCheckRouteHealthProgressEventPayload {
  return (
    event.source === 'node' &&
    event.event === 'check route health progress' &&
    typeof event.nodeId === 'number' &&
    typeof event.rounds === 'number' &&
    typeof event.totalRounds === 'number' &&
    typeof event.lastRating === 'number'
  );
}

export function isZwjsNodeFirmwareUpdateProgressEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeFirmwareUpdateProgressEventPayload {
  return (
    event.source === 'node' &&
    event.event === 'firmware update progress' &&
    typeof event.nodeId === 'number'
  );
}

export function isZwjsNodeFirmwareUpdateFinishedEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsNodeFirmwareUpdateFinishedEventPayload {
  return (
    event.source === 'node' &&
    event.event === 'firmware update finished' &&
    typeof event.nodeId === 'number'
  );
}

export function isZwjsZnifferReadyEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsZnifferReadyEventPayload {
  return event.source === 'zniffer' && event.event === 'ready';
}

export function isZwjsZnifferCorruptedFrameEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsZnifferCorruptedFrameEventPayload {
  return event.source === 'zniffer' && event.event === 'corrupted frame';
}

export function isZwjsZnifferFrameEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsZnifferFrameEventPayload {
  return event.source === 'zniffer' && event.event === 'frame';
}

export function isZwjsZnifferErrorEvent(
  event: ZwjsProtocolEventPayload,
): event is ZwjsZnifferErrorEventPayload {
  return event.source === 'zniffer' && event.event === 'error';
}

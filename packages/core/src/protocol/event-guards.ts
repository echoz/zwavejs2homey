import type {
  ZwjsControllerNvmBackupProgressEventPayload,
  ZwjsControllerNvmConvertProgressEventPayload,
  ZwjsControllerNvmRestoreProgressEventPayload,
  ZwjsDriverLoggingEventPayload,
  ZwjsNodeCheckLifelineHealthProgressEventPayload,
  ZwjsNodeCheckRouteHealthProgressEventPayload,
  ZwjsNodeMetadataUpdatedEventPayload,
  ZwjsNodeNotificationEventPayload,
  ZwjsNodeTestPowerlevelProgressEventPayload,
  ZwjsNodeValueAddedEventPayload,
  ZwjsNodeValueRemovedEventPayload,
  ZwjsNodeValueUpdatedEventPayload,
  ZwjsProtocolEventPayload,
} from '../client/types';

function isNodeEventBase(event: ZwjsProtocolEventPayload, expectedName: string): event is ZwjsProtocolEventPayload & { source: 'node'; event: string; nodeId: number } {
  return event.source === 'node' && event.event === expectedName && typeof event.nodeId === 'number';
}

export function isZwjsNodeValueUpdatedEvent(event: ZwjsProtocolEventPayload): event is ZwjsNodeValueUpdatedEventPayload {
  return isNodeEventBase(event, 'value updated');
}

export function isZwjsNodeValueAddedEvent(event: ZwjsProtocolEventPayload): event is ZwjsNodeValueAddedEventPayload {
  return isNodeEventBase(event, 'value added');
}

export function isZwjsNodeValueRemovedEvent(event: ZwjsProtocolEventPayload): event is ZwjsNodeValueRemovedEventPayload {
  return isNodeEventBase(event, 'value removed');
}

export function isZwjsNodeMetadataUpdatedEvent(event: ZwjsProtocolEventPayload): event is ZwjsNodeMetadataUpdatedEventPayload {
  return isNodeEventBase(event, 'metadata updated');
}

export function isZwjsNodeNotificationEvent(event: ZwjsProtocolEventPayload): event is ZwjsNodeNotificationEventPayload {
  return isNodeEventBase(event, 'notification');
}

export function isZwjsDriverLoggingEvent(event: ZwjsProtocolEventPayload): event is ZwjsDriverLoggingEventPayload {
  return event.source === 'driver' && event.event === 'logging' && typeof event.formattedMessage === 'string';
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

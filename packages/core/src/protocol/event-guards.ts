import type {
  ZwjsControllerNvmConvertProgressEventPayload,
  ZwjsControllerNvmRestoreProgressEventPayload,
  ZwjsDriverLoggingEventPayload,
  ZwjsNodeMetadataUpdatedEventPayload,
  ZwjsNodeNotificationEventPayload,
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

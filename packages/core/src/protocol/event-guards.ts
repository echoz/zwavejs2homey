import type {
  ZwjsNodeMetadataUpdatedEventPayload,
  ZwjsNodeNotificationEventPayload,
  ZwjsNodeValueUpdatedEventPayload,
  ZwjsProtocolEventPayload,
} from '../client/types';

function isNodeEventBase(event: ZwjsProtocolEventPayload, expectedName: string): event is ZwjsProtocolEventPayload & { source: 'node'; event: string; nodeId: number } {
  return event.source === 'node' && event.event === expectedName && typeof event.nodeId === 'number';
}

export function isZwjsNodeValueUpdatedEvent(event: ZwjsProtocolEventPayload): event is ZwjsNodeValueUpdatedEventPayload {
  return isNodeEventBase(event, 'value updated');
}

export function isZwjsNodeMetadataUpdatedEvent(event: ZwjsProtocolEventPayload): event is ZwjsNodeMetadataUpdatedEventPayload {
  return isNodeEventBase(event, 'metadata updated');
}

export function isZwjsNodeNotificationEvent(event: ZwjsProtocolEventPayload): event is ZwjsNodeNotificationEventPayload {
  return isNodeEventBase(event, 'notification');
}


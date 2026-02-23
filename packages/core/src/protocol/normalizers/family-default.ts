import type { NodeListResult, ServerInfoResult, ZwjsClientEvent, ZwjsProtocolEventPayload } from '../../client/types';
import { ZwjsClientError } from '../../errors';
import type { ZwjsProtocolAdapter } from './types';

export class DefaultZwjsFamilyNormalizer implements ZwjsProtocolAdapter {
  family = 'zwjs-default';

  canHandleVersion(): boolean {
    return true;
  }

  normalizeIncoming(message: unknown) {
    if (typeof message !== 'object' || message === null) {
      throw new ZwjsClientError({ code: 'PROTOCOL_ERROR', message: 'Incoming message is not an object' });
    }

    const record = message as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : undefined;
    const messageId = typeof record.messageId === 'string' ? record.messageId : undefined;
    const events: ZwjsClientEvent[] = [];
    let serverInfo: ServerInfoResult | undefined;
    let nodesSnapshot: NodeListResult | undefined;

    if (type === 'version') {
      serverInfo = {
        serverVersion: typeof record.serverVersion === 'string' ? record.serverVersion : undefined,
        zwaveJsVersion: typeof record.driverVersion === 'string' ? record.driverVersion : undefined,
        schemaHints: [
          ...(typeof record.minSchemaVersion === 'number' ? [`min:${record.minSchemaVersion}`] : []),
          ...(typeof record.maxSchemaVersion === 'number' ? [`max:${record.maxSchemaVersion}`] : []),
        ],
        raw: record,
      };
      events.push({ type: 'server.info', ts: new Date().toISOString(), source: 'zwjs-client', info: serverInfo });
    } else if (type === 'server.info' && typeof record.payload === 'object' && record.payload !== null) {
      const payload = record.payload as Record<string, unknown>;
      serverInfo = {
        serverVersion: typeof payload.serverVersion === 'string' ? payload.serverVersion : undefined,
        zwaveJsVersion: typeof payload.zwaveJsVersion === 'string' ? payload.zwaveJsVersion : undefined,
        schemaHints: Array.isArray(payload.schemaHints) ? payload.schemaHints.filter((v): v is string => typeof v === 'string') : undefined,
        raw: payload,
      };
      events.push({ type: 'server.info', ts: new Date().toISOString(), source: 'zwjs-client', info: serverInfo });
    }

    const resultPayload = 'result' in record ? record.result : undefined;
    const candidateNodes =
      type === 'nodes.snapshot' && Array.isArray(record.payload)
        ? record.payload
        : (typeof resultPayload === 'object' &&
          resultPayload !== null &&
          typeof (resultPayload as Record<string, unknown>).state === 'object' &&
          (resultPayload as Record<string, unknown>).state !== null &&
          Array.isArray(((resultPayload as Record<string, unknown>).state as Record<string, unknown>).nodes)
            ? ((((resultPayload as Record<string, unknown>).state as Record<string, unknown>).nodes) as unknown[])
            : undefined);

    if (candidateNodes) {
      const nodes = candidateNodes
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((node) => ({
          nodeId:
            typeof node.nodeId === 'number'
              ? node.nodeId
              : typeof node.id === 'number'
                ? node.id
                : -1,
          name: typeof node.name === 'string' ? node.name : undefined,
          location:
            typeof node.location === 'string'
              ? node.location
              : typeof node.loc === 'string'
                ? node.loc
                : undefined,
          ready: typeof node.ready === 'boolean' ? node.ready : undefined,
          status: typeof node.status === 'string' ? node.status : undefined,
        }))
        .filter((node) => node.nodeId >= 0);

      nodesSnapshot = { nodes };
      events.push({ type: 'nodes.snapshot', ts: new Date().toISOString(), source: 'zwjs-client', nodes: nodesSnapshot });
    }

    if (type === 'event' && typeof record.event === 'object' && record.event !== null) {
      const protocolEvent = record.event as ZwjsProtocolEventPayload;
      const protocolSource = typeof protocolEvent.source === 'string' ? protocolEvent.source : undefined;
      const typedEventType =
        protocolSource === 'driver'
          ? 'zwjs.event.driver'
          : protocolSource === 'controller'
            ? 'zwjs.event.controller'
            : protocolSource === 'node'
              ? 'zwjs.event.node'
              : protocolSource === 'zniffer'
                ? 'zwjs.event.zniffer'
                : undefined;

      if (typedEventType) {
        events.push({
          type: typedEventType,
          ts: new Date().toISOString(),
          source: 'zwjs-client',
          event: protocolEvent,
        });
      }

      events.push({
        type: 'node.event.raw-normalized',
        ts: new Date().toISOString(),
        source: 'zwjs-client',
        event: protocolEvent,
      });
    } else if (type && type.startsWith('node.')) {
      events.push({
        type: 'node.event.raw-normalized',
        ts: new Date().toISOString(),
        source: 'zwjs-client',
        event: { type, payload: record.payload, raw: record },
      });
    }

    const isFailedResult = record.type === 'result' && record.success === false;

    return {
      events,
      requestResponse:
        messageId && !isFailedResult
          ? { id: messageId, payload: 'result' in record ? record.result : record.payload ?? record }
          : undefined,
      requestError:
        messageId && isFailedResult ? { id: messageId, error: 'error' in record ? record.error : record } : undefined,
      serverInfo,
      nodesSnapshot,
    };
  }

  buildInitializeRequest(id: string, schemaVersion: number, additionalUserAgentComponents?: Record<string, string>): unknown {
    return {
      messageId: id,
      command: 'initialize',
      schemaVersion,
      ...(additionalUserAgentComponents ? { additionalUserAgentComponents } : {}),
    };
  }

  buildStartListeningRequest(id: string): unknown {
    return { messageId: id, command: 'start_listening' };
  }

  buildCommandRequest(id: string, command: string, args?: Record<string, unknown>): unknown {
    return {
      messageId: id,
      command,
      ...(args ?? {}),
    };
  }
}

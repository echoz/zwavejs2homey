import { ZwjsClientError } from '../../errors';
import type { ZwjsProtocolAdapter } from './types';

export class FallbackNormalizer implements ZwjsProtocolAdapter {
  family = 'fallback';

  canHandleVersion(): boolean {
    return true;
  }

  normalizeIncoming(message: unknown) {
    if (typeof message !== 'object' || message === null) {
      throw new ZwjsClientError({
        code: 'PROTOCOL_ERROR',
        message: 'Incoming message is not an object',
      });
    }

    const record = message as Record<string, unknown>;
    const responseId =
      typeof record.messageId === 'string'
        ? record.messageId
        : typeof record.id === 'string'
          ? record.id
          : undefined;
    const version =
      record.type === 'version' && typeof record.serverVersion === 'string'
        ? record.serverVersion
        : typeof record.version === 'string'
          ? record.version
          : undefined;

    const isFailedResult = record.type === 'result' && record.success === false;

    return {
      serverInfo: version ? { serverVersion: version, raw: message } : undefined,
      requestResponse:
        responseId && !isFailedResult
          ? { id: responseId, payload: 'result' in record ? record.result : message }
          : undefined,
      requestError:
        responseId && isFailedResult
          ? { id: responseId, error: 'error' in record ? record.error : record }
          : undefined,
      events: [
        {
          type: 'node.event.raw-normalized' as const,
          ts: new Date().toISOString(),
          source: 'zwjs-client' as const,
          event: record,
        },
      ],
    };
  }

  buildInitializeRequest(
    id: string,
    schemaVersion: number,
    additionalUserAgentComponents?: Record<string, string>,
  ): unknown {
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
    return { messageId: id, command, ...(args ?? {}) };
  }
}

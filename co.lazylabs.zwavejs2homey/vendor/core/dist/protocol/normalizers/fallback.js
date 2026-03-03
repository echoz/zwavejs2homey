"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FallbackNormalizer = void 0;
const errors_1 = require("../../errors");
class FallbackNormalizer {
    constructor() {
        this.family = 'fallback';
    }
    canHandleVersion() {
        return true;
    }
    normalizeIncoming(message) {
        if (typeof message !== 'object' || message === null) {
            throw new errors_1.ZwjsClientError({
                code: 'PROTOCOL_ERROR',
                message: 'Incoming message is not an object',
            });
        }
        const record = message;
        const responseId = typeof record.messageId === 'string'
            ? record.messageId
            : typeof record.id === 'string'
                ? record.id
                : undefined;
        const version = record.type === 'version' && typeof record.serverVersion === 'string'
            ? record.serverVersion
            : typeof record.version === 'string'
                ? record.version
                : undefined;
        const isFailedResult = record.type === 'result' && record.success === false;
        return {
            serverInfo: version ? { serverVersion: version, raw: message } : undefined,
            requestResponse: responseId && !isFailedResult
                ? { id: responseId, payload: 'result' in record ? record.result : message }
                : undefined,
            requestError: responseId && isFailedResult
                ? { id: responseId, error: 'error' in record ? record.error : record }
                : undefined,
            events: [
                {
                    type: 'node.event.raw-normalized',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: record,
                },
            ],
        };
    }
    buildInitializeRequest(id, schemaVersion, additionalUserAgentComponents) {
        return {
            messageId: id,
            command: 'initialize',
            schemaVersion,
            ...(additionalUserAgentComponents ? { additionalUserAgentComponents } : {}),
        };
    }
    buildStartListeningRequest(id) {
        return { messageId: id, command: 'start_listening' };
    }
    buildCommandRequest(id, command, args) {
        return { messageId: id, command, ...(args ?? {}) };
    }
}
exports.FallbackNormalizer = FallbackNormalizer;

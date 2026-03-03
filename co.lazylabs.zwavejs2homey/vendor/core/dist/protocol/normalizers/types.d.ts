import type { NodeListResult, ServerInfoResult, ZwjsClientEvent } from '../../client/types';
export interface NormalizedMessage {
    events?: ZwjsClientEvent[];
    requestResponse?: {
        id: string;
        payload: unknown;
    };
    requestError?: {
        id: string;
        error: unknown;
    };
    serverInfo?: ServerInfoResult;
    nodesSnapshot?: NodeListResult;
}
export interface ZwjsProtocolAdapter {
    family: string;
    canHandleVersion(version?: string): boolean;
    normalizeIncoming(message: unknown): NormalizedMessage;
    buildInitializeRequest?(id: string, schemaVersion: number, additionalUserAgentComponents?: Record<string, string>): unknown;
    buildStartListeningRequest?(id: string): unknown;
    buildCommandRequest?(id: string, command: string, args?: Record<string, unknown>): unknown;
}
//# sourceMappingURL=types.d.ts.map
import type { NodeListResult, ServerInfoResult, ZwjsClientEvent } from '../../client/types';
import type { ZwjsProtocolAdapter } from './types';
export declare class DefaultZwjsFamilyNormalizer implements ZwjsProtocolAdapter {
    family: string;
    canHandleVersion(): boolean;
    normalizeIncoming(message: unknown): {
        events: ZwjsClientEvent[];
        requestResponse: {
            id: string;
            payload: unknown;
        } | undefined;
        requestError: {
            id: string;
            error: unknown;
        } | undefined;
        serverInfo: ServerInfoResult | undefined;
        nodesSnapshot: NodeListResult | undefined;
    };
    buildInitializeRequest(id: string, schemaVersion: number, additionalUserAgentComponents?: Record<string, string>): unknown;
    buildStartListeningRequest(id: string): unknown;
    buildCommandRequest(id: string, command: string, args?: Record<string, unknown>): unknown;
}
//# sourceMappingURL=family-default.d.ts.map
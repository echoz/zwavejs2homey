import type { ZwjsProtocolAdapter } from './types';
export declare class FallbackNormalizer implements ZwjsProtocolAdapter {
    family: string;
    canHandleVersion(): boolean;
    normalizeIncoming(message: unknown): {
        serverInfo: {
            serverVersion: string;
            raw: object;
        } | undefined;
        requestResponse: {
            id: string;
            payload: unknown;
        } | undefined;
        requestError: {
            id: string;
            error: unknown;
        } | undefined;
        events: {
            type: "node.event.raw-normalized";
            ts: string;
            source: "zwjs-client";
            event: Record<string, unknown>;
        }[];
    };
    buildInitializeRequest(id: string, schemaVersion: number, additionalUserAgentComponents?: Record<string, string>): unknown;
    buildStartListeningRequest(id: string): unknown;
    buildCommandRequest(id: string, command: string, args?: Record<string, unknown>): unknown;
}
//# sourceMappingURL=fallback.d.ts.map
export type ZwjsClientErrorCode = 'INVALID_STATE' | 'CONNECT_TIMEOUT' | 'REQUEST_TIMEOUT' | 'CLIENT_STOPPED' | 'TRANSPORT_ERROR' | 'AUTH_FAILED' | 'PROTOCOL_ERROR' | 'UNSUPPORTED_VERSION' | 'UNSUPPORTED_OPERATION';
export interface ClientErrorSummary {
    code: ZwjsClientErrorCode;
    message: string;
    retryable?: boolean;
    cause?: unknown;
}
export declare class ZwjsClientError extends Error {
    readonly code: ZwjsClientErrorCode;
    readonly retryable: boolean;
    readonly cause?: unknown;
    constructor(summary: ClientErrorSummary);
    toSummary(): ClientErrorSummary;
}
export declare function toErrorSummary(error: unknown, fallbackCode?: ZwjsClientErrorCode): ClientErrorSummary;
//# sourceMappingURL=errors.d.ts.map
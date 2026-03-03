"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZwjsClientError = void 0;
exports.toErrorSummary = toErrorSummary;
class ZwjsClientError extends Error {
    constructor(summary) {
        super(summary.message);
        this.name = 'ZwjsClientError';
        this.code = summary.code;
        this.retryable = summary.retryable ?? false;
        this.cause = summary.cause;
    }
    toSummary() {
        return {
            code: this.code,
            message: this.message,
            retryable: this.retryable,
            cause: this.cause,
        };
    }
}
exports.ZwjsClientError = ZwjsClientError;
function toErrorSummary(error, fallbackCode = 'PROTOCOL_ERROR') {
    if (error instanceof ZwjsClientError)
        return error.toSummary();
    if (error instanceof Error) {
        return { code: fallbackCode, message: error.message, cause: error };
    }
    return { code: fallbackCode, message: 'Unknown error', cause: error };
}

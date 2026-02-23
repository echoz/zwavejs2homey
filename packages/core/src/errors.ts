export type ZwjsClientErrorCode =
  | 'INVALID_STATE'
  | 'CONNECT_TIMEOUT'
  | 'REQUEST_TIMEOUT'
  | 'CLIENT_STOPPED'
  | 'TRANSPORT_ERROR'
  | 'AUTH_FAILED'
  | 'PROTOCOL_ERROR'
  | 'UNSUPPORTED_VERSION'
  | 'UNSUPPORTED_OPERATION';

export interface ClientErrorSummary {
  code: ZwjsClientErrorCode;
  message: string;
  retryable?: boolean;
  cause?: unknown;
}

export class ZwjsClientError extends Error {
  readonly code: ZwjsClientErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(summary: ClientErrorSummary) {
    super(summary.message);
    this.name = 'ZwjsClientError';
    this.code = summary.code;
    this.retryable = summary.retryable ?? false;
    this.cause = summary.cause;
  }

  toSummary(): ClientErrorSummary {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      cause: this.cause,
    };
  }
}

export function toErrorSummary(
  error: unknown,
  fallbackCode: ZwjsClientErrorCode = 'PROTOCOL_ERROR',
): ClientErrorSummary {
  if (error instanceof ZwjsClientError) return error.toSummary();
  if (error instanceof Error) {
    return { code: fallbackCode, message: error.message, cause: error };
  }
  return { code: fallbackCode, message: 'Unknown error', cause: error };
}

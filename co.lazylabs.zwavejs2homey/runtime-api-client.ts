export const API_SCHEMA_VERSION = 'zwjs2homey-api/v1';

export class RuntimeApiClientError extends Error {
  public readonly code: string;

  public readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'RuntimeApiClientError';
    this.code = code;
    this.details = details;
  }
}

type OptionalAction = 'auto' | 'backfill-marker' | 'adopt-recommended-baseline' | 'none';

interface ApiEnvelopeError {
  code?: string;
  message?: string;
  details?: unknown;
}

interface ApiEnvelope<TData = unknown> {
  schemaVersion?: unknown;
  ok?: unknown;
  data?: TData;
  error?: ApiEnvelopeError;
}

interface HomeyApiFacade {
  api: {
    (
      method: string,
      uri: string,
      callback: (error: Error | null, result: unknown) => void,
    ): void | Promise<unknown>;
    (
      method: string,
      uri: string,
      body: unknown,
      callback: (error: Error | null, result: unknown) => void,
    ): void | Promise<unknown>;
  };
}

export interface RuntimeApiClient {
  RuntimeApiClientError: typeof RuntimeApiClientError;
  getRuntimeBridges: () => Promise<unknown>;
  getRuntimeDiagnostics: (options?: {
    homeyDeviceId?: unknown;
    bridgeId?: unknown;
  }) => Promise<unknown>;
  getRuntimeSupportBundle: (options?: {
    homeyDeviceId?: unknown;
    bridgeId?: unknown;
    includeNoAction?: unknown;
  }) => Promise<unknown>;
  getRecommendationActionQueue: (options?: {
    homeyDeviceId?: unknown;
    bridgeId?: unknown;
    includeNoAction?: unknown;
  }) => Promise<unknown>;
  executeRecommendationAction: (options: {
    homeyDeviceId?: unknown;
    action?: unknown;
  }) => Promise<unknown>;
  executeRecommendationActions: (options?: {
    homeyDeviceId?: unknown;
    bridgeId?: unknown;
    includeNoAction?: unknown;
  }) => Promise<unknown>;
}

function normalizeOptionalString(value: unknown, label: string): string | undefined {
  if (typeof value === 'undefined' || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new RuntimeApiClientError('invalid-argument', `${label} must be a string`, {
      field: label,
      expected: 'string',
    });
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequiredString(value: unknown, label: string): string {
  const normalized = normalizeOptionalString(value, label);
  if (!normalized) {
    throw new RuntimeApiClientError('invalid-argument', `${label} must be a non-empty string`, {
      field: label,
      expected: 'non-empty string',
    });
  }
  return normalized;
}

function normalizeOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (typeof value === 'undefined' || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw new RuntimeApiClientError('invalid-argument', `${label} must be a boolean`, {
      field: label,
      expected: 'boolean',
    });
  }
  return value;
}

function normalizeOptionalAction(value: unknown): OptionalAction | undefined {
  if (typeof value === 'undefined' || value === null) return undefined;
  if (value === 'auto') return value;
  if (value === 'backfill-marker') return value;
  if (value === 'adopt-recommended-baseline') return value;
  if (value === 'none') return value;
  throw new RuntimeApiClientError(
    'invalid-argument',
    'action must be one of: auto, backfill-marker, adopt-recommended-baseline, none',
    {
      field: 'action',
      expected: ['auto', 'backfill-marker', 'adopt-recommended-baseline', 'none'],
    },
  );
}

function toQueryString(options: {
  homeyDeviceId?: string;
  bridgeId?: string;
  includeNoAction?: boolean;
}): string {
  const segments: string[] = [];
  if (options.homeyDeviceId) {
    segments.push(`homeyDeviceId=${encodeURIComponent(options.homeyDeviceId)}`);
  }
  if (options.bridgeId) {
    segments.push(`bridgeId=${encodeURIComponent(options.bridgeId)}`);
  }
  if (typeof options.includeNoAction === 'boolean') {
    segments.push(
      `includeNoAction=${encodeURIComponent(options.includeNoAction ? 'true' : 'false')}`,
    );
  }
  const query = segments.join('&');
  return query.length > 0 ? `?${query}` : '';
}

function assertApiFacade(homeyApi: unknown): asserts homeyApi is HomeyApiFacade {
  if (
    !homeyApi ||
    typeof homeyApi !== 'object' ||
    typeof (homeyApi as HomeyApiFacade).api !== 'function'
  ) {
    throw new RuntimeApiClientError(
      'invalid-homey-api',
      'homeyApi must expose api(method, uri, body?, callback)',
    );
  }
}

function invokeHomeyApi(
  homeyApi: HomeyApiFacade,
  method: string,
  uri: string,
  body?: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const callback = (error: Error | null, result: unknown): void => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    try {
      if (typeof body === 'undefined') {
        const maybePromise = homeyApi.api(method, uri, callback);
        if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
          (maybePromise as Promise<unknown>).then(resolve).catch(reject);
        }
      } else {
        const maybePromise = homeyApi.api(method, uri, body, callback);
        if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
          (maybePromise as Promise<unknown>).then(resolve).catch(reject);
        }
      }
    } catch (error) {
      reject(error);
    }
  });
}

function parseEnvelope(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== 'object') {
    throw new RuntimeApiClientError('invalid-envelope', 'Route response envelope is missing');
  }
  const typedEnvelope = envelope as ApiEnvelope;
  if (typedEnvelope.schemaVersion !== API_SCHEMA_VERSION) {
    throw new RuntimeApiClientError(
      'invalid-envelope',
      `Unexpected route schemaVersion: ${String(typedEnvelope.schemaVersion)}`,
    );
  }
  if (typedEnvelope.ok === true) {
    return typedEnvelope.data;
  }

  const error =
    typedEnvelope.error && typeof typedEnvelope.error === 'object' ? typedEnvelope.error : null;
  const code = typeof error?.code === 'string' ? error.code : 'api-error';
  let message = 'API route returned an error';
  if (typeof error?.message === 'string') {
    message = error.message;
  }
  throw new RuntimeApiClientError(code, message, error?.details);
}

export function createRuntimeApiClient(homeyApi: unknown): RuntimeApiClient {
  assertApiFacade(homeyApi);

  return {
    RuntimeApiClientError,
    async getRuntimeBridges() {
      const response = await invokeHomeyApi(homeyApi, 'GET', '/runtime/bridges');
      return parseEnvelope(response);
    },

    async getRuntimeDiagnostics(options = {}) {
      const homeyDeviceId = normalizeOptionalString(options.homeyDeviceId, 'homeyDeviceId');
      const bridgeId = normalizeOptionalString(options.bridgeId, 'bridgeId');
      const query = toQueryString({ homeyDeviceId, bridgeId });
      const response = await invokeHomeyApi(homeyApi, 'GET', `/runtime/diagnostics${query}`);
      return parseEnvelope(response);
    },

    async getRuntimeSupportBundle(options = {}) {
      const homeyDeviceId = normalizeOptionalString(options.homeyDeviceId, 'homeyDeviceId');
      const bridgeId = normalizeOptionalString(options.bridgeId, 'bridgeId');
      const includeNoAction = normalizeOptionalBoolean(options.includeNoAction, 'includeNoAction');
      const query = toQueryString({ homeyDeviceId, bridgeId, includeNoAction });
      const response = await invokeHomeyApi(homeyApi, 'GET', `/runtime/support-bundle${query}`);
      return parseEnvelope(response);
    },

    async getRecommendationActionQueue(options = {}) {
      const homeyDeviceId = normalizeOptionalString(options.homeyDeviceId, 'homeyDeviceId');
      const bridgeId = normalizeOptionalString(options.bridgeId, 'bridgeId');
      const includeNoAction = normalizeOptionalBoolean(options.includeNoAction, 'includeNoAction');
      const query = toQueryString({ homeyDeviceId, bridgeId, includeNoAction });
      const response = await invokeHomeyApi(homeyApi, 'GET', `/runtime/recommendations${query}`);
      return parseEnvelope(response);
    },

    async executeRecommendationAction(options) {
      const payload = options && typeof options === 'object' ? options : {};
      const homeyDeviceId = normalizeRequiredString(payload.homeyDeviceId, 'homeyDeviceId');
      const action = normalizeOptionalAction(payload.action);
      const response = await invokeHomeyApi(homeyApi, 'POST', '/runtime/recommendations/execute', {
        homeyDeviceId,
        action,
      });
      return parseEnvelope(response);
    },

    async executeRecommendationActions(options = {}) {
      const homeyDeviceId = normalizeOptionalString(options.homeyDeviceId, 'homeyDeviceId');
      const bridgeId = normalizeOptionalString(options.bridgeId, 'bridgeId');
      const includeNoAction = normalizeOptionalBoolean(options.includeNoAction, 'includeNoAction');
      const response = await invokeHomeyApi(
        homeyApi,
        'POST',
        '/runtime/recommendations/execute-batch',
        {
          homeyDeviceId,
          bridgeId,
          includeNoAction,
        },
      );
      return parseEnvelope(response);
    },
  };
}

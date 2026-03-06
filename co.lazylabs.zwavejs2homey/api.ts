const ACTION_SELECTIONS = new Set([
  'auto',
  'backfill-marker',
  'adopt-recommended-baseline',
  'none',
] as const);

type RecommendationActionSelection = (typeof ACTION_SELECTIONS extends Set<infer T> ? T : never) &
  string;

const API_SCHEMA_VERSION = 'zwjs2homey-api/v1';

class ApiRouteError extends Error {
  public readonly code: string;

  public readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRouteError';
    this.code = code;
    this.details = details;
  }
}

function createSuccessResponse(data: unknown): {
  schemaVersion: string;
  ok: true;
  data: unknown;
  error: null;
} {
  return {
    schemaVersion: API_SCHEMA_VERSION,
    ok: true,
    data,
    error: null,
  };
}

function createErrorResponse(error: unknown): {
  schemaVersion: string;
  ok: false;
  data: null;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
} {
  if (error instanceof ApiRouteError) {
    return {
      schemaVersion: API_SCHEMA_VERSION,
      ok: false,
      data: null,
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    };
  }

  const message = error instanceof Error ? error.message : 'Unexpected API route failure';
  return {
    schemaVersion: API_SCHEMA_VERSION,
    ok: false,
    data: null,
    error: {
      code: 'runtime-error',
      message,
      details: null,
    },
  };
}

async function executeRoute(handler: () => Promise<unknown>): Promise<unknown> {
  try {
    const data = await handler();
    return createSuccessResponse(data);
  } catch (error) {
    return createErrorResponse(error);
  }
}

function normalizeObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === 'undefined' || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiRouteError('invalid-request', `${label} must be an object`, {
      field: label,
      expected: 'object',
    });
  }
  return value as Record<string, unknown>;
}

function normalizeOptionalString(value: unknown, label: string): string | undefined {
  if (typeof value === 'undefined' || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ApiRouteError('invalid-request', `${label} must be a string`, {
      field: label,
      expected: 'string',
    });
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequiredString(value: unknown, label: string, code = 'invalid-request'): string {
  if (typeof value !== 'string') {
    throw new ApiRouteError(code, `${label} must be a string`, {
      field: label,
      expected: 'non-empty string',
    });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ApiRouteError(code, `${label} must be a non-empty string`, {
      field: label,
      expected: 'non-empty string',
    });
  }
  return trimmed;
}

function normalizeOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (typeof value === 'undefined' || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
    if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  }
  throw new ApiRouteError('invalid-request', `${label} must be a boolean`, {
    field: label,
    expected: 'boolean',
  });
}

function normalizeOptionalAction(value: unknown): RecommendationActionSelection | undefined {
  if (typeof value === 'undefined' || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ApiRouteError('invalid-action-selection', 'action must be a string', {
      field: 'action',
      expected: 'string',
    });
  }
  const normalized = value.trim();
  if (ACTION_SELECTIONS.has(normalized as RecommendationActionSelection)) {
    return normalized as RecommendationActionSelection;
  }
  throw new ApiRouteError(
    'invalid-action-selection',
    'action must be one of: auto, backfill-marker, adopt-recommended-baseline, none',
    {
      field: 'action',
      expected: Array.from(ACTION_SELECTIONS),
    },
  );
}

interface RuntimeApp {
  getNodeRuntimeDiagnostics: (options: { homeyDeviceId?: string }) => Promise<unknown>;
  getRuntimeSupportBundle: (options: {
    homeyDeviceId?: string;
    includeNoAction?: boolean;
  }) => Promise<unknown>;
  getRecommendationActionQueue: (options: {
    homeyDeviceId?: string;
    includeNoAction: boolean;
  }) => Promise<unknown>;
  executeRecommendationAction: (options: {
    homeyDeviceId: string;
    action?: RecommendationActionSelection;
  }) => Promise<unknown>;
  executeRecommendationActions: (options: {
    homeyDeviceId?: string;
    includeNoAction: boolean;
  }) => Promise<unknown>;
}

function getRuntimeApp(homey: unknown): RuntimeApp {
  const app = (homey as { app?: unknown } | null | undefined)?.app;
  if (!app || typeof app !== 'object') {
    throw new ApiRouteError('runtime-unavailable', 'Homey app runtime is unavailable');
  }
  return app as RuntimeApp;
}

module.exports = {
  async getRuntimeDiagnostics({ homey, query }: { homey: unknown; query: unknown }) {
    return executeRoute(async () => {
      const app = getRuntimeApp(homey);
      const params = normalizeObject(query, 'query');
      const homeyDeviceId = normalizeOptionalString(params.homeyDeviceId, 'homeyDeviceId');
      return app.getNodeRuntimeDiagnostics({
        homeyDeviceId,
      });
    });
  },

  async getRuntimeSupportBundle({ homey, query }: { homey: unknown; query: unknown }) {
    return executeRoute(async () => {
      const app = getRuntimeApp(homey);
      const params = normalizeObject(query, 'query');
      const homeyDeviceId = normalizeOptionalString(params.homeyDeviceId, 'homeyDeviceId');
      const includeNoAction = normalizeOptionalBoolean(params.includeNoAction, 'includeNoAction');
      return app.getRuntimeSupportBundle({
        homeyDeviceId,
        includeNoAction: includeNoAction === true,
      });
    });
  },

  async getRecommendationActionQueue({ homey, query }: { homey: unknown; query: unknown }) {
    return executeRoute(async () => {
      const app = getRuntimeApp(homey);
      const params = normalizeObject(query, 'query');
      const homeyDeviceId = normalizeOptionalString(params.homeyDeviceId, 'homeyDeviceId');
      const includeNoAction = normalizeOptionalBoolean(params.includeNoAction, 'includeNoAction');
      return app.getRecommendationActionQueue({
        homeyDeviceId,
        includeNoAction: includeNoAction === true,
      });
    });
  },

  async executeRecommendationAction({ homey, body }: { homey: unknown; body: unknown }) {
    return executeRoute(async () => {
      const app = getRuntimeApp(homey);
      const payload = normalizeObject(body, 'body');
      if (typeof payload.homeyDeviceId === 'undefined' || payload.homeyDeviceId === null) {
        throw new ApiRouteError('invalid-homey-device-id', 'homeyDeviceId is required', {
          field: 'homeyDeviceId',
          expected: 'non-empty string',
        });
      }
      const homeyDeviceId = normalizeRequiredString(
        payload.homeyDeviceId,
        'homeyDeviceId',
        'invalid-homey-device-id',
      );
      const action = normalizeOptionalAction(payload.action);
      return app.executeRecommendationAction({
        homeyDeviceId,
        action,
      });
    });
  },

  async executeRecommendationActions({ homey, body }: { homey: unknown; body: unknown }) {
    return executeRoute(async () => {
      const app = getRuntimeApp(homey);
      const payload = normalizeObject(body, 'body');
      const homeyDeviceId = normalizeOptionalString(payload.homeyDeviceId, 'homeyDeviceId');
      const includeNoAction = normalizeOptionalBoolean(payload.includeNoAction, 'includeNoAction');
      return app.executeRecommendationActions({
        homeyDeviceId,
        includeNoAction: includeNoAction === true,
      });
    });
  },
};

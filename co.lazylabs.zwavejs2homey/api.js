"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ACTION_SELECTIONS = new Set([
    'auto',
    'backfill-marker',
    'adopt-recommended-baseline',
    'none',
]);
const API_SCHEMA_VERSION = 'zwjs2homey-api/v1';
const ROUTE_TIMEOUT_MS = 15000;
class ApiRouteError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = 'ApiRouteError';
        this.code = code;
        this.details = details;
    }
}
function createSuccessResponse(data) {
    return {
        schemaVersion: API_SCHEMA_VERSION,
        ok: true,
        data,
        error: null,
    };
}
function createErrorResponse(error) {
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
async function withRouteTimeout(promise, timeoutMs, routeName) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new ApiRouteError('route-timeout', `${routeName} timed out after ${timeoutMs}ms. Check app logs for runtime stalls.`));
        }, timeoutMs);
    });
    try {
        return (await Promise.race([promise, timeoutPromise]));
    }
    finally {
        if (timeoutHandle)
            clearTimeout(timeoutHandle);
    }
}
async function executeRoute(routeName, handler) {
    try {
        const data = await withRouteTimeout(handler(), ROUTE_TIMEOUT_MS, routeName);
        return createSuccessResponse(data);
    }
    catch (error) {
        return createErrorResponse(error);
    }
}
function normalizeObject(value, label) {
    if (typeof value === 'undefined' || value === null)
        return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiRouteError('invalid-request', `${label} must be an object`, {
            field: label,
            expected: 'object',
        });
    }
    return value;
}
function normalizeOptionalString(value, label) {
    if (typeof value === 'undefined' || value === null)
        return undefined;
    if (typeof value !== 'string') {
        throw new ApiRouteError('invalid-request', `${label} must be a string`, {
            field: label,
            expected: 'string',
        });
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function normalizeRequiredString(value, label, code = 'invalid-request') {
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
function normalizeOptionalBoolean(value, label) {
    if (typeof value === 'undefined' || value === null)
        return undefined;
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === '1' || normalized === 'true' || normalized === 'yes')
            return true;
        if (normalized === '0' || normalized === 'false' || normalized === 'no')
            return false;
    }
    throw new ApiRouteError('invalid-request', `${label} must be a boolean`, {
        field: label,
        expected: 'boolean',
    });
}
function normalizeOptionalAction(value) {
    if (typeof value === 'undefined' || value === null)
        return undefined;
    if (typeof value !== 'string') {
        throw new ApiRouteError('invalid-action-selection', 'action must be a string', {
            field: 'action',
            expected: 'string',
        });
    }
    const normalized = value.trim();
    if (ACTION_SELECTIONS.has(normalized)) {
        return normalized;
    }
    throw new ApiRouteError('invalid-action-selection', 'action must be one of: auto, backfill-marker, adopt-recommended-baseline, none', {
        field: 'action',
        expected: Array.from(ACTION_SELECTIONS),
    });
}
function getRuntimeApp(homey) {
    const app = homey?.app;
    if (!app || typeof app !== 'object') {
        throw new ApiRouteError('runtime-unavailable', 'Homey app runtime is unavailable');
    }
    return app;
}
module.exports = {
    async getRuntimeDiagnostics({ homey, query }) {
        return executeRoute('getRuntimeDiagnostics', async () => {
            const app = getRuntimeApp(homey);
            const params = normalizeObject(query, 'query');
            const homeyDeviceId = normalizeOptionalString(params.homeyDeviceId, 'homeyDeviceId');
            return app.getNodeRuntimeDiagnostics({
                homeyDeviceId,
            });
        });
    },
    async getRuntimeSupportBundle({ homey, query }) {
        return executeRoute('getRuntimeSupportBundle', async () => {
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
    async getRecommendationActionQueue({ homey, query }) {
        return executeRoute('getRecommendationActionQueue', async () => {
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
    async executeRecommendationAction({ homey, body }) {
        return executeRoute('executeRecommendationAction', async () => {
            const app = getRuntimeApp(homey);
            const payload = normalizeObject(body, 'body');
            if (typeof payload.homeyDeviceId === 'undefined' || payload.homeyDeviceId === null) {
                throw new ApiRouteError('invalid-homey-device-id', 'homeyDeviceId is required', {
                    field: 'homeyDeviceId',
                    expected: 'non-empty string',
                });
            }
            const homeyDeviceId = normalizeRequiredString(payload.homeyDeviceId, 'homeyDeviceId', 'invalid-homey-device-id');
            const action = normalizeOptionalAction(payload.action);
            return app.executeRecommendationAction({
                homeyDeviceId,
                action,
            });
        });
    },
    async executeRecommendationActions({ homey, body }) {
        return executeRoute('executeRecommendationActions', async () => {
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

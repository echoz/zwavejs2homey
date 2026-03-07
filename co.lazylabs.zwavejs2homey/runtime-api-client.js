"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeApiClientError = exports.API_SCHEMA_VERSION = void 0;
exports.createRuntimeApiClient = createRuntimeApiClient;
exports.API_SCHEMA_VERSION = 'zwjs2homey-api/v1';
class RuntimeApiClientError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = 'RuntimeApiClientError';
        this.code = code;
        this.details = details;
    }
}
exports.RuntimeApiClientError = RuntimeApiClientError;
function normalizeOptionalString(value, label) {
    if (typeof value === 'undefined' || value === null)
        return undefined;
    if (typeof value !== 'string') {
        throw new RuntimeApiClientError('invalid-argument', `${label} must be a string`, {
            field: label,
            expected: 'string',
        });
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function normalizeRequiredString(value, label) {
    const normalized = normalizeOptionalString(value, label);
    if (!normalized) {
        throw new RuntimeApiClientError('invalid-argument', `${label} must be a non-empty string`, {
            field: label,
            expected: 'non-empty string',
        });
    }
    return normalized;
}
function normalizeOptionalBoolean(value, label) {
    if (typeof value === 'undefined' || value === null)
        return undefined;
    if (typeof value !== 'boolean') {
        throw new RuntimeApiClientError('invalid-argument', `${label} must be a boolean`, {
            field: label,
            expected: 'boolean',
        });
    }
    return value;
}
function normalizeOptionalAction(value) {
    if (typeof value === 'undefined' || value === null)
        return undefined;
    if (value === 'auto')
        return value;
    if (value === 'backfill-marker')
        return value;
    if (value === 'adopt-recommended-baseline')
        return value;
    if (value === 'none')
        return value;
    throw new RuntimeApiClientError('invalid-argument', 'action must be one of: auto, backfill-marker, adopt-recommended-baseline, none', {
        field: 'action',
        expected: ['auto', 'backfill-marker', 'adopt-recommended-baseline', 'none'],
    });
}
function toQueryString(options) {
    const segments = [];
    if (options.homeyDeviceId) {
        segments.push(`homeyDeviceId=${encodeURIComponent(options.homeyDeviceId)}`);
    }
    if (typeof options.includeNoAction === 'boolean') {
        segments.push(`includeNoAction=${encodeURIComponent(options.includeNoAction ? 'true' : 'false')}`);
    }
    const query = segments.join('&');
    return query.length > 0 ? `?${query}` : '';
}
function assertApiFacade(homeyApi) {
    if (!homeyApi ||
        typeof homeyApi !== 'object' ||
        typeof homeyApi.api !== 'function') {
        throw new RuntimeApiClientError('invalid-homey-api', 'homeyApi must expose api(method, uri, body?, callback)');
    }
}
function invokeHomeyApi(homeyApi, method, uri, body) {
    return new Promise((resolve, reject) => {
        const callback = (error, result) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(result);
        };
        try {
            if (typeof body === 'undefined') {
                const maybePromise = homeyApi.api(method, uri, callback);
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.then(resolve).catch(reject);
                }
            }
            else {
                const maybePromise = homeyApi.api(method, uri, body, callback);
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.then(resolve).catch(reject);
                }
            }
        }
        catch (error) {
            reject(error);
        }
    });
}
function parseEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') {
        throw new RuntimeApiClientError('invalid-envelope', 'Route response envelope is missing');
    }
    const typedEnvelope = envelope;
    if (typedEnvelope.schemaVersion !== exports.API_SCHEMA_VERSION) {
        throw new RuntimeApiClientError('invalid-envelope', `Unexpected route schemaVersion: ${String(typedEnvelope.schemaVersion)}`);
    }
    if (typedEnvelope.ok === true) {
        return typedEnvelope.data;
    }
    const error = typedEnvelope.error && typeof typedEnvelope.error === 'object' ? typedEnvelope.error : null;
    const code = typeof error?.code === 'string' ? error.code : 'api-error';
    let message = 'API route returned an error';
    if (typeof error?.message === 'string') {
        message = error.message;
    }
    throw new RuntimeApiClientError(code, message, error?.details);
}
function createRuntimeApiClient(homeyApi) {
    assertApiFacade(homeyApi);
    return {
        RuntimeApiClientError,
        async getRuntimeBridges() {
            const response = await invokeHomeyApi(homeyApi, 'GET', '/runtime/bridges');
            return parseEnvelope(response);
        },
        async getRuntimeDiagnostics(options = {}) {
            const homeyDeviceId = normalizeOptionalString(options.homeyDeviceId, 'homeyDeviceId');
            const query = toQueryString({ homeyDeviceId });
            const response = await invokeHomeyApi(homeyApi, 'GET', `/runtime/diagnostics${query}`);
            return parseEnvelope(response);
        },
        async getRuntimeSupportBundle(options = {}) {
            const homeyDeviceId = normalizeOptionalString(options.homeyDeviceId, 'homeyDeviceId');
            const includeNoAction = normalizeOptionalBoolean(options.includeNoAction, 'includeNoAction');
            const query = toQueryString({ homeyDeviceId, includeNoAction });
            const response = await invokeHomeyApi(homeyApi, 'GET', `/runtime/support-bundle${query}`);
            return parseEnvelope(response);
        },
        async getRecommendationActionQueue(options = {}) {
            const homeyDeviceId = normalizeOptionalString(options.homeyDeviceId, 'homeyDeviceId');
            const includeNoAction = normalizeOptionalBoolean(options.includeNoAction, 'includeNoAction');
            const query = toQueryString({ homeyDeviceId, includeNoAction });
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
            const includeNoAction = normalizeOptionalBoolean(options.includeNoAction, 'includeNoAction');
            const response = await invokeHomeyApi(homeyApi, 'POST', '/runtime/recommendations/execute-batch', {
                homeyDeviceId,
                includeNoAction,
            });
            return parseEnvelope(response);
        },
    };
}

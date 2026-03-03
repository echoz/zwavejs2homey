"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZWJS_CONNECTION_SETTINGS_KEY = void 0;
exports.resolveZwjsConnectionConfig = resolveZwjsConnectionConfig;
exports.ZWJS_CONNECTION_SETTINGS_KEY = 'zwjs_connection';
const DEFAULT_URL = 'ws://127.0.0.1:3000';
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return value;
}
function parseWsUrl(value) {
    if (typeof value !== 'string')
        return null;
    const candidate = value.trim();
    if (candidate.length <= 0)
        return null;
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:')
            return null;
        return parsed.toString();
    }
    catch {
        return null;
    }
}
function parseAuthFromRecord(record) {
    const authRecord = asRecord(record.auth);
    if (!authRecord)
        return null;
    const authType = typeof authRecord.type === 'string' ? authRecord.type.trim() : '';
    if (authType === 'none')
        return { type: 'none' };
    if (authType === 'bearer') {
        const token = typeof authRecord.token === 'string' ? authRecord.token.trim() : '';
        if (token.length > 0) {
            return { type: 'bearer', token };
        }
        return null;
    }
    return null;
}
function parseTokenAuth(record) {
    const token = typeof record.token === 'string' ? record.token.trim() : '';
    if (token.length <= 0)
        return null;
    return { type: 'bearer', token };
}
function resolveZwjsConnectionConfig(rawSettings, defaults = {}) {
    const defaultUrl = parseWsUrl(defaults.url) ?? DEFAULT_URL;
    const warnings = [];
    const parsedFromString = parseWsUrl(rawSettings);
    if (parsedFromString) {
        return {
            source: 'settings',
            clientConfig: {
                url: parsedFromString,
                auth: { type: 'none' },
            },
            warnings,
        };
    }
    const settingsRecord = asRecord(rawSettings);
    if (!settingsRecord) {
        if (rawSettings !== undefined && rawSettings !== null) {
            warnings.push('zwjs_connection ignored: expected URL string or object');
        }
        return {
            source: 'default',
            clientConfig: {
                url: defaultUrl,
                auth: { type: 'none' },
            },
            warnings,
        };
    }
    const parsedUrl = parseWsUrl(settingsRecord.url);
    if (!parsedUrl && settingsRecord.url !== undefined) {
        warnings.push('zwjs_connection.url ignored: must be ws:// or wss:// URL');
    }
    const parsedAuth = parseAuthFromRecord(settingsRecord);
    const parsedTokenAuth = parsedAuth ?? parseTokenAuth(settingsRecord);
    if (!parsedAuth && asRecord(settingsRecord.auth)) {
        const authRecord = settingsRecord.auth;
        if (authRecord.type === 'bearer' && !parsedTokenAuth) {
            warnings.push('zwjs_connection.auth.token ignored: non-empty bearer token is required');
        }
        else if (authRecord.type !== 'none' && authRecord.type !== 'bearer') {
            warnings.push('zwjs_connection.auth.type ignored: expected "none" or "bearer"');
        }
    }
    const resolvedUrl = parsedUrl ?? defaultUrl;
    const resolvedAuth = parsedTokenAuth ?? { type: 'none' };
    const source = parsedUrl ||
        parsedTokenAuth ||
        settingsRecord.url !== undefined ||
        settingsRecord.auth !== undefined
        ? 'settings'
        : 'default';
    return {
        source,
        clientConfig: {
            url: resolvedUrl,
            auth: resolvedAuth,
        },
        warnings,
    };
}

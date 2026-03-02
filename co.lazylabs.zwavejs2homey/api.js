'use strict';

const ACTION_SELECTIONS = new Set([
  'auto',
  'backfill-marker',
  'adopt-recommended-baseline',
  'none',
]);

function normalizeObject(value, label) {
  if (typeof value === 'undefined' || value === null) return {};
  if (typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function normalizeOptionalString(value, label) {
  if (typeof value === 'undefined' || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalBoolean(value, label) {
  if (typeof value === 'undefined' || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
    if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  }
  throw new Error(`${label} must be a boolean`);
}

function normalizeOptionalAction(value) {
  if (typeof value === 'undefined' || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error('action must be a string');
  }
  const normalized = value.trim();
  if (ACTION_SELECTIONS.has(normalized)) {
    return normalized;
  }
  throw new Error('action must be one of: auto, backfill-marker, adopt-recommended-baseline, none');
}

function getRuntimeApp(homey) {
  const app = homey?.app;
  if (!app || typeof app !== 'object') {
    throw new Error('Homey app runtime is unavailable');
  }
  return app;
}

module.exports = {
  async getRuntimeDiagnostics({ homey, query }) {
    const app = getRuntimeApp(homey);
    const params = normalizeObject(query, 'query');
    const homeyDeviceId = normalizeOptionalString(params.homeyDeviceId, 'homeyDeviceId');
    return app.getNodeRuntimeDiagnostics({
      homeyDeviceId,
    });
  },

  async getRecommendationActionQueue({ homey, query }) {
    const app = getRuntimeApp(homey);
    const params = normalizeObject(query, 'query');
    const homeyDeviceId = normalizeOptionalString(params.homeyDeviceId, 'homeyDeviceId');
    const includeNoAction = normalizeOptionalBoolean(params.includeNoAction, 'includeNoAction');
    return app.getRecommendationActionQueue({
      homeyDeviceId,
      includeNoAction: includeNoAction === true,
    });
  },

  async executeRecommendationAction({ homey, body }) {
    const app = getRuntimeApp(homey);
    const payload = normalizeObject(body, 'body');
    const homeyDeviceId = normalizeOptionalString(payload.homeyDeviceId, 'homeyDeviceId');
    if (!homeyDeviceId) {
      throw new Error('homeyDeviceId is required');
    }
    const action = normalizeOptionalAction(payload.action);
    return app.executeRecommendationAction({
      homeyDeviceId,
      action,
    });
  },

  async executeRecommendationActions({ homey, body }) {
    const app = getRuntimeApp(homey);
    const payload = normalizeObject(body, 'body');
    const homeyDeviceId = normalizeOptionalString(payload.homeyDeviceId, 'homeyDeviceId');
    const includeNoAction = normalizeOptionalBoolean(payload.includeNoAction, 'includeNoAction');
    return app.executeRecommendationActions({
      homeyDeviceId,
      includeNoAction: includeNoAction === true,
    });
  },
};

import fs from 'node:fs/promises';

const RUNTIME_API_SCHEMA_VERSION = 'zwjs2homey-api/v1';
const SUPPORT_BUNDLE_SCHEMA_VERSION = 'zwjs2homey-support-bundle/v1';
const DEFAULT_TIMEOUT_MS = 10000;
const REDACTED_VALUE = '<redacted>';

const REDACTED_STRING_KEYS = new Set([
  'baseUrl',
  'homeyDeviceId',
  'location',
  'name',
  'token',
  'url',
  'zone',
  'zoneName',
]);

export function getUsageText() {
  return [
    'Usage:',
    '  node tools/homey-support-bundle.mjs --base-url <url> [options]',
    '',
    'Required:',
    '  --base-url <url>          Base app API URL (example: http://HOMEY/api/app/co.lazylabs.zwavejs2homey)',
    '',
    'Options:',
    '  --token <token>           Bearer token for Authorization header',
    '  --homey-device-id <id>    Optional node filter for diagnostics/recommendations',
    '  --include-no-action <b>   Include non-actionable recommendations (default: true)',
    `  --timeout-ms <n>          Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`,
    '  --format <json|json-pretty|markdown>',
    '                            Output format (default: json-pretty)',
    '  --output-file <path>      Write bundle output to file (otherwise prints to stdout)',
    '  --redact-share            Redact sensitive text fields for safer external sharing',
    '  --help                    Show this help',
    '',
    'Notes:',
    '  - This command is read-only; it only calls runtime diagnostics/recommendation routes.',
    '  - No mutation routes are invoked.',
  ].join('\n');
}

function parsePositiveInt(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function trimOrUndefined(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseBooleanLike(value, flag) {
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  throw new Error(`${flag} must be a boolean-like value (true|false|1|0|yes|no)`);
}

function normalizeBaseUrl(value) {
  const parsed = trimOrUndefined(value);
  if (!parsed) throw new Error('--base-url is required');
  try {
    const url = new URL(parsed);
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`Invalid --base-url: ${parsed}`);
  }
}

function normalizeFormat(value) {
  const normalized = trimOrUndefined(value) ?? 'json-pretty';
  if (!['json', 'json-pretty', 'markdown'].includes(normalized)) {
    throw new Error('--format must be "json", "json-pretty", or "markdown"');
  }
  return normalized;
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { ok: false, error: getUsageText() };
  }

  try {
    const args = [...argv];
    let baseUrl;
    let token;
    let homeyDeviceId;
    let includeNoAction = true;
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    let format = 'json-pretty';
    let outputFile;
    let redactShare = false;

    while (args.length > 0) {
      const flag = args.shift();
      if (!flag) break;

      if (flag === '--base-url') {
        baseUrl = args.shift();
        if (!baseUrl) throw new Error('--base-url requires a value');
        continue;
      }
      if (flag === '--token') {
        token = args.shift();
        if (!token) throw new Error('--token requires a value');
        continue;
      }
      if (flag === '--homey-device-id') {
        homeyDeviceId = args.shift();
        if (!homeyDeviceId) throw new Error('--homey-device-id requires a value');
        continue;
      }
      if (flag === '--include-no-action') {
        const value = args.shift();
        if (!value) throw new Error('--include-no-action requires a value');
        includeNoAction = parseBooleanLike(value, '--include-no-action');
        continue;
      }
      if (flag === '--timeout-ms') {
        const value = args.shift();
        if (!value) throw new Error('--timeout-ms requires a value');
        timeoutMs = parsePositiveInt(value, '--timeout-ms');
        continue;
      }
      if (flag === '--format') {
        const value = args.shift();
        if (!value) throw new Error('--format requires a value');
        format = normalizeFormat(value);
        continue;
      }
      if (flag === '--output-file') {
        outputFile = args.shift();
        if (!outputFile) throw new Error('--output-file requires a value');
        continue;
      }
      if (flag === '--redact-share') {
        redactShare = true;
        continue;
      }

      throw new Error(`Unknown argument: ${flag}`);
    }

    return {
      ok: true,
      command: {
        baseUrl: normalizeBaseUrl(baseUrl),
        token: trimOrUndefined(token),
        homeyDeviceId: trimOrUndefined(homeyDeviceId),
        includeNoAction,
        timeoutMs,
        format,
        outputFile: trimOrUndefined(outputFile),
        redactShare,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function validateEnvelopeShape(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, reason: 'missing-envelope-object' };
  }
  if (envelope.schemaVersion !== RUNTIME_API_SCHEMA_VERSION) {
    return { ok: false, reason: `unexpected-schema-version:${String(envelope.schemaVersion)}` };
  }
  if (typeof envelope.ok !== 'boolean') {
    return { ok: false, reason: 'missing-ok-boolean' };
  }
  if (envelope.ok === true) {
    return { ok: true, routeOk: true };
  }
  if (!envelope.error || typeof envelope.error !== 'object') {
    return { ok: false, reason: 'missing-error-object' };
  }
  if (typeof envelope.error.code !== 'string' || envelope.error.code.length === 0) {
    return { ok: false, reason: 'missing-error-code' };
  }
  return { ok: true, routeOk: false };
}

function buildUrl(baseUrl, request) {
  const url = new URL(request.path, `${baseUrl}/`);
  if (request.query && typeof request.query === 'object') {
    for (const [key, value] of Object.entries(request.query)) {
      if (typeof value === 'undefined') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function invokeRuntimeRoute(command, request) {
  const url = buildUrl(command.baseUrl, request);
  const headers = { accept: 'application/json' };
  if (command.token) {
    headers.authorization = `Bearer ${command.token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), command.timeoutMs);
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let json;
    if (text.trim().length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    return {
      url,
      status: response.status,
      text,
      envelope: json,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function buildSupportBundleRequests(command) {
  const diagnosticsQuery = {};
  if (command.homeyDeviceId) {
    diagnosticsQuery.homeyDeviceId = command.homeyDeviceId;
  }

  const recommendationsQuery = {
    ...diagnosticsQuery,
    includeNoAction: command.includeNoAction,
  };

  return [
    {
      key: 'diagnostics',
      method: 'GET',
      path: '/runtime/diagnostics',
      query: diagnosticsQuery,
    },
    {
      key: 'recommendations',
      method: 'GET',
      path: '/runtime/recommendations',
      query: recommendationsQuery,
    },
  ];
}

function normalizeRouteResult(request, response) {
  const envelopeValidation = validateEnvelopeShape(response.envelope);
  const transportOk = response.status >= 200 && response.status < 300;
  const routeOk = envelopeValidation.ok ? envelopeValidation.routeOk : null;
  const passed = transportOk && envelopeValidation.ok && routeOk === true;

  return {
    key: request.key,
    method: request.method,
    path: request.path,
    url: response.url,
    httpStatus: response.status,
    transportOk,
    envelopeOk: envelopeValidation.ok,
    routeOk,
    passed,
    envelopeReason: envelopeValidation.ok ? 'ok' : envelopeValidation.reason,
    data: envelopeValidation.ok ? (response.envelope?.data ?? null) : null,
    error: envelopeValidation.ok ? (response.envelope?.error ?? null) : null,
  };
}

function normalizeRouteError(request, error) {
  return {
    key: request.key,
    method: request.method,
    path: request.path,
    url: null,
    httpStatus: null,
    transportOk: false,
    envelopeOk: false,
    routeOk: null,
    passed: false,
    envelopeReason: error instanceof Error ? error.message : String(error),
    data: null,
    error: {
      code: 'request-failed',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function toBundleRoutes(routeResults) {
  const byKey = {};
  for (const routeResult of routeResults) {
    byKey[routeResult.key] = routeResult;
  }
  return byKey;
}

function getDiagnosticsNodeCount(diagnosticsRoute) {
  const nodes = diagnosticsRoute?.data?.nodes;
  return Array.isArray(nodes) ? nodes.length : null;
}

function getActionableCount(recommendationsRoute) {
  if (
    recommendationsRoute?.data &&
    typeof recommendationsRoute.data.actionable === 'number' &&
    Number.isInteger(recommendationsRoute.data.actionable)
  ) {
    return recommendationsRoute.data.actionable;
  }
  const items = recommendationsRoute?.data?.items;
  if (!Array.isArray(items)) return null;
  return items.filter((item) => item && item.action !== 'none').length;
}

function redactValue(value, key) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, key));
  }

  if (value && typeof value === 'object') {
    const redacted = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      redacted[entryKey] = redactValue(entryValue, entryKey);
    }
    return redacted;
  }

  if (typeof value === 'string' && key && REDACTED_STRING_KEYS.has(key)) {
    return REDACTED_VALUE;
  }
  return value;
}

function redactBundle(bundle) {
  return redactValue(bundle, null);
}

export function renderSupportBundle(bundle, format) {
  if (format === 'json') {
    return JSON.stringify(bundle);
  }
  if (format === 'json-pretty') {
    return JSON.stringify(bundle, null, 2);
  }

  if (format === 'markdown') {
    const lines = [];
    lines.push('# Homey Support Bundle');
    lines.push('');
    lines.push(`- Generated: ${bundle.generatedAt}`);
    lines.push(`- Base URL: ${bundle.source.baseUrl}`);
    lines.push(`- Device Filter: ${bundle.source.homeyDeviceId ?? '<none>'}`);
    lines.push(`- Include No Action: ${bundle.source.includeNoAction ? 'yes' : 'no'}`);
    lines.push(`- Redacted: ${bundle.source.redacted ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Routes Passed: ${bundle.summary.routesPassed}/${bundle.summary.routeCount}`);
    lines.push(`- Routes Failed: ${bundle.summary.routesFailed}`);
    lines.push(`- Diagnostics Nodes: ${bundle.summary.diagnosticsNodeCount ?? '<unknown>'}`);
    lines.push(
      `- Actionable Recommendations: ${bundle.summary.actionableRecommendations ?? '<unknown>'}`,
    );
    lines.push('');
    lines.push('## Routes');
    lines.push('');
    lines.push('| Route | HTTP | Transport | Envelope | Route Ok | Status |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const route of Object.values(bundle.routes)) {
      lines.push(
        `| ${route.key} | ${route.httpStatus ?? '-'} | ${route.transportOk ? 'ok' : 'fail'} | ${
          route.envelopeOk ? 'ok' : route.envelopeReason
        } | ${route.routeOk === null ? '-' : route.routeOk ? 'ok' : 'fail'} | ${
          route.passed ? 'PASS' : 'FAIL'
        } |`,
      );
    }
    return lines.join('\n');
  }

  throw new Error(`Unsupported format: ${format}`);
}

export async function runHomeySupportBundle(command, logger = console, deps = {}) {
  const invoke = deps.invokeRouteImpl ?? invokeRuntimeRoute;
  const writeFileImpl = deps.writeFileImpl ?? fs.writeFile;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());

  const requests = buildSupportBundleRequests(command);
  const routeResults = [];

  for (const request of requests) {
    try {
      const response = await invoke(command, request);
      routeResults.push(normalizeRouteResult(request, response));
    } catch (error) {
      routeResults.push(normalizeRouteError(request, error));
    }
  }

  const routes = toBundleRoutes(routeResults);
  const routeCount = routeResults.length;
  const routesPassed = routeResults.filter((route) => route.passed).length;
  const routesFailed = routeCount - routesPassed;

  const bundle = {
    schemaVersion: SUPPORT_BUNDLE_SCHEMA_VERSION,
    generatedAt: nowIso(),
    source: {
      baseUrl: command.baseUrl,
      homeyDeviceId: command.homeyDeviceId ?? null,
      includeNoAction: command.includeNoAction,
      timeoutMs: command.timeoutMs,
      redacted: command.redactShare === true,
    },
    summary: {
      routeCount,
      routesPassed,
      routesFailed,
      diagnosticsNodeCount: getDiagnosticsNodeCount(routes.diagnostics),
      actionableRecommendations: getActionableCount(routes.recommendations),
    },
    routes,
  };

  const outputBundle = command.redactShare ? redactBundle(bundle) : bundle;
  const rendered = renderSupportBundle(outputBundle, command.format);

  if (command.outputFile) {
    await writeFileImpl(command.outputFile, rendered, 'utf8');
    logger.log(`Wrote support bundle: ${command.outputFile}`);
  } else {
    logger.log(rendered);
  }

  return outputBundle;
}

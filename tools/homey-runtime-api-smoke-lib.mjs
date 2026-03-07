const API_SCHEMA_VERSION = 'zwjs2homey-api/v1';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_SMOKE_DEVICE_ID = '__smoke_invalid__';

export function getUsageText() {
  return [
    'Usage:',
    '  node tools/homey-runtime-api-smoke.mjs --base-url <url> [options]',
    '',
    'Required:',
    '  --base-url <url>          Base app API URL (example: http://HOMEY/api/app/co.lazylabs.zwavejs2homey)',
    '',
    'Options:',
    '  --token <token>           Bearer token for Authorization header',
    '  --read-device-id <id>     Optional homeyDeviceId used for read routes',
    `  --smoke-device-id <id>    Device ID used for execute route smoke calls (default: ${DEFAULT_SMOKE_DEVICE_ID})`,
    `  --timeout-ms <n>          Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`,
    '  --format <table|json>     Output format (default: table)',
    '  --help                    Show this help',
    '',
    'Notes:',
    '  - This smoke calls all runtime routes, including execute routes.',
    '  - By default it uses a non-existent smoke device ID to avoid mutation side-effects.',
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

function normalizeBaseUrl(value) {
  const parsed = trimOrUndefined(value);
  if (!parsed) {
    throw new Error('--base-url is required');
  }
  try {
    const asUrl = new URL(parsed);
    return asUrl.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`Invalid --base-url: ${parsed}`);
  }
}

function normalizeFormat(value) {
  const normalized = trimOrUndefined(value) ?? 'table';
  if (normalized !== 'table' && normalized !== 'json') {
    throw new Error('--format must be "table" or "json"');
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
    let readDeviceId;
    let smokeDeviceId = DEFAULT_SMOKE_DEVICE_ID;
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    let format = 'table';

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
      if (flag === '--read-device-id') {
        readDeviceId = args.shift();
        if (!readDeviceId) throw new Error('--read-device-id requires a value');
        continue;
      }
      if (flag === '--smoke-device-id') {
        smokeDeviceId = args.shift();
        if (!smokeDeviceId) throw new Error('--smoke-device-id requires a value');
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

      throw new Error(`Unknown argument: ${flag}`);
    }

    return {
      ok: true,
      command: {
        baseUrl: normalizeBaseUrl(baseUrl),
        token: trimOrUndefined(token),
        readDeviceId: trimOrUndefined(readDeviceId),
        smokeDeviceId: trimOrUndefined(smokeDeviceId) ?? DEFAULT_SMOKE_DEVICE_ID,
        timeoutMs,
        format,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildSmokeRouteRequests(command) {
  const readQuery = {};
  if (command.readDeviceId) {
    readQuery.homeyDeviceId = command.readDeviceId;
  }

  const recommendationsQuery = {
    ...readQuery,
    includeNoAction: true,
  };

  return [
    {
      key: 'getRuntimeBridges',
      method: 'GET',
      path: '/runtime/bridges',
      query: {},
    },
    {
      key: 'getRuntimeDiagnostics',
      method: 'GET',
      path: '/runtime/diagnostics',
      query: readQuery,
    },
    {
      key: 'getRuntimeSupportBundle',
      method: 'GET',
      path: '/runtime/support-bundle',
      query: recommendationsQuery,
    },
    {
      key: 'getRecommendationActionQueue',
      method: 'GET',
      path: '/runtime/recommendations',
      query: recommendationsQuery,
    },
    {
      key: 'executeRecommendationAction',
      method: 'POST',
      path: '/runtime/recommendations/execute',
      body: {
        homeyDeviceId: command.smokeDeviceId,
        action: 'auto',
      },
    },
    {
      key: 'executeRecommendationActions',
      method: 'POST',
      path: '/runtime/recommendations/execute-batch',
      body: {
        homeyDeviceId: command.smokeDeviceId,
        includeNoAction: true,
      },
    },
  ];
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
  let body;
  if (request.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(request.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), command.timeoutMs);
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
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

function validateEnvelopeShape(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, reason: 'missing-envelope-object' };
  }
  if (envelope.schemaVersion !== API_SCHEMA_VERSION) {
    return { ok: false, reason: `unexpected-schema-version:${String(envelope.schemaVersion)}` };
  }
  if (typeof envelope.ok !== 'boolean') {
    return { ok: false, reason: 'missing-ok-boolean' };
  }
  if (envelope.ok === true) {
    return { ok: true };
  }
  if (!envelope.error || typeof envelope.error !== 'object') {
    return { ok: false, reason: 'missing-error-object' };
  }
  if (typeof envelope.error.code !== 'string' || envelope.error.code.length === 0) {
    return { ok: false, reason: 'missing-error-code' };
  }
  return { ok: true };
}

function formatTable(summary) {
  const lines = [];
  lines.push(`Runtime API smoke @ ${summary.baseUrl}`);
  lines.push(`Routes: ${summary.total}  Passed: ${summary.passed}  Failed: ${summary.failed}`);
  lines.push('');
  lines.push('Status  Method  Path                                  HTTP  Envelope');
  lines.push('------  ------  ------------------------------------  ----  --------');
  for (const check of summary.checks) {
    const status = check.passed ? 'PASS' : 'FAIL';
    const http = check.httpStatus ?? '-';
    const envelope = check.envelopeReason ?? '-';
    lines.push(
      `${status.padEnd(6)}  ${check.method.padEnd(6)}  ${check.path.padEnd(36)}  ${String(http).padEnd(4)}  ${envelope}`,
    );
  }
  return lines.join('\n');
}

export async function runHomeyRuntimeApiSmoke(command, logger = console, deps = {}) {
  const invoke = deps.invokeRouteImpl ?? invokeRuntimeRoute;
  const requests = buildSmokeRouteRequests(command);
  const checks = [];

  for (const request of requests) {
    try {
      const result = await invoke(command, request);
      const envelopeValidation = validateEnvelopeShape(result.envelope);
      const passed = result.status >= 200 && result.status < 300 && envelopeValidation.ok;
      checks.push({
        key: request.key,
        method: request.method,
        path: request.path,
        httpStatus: result.status,
        passed,
        envelopeReason: envelopeValidation.ok ? 'ok' : envelopeValidation.reason,
        url: result.url,
      });
    } catch (error) {
      checks.push({
        key: request.key,
        method: request.method,
        path: request.path,
        httpStatus: null,
        passed: false,
        envelopeReason: error instanceof Error ? error.message : String(error),
        url: null,
      });
    }
  }

  const passed = checks.filter((entry) => entry.passed).length;
  const summary = {
    generatedAt: new Date().toISOString(),
    schemaVersion: API_SCHEMA_VERSION,
    baseUrl: command.baseUrl,
    total: checks.length,
    passed,
    failed: checks.length - passed,
    checks,
  };

  const rendered =
    command.format === 'json' ? JSON.stringify(summary, null, 2) : formatTable(summary);
  logger.log(rendered);

  if (summary.failed > 0) {
    throw new Error(`Runtime API smoke failed (${summary.failed}/${summary.total})`);
  }
  return summary;
}

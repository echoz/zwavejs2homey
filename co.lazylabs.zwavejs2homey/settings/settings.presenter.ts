interface ConnectionPill {
  label: string;
  tone: 'ok' | 'warn' | 'error';
}

interface LoadedSettings {
  url: string;
  authType: 'none' | 'bearer';
  token: string;
}

interface ValidateSettingsPayload {
  url: string;
  auth: {
    type: 'none' | 'bearer';
    token?: string;
  };
}

type ValidateSettingsResult =
  | {
      payload: ValidateSettingsPayload;
      error?: undefined;
    }
  | {
      payload?: undefined;
      error: string;
    };

interface RuntimeNodeRecommendation {
  available?: unknown;
  backfillNeeded?: unknown;
}

interface RuntimeNode {
  recommendation?: RuntimeNodeRecommendation;
}

interface RuntimeData {
  bridgeId?: unknown;
  generatedAt?: unknown;
  diagnosticsRefresh?: {
    lastSuccessAt?: unknown;
    lastFailureAt?: unknown;
    lastFailureReason?: unknown;
    lastReason?: unknown;
  };
  zwjs?: {
    available?: unknown;
    transportConnected?: unknown;
    lifecycle?: unknown;
    serverVersion?: unknown;
  };
  compiledProfiles?: {
    loaded?: unknown;
  };
  curation?: {
    loaded?: unknown;
  };
  nodes?: unknown;
}

interface RuntimeResponseEnvelope {
  ok?: unknown;
  data?: unknown;
  error?: {
    message?: unknown;
  };
}

type RuntimeParseResult =
  | {
      data: RuntimeData;
      error?: undefined;
    }
  | {
      data?: undefined;
      error: string;
    };

type SupportBundleParseResult =
  | {
      data: Record<string, unknown>;
      error?: undefined;
    }
  | {
      data?: undefined;
      error: string;
    };

interface SupportBundleExportResult {
  fileName: string;
  content: string;
  redacted: boolean;
}

interface RuntimeStatusRow {
  key: string;
  value: string | ConnectionPill;
  kind: 'text' | 'pill';
}

interface RuntimeViewModel {
  rows: RuntimeStatusRow[];
  warnings: string[];
  warningCount: number;
  runtimeHint: string;
}

interface SettingsPresenter {
  DEFAULT_URL: string;
  DEFAULT_SUPPORT_BUNDLE_FILE_NAME: string;
  normalizeLoadedSettings: (raw: unknown) => LoadedSettings;
  validateSettingsInput: (input: {
    url?: unknown;
    authType?: unknown;
    token?: unknown;
  }) => ValidateSettingsResult;
  parseRuntimeResponse: (response: unknown) => RuntimeParseResult;
  parseSupportBundleResponse: (response: unknown) => SupportBundleParseResult;
  buildSupportBundleExport: (
    input: Record<string, unknown>,
    options?: { redact?: boolean },
  ) => SupportBundleExportResult;
  buildRuntimeViewModel: (data: RuntimeData) => RuntimeViewModel;
}

interface UiRoot {
  Zwjs2HomeyUi?: {
    settingsPresenter?: SettingsPresenter;
  };
}

(function attachSettingsPresenter(root: UiRoot | undefined, factory: () => SettingsPresenter) {
  const presenter = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = presenter;
  }
  const nextRoot = root || {};
  nextRoot.Zwjs2HomeyUi = nextRoot.Zwjs2HomeyUi || {};
  nextRoot.Zwjs2HomeyUi.settingsPresenter = presenter;
})(
  typeof window !== 'undefined'
    ? (window as unknown as UiRoot)
    : typeof global !== 'undefined'
      ? (global as unknown as UiRoot)
      : ({} as UiRoot),
  function createPresenter() {
    const DEFAULT_URL = 'ws://127.0.0.1:3000';
    const DEFAULT_SUPPORT_BUNDLE_FILE_NAME = 'zwjs2homey-support-bundle.json';
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

    function asText(value: unknown): string {
      if (value === null || typeof value === 'undefined' || value === '') return 'n/a';
      return String(value);
    }

    function formatIso(value: unknown): string {
      if (!value) return 'n/a';
      const parsed = new Date(String(value));
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleString();
    }

    function isWsUrl(value: string): boolean {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
      } catch (_error) {
        return false;
      }
    }

    function normalizeLoadedSettings(raw: unknown): LoadedSettings {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
          url: DEFAULT_URL,
          authType: 'none',
          token: '',
        };
      }

      const rawRecord = raw as Record<string, unknown>;
      const url =
        typeof rawRecord.url === 'string' && rawRecord.url.trim()
          ? rawRecord.url.trim()
          : DEFAULT_URL;
      const auth =
        rawRecord.auth && typeof rawRecord.auth === 'object' && !Array.isArray(rawRecord.auth)
          ? (rawRecord.auth as Record<string, unknown>)
          : null;
      const authType = auth && auth.type === 'bearer' ? 'bearer' : 'none';
      const token =
        authType === 'bearer' && typeof auth?.token === 'string' ? auth.token.trim() : '';

      return { url, authType, token };
    }

    function validateSettingsInput(input: {
      url?: unknown;
      authType?: unknown;
      token?: unknown;
    }): ValidateSettingsResult {
      const url = typeof input.url === 'string' ? input.url.trim() : '';
      const authType = input.authType === 'bearer' ? 'bearer' : 'none';
      const token = typeof input.token === 'string' ? input.token.trim() : '';

      if (!url) {
        return { error: 'WebSocket URL is required.' };
      }
      if (!isWsUrl(url)) {
        return { error: 'URL must start with ws:// or wss://.' };
      }
      if (authType === 'bearer' && !token) {
        return { error: 'Bearer token is required when authentication is bearer.' };
      }

      if (authType === 'bearer') {
        return {
          payload: {
            url,
            auth: {
              type: 'bearer',
              token,
            },
          },
        };
      }

      return {
        payload: {
          url,
          auth: { type: 'none' },
        },
      };
    }

    function parseRuntimeResponse(response: unknown): RuntimeParseResult {
      if (!response || typeof response !== 'object') {
        return { error: 'Runtime diagnostics response is invalid.' };
      }
      const envelope = response as RuntimeResponseEnvelope;
      if (envelope.ok === true && envelope.data && typeof envelope.data === 'object') {
        return { data: envelope.data as RuntimeData };
      }
      if (envelope.ok === false && envelope.error && typeof envelope.error === 'object') {
        return {
          error:
            typeof envelope.error.message === 'string'
              ? envelope.error.message
              : 'Runtime diagnostics unavailable.',
        };
      }
      return { error: 'Runtime diagnostics response is missing expected fields.' };
    }

    function parseSupportBundleResponse(response: unknown): SupportBundleParseResult {
      if (!response || typeof response !== 'object') {
        return { error: 'Support bundle response is invalid.' };
      }
      const envelope = response as RuntimeResponseEnvelope;
      if (envelope.ok === true && envelope.data && typeof envelope.data === 'object') {
        return { data: envelope.data as Record<string, unknown> };
      }
      if (envelope.ok === false && envelope.error && typeof envelope.error === 'object') {
        return {
          error:
            typeof envelope.error.message === 'string'
              ? envelope.error.message
              : 'Support bundle is unavailable.',
        };
      }
      return { error: 'Support bundle response is missing expected fields.' };
    }

    function toSafeFileSegment(value: string): string {
      const trimmed = value.trim();
      if (trimmed.length === 0) return 'unknown';
      const sanitized = trimmed.replace(/[^0-9A-Za-z._-]+/g, '_').replace(/^_+|_+$/g, '');
      return sanitized.length > 0 ? sanitized : 'unknown';
    }

    function supportBundleFileName(bundle: Record<string, unknown>): string {
      const generatedAt =
        bundle && typeof bundle.generatedAt === 'string' ? bundle.generatedAt.trim() : '';
      if (!generatedAt) {
        return DEFAULT_SUPPORT_BUNDLE_FILE_NAME;
      }
      const parsed = new Date(generatedAt);
      if (Number.isNaN(parsed.getTime())) {
        return DEFAULT_SUPPORT_BUNDLE_FILE_NAME;
      }
      const iso = parsed.toISOString();
      const datePart = toSafeFileSegment(iso.slice(0, 10).replace(/-/g, ''));
      const timePart = toSafeFileSegment(iso.slice(11, 19).replace(/:/g, ''));
      return `zwjs2homey-support-bundle-${datePart}-${timePart}.json`;
    }

    function redactSupportBundleValue(value: unknown, key: string | null): unknown {
      if (Array.isArray(value)) {
        return value.map((entry) => redactSupportBundleValue(entry, key));
      }
      if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};
        for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
          output[entryKey] = redactSupportBundleValue(entryValue, entryKey);
        }
        return output;
      }
      if (typeof value === 'string' && key && REDACTED_STRING_KEYS.has(key)) {
        return REDACTED_VALUE;
      }
      return value;
    }

    function buildSupportBundleExport(
      input: Record<string, unknown>,
      options?: { redact?: boolean },
    ): SupportBundleExportResult {
      const redacted = options?.redact === true;
      const bundle = redacted
        ? (redactSupportBundleValue(input, null) as Record<string, unknown>)
        : input;
      return {
        fileName: supportBundleFileName(bundle),
        content: JSON.stringify(bundle, null, 2),
        redacted,
      };
    }

    function toRuntimeNodes(data: RuntimeData): RuntimeNode[] {
      return Array.isArray(data.nodes) ? (data.nodes as RuntimeNode[]) : [];
    }

    function buildRuntimeWarnings(data: RuntimeData): string[] {
      const messages: string[] = [];
      if (!data.zwjs || data.zwjs.available !== true) {
        messages.push('ZWJS client is unavailable. Save a valid connection URL.');
        return messages;
      }
      if (data.zwjs.transportConnected !== true) {
        messages.push('ZWJS transport is disconnected. Pair/import may return empty results.');
      }
      if (!data.compiledProfiles || data.compiledProfiles.loaded !== true) {
        messages.push('Compiled profiles are not loaded. Runtime matching may fall back.');
      }
      if (!data.curation || data.curation.loaded !== true) {
        messages.push('Curation runtime failed to load. Device overrides may be unavailable.');
      }
      return messages;
    }

    function connectionPill(zwjs: RuntimeData['zwjs']): ConnectionPill {
      if (!zwjs || zwjs.available !== true) {
        return { label: 'Unavailable', tone: 'error' };
      }
      if (zwjs.transportConnected === true) {
        return { label: 'Connected', tone: 'ok' };
      }
      return { label: 'Disconnected', tone: 'warn' };
    }

    function runtimeStatusLabel(data: RuntimeData): string {
      if (!data.zwjs || data.zwjs.available !== true) return 'Bridge Not Configured';
      if (data.zwjs.transportConnected !== true) return 'Bridge Disconnected';
      const nodes = toRuntimeNodes(data);
      if (nodes.length > 0) return 'Imported Nodes Available';
      return 'Ready, No Nodes Imported';
    }

    function diagnosticsRefreshStatusLabel(data: RuntimeData): string {
      const refresh =
        data && typeof data === 'object' && data.diagnosticsRefresh
          ? data.diagnosticsRefresh
          : null;
      if (!refresh || typeof refresh !== 'object') return 'n/a';
      const failureReason =
        typeof refresh.lastFailureReason === 'string' ? refresh.lastFailureReason.trim() : '';
      if (failureReason.length > 0) return 'Failed';
      const successAt =
        typeof refresh.lastSuccessAt === 'string' ? refresh.lastSuccessAt.trim() : '';
      if (successAt.length > 0) return 'Healthy';
      return 'n/a';
    }

    function buildRuntimeViewModel(data: RuntimeData): RuntimeViewModel {
      const nodes = toRuntimeNodes(data);
      const backfillNeeded = nodes.filter(
        (node) => node && node.recommendation && node.recommendation.backfillNeeded === true,
      ).length;
      const updatesAvailable = nodes.filter(
        (node) => node && node.recommendation && node.recommendation.available === true,
      ).length;
      const actionableCount = nodes.filter(
        (node) =>
          node &&
          node.recommendation &&
          (node.recommendation.backfillNeeded === true || node.recommendation.available === true),
      ).length;
      const warnings = buildRuntimeWarnings(data);

      return {
        rows: [
          { key: 'Runtime Status', value: runtimeStatusLabel(data), kind: 'text' },
          { key: 'Bridge', value: asText(data.bridgeId), kind: 'text' },
          { key: 'ZWJS', value: connectionPill(data.zwjs), kind: 'pill' },
          { key: 'Lifecycle', value: asText(data.zwjs && data.zwjs.lifecycle), kind: 'text' },
          { key: 'ZWJS Server', value: asText(data.zwjs && data.zwjs.serverVersion), kind: 'text' },
          {
            key: 'Diagnostics Refresh',
            value: diagnosticsRefreshStatusLabel(data),
            kind: 'text',
          },
          {
            key: 'Diagnostics Last Success',
            value: formatIso(data.diagnosticsRefresh && data.diagnosticsRefresh.lastSuccessAt),
            kind: 'text',
          },
          {
            key: 'Diagnostics Last Failure',
            value: formatIso(data.diagnosticsRefresh && data.diagnosticsRefresh.lastFailureAt),
            kind: 'text',
          },
          {
            key: 'Diagnostics Last Reason',
            value: asText(data.diagnosticsRefresh && data.diagnosticsRefresh.lastReason),
            kind: 'text',
          },
          { key: 'Imported Nodes', value: asText(nodes.length), kind: 'text' },
          { key: 'Action Needed', value: asText(actionableCount), kind: 'text' },
          { key: 'Profile Updates', value: asText(updatesAvailable), kind: 'text' },
          { key: 'Backfill Needed', value: asText(backfillNeeded), kind: 'text' },
          {
            key: 'Compiled Profiles',
            value:
              data.compiledProfiles && data.compiledProfiles.loaded === true ? 'Loaded' : 'Missing',
            kind: 'text',
          },
          {
            key: 'Curation',
            value: data.curation && data.curation.loaded === true ? 'Loaded' : 'Unavailable',
            kind: 'text',
          },
          { key: 'Last Updated', value: formatIso(data.generatedAt), kind: 'text' },
        ],
        warnings,
        warningCount: warnings.length,
        runtimeHint:
          actionableCount > 0
            ? `${actionableCount} imported node(s) need attention in Bridge Tools.`
            : typeof data.diagnosticsRefresh?.lastFailureReason === 'string' &&
                data.diagnosticsRefresh.lastFailureReason.trim().length > 0
              ? `Diagnostics refresh failed: ${data.diagnosticsRefresh.lastFailureReason.trim()}`
              : 'No immediate runtime actions are required.',
      };
    }

    return {
      DEFAULT_URL,
      DEFAULT_SUPPORT_BUNDLE_FILE_NAME,
      normalizeLoadedSettings,
      validateSettingsInput,
      parseRuntimeResponse,
      parseSupportBundleResponse,
      buildSupportBundleExport,
      buildRuntimeViewModel,
    };
  },
);

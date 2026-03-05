// @ts-nocheck

const crypto = require('node:crypto');

export interface HomeyCurationEntryV1 {
  [key: string]: any;
}

export interface HomeyCurationRuntimeStatusV1 {
  loaded: boolean;
  source: string;
  sourceKey: string;
  schemaVersion: string | null;
  updatedAt: string | null;
  entryCount: number;
  errorMessage: string | null;
  [key: string]: any;
}

export interface HomeyCurationApplyReport {
  loweredActions: Array<Record<string, any>>;
  appliedActions: Array<Record<string, any>>;
  skippedActions: Array<Record<string, any>>;
  errors: Array<Record<string, any>>;
  summary: {
    lowered: number;
    applied: number;
    skipped: number;
    errors: number;
  };
}

export interface HomeyBaselineMarkerV1 {
  projectionVersion: string;
  baselineProfileHash: string;
  updatedAt: string;
  pipelineFingerprint?: string;
  [key: string]: any;
}

export interface BaselineRecommendationStateV1 {
  recommendationAvailable: boolean;
  recommendationReason: string;
  projectionVersion: string;
  currentMarker: HomeyBaselineMarkerV1;
  storedMarker: HomeyBaselineMarkerV1 | null;
  shouldBackfillMarker: boolean;
  [key: string]: any;
}

const CURATION_SETTINGS_KEY = 'curation.v1';
const CURATION_SCHEMA_VERSION = 'homey-curation/v1';
const BASELINE_MARKER_PROJECTION_VERSION = '1';

const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'updatedAt', 'entries']);
const ENTRY_KEYS = new Set(['targetDevice', 'baselineMarker', 'overrides', 'note', 'updatedAt']);
const TARGET_DEVICE_KEYS = new Set(['homeyDeviceId', 'catalogId', 'diagnosticDeviceKey']);
const BASELINE_MARKER_KEYS = new Set([
  'projectionVersion',
  'pipelineFingerprint',
  'baselineProfileHash',
  'updatedAt',
]);
const OVERRIDES_KEYS = new Set(['deviceIdentity', 'capabilities', 'collections']);
const DEVICE_IDENTITY_KEYS = new Set(['homeyClass', 'driverTemplateId']);
const CAPABILITY_OVERRIDE_KEYS = new Set(['inboundMapping', 'outboundMapping', 'flags']);
const COLLECTIONS_KEYS = new Set([
  'capabilitiesAdd',
  'capabilitiesRemove',
  'subscriptionsAdd',
  'subscriptionsRemove',
  'ignoredValuesAdd',
  'ignoredValuesRemove',
]);

const COLLECTION_PAIR_CONSTRAINTS = [
  ['capabilitiesAdd', 'capabilitiesRemove'],
  ['subscriptionsAdd', 'subscriptionsRemove'],
  ['ignoredValuesAdd', 'ignoredValuesRemove'],
];

const CURATION_RUNTIME_SOURCE_REF = 'homey-curation/v1';

function toErrorMessage(error: any) {
  if (error instanceof Error && typeof error.message === 'string') return error.message;
  return String(error);
}

function isPlainObject(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertPlainObject(value: any, pathLabel: any) {
  if (!isPlainObject(value)) {
    throw new Error(`${pathLabel} must be an object`);
  }
  return value;
}

function assertAllowedKeys(record: any, allowedKeys: any, pathLabel: any) {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${pathLabel} contains unsupported field: ${key}`);
    }
  }
}

function assertNonEmptyString(value: any, pathLabel: any) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${pathLabel} must be a non-empty string`);
  }
  return value.trim();
}

function assertIsoTimestamp(value: any, pathLabel: any) {
  const text = assertNonEmptyString(value, pathLabel);
  const parsedTime = Date.parse(text);
  if (!Number.isFinite(parsedTime)) {
    throw new Error(`${pathLabel} must be an ISO timestamp`);
  }
  return text;
}

function canonicalizeCollectionValue(value: any, pathLabel: any) {
  if (value === null) return 'null';
  const valueType = typeof value;
  if (valueType === 'string') return `string:${value}`;
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${pathLabel} contains non-finite numeric value`);
    }
    return `number:${String(value)}`;
  }
  if (valueType === 'boolean') return `boolean:${String(value)}`;
  if (Array.isArray(value)) {
    const nested = value.map((item, index) => {
      return canonicalizeCollectionValue(item, `${pathLabel}[${index}]`);
    });
    return `array:[${nested.join(',')}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const nested = [];
    for (const key of keys) {
      const keyValue = canonicalizeCollectionValue(value[key], `${pathLabel}.${key}`);
      nested.push(`${JSON.stringify(key)}:${keyValue}`);
    }
    return `object:{${nested.join(',')}}`;
  }
  throw new Error(`${pathLabel} contains unsupported value type`);
}

function normalizeCollectionArray(raw: any, pathLabel: any) {
  if (!Array.isArray(raw)) {
    throw new Error(`${pathLabel} must be an array`);
  }

  const deduped = [];
  const seen = new Set();
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const canonical = canonicalizeCollectionValue(item, `${pathLabel}[${index}]`);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    deduped.push(item);
  }
  return deduped;
}

function ensureNoCollectionPairOverlap(
  collections: any,
  addKey: any,
  removeKey: any,
  pathLabel: any,
) {
  const addItems = Array.isArray(collections[addKey]) ? collections[addKey] : [];
  const removeItems = Array.isArray(collections[removeKey]) ? collections[removeKey] : [];
  if (addItems.length === 0 || removeItems.length === 0) return;

  const addSet = new Set(
    addItems.map((item, index) => {
      return canonicalizeCollectionValue(item, `${pathLabel}.${addKey}[${index}]`);
    }),
  );
  for (let index = 0; index < removeItems.length; index += 1) {
    const item = removeItems[index];
    const canonical = canonicalizeCollectionValue(item, `${pathLabel}.${removeKey}[${index}]`);
    if (addSet.has(canonical)) {
      throw new Error(
        `${pathLabel} has overlapping values across ${addKey} and ${removeKey}; each value may appear in only one`,
      );
    }
  }
}

function normalizeEntryOverrides(rawOverrides: any, pathLabel: any) {
  const overridesRecord = assertPlainObject(rawOverrides, pathLabel);
  assertAllowedKeys(overridesRecord, OVERRIDES_KEYS, pathLabel);

  const normalized = {};
  if (overridesRecord.deviceIdentity !== undefined) {
    const deviceIdentityRecord = assertPlainObject(
      overridesRecord.deviceIdentity,
      `${pathLabel}.deviceIdentity`,
    );
    assertAllowedKeys(deviceIdentityRecord, DEVICE_IDENTITY_KEYS, `${pathLabel}.deviceIdentity`);
    const normalizedIdentity = {};
    if (deviceIdentityRecord.homeyClass !== undefined) {
      normalizedIdentity.homeyClass = assertNonEmptyString(
        deviceIdentityRecord.homeyClass,
        `${pathLabel}.deviceIdentity.homeyClass`,
      );
    }
    if (deviceIdentityRecord.driverTemplateId !== undefined) {
      normalizedIdentity.driverTemplateId = assertNonEmptyString(
        deviceIdentityRecord.driverTemplateId,
        `${pathLabel}.deviceIdentity.driverTemplateId`,
      );
    }
    normalized.deviceIdentity = normalizedIdentity;
  }

  if (overridesRecord.capabilities !== undefined) {
    const capabilitiesRecord = assertPlainObject(
      overridesRecord.capabilities,
      `${pathLabel}.capabilities`,
    );
    const normalizedCapabilities = {};
    for (const [capabilityId, capabilityOverride] of Object.entries(capabilitiesRecord)) {
      const normalizedCapabilityId = assertNonEmptyString(
        capabilityId,
        `${pathLabel}.capabilities key`,
      );
      const capabilityRecord = assertPlainObject(
        capabilityOverride,
        `${pathLabel}.capabilities.${normalizedCapabilityId}`,
      );
      assertAllowedKeys(
        capabilityRecord,
        CAPABILITY_OVERRIDE_KEYS,
        `${pathLabel}.capabilities.${normalizedCapabilityId}`,
      );
      const normalizedCapabilityOverride = {};
      if (capabilityRecord.inboundMapping !== undefined) {
        normalizedCapabilityOverride.inboundMapping = assertPlainObject(
          capabilityRecord.inboundMapping,
          `${pathLabel}.capabilities.${normalizedCapabilityId}.inboundMapping`,
        );
      }
      if (capabilityRecord.outboundMapping !== undefined) {
        normalizedCapabilityOverride.outboundMapping = assertPlainObject(
          capabilityRecord.outboundMapping,
          `${pathLabel}.capabilities.${normalizedCapabilityId}.outboundMapping`,
        );
      }
      if (capabilityRecord.flags !== undefined) {
        normalizedCapabilityOverride.flags = assertPlainObject(
          capabilityRecord.flags,
          `${pathLabel}.capabilities.${normalizedCapabilityId}.flags`,
        );
      }
      normalizedCapabilities[normalizedCapabilityId] = normalizedCapabilityOverride;
    }
    normalized.capabilities = normalizedCapabilities;
  }

  if (overridesRecord.collections !== undefined) {
    const collectionsRecord = assertPlainObject(
      overridesRecord.collections,
      `${pathLabel}.collections`,
    );
    assertAllowedKeys(collectionsRecord, COLLECTIONS_KEYS, `${pathLabel}.collections`);
    const normalizedCollections = {};
    for (const key of COLLECTIONS_KEYS) {
      if (collectionsRecord[key] !== undefined) {
        normalizedCollections[key] = normalizeCollectionArray(
          collectionsRecord[key],
          `${pathLabel}.collections.${key}`,
        );
      }
    }
    for (const [addKey, removeKey] of COLLECTION_PAIR_CONSTRAINTS) {
      ensureNoCollectionPairOverlap(
        normalizedCollections,
        addKey,
        removeKey,
        `${pathLabel}.collections`,
      );
    }
    normalized.collections = normalizedCollections;
  }

  return normalized;
}

function normalizeEntry(rawEntry: any, homeyDeviceId: any, pathLabel: any) {
  const entryRecord = assertPlainObject(rawEntry, pathLabel);
  assertAllowedKeys(entryRecord, ENTRY_KEYS, pathLabel);
  const targetDevice = assertPlainObject(entryRecord.targetDevice, `${pathLabel}.targetDevice`);
  assertAllowedKeys(targetDevice, TARGET_DEVICE_KEYS, `${pathLabel}.targetDevice`);
  const targetHomeyDeviceId = assertNonEmptyString(
    targetDevice.homeyDeviceId,
    `${pathLabel}.targetDevice.homeyDeviceId`,
  );
  if (targetHomeyDeviceId !== homeyDeviceId) {
    throw new Error(
      `${pathLabel}.targetDevice.homeyDeviceId must match entry key (${homeyDeviceId})`,
    );
  }

  const baselineMarker = assertPlainObject(
    entryRecord.baselineMarker,
    `${pathLabel}.baselineMarker`,
  );
  assertAllowedKeys(baselineMarker, BASELINE_MARKER_KEYS, `${pathLabel}.baselineMarker`);

  const normalized = {
    targetDevice: {
      homeyDeviceId: targetHomeyDeviceId,
    },
    baselineMarker: {
      projectionVersion: assertNonEmptyString(
        baselineMarker.projectionVersion,
        `${pathLabel}.baselineMarker.projectionVersion`,
      ),
      baselineProfileHash: assertNonEmptyString(
        baselineMarker.baselineProfileHash,
        `${pathLabel}.baselineMarker.baselineProfileHash`,
      ),
      updatedAt: assertIsoTimestamp(
        baselineMarker.updatedAt,
        `${pathLabel}.baselineMarker.updatedAt`,
      ),
    },
    updatedAt: assertIsoTimestamp(entryRecord.updatedAt, `${pathLabel}.updatedAt`),
  };

  if (targetDevice.catalogId !== undefined) {
    normalized.targetDevice.catalogId = assertNonEmptyString(
      targetDevice.catalogId,
      `${pathLabel}.targetDevice.catalogId`,
    );
  }
  if (targetDevice.diagnosticDeviceKey !== undefined) {
    normalized.targetDevice.diagnosticDeviceKey = assertNonEmptyString(
      targetDevice.diagnosticDeviceKey,
      `${pathLabel}.targetDevice.diagnosticDeviceKey`,
    );
  }
  if (baselineMarker.pipelineFingerprint !== undefined) {
    normalized.baselineMarker.pipelineFingerprint = assertNonEmptyString(
      baselineMarker.pipelineFingerprint,
      `${pathLabel}.baselineMarker.pipelineFingerprint`,
    );
  }
  if (entryRecord.note !== undefined) {
    normalized.note = assertNonEmptyString(entryRecord.note, `${pathLabel}.note`);
  }
  if (entryRecord.overrides !== undefined) {
    normalized.overrides = normalizeEntryOverrides(entryRecord.overrides, `${pathLabel}.overrides`);
  }

  return normalized;
}

function normalizeCurationDocument(rawDocument: any) {
  const topLevel = assertPlainObject(rawDocument, 'curation document');
  assertAllowedKeys(topLevel, TOP_LEVEL_KEYS, 'curation document');

  const schemaVersion = assertNonEmptyString(
    topLevel.schemaVersion,
    'curation document.schemaVersion',
  );
  if (schemaVersion !== CURATION_SCHEMA_VERSION) {
    throw new Error(
      `curation document.schemaVersion must be ${CURATION_SCHEMA_VERSION} (received ${schemaVersion})`,
    );
  }

  const updatedAt = assertIsoTimestamp(topLevel.updatedAt, 'curation document.updatedAt');
  const entriesRaw = assertPlainObject(topLevel.entries, 'curation document.entries');
  const entries = {};
  for (const [homeyDeviceId, rawEntry] of Object.entries(entriesRaw)) {
    const normalizedHomeyDeviceId = assertNonEmptyString(
      homeyDeviceId,
      'curation document.entries key',
    );
    entries[normalizedHomeyDeviceId] = normalizeEntry(
      rawEntry,
      normalizedHomeyDeviceId,
      `curation document.entries.${normalizedHomeyDeviceId}`,
    );
  }

  return {
    schemaVersion,
    updatedAt,
    entries,
  };
}

function createEmptyCurationDocument() {
  return {
    schemaVersion: CURATION_SCHEMA_VERSION,
    updatedAt: null,
    entries: {},
  };
}

function loadCurationRuntimeFromSettings(settingsValue: any) {
  if (settingsValue === undefined || settingsValue === null) {
    return {
      document: createEmptyCurationDocument(),
      entriesByDeviceId: new Map(),
      status: {
        loaded: true,
        sourceKey: CURATION_SETTINGS_KEY,
        source: 'settings-default-empty',
        schemaVersion: CURATION_SCHEMA_VERSION,
        updatedAt: null,
        entryCount: 0,
        errorMessage: null,
      },
    };
  }

  try {
    const document = normalizeCurationDocument(settingsValue);
    const entriesByDeviceId = new Map(Object.entries(document.entries));
    return {
      document,
      entriesByDeviceId,
      status: {
        loaded: true,
        sourceKey: CURATION_SETTINGS_KEY,
        source: 'settings',
        schemaVersion: document.schemaVersion,
        updatedAt: document.updatedAt,
        entryCount: entriesByDeviceId.size,
        errorMessage: null,
      },
    };
  } catch (error) {
    return {
      document: createEmptyCurationDocument(),
      entriesByDeviceId: new Map(),
      status: {
        loaded: false,
        sourceKey: CURATION_SETTINGS_KEY,
        source: 'settings',
        schemaVersion: null,
        updatedAt: null,
        entryCount: 0,
        errorMessage: toErrorMessage(error),
      },
    };
  }
}

function resolveCurationEntryFromRuntime(runtime: any, homeyDeviceId: any) {
  if (!runtime?.entriesByDeviceId) return undefined;
  return runtime.entriesByDeviceId.get(homeyDeviceId);
}

function deepClone(value: any) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry));
  }
  if (isPlainObject(value)) {
    const cloned = {};
    for (const [key, entryValue] of Object.entries(value)) {
      cloned[key] = deepClone(entryValue);
    }
    return cloned;
  }
  return value;
}

function normalizeRuntimeRuleIdSegment(value: any) {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return 'unknown';
  return trimmed.replace(/[^a-z0-9._-]+/g, '_');
}

function createCurationRuntimeRuleId(homeyDeviceId: any, pathLabel: any) {
  return `curation.${normalizeRuntimeRuleIdSegment(homeyDeviceId)}.${normalizeRuntimeRuleIdSegment(pathLabel)}`;
}

function createCurationRuntimeAction(homeyDeviceId: any, kind: any, pathLabel: any, payload: any) {
  return {
    ruleId: createCurationRuntimeRuleId(homeyDeviceId, pathLabel),
    kind,
    path: pathLabel,
    payload,
  };
}

function lowerCurationEntryToRuntimeActions(curationEntry: any, options: any = {}) {
  if (!isPlainObject(curationEntry) || !isPlainObject(curationEntry.overrides)) return [];
  let homeyDeviceId = 'unknown-device';
  if (typeof options.homeyDeviceId === 'string' && options.homeyDeviceId.trim().length > 0) {
    homeyDeviceId = options.homeyDeviceId;
  } else if (typeof curationEntry.targetDevice?.homeyDeviceId === 'string') {
    const targetDeviceId = curationEntry.targetDevice.homeyDeviceId.trim();
    if (targetDeviceId.length > 0) {
      homeyDeviceId = targetDeviceId;
    }
  } else if (typeof curationEntry.targetDeviceId === 'string') {
    const legacyTargetDeviceId = curationEntry.targetDeviceId.trim();
    if (legacyTargetDeviceId.length > 0) {
      homeyDeviceId = legacyTargetDeviceId;
    }
  }
  const actions = [];
  const { overrides } = curationEntry;
  const collectionOverrides = isPlainObject(overrides.collections)
    ? overrides.collections
    : undefined;
  const capabilitiesAdd = collectionOverrides?.capabilitiesAdd;
  const capabilitiesRemove = collectionOverrides?.capabilitiesRemove;
  const subscriptionsAdd = collectionOverrides?.subscriptionsAdd;
  const subscriptionsRemove = collectionOverrides?.subscriptionsRemove;
  const ignoredValuesAdd = collectionOverrides?.ignoredValuesAdd;
  const ignoredValuesRemove = collectionOverrides?.ignoredValuesRemove;

  if (isPlainObject(overrides.deviceIdentity)) {
    if (typeof overrides.deviceIdentity.homeyClass === 'string') {
      actions.push(
        createCurationRuntimeAction(
          homeyDeviceId,
          'set-device-identity',
          'deviceIdentity.homeyClass',
          {
            slot: 'homeyClass',
            value: overrides.deviceIdentity.homeyClass,
          },
        ),
      );
    }
    if (typeof overrides.deviceIdentity.driverTemplateId === 'string') {
      actions.push(
        createCurationRuntimeAction(
          homeyDeviceId,
          'set-device-identity',
          'deviceIdentity.driverTemplateId',
          {
            slot: 'driverTemplateId',
            value: overrides.deviceIdentity.driverTemplateId,
          },
        ),
      );
    }
  }

  if (Array.isArray(capabilitiesAdd)) {
    for (let index = 0; index < capabilitiesAdd.length; index += 1) {
      actions.push(
        createCurationRuntimeAction(
          homeyDeviceId,
          'add-capability',
          `collections.capabilitiesAdd.${index}`,
          { capabilityId: capabilitiesAdd[index] },
        ),
      );
    }
  }

  if (isPlainObject(overrides.capabilities)) {
    const capabilityIds = Object.keys(overrides.capabilities).sort((a, b) => a.localeCompare(b));
    for (const capabilityId of capabilityIds) {
      const capabilityOverride = overrides.capabilities[capabilityId];
      if (!isPlainObject(capabilityOverride)) continue;
      if (capabilityOverride.inboundMapping !== undefined) {
        actions.push(
          createCurationRuntimeAction(
            homeyDeviceId,
            'set-capability',
            `capabilities.${capabilityId}.inboundMapping`,
            {
              capabilityId,
              slot: 'inboundMapping',
              value: capabilityOverride.inboundMapping,
            },
          ),
        );
      }
      if (capabilityOverride.outboundMapping !== undefined) {
        actions.push(
          createCurationRuntimeAction(
            homeyDeviceId,
            'set-capability',
            `capabilities.${capabilityId}.outboundMapping`,
            {
              capabilityId,
              slot: 'outboundMapping',
              value: capabilityOverride.outboundMapping,
            },
          ),
        );
      }
      if (capabilityOverride.flags !== undefined) {
        actions.push(
          createCurationRuntimeAction(
            homeyDeviceId,
            'set-capability',
            `capabilities.${capabilityId}.flags`,
            {
              capabilityId,
              slot: 'flags',
              value: capabilityOverride.flags,
            },
          ),
        );
      }
    }
  }

  if (Array.isArray(capabilitiesRemove)) {
    for (let index = 0; index < capabilitiesRemove.length; index += 1) {
      actions.push(
        createCurationRuntimeAction(
          homeyDeviceId,
          'remove-capability',
          `collections.capabilitiesRemove.${index}`,
          { capabilityId: capabilitiesRemove[index] },
        ),
      );
    }
  }

  if (Array.isArray(subscriptionsAdd)) {
    for (let index = 0; index < subscriptionsAdd.length; index += 1) {
      actions.push(
        createCurationRuntimeAction(
          homeyDeviceId,
          'add-subscription',
          `collections.subscriptionsAdd.${index}`,
          { value: subscriptionsAdd[index] },
        ),
      );
    }
  }

  if (Array.isArray(subscriptionsRemove)) {
    for (let index = 0; index < subscriptionsRemove.length; index += 1) {
      actions.push(
        createCurationRuntimeAction(
          homeyDeviceId,
          'remove-subscription',
          `collections.subscriptionsRemove.${index}`,
          { value: subscriptionsRemove[index] },
        ),
      );
    }
  }

  if (Array.isArray(ignoredValuesAdd)) {
    for (let index = 0; index < ignoredValuesAdd.length; index += 1) {
      actions.push(
        createCurationRuntimeAction(
          homeyDeviceId,
          'add-ignored-value',
          `collections.ignoredValuesAdd.${index}`,
          { value: ignoredValuesAdd[index] },
        ),
      );
    }
  }

  if (Array.isArray(ignoredValuesRemove)) {
    for (let index = 0; index < ignoredValuesRemove.length; index += 1) {
      actions.push(
        createCurationRuntimeAction(
          homeyDeviceId,
          'remove-ignored-value',
          `collections.ignoredValuesRemove.${index}`,
          { value: ignoredValuesRemove[index] },
        ),
      );
    }
  }

  return actions;
}

function normalizeCapabilityDirectionality(capability: any) {
  const hasInbound = capability.inboundMapping !== undefined;
  const hasOutbound = capability.outboundMapping !== undefined;
  if (hasInbound && hasOutbound) return 'bidirectional';
  if (hasInbound) return 'inbound-only';
  if (hasOutbound) return 'outbound-only';
  return 'inbound-only';
}

function createCurationProvenance(ruleId: any, action: any, reason: any) {
  return {
    layer: 'user-curation',
    ruleId,
    action,
    sourceRef: CURATION_RUNTIME_SOURCE_REF,
    reason,
  };
}

function findCapabilityIndex(profile: any, capabilityId: any) {
  if (!Array.isArray(profile.capabilities)) return -1;
  return profile.capabilities.findIndex((capability) => capability?.capabilityId === capabilityId);
}

function canonicalCollectionItemKey(value: any, pathLabel: any) {
  return canonicalizeCollectionValue(value, pathLabel);
}

function applyCollectionAdd(profile: any, slotKey: any, value: any, action: any, report: any) {
  if (!Array.isArray(profile[slotKey])) profile[slotKey] = [];
  const valueKey = canonicalCollectionItemKey(value, `${action.path}:value`);
  const existingIndex = profile[slotKey].findIndex((item, index) => {
    const existingKey = canonicalCollectionItemKey(item, `${action.path}:existing:${index}`);
    return existingKey === valueKey;
  });
  if (existingIndex >= 0) {
    report.skippedActions.push({
      ruleId: action.ruleId,
      kind: action.kind,
      path: action.path,
      reason: `${slotKey}_already_present`,
    });
    return;
  }
  profile[slotKey].push(deepClone(value));
  report.appliedActions.push({
    ruleId: action.ruleId,
    kind: action.kind,
    path: action.path,
  });
}

function applyCollectionRemove(profile: any, slotKey: any, value: any, action: any, report: any) {
  if (!Array.isArray(profile[slotKey]) || profile[slotKey].length === 0) {
    report.skippedActions.push({
      ruleId: action.ruleId,
      kind: action.kind,
      path: action.path,
      reason: `${slotKey}_missing`,
    });
    return;
  }
  const targetKey = canonicalCollectionItemKey(value, `${action.path}:value`);
  const index = profile[slotKey].findIndex((item, itemIndex) => {
    return canonicalCollectionItemKey(item, `${action.path}:existing:${itemIndex}`) === targetKey;
  });
  if (index < 0) {
    report.skippedActions.push({
      ruleId: action.ruleId,
      kind: action.kind,
      path: action.path,
      reason: `${slotKey}_item_not_found`,
    });
    return;
  }
  profile[slotKey].splice(index, 1);
  report.appliedActions.push({
    ruleId: action.ruleId,
    kind: action.kind,
    path: action.path,
  });
}

function applyCurationEntryToProfile(
  baseProfile: any,
  curationEntry: any,
  options: any = {},
): { profile: any; report: HomeyCurationApplyReport } {
  if (!isPlainObject(baseProfile)) {
    throw new Error('baseProfile must be an object');
  }

  const homeyDeviceId = options.homeyDeviceId ?? curationEntry?.targetDevice?.homeyDeviceId;
  const actions = lowerCurationEntryToRuntimeActions(curationEntry, {
    homeyDeviceId,
  });
  const profile = deepClone(baseProfile);
  const report = {
    loweredActions: actions,
    appliedActions: [],
    skippedActions: [],
    errors: [],
  };

  if (!Array.isArray(profile.capabilities)) profile.capabilities = [];
  if (!isPlainObject(profile.classification)) {
    profile.classification = {
      homeyClass: 'other',
      confidence: 'generic',
      uncurated: true,
    };
  }

  for (const action of actions) {
    try {
      if (action.kind === 'set-device-identity') {
        const { slot, value } = action.payload ?? {};
        if (slot !== 'homeyClass' && slot !== 'driverTemplateId') {
          report.skippedActions.push({
            ruleId: action.ruleId,
            kind: action.kind,
            path: action.path,
            reason: 'invalid_device_identity_slot',
          });
          continue;
        }
        profile.classification[slot] = value;
        report.appliedActions.push({
          ruleId: action.ruleId,
          kind: action.kind,
          path: action.path,
        });
        continue;
      }

      if (action.kind === 'add-capability') {
        const capabilityId = assertNonEmptyString(
          action.payload?.capabilityId,
          `${action.path}.capabilityId`,
        );
        const existingIndex = findCapabilityIndex(profile, capabilityId);
        if (existingIndex >= 0) {
          report.skippedActions.push({
            ruleId: action.ruleId,
            kind: action.kind,
            path: action.path,
            reason: 'capability_already_present',
          });
          continue;
        }
        profile.capabilities.push({
          capabilityId,
          directionality: 'inbound-only',
          provenance: createCurationProvenance(action.ruleId, 'augment', action.path),
        });
        report.appliedActions.push({
          ruleId: action.ruleId,
          kind: action.kind,
          path: action.path,
        });
        continue;
      }

      if (action.kind === 'remove-capability') {
        const capabilityId = assertNonEmptyString(
          action.payload?.capabilityId,
          `${action.path}.capabilityId`,
        );
        const existingIndex = findCapabilityIndex(profile, capabilityId);
        if (existingIndex < 0) {
          report.skippedActions.push({
            ruleId: action.ruleId,
            kind: action.kind,
            path: action.path,
            reason: 'capability_not_found',
          });
          continue;
        }
        profile.capabilities.splice(existingIndex, 1);
        report.appliedActions.push({
          ruleId: action.ruleId,
          kind: action.kind,
          path: action.path,
        });
        continue;
      }

      if (action.kind === 'set-capability') {
        const capabilityId = assertNonEmptyString(
          action.payload?.capabilityId,
          `${action.path}.capabilityId`,
        );
        const slot = action.payload?.slot;
        if (slot !== 'inboundMapping' && slot !== 'outboundMapping' && slot !== 'flags') {
          report.skippedActions.push({
            ruleId: action.ruleId,
            kind: action.kind,
            path: action.path,
            reason: 'invalid_capability_slot',
          });
          continue;
        }
        const existingIndex = findCapabilityIndex(profile, capabilityId);
        if (existingIndex < 0) {
          report.skippedActions.push({
            ruleId: action.ruleId,
            kind: action.kind,
            path: action.path,
            reason: 'capability_not_found',
          });
          continue;
        }
        const existing = profile.capabilities[existingIndex];
        const nextValue = deepClone(action.payload?.value);
        existing[slot] = nextValue;
        existing.directionality = normalizeCapabilityDirectionality(existing);
        existing.provenance = createCurationProvenance(action.ruleId, 'replace', action.path);
        report.appliedActions.push({
          ruleId: action.ruleId,
          kind: action.kind,
          path: action.path,
        });
        continue;
      }

      if (action.kind === 'add-subscription') {
        applyCollectionAdd(profile, 'subscriptions', action.payload?.value, action, report);
        continue;
      }

      if (action.kind === 'remove-subscription') {
        applyCollectionRemove(profile, 'subscriptions', action.payload?.value, action, report);
        continue;
      }

      if (action.kind === 'add-ignored-value') {
        applyCollectionAdd(profile, 'ignoredValues', action.payload?.value, action, report);
        continue;
      }

      if (action.kind === 'remove-ignored-value') {
        applyCollectionRemove(profile, 'ignoredValues', action.payload?.value, action, report);
        continue;
      }

      report.skippedActions.push({
        ruleId: action.ruleId,
        kind: action.kind,
        path: action.path,
        reason: 'unsupported_action',
      });
    } catch (error) {
      report.errors.push({
        ruleId: action.ruleId,
        kind: action.kind,
        path: action.path,
        message: toErrorMessage(error),
      });
    }
  }

  report.summary = {
    lowered: actions.length,
    applied: report.appliedActions.length,
    skipped: report.skippedActions.length,
    errors: report.errors.length,
  };

  return { profile, report };
}

function normalizeBaselineComparableString(value: any) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : value;
}

function normalizeBaselineComparableNumber(value: any) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return value;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const parsedHex = Number.parseInt(trimmed.slice(2), 16);
    if (Number.isFinite(parsedHex)) return parsedHex;
  }
  if (/^-?\d+$/.test(trimmed)) {
    const parsedDec = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsedDec)) return parsedDec;
  }
  return value;
}

function isValueIdLike(value: any) {
  if (!isPlainObject(value)) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'commandClass')) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'property')) return false;
  return true;
}

function normalizeValueIdForBaselineHashV1(valueId: any) {
  const normalized = {
    commandClass: normalizeBaselineComparableNumber(valueId.commandClass),
    endpoint:
      valueId.endpoint === undefined ? 0 : normalizeBaselineComparableNumber(valueId.endpoint),
    property: normalizeBaselineComparableString(valueId.property),
  };
  if (valueId.propertyKey !== undefined) {
    normalized.propertyKey = normalizeBaselineComparableString(valueId.propertyKey);
  }
  return normalized;
}

function normalizeForBaselineHashV1(value: any) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const normalizedItems = [];
    for (const item of value) {
      const normalizedItem = normalizeForBaselineHashV1(item);
      if (normalizedItem !== undefined) normalizedItems.push(normalizedItem);
    }
    return normalizedItems;
  }
  if (isPlainObject(value)) {
    const source = isValueIdLike(value) ? normalizeValueIdForBaselineHashV1(value) : value;
    const normalizedRecord = {};
    const sortedKeys = Object.keys(source).sort((a, b) => a.localeCompare(b));
    for (const key of sortedKeys) {
      const normalizedValue = normalizeForBaselineHashV1(source[key]);
      if (normalizedValue !== undefined) normalizedRecord[key] = normalizedValue;
    }
    return normalizedRecord;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

function canonicalJsonForBaselineHashV1(value: any) {
  const normalized = normalizeForBaselineHashV1(value);
  return JSON.stringify(normalized);
}

function sortByCanonicalJson(items: any) {
  const pairs = [];
  for (const item of items) {
    const key = canonicalJsonForBaselineHashV1(item);
    if (key === undefined) continue;
    pairs.push({ item, key });
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  return pairs.map((entry) => entry.item);
}

function buildBaselineProfileProjectionV1(profile: any) {
  const sourceProfile = isPlainObject(profile) ? profile : {};
  const sourceClassification = isPlainObject(sourceProfile.classification)
    ? sourceProfile.classification
    : {};
  const projection = {
    classification: {
      homeyClass: normalizeBaselineComparableString(sourceClassification.homeyClass),
      driverTemplateId: normalizeBaselineComparableString(sourceClassification.driverTemplateId),
    },
    capabilities: [],
  };

  const rawCapabilities = Array.isArray(sourceProfile.capabilities)
    ? sourceProfile.capabilities
    : [];
  const normalizedCapabilities = [];
  for (const rawCapability of rawCapabilities) {
    if (!isPlainObject(rawCapability) || typeof rawCapability.capabilityId !== 'string') continue;
    normalizedCapabilities.push({
      capabilityId: rawCapability.capabilityId,
      inboundMapping: normalizeForBaselineHashV1(rawCapability.inboundMapping),
      outboundMapping: normalizeForBaselineHashV1(rawCapability.outboundMapping),
      flags: normalizeForBaselineHashV1(rawCapability.flags),
    });
  }
  normalizedCapabilities.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
  projection.capabilities = normalizedCapabilities;

  if (Array.isArray(sourceProfile.subscriptions)) {
    const subscriptions = [];
    for (const item of sourceProfile.subscriptions) {
      const normalized = normalizeForBaselineHashV1(item);
      if (normalized !== undefined) subscriptions.push(normalized);
    }
    projection.subscriptions = sortByCanonicalJson(subscriptions);
  }

  if (Array.isArray(sourceProfile.ignoredValues)) {
    const ignoredValues = [];
    for (const item of sourceProfile.ignoredValues) {
      const normalized = normalizeForBaselineHashV1(item);
      if (normalized !== undefined) ignoredValues.push(normalized);
    }
    projection.ignoredValues = sortByCanonicalJson(ignoredValues);
  }

  return normalizeForBaselineHashV1(projection);
}

function computeBaselineProfileHashV1(profile: any) {
  const canonicalJson = canonicalJsonForBaselineHashV1(buildBaselineProfileProjectionV1(profile));
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

function toTrimmedStringOrEmpty(value: any) {
  return typeof value === 'string' ? value.trim() : '';
}

function createBaselineMarkerV1(profile: any, options: any = {}): HomeyBaselineMarkerV1 {
  const marker = {
    projectionVersion: BASELINE_MARKER_PROJECTION_VERSION,
    baselineProfileHash: computeBaselineProfileHashV1(profile),
    updatedAt: new Date(options.now ?? Date.now()).toISOString(),
  };
  const pipelineFingerprint = toTrimmedStringOrEmpty(options.pipelineFingerprint);
  if (pipelineFingerprint.length > 0) marker.pipelineFingerprint = pipelineFingerprint;
  return marker;
}

function normalizeStoredBaselineMarker(marker: any): HomeyBaselineMarkerV1 | null {
  if (!isPlainObject(marker)) return null;
  const projectionVersion = toTrimmedStringOrEmpty(marker.projectionVersion);
  const baselineProfileHash = toTrimmedStringOrEmpty(marker.baselineProfileHash);
  const updatedAt = toTrimmedStringOrEmpty(marker.updatedAt);
  const pipelineFingerprint = toTrimmedStringOrEmpty(marker.pipelineFingerprint);
  if (projectionVersion.length === 0) return null;
  if (baselineProfileHash.length === 0) return null;
  if (updatedAt.length === 0) return null;
  const normalizedMarker = {
    projectionVersion,
    baselineProfileHash,
    updatedAt,
  };
  if (pipelineFingerprint.length > 0) {
    normalizedMarker.pipelineFingerprint = pipelineFingerprint;
  }
  return normalizedMarker;
}

function evaluateBaselineRecommendationState(
  profile: any,
  curationEntry: any,
  options: any = {},
): BaselineRecommendationStateV1 {
  const currentMarker = createBaselineMarkerV1(profile, options);
  if (!isPlainObject(curationEntry)) {
    return {
      recommendationAvailable: false,
      recommendationReason: 'no-curation-entry',
      projectionVersion: BASELINE_MARKER_PROJECTION_VERSION,
      currentMarker,
      storedMarker: null,
      shouldBackfillMarker: false,
    };
  }

  const storedMarker = normalizeStoredBaselineMarker(curationEntry.baselineMarker);
  if (!storedMarker) {
    return {
      recommendationAvailable: false,
      recommendationReason: 'marker-missing-backfill',
      projectionVersion: BASELINE_MARKER_PROJECTION_VERSION,
      currentMarker,
      storedMarker: null,
      shouldBackfillMarker: true,
    };
  }

  if (storedMarker.projectionVersion !== BASELINE_MARKER_PROJECTION_VERSION) {
    return {
      recommendationAvailable: false,
      recommendationReason: 'projection-version-mismatch-backfill',
      projectionVersion: BASELINE_MARKER_PROJECTION_VERSION,
      currentMarker,
      storedMarker,
      shouldBackfillMarker: true,
    };
  }

  if (storedMarker.baselineProfileHash !== currentMarker.baselineProfileHash) {
    return {
      recommendationAvailable: true,
      recommendationReason: 'baseline-hash-changed',
      projectionVersion: BASELINE_MARKER_PROJECTION_VERSION,
      currentMarker,
      storedMarker,
      shouldBackfillMarker: false,
    };
  }

  return {
    recommendationAvailable: false,
    recommendationReason: 'baseline-hash-unchanged',
    projectionVersion: BASELINE_MARKER_PROJECTION_VERSION,
    currentMarker,
    storedMarker,
    shouldBackfillMarker: false,
  };
}

function cloneCurationDocumentForMutation(document: any) {
  const nextDocument = createEmptyCurationDocument();
  if (isPlainObject(document)) {
    if (isPlainObject(document.entries)) {
      nextDocument.entries = deepClone(document.entries);
    }
    if (typeof document.updatedAt === 'string' && document.updatedAt.trim().length > 0) {
      nextDocument.updatedAt = document.updatedAt.trim();
    }
  }
  nextDocument.schemaVersion = CURATION_SCHEMA_VERSION;
  return nextDocument;
}

function normalizeBaselineMarkerForStorage(marker: any, updatedAtFallback: any) {
  const markerRecord = assertPlainObject(marker, 'baselineMarker');
  const normalizedMarker = {
    projectionVersion: assertNonEmptyString(
      markerRecord.projectionVersion,
      'baselineMarker.projectionVersion',
    ),
    baselineProfileHash: assertNonEmptyString(
      markerRecord.baselineProfileHash,
      'baselineMarker.baselineProfileHash',
    ),
    updatedAt:
      markerRecord.updatedAt !== undefined
        ? assertIsoTimestamp(markerRecord.updatedAt, 'baselineMarker.updatedAt')
        : updatedAtFallback,
  };
  if (markerRecord.pipelineFingerprint !== undefined) {
    normalizedMarker.pipelineFingerprint = assertNonEmptyString(
      markerRecord.pipelineFingerprint,
      'baselineMarker.pipelineFingerprint',
    );
  }
  return normalizedMarker;
}

function upsertCurationBaselineMarkerV1(
  document: any,
  homeyDeviceId: any,
  baselineMarker: any,
  options: any = {},
) {
  const normalizedHomeyDeviceId = assertNonEmptyString(homeyDeviceId, 'homeyDeviceId');
  const updatedAt = new Date(options.now ?? Date.now()).toISOString();
  const normalizedBaselineMarker = normalizeBaselineMarkerForStorage(baselineMarker, updatedAt);
  const nextDocument = cloneCurationDocumentForMutation(document);
  const existingEntry = isPlainObject(nextDocument.entries[normalizedHomeyDeviceId])
    ? nextDocument.entries[normalizedHomeyDeviceId]
    : undefined;
  const nextEntry = existingEntry ? deepClone(existingEntry) : {};
  nextEntry.targetDevice = isPlainObject(nextEntry.targetDevice) ? nextEntry.targetDevice : {};
  nextEntry.targetDevice.homeyDeviceId = normalizedHomeyDeviceId;
  if (!isPlainObject(nextEntry.overrides)) nextEntry.overrides = {};
  nextEntry.baselineMarker = normalizedBaselineMarker;
  nextEntry.updatedAt = updatedAt;
  nextDocument.entries[normalizedHomeyDeviceId] = nextEntry;
  nextDocument.updatedAt = updatedAt;
  return {
    document: nextDocument,
    createdEntry: !existingEntry,
    updatedAt,
  };
}

function removeCurationEntryV1(document: any, homeyDeviceId: any, options: any = {}) {
  const normalizedHomeyDeviceId = assertNonEmptyString(homeyDeviceId, 'homeyDeviceId');
  const updatedAt = new Date(options.now ?? Date.now()).toISOString();
  const nextDocument = cloneCurationDocumentForMutation(document);
  const removed = Object.prototype.hasOwnProperty.call(
    nextDocument.entries,
    normalizedHomeyDeviceId,
  );
  if (removed) delete nextDocument.entries[normalizedHomeyDeviceId];
  nextDocument.updatedAt = updatedAt;
  return {
    document: nextDocument,
    removed,
    updatedAt,
  };
}

export {
  CURATION_SETTINGS_KEY,
  CURATION_SCHEMA_VERSION,
  BASELINE_MARKER_PROJECTION_VERSION,
  loadCurationRuntimeFromSettings,
  resolveCurationEntryFromRuntime,
  lowerCurationEntryToRuntimeActions,
  applyCurationEntryToProfile,
  buildBaselineProfileProjectionV1,
  computeBaselineProfileHashV1,
  createBaselineMarkerV1,
  evaluateBaselineRecommendationState,
  upsertCurationBaselineMarkerV1,
  removeCurationEntryV1,
};

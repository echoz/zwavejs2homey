'use strict';

const CURATION_SETTINGS_KEY = 'curation.v1';
const CURATION_SCHEMA_VERSION = 'homey-curation/v1';

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

function toErrorMessage(error) {
  if (error instanceof Error && typeof error.message === 'string') return error.message;
  return String(error);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertPlainObject(value, pathLabel) {
  if (!isPlainObject(value)) {
    throw new Error(`${pathLabel} must be an object`);
  }
  return value;
}

function assertAllowedKeys(record, allowedKeys, pathLabel) {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${pathLabel} contains unsupported field: ${key}`);
    }
  }
}

function assertNonEmptyString(value, pathLabel) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${pathLabel} must be a non-empty string`);
  }
  return value.trim();
}

function assertIsoTimestamp(value, pathLabel) {
  const text = assertNonEmptyString(value, pathLabel);
  const parsedTime = Date.parse(text);
  if (!Number.isFinite(parsedTime)) {
    throw new Error(`${pathLabel} must be an ISO timestamp`);
  }
  return text;
}

function canonicalizeCollectionValue(value, pathLabel) {
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

function normalizeCollectionArray(raw, pathLabel) {
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

function ensureNoCollectionPairOverlap(collections, addKey, removeKey, pathLabel) {
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

function normalizeEntryOverrides(rawOverrides, pathLabel) {
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

function normalizeEntry(rawEntry, homeyDeviceId, pathLabel) {
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

function normalizeCurationDocument(rawDocument) {
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

function loadCurationRuntimeFromSettings(settingsValue) {
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

function resolveCurationEntryFromRuntime(runtime, homeyDeviceId) {
  if (!runtime?.entriesByDeviceId) return undefined;
  return runtime.entriesByDeviceId.get(homeyDeviceId);
}

module.exports = {
  CURATION_SETTINGS_KEY,
  CURATION_SCHEMA_VERSION,
  loadCurationRuntimeFromSettings,
  resolveCurationEntryFromRuntime,
};

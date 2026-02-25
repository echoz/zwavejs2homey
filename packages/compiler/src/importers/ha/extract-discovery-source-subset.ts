import fs from 'node:fs';
import path from 'node:path';

import type {
  HaExtractedDiscoveryInputV1,
  HaExtractedDiscoveryEntryV1,
} from './translate-extracted-discovery';

export type HaSourceSubsetUnsupportedReason =
  | 'unsupported-platform'
  | 'unsupported-primary-value-alias'
  | 'unsupported-primary-value-inline'
  | 'unsupported-primary-value-shape'
  | 'unsupported-primary-value'
  | 'unsupported-companion-alias'
  | 'unsupported-companion-inline'
  | 'unsupported-companion-shape'
  | 'missing-required-fields'
  | 'unsupported-companion-value'
  | 'parse-error';

export interface HaSourceSubsetUnsupportedItem {
  sourceRef: string;
  reason: HaSourceSubsetUnsupportedReason;
  detail: string;
}

export interface HaSourceSubsetExtractReport {
  scannedSchemas: number;
  translated: number;
  skipped: number;
  unsupported: HaSourceSubsetUnsupportedItem[];
  unsupportedByReason: Partial<Record<HaSourceSubsetUnsupportedReason, number>>;
}

export interface HaSourceSubsetExtractResult {
  artifact: HaExtractedDiscoveryInputV1;
  report: HaSourceSubsetExtractReport;
}

const COMMAND_CLASS_NUMBERS: Record<string, number> = {
  BASIC: 32,
  BATTERY: 128,
  BARRIER_OPERATOR: 102,
  ENERGY_PRODUCTION: 144,
  COLOR_SWITCH: 51,
  CONFIGURATION: 112,
  DOOR_LOCK: 98,
  HUMIDITY_CONTROL_MODE: 109,
  INDICATOR: 87,
  LOCK: 118,
  MANUFACTURER_PROPRIETARY: 145,
  METER: 50,
  NOTIFICATION: 113,
  PROTECTION: 117,
  SENSOR_BINARY: 48,
  SENSOR_MULTILEVEL: 49,
  SENSOR_ALARM: 156,
  SOUND_SWITCH: 121,
  SWITCH_BINARY: 37,
  SWITCH_MULTILEVEL: 38,
  THERMOSTAT_FAN_MODE: 68,
  THERMOSTAT_MODE: 64,
  THERMOSTAT_SETPOINT: 67,
  WINDOW_COVERING: 106,
};

const VALUE_TYPE_MAP: Record<string, string> = {
  BOOLEAN: 'boolean',
  NUMBER: 'number',
  STRING: 'string',
};

type ParsedValueMatcher = NonNullable<HaExtractedDiscoveryEntryV1['valueMatch']>;
type ParsedCompanion = NonNullable<
  NonNullable<HaExtractedDiscoveryEntryV1['companions']>['requiredValues']
>[number];
type ParsedOutput = HaExtractedDiscoveryEntryV1['output'];
type ParsedPropertyKey = string | number | null;

interface AliasSchemaDef {
  commandClass: number;
  property: string | number;
  endpoint?: number;
  metadataType?: string;
  propertyKey?: ParsedPropertyKey | ParsedPropertyKey[];
}

const WINDOW_COVERING_POSITION_PROPERTY_KEYS: ParsedPropertyKey[] = [
  'inboundBottom',
  'inboundBottomNoPosition',
  'inboundLeft',
  'inboundLeftNoPosition',
  'inboundLeftRight',
  'inboundLeftRightNoPosition',
  'inboundRight',
  'inboundRightNoPosition',
  'inboundTop',
  'inboundTopNoPosition',
  'inboundTopBottom',
  'inboundTopBottomNoPosition',
  'outboundBottom',
  'outboundBottomNoPosition',
  'outboundLeft',
  'outboundLeftNoPosition',
  'outboundRight',
  'outboundRightNoPosition',
  'outboundTop',
  'outboundTopNoPosition',
];

const WINDOW_COVERING_TILT_PROPERTY_KEYS: ParsedPropertyKey[] = [
  'horizontalSlatsAngle',
  'horizontalSlatsAngleNoPosition',
  'verticalSlatsAngle',
  'verticalSlatsAngleNoPosition',
];

const VALUE_ALIAS_DEFS: Record<string, AliasSchemaDef> = {
  SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA: {
    commandClass: 38,
    property: 'currentValue',
    endpoint: 0,
    metadataType: 'number',
  },
  SWITCH_MULTILEVEL_TARGET_VALUE_SCHEMA: {
    commandClass: 38,
    property: 'targetValue',
    endpoint: 0,
    metadataType: 'number',
  },
  SWITCH_BINARY_CURRENT_VALUE_SCHEMA: {
    commandClass: 37,
    property: 'currentValue',
    endpoint: 0,
    metadataType: 'boolean',
  },
  DOOR_LOCK_CURRENT_MODE_SCHEMA: {
    commandClass: 98,
    property: 'currentMode',
    endpoint: 0,
    metadataType: 'number',
  },
  COLOR_SWITCH_CURRENT_VALUE_SCHEMA: {
    commandClass: 51,
    property: 'currentValue',
    endpoint: 0,
    metadataType: 'number',
    propertyKey: null,
  },
  SIREN_TONE_SCHEMA: {
    commandClass: 121,
    property: 'toneId',
    endpoint: 0,
    metadataType: 'number',
  },
  WINDOW_COVERING_COVER_CURRENT_VALUE_SCHEMA: {
    commandClass: 106,
    property: 'currentValue',
    endpoint: 0,
    metadataType: 'number',
    propertyKey: WINDOW_COVERING_POSITION_PROPERTY_KEYS,
  },
  WINDOW_COVERING_SLAT_CURRENT_VALUE_SCHEMA: {
    commandClass: 106,
    property: 'currentValue',
    endpoint: 0,
    metadataType: 'number',
    propertyKey: WINDOW_COVERING_TILT_PROPERTY_KEYS,
  },
};

const PROPERTY_TOKEN_MAP: Record<string, string | number> = {
  CURRENT_MODE_PROPERTY: 'currentMode',
  CURRENT_STATE_PROPERTY: 'currentState',
  CURRENT_VALUE_PROPERTY: 'currentValue',
  DEFAULT_TONE_ID_PROPERTY: 'defaultToneId',
  DEFAULT_VOLUME_PROPERTY: 'defaultVolume',
  DOOR_STATUS_PROPERTY: 'doorStatus',
  HUMIDITY_CONTROL_MODE_PROPERTY: 'humidityMode',
  LOCAL_PROPERTY: 'local',
  LOCKED_PROPERTY: 'locked',
  RESET_METER_PROPERTY: 'reset',
  RF_PROPERTY: 'rf',
  SIGNALING_STATE_PROPERTY: 'signalingState',
  TARGET_STATE_PROPERTY: 'targetState',
  TARGET_VALUE_PROPERTY: 'targetValue',
  THERMOSTAT_FAN_MODE_PROPERTY: 'fanMode',
  THERMOSTAT_SETPOINT_PROPERTY: 'setpoint',
  THERMOSTAT_MODE_PROPERTY: 'mode',
  TONE_ID_PROPERTY: 'toneId',
  VALUE_PROPERTY: 'value',
};

function countLines(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function parseHexSet(content: string): number[] {
  return content
    .split(',')
    .map((part) => part.split('#', 1)[0].trim())
    .filter(Boolean)
    .map((part) => {
      const hexMatch = part.match(/^0x([0-9A-Fa-f]+)$/);
      if (hexMatch) return Number.parseInt(hexMatch[1], 16);
      const dec = Number.parseInt(part, 10);
      if (!Number.isNaN(dec)) return dec;
      throw new Error(`Unsupported numeric token: ${part}`);
    });
}

function parseStringSet(content: string): string[] {
  return [...content.matchAll(/"([^"]+)"|'([^']+)'/g)]
    .map((match) => (match[1] ?? match[2] ?? '').trim())
    .filter((value) => value.length > 0);
}

function parsePropertyToken(content: string): string | number | null | undefined {
  const trimmed = content.trim();
  if (trimmed === 'None') return null;
  if (PROPERTY_TOKEN_MAP[trimmed] !== undefined) return PROPERTY_TOKEN_MAP[trimmed];
  const quoted = trimmed.match(/^"([^"]+)"$|^'([^']+)'$/);
  if (quoted) return quoted[1] ?? quoted[2];
  const hex = trimmed.match(/^0x([0-9A-Fa-f]+)$/);
  if (hex) return Number.parseInt(hex[1], 16);
  const dec = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(dec) && String(dec) === trimmed) return dec;
  return undefined;
}

function parseCommandClassSet(content: string): number | null {
  const names = [...content.matchAll(/CommandClass\.([A-Z_]+)/g)].map((m) => m[1]);
  if (names.length === 0) return null;
  for (const name of names) {
    const commandClass = COMMAND_CLASS_NUMBERS[name];
    if (commandClass !== undefined) return commandClass;
  }
  return null;
}

function parsePropertySet(content: string): string | number | null {
  for (const token of content.split(',')) {
    const parsed = parsePropertyToken(token);
    if (parsed !== undefined && parsed !== null) return parsed;
  }
  return null;
}

function parsePropertyKeySet(content: string): ParsedPropertyKey[] | null {
  const parsed: ParsedPropertyKey[] = [];
  for (const token of content.split(',')) {
    const value = parsePropertyToken(token);
    if (value === undefined) return null;
    parsed.push(value);
  }
  if (parsed.length === 0) return [];
  return [...new Set(parsed)];
}

function extractSchemaBlocks(source: string): Array<{ startIndex: number; body: string }> {
  const blocks: Array<{ startIndex: number; body: string }> = [];
  const needle = 'ZWaveDiscoverySchema(';
  let from = 0;
  while (true) {
    const start = source.indexOf(needle, from);
    if (start === -1) break;
    let i = start + needle.length;
    let depth = 1;
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }
      if ((inSingle || inDouble) && ch === '\\') {
        escaped = true;
        i += 1;
        continue;
      }
      if (!inDouble && ch === "'" && !inSingle) {
        inSingle = true;
        i += 1;
        continue;
      }
      if (inSingle && ch === "'") {
        inSingle = false;
        i += 1;
        continue;
      }
      if (!inSingle && ch === '"' && !inDouble) {
        inDouble = true;
        i += 1;
        continue;
      }
      if (inDouble && ch === '"') {
        inDouble = false;
        i += 1;
        continue;
      }
      if (inSingle || inDouble) {
        i += 1;
        continue;
      }
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      i += 1;
    }
    if (depth === 0) {
      blocks.push({
        startIndex: start,
        body: source.slice(start + needle.length, i - 1),
      });
      from = i;
    } else {
      break;
    }
  }
  return blocks;
}

function parseInlineValueSchema(fragment: string): ParsedValueMatcher | ParsedCompanion | null {
  const ccSetMatch = fragment.match(/command_class=\{([\s\S]*?)\}/);
  if (!ccSetMatch) return null;
  const commandClass = parseCommandClassSet(ccSetMatch[1]);
  if (commandClass === null) return null;
  const propertyMatch = fragment.match(/property=\{([^}]+)\}/);
  let property = propertyMatch ? parsePropertySet(propertyMatch[1]) : null;
  if (property === null) {
    if (
      commandClass === 32 ||
      commandClass === 48 ||
      commandClass === 49 ||
      commandClass === 50 ||
      commandClass === 87 ||
      commandClass === 113 ||
      commandClass === 128 ||
      commandClass === 144 ||
      commandClass === 156
    ) {
      property = 'currentValue';
    } else {
      return null;
    }
  }
  const endpointMatch = fragment.match(/endpoint=\{([^}]+)\}/);
  const endpoint = endpointMatch ? parseHexSet(endpointMatch[1])[0] : 0;
  const propertyKeyMatch = fragment.match(/property_key=\{([^}]+)\}/);
  const parsed: ParsedValueMatcher = {
    commandClass,
    endpoint,
    property,
  };
  if (propertyKeyMatch) {
    const propertyKey = parsePropertyKeySet(propertyKeyMatch[1]);
    if (!propertyKey) return null;
    if (propertyKey.length === 1) {
      parsed.propertyKey = propertyKey[0];
    } else if (propertyKey.length > 1) {
      parsed.propertyKey = propertyKey;
    }
  }
  const typeMatch = fragment.match(/type=\{ValueType\.([A-Z_]+)\}/);
  const readableMatch = fragment.match(/\breadable=(True|False)\b/);
  const writeableMatch = fragment.match(/\bwriteable=(True|False)\b/);
  const metadata: NonNullable<ParsedValueMatcher['metadata']> = {};
  if (typeMatch && VALUE_TYPE_MAP[typeMatch[1]]) metadata.type = VALUE_TYPE_MAP[typeMatch[1]];
  if (readableMatch) metadata.readable = readableMatch[1] === 'True';
  if (writeableMatch) metadata.writeable = writeableMatch[1] === 'True';
  if (Object.keys(metadata).length > 0) parsed.metadata = metadata;
  return parsed;
}

function parseEntrySemantics(block: string): HaExtractedDiscoveryEntryV1['semantics'] | undefined {
  const allowMultiMatch = block.match(/\ballow_multi=(True|False)\b/);
  const assumedStateMatch = block.match(/\bassumed_state=(True|False)\b/);
  const entityRegistryEnabledDefaultMatch = block.match(
    /\bentity_registry_enabled_default=(True|False)\b/,
  );
  const semantics: NonNullable<HaExtractedDiscoveryEntryV1['semantics']> = {};
  if (allowMultiMatch) semantics.allowMulti = allowMultiMatch[1] === 'True';
  if (assumedStateMatch) semantics.assumedState = assumedStateMatch[1] === 'True';
  if (entityRegistryEnabledDefaultMatch) {
    semantics.entityRegistryEnabledDefault = entityRegistryEnabledDefaultMatch[1] === 'True';
  }
  return Object.keys(semantics).length > 0 ? semantics : undefined;
}

function parseValueSchemaRef(
  block: string,
  fieldName: 'primary_value' | 'required_values' | 'absent_values',
) {
  if (fieldName === 'primary_value') {
    const aliasMatch = block.match(/primary_value=([A-Z0-9_]+_SCHEMA)/);
    if (aliasMatch) {
      const alias = VALUE_ALIAS_DEFS[aliasMatch[1]];
      if (!alias) {
        return {
          unsupported: `Unsupported primary_value alias: ${aliasMatch[1]}`,
          unsupportedReason: 'unsupported-primary-value-alias' as const,
        };
      }
      const value: ParsedValueMatcher = {
        commandClass: alias.commandClass,
        endpoint: alias.endpoint ?? 0,
        property: alias.property,
        ...(alias.propertyKey !== undefined ? { propertyKey: alias.propertyKey } : {}),
        ...(alias.metadataType ? { metadata: { type: alias.metadataType } } : {}),
      };
      return { value };
    }
    const inlineMatch = block.match(/primary_value=ZWaveValueDiscoverySchema\(([\s\S]*?)\)\s*,/);
    if (!inlineMatch) {
      return {
        unsupported: 'Missing or unsupported primary_value shape',
        unsupportedReason: 'unsupported-primary-value-shape' as const,
      };
    }
    const value = parseInlineValueSchema(inlineMatch[1]);
    if (!value) {
      return {
        unsupported: 'Unsupported primary_value inline schema',
        unsupportedReason: 'unsupported-primary-value-inline' as const,
      };
    }
    return { value: value as ParsedValueMatcher };
  }

  const listMatch = block.match(new RegExp(`${fieldName}=\\[([\\s\\S]*?)\\]\\s*(?:,|$)`));
  if (!listMatch) return { values: undefined as ParsedCompanion[] | undefined };
  const listBody = listMatch[1];
  const aliasItems = [...listBody.matchAll(/([A-Z0-9_]+_SCHEMA)/g)].map((m) => m[1]);
  if (aliasItems.length > 0 && !listBody.includes('ZWaveValueDiscoverySchema(')) {
    const mapped = aliasItems.map((aliasName) => {
      const alias = VALUE_ALIAS_DEFS[aliasName];
      if (!alias) {
        const error = new Error(`Unsupported companion alias: ${aliasName}`);
        error.name = 'UnsupportedCompanionAliasError';
        throw error;
      }
      return {
        commandClass: alias.commandClass,
        endpoint: alias.endpoint ?? 0,
        property: alias.property,
        ...(alias.propertyKey !== undefined ? { propertyKey: alias.propertyKey } : {}),
      };
    });
    return { values: mapped };
  }

  const inlineItems = [...listBody.matchAll(/ZWaveValueDiscoverySchema\(([\s\S]*?)\)/g)];
  const parsed: ParsedCompanion[] = [];
  for (const match of inlineItems) {
    const value = parseInlineValueSchema(match[1]);
    if (!value) {
      return {
        unsupported: `Unsupported ${fieldName} inline schema`,
        unsupportedReason: 'unsupported-companion-inline' as const,
      };
    }
    parsed.push({
      commandClass: value.commandClass,
      endpoint: value.endpoint,
      property: value.property,
      ...(value.propertyKey !== undefined ? { propertyKey: value.propertyKey } : {}),
    });
  }
  if (inlineItems.length === 0 && listBody.trim().length > 0) {
    return {
      unsupported: `Unsupported ${fieldName} list shape`,
      unsupportedReason: 'unsupported-companion-shape' as const,
    };
  }
  return { values: parsed };
}

function parseDeviceMatch(block: string): HaExtractedDiscoveryEntryV1['deviceMatch'] | undefined {
  const manufacturerMatch = block.match(/manufacturer_id=\{([^}]+)\}/);
  const productIdMatch = block.match(/product_id=\{([^}]+)\}/);
  const productTypeMatch = block.match(/product_type=\{([^}]+)\}/);
  const deviceClassGenericMatch = block.match(/device_class_generic=\{([^}]+)\}/);
  const deviceClassSpecificMatch = block.match(/device_class_specific=\{([^}]+)\}/);
  const fwMatch = block.match(
    /firmware_version=(?:FirmwareVersionRange\()?min_version=\"([^\"]+)\"[\s\S]*?max_version=\"([^\"]+)\"/,
  );

  const result: NonNullable<HaExtractedDiscoveryEntryV1['deviceMatch']> = {};
  if (manufacturerMatch) result.manufacturerId = parseHexSet(manufacturerMatch[1])[0];
  if (productIdMatch) result.productId = parseHexSet(productIdMatch[1])[0];
  if (productTypeMatch) result.productType = parseHexSet(productTypeMatch[1])[0];
  if (deviceClassGenericMatch) {
    const parsed = parseStringSet(deviceClassGenericMatch[1]);
    if (parsed.length > 0) result.deviceClassGeneric = parsed;
  }
  if (deviceClassSpecificMatch) {
    const parsed = parseStringSet(deviceClassSpecificMatch[1]);
    if (parsed.length > 0) result.deviceClassSpecific = parsed;
  }
  if (fwMatch) result.firmwareVersionRange = { min: fwMatch[1], max: fwMatch[2] };
  return Object.keys(result).length > 0 ? result : undefined;
}

function mapPlatformToOutput(
  platform: string,
  primaryValue: ParsedValueMatcher,
): ParsedOutput | null {
  switch (platform) {
    case 'FAN':
      return {
        homeyClass: 'fan',
        driverTemplateId: 'ha-import-fan',
        capabilityId: 'dim',
      };
    case 'CLIMATE':
      return {
        homeyClass: 'thermostat',
        driverTemplateId: 'ha-import-thermostat',
        capabilityId: 'target_temperature',
      };
    case 'SWITCH':
      return {
        homeyClass: 'socket',
        driverTemplateId: 'ha-import-switch',
        capabilityId: 'onoff',
      };
    case 'LIGHT':
      return {
        homeyClass: 'light',
        driverTemplateId: 'ha-import-light',
        capabilityId: primaryValue.commandClass === 38 ? 'dim' : 'onoff',
      };
    case 'BINARY_SENSOR':
      return {
        homeyClass: 'sensor',
        driverTemplateId: 'ha-import-binary-sensor',
        capabilityId: 'alarm_generic',
      };
    case 'LOCK':
      return {
        homeyClass: 'lock',
        driverTemplateId: 'ha-import-lock',
        capabilityId: 'locked',
      };
    case 'SELECT':
      return {
        homeyClass: 'other',
        driverTemplateId: 'ha-import-select',
        capabilityId: 'enum_select',
      };
    case 'COVER':
      return {
        homeyClass: 'curtain',
        driverTemplateId: 'ha-import-cover',
        capabilityId: 'windowcoverings_set',
      };
    case 'SENSOR':
      return {
        homeyClass: 'sensor',
        driverTemplateId: 'ha-import-sensor',
        capabilityId: 'measure_generic',
      };
    case 'NUMBER':
      return {
        homeyClass: 'other',
        driverTemplateId: 'ha-import-number',
        capabilityId: 'number_value',
      };
    case 'BUTTON':
      return {
        homeyClass: 'button',
        driverTemplateId: 'ha-import-button',
        capabilityId: 'button_action',
      };
    case 'SIREN':
      return {
        homeyClass: 'alarm',
        driverTemplateId: 'ha-import-siren',
        capabilityId: 'alarm_siren',
      };
    case 'HUMIDIFIER':
      return {
        homeyClass: 'humidifier',
        driverTemplateId: 'ha-import-humidifier',
        capabilityId: 'dim',
      };
    default:
      return null;
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function buildEntryFromBlock(
  source: string,
  block: { startIndex: number; body: string },
  sourceRefBase: string,
): { entry?: HaExtractedDiscoveryEntryV1; unsupported?: HaSourceSubsetUnsupportedItem } {
  const line = countLines(source, block.startIndex);
  const sourceRef = `${sourceRefBase}:${line}`;
  try {
    const platformMatch = block.body.match(/platform=Platform\.([A-Z_]+)/);
    if (!platformMatch) {
      return {
        unsupported: {
          sourceRef,
          reason: 'missing-required-fields',
          detail: 'missing platform=Platform.*',
        },
      };
    }
    const platform = platformMatch[1];
    const primary = parseValueSchemaRef(block.body, 'primary_value');
    if ('unsupported' in primary) {
      return {
        unsupported: {
          sourceRef,
          reason: primary.unsupportedReason ?? 'unsupported-primary-value',
          detail: primary.unsupported ?? 'unsupported primary value',
        },
      };
    }
    if (!primary.value) {
      return {
        unsupported: {
          sourceRef,
          reason: 'missing-required-fields',
          detail: 'missing primary_value',
        },
      };
    }
    const output = mapPlatformToOutput(platform, primary.value);
    if (!output) {
      return {
        unsupported: {
          sourceRef,
          reason: 'unsupported-platform',
          detail: platform,
        },
      };
    }

    let requiredValues;
    let absentValues;
    try {
      const required = parseValueSchemaRef(block.body, 'required_values');
      const absent = parseValueSchemaRef(block.body, 'absent_values');
      if ('unsupported' in required) {
        return {
          unsupported: {
            sourceRef,
            reason: required.unsupportedReason ?? 'unsupported-companion-value',
            detail: required.unsupported ?? 'unsupported required_values',
          },
        };
      }
      if ('unsupported' in absent) {
        return {
          unsupported: {
            sourceRef,
            reason: absent.unsupportedReason ?? 'unsupported-companion-value',
            detail: absent.unsupported ?? 'unsupported absent_values',
          },
        };
      }
      requiredValues = required.values;
      absentValues = absent.values;
    } catch (error) {
      return {
        unsupported: {
          sourceRef,
          reason:
            error instanceof Error && error.name === 'UnsupportedCompanionAliasError'
              ? 'unsupported-companion-alias'
              : 'unsupported-companion-value',
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    }

    const hintMatch = block.body.match(/hint=\"([^\"]+)\"/);
    const baseId = hintMatch
      ? `${platform.toLowerCase()}_${slug(hintMatch[1])}`
      : `${platform.toLowerCase()}_${line}`;

    const semantics = parseEntrySemantics(block.body);
    const deviceMatch = parseDeviceMatch(block.body);

    const entry: HaExtractedDiscoveryEntryV1 = {
      id: `ha_extracted_${baseId}_${line}`,
      sourceRef,
      ...(semantics ? { semantics } : {}),
      ...(deviceMatch ? { deviceMatch } : {}),
      valueMatch: primary.value,
      ...(requiredValues || absentValues
        ? {
            companions: {
              ...(requiredValues ? { requiredValues } : {}),
              ...(absentValues ? { absentValues } : {}),
            },
          }
        : {}),
      output,
    };
    return { entry };
  } catch (error) {
    return {
      unsupported: {
        sourceRef,
        reason: 'parse-error',
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function extractHaDiscoverySubsetFromSource(
  sourceText: string,
  sourceRefBase: string,
): HaSourceSubsetExtractResult {
  const blocks = extractSchemaBlocks(sourceText);
  const entries: HaExtractedDiscoveryEntryV1[] = [];
  const unsupported: HaSourceSubsetUnsupportedItem[] = [];

  for (const block of blocks) {
    const parsed = buildEntryFromBlock(sourceText, block, sourceRefBase);
    if (parsed.entry) {
      entries.push(parsed.entry);
    } else if (parsed.unsupported) {
      unsupported.push(parsed.unsupported);
    }
  }

  const unsupportedByReason: Partial<Record<HaSourceSubsetUnsupportedReason, number>> = {};
  for (const item of unsupported) {
    unsupportedByReason[item.reason] = (unsupportedByReason[item.reason] ?? 0) + 1;
  }

  return {
    artifact: {
      schemaVersion: 'ha-extracted-discovery/v1',
      source: {
        generatedAt: new Date().toISOString(),
        sourceRef: sourceRefBase,
      },
      entries,
    },
    report: {
      scannedSchemas: blocks.length,
      translated: entries.length,
      skipped: unsupported.length,
      unsupported,
      unsupportedByReason,
    },
  };
}

export function extractHaDiscoverySubsetFromFile(filePath: string): HaSourceSubsetExtractResult {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceRefBase = path.relative(process.cwd(), filePath) || filePath;
  return extractHaDiscoverySubsetFromSource(sourceText, sourceRefBase);
}

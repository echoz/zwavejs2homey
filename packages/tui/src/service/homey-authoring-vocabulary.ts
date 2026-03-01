import fs from 'node:fs';
import path from 'node:path';

export interface HomeyAuthoringVocabulary {
  source: 'artifact' | 'fallback';
  filePath: string;
  homeyClasses: string[];
  capabilityIds: string[];
  warning?: string;
}

export const FALLBACK_HOMEY_CLASS_OPTIONS = [
  'other',
  'socket',
  'light',
  'sensor',
  'button',
  'lock',
  'thermostat',
  'windowcoverings',
  'speaker',
  'fan',
];

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractIds(list: unknown, fieldPath: string): string[] {
  if (!Array.isArray(list)) {
    throw new Error(`${fieldPath} must be an array`);
  }
  const ids = [];
  for (let index = 0; index < list.length; index += 1) {
    const entry = asObject(list[index]);
    if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(`${fieldPath}[${index}].id must be a non-empty string`);
    }
    ids.push(entry.id);
  }
  return uniqueSorted(ids);
}

function resolveFilePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

export function loadHomeyAuthoringVocabulary(filePath: string): HomeyAuthoringVocabulary {
  const resolvedPath = resolveFilePath(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      source: 'fallback',
      filePath: resolvedPath,
      homeyClasses: [...FALLBACK_HOMEY_CLASS_OPTIONS],
      capabilityIds: [],
      warning: `Vocabulary artifact not found at ${resolvedPath}; using fallback Homey classes.`,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    const object = asObject(parsed);
    if (!object || object.schemaVersion !== 'homey-vocabulary/v1') {
      throw new Error('schemaVersion must be "homey-vocabulary/v1"');
    }
    return {
      source: 'artifact',
      filePath: resolvedPath,
      homeyClasses: extractIds(object.homeyClasses, 'homeyClasses'),
      capabilityIds: extractIds(object.capabilityIds, 'capabilityIds'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      source: 'fallback',
      filePath: resolvedPath,
      homeyClasses: [...FALLBACK_HOMEY_CLASS_OPTIONS],
      capabilityIds: [],
      warning:
        `Failed to load vocabulary artifact at ${resolvedPath}: ${message}. ` +
        'Using fallback Homey classes.',
    };
  }
}

import fs from 'node:fs';
import path from 'node:path';

export interface HomeyAuthoringVocabulary {
  filePath: string;
  homeyClasses: string[];
  capabilityIds: string[];
}

export class HomeyAuthoringVocabularyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomeyAuthoringVocabularyError';
  }
}

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
  if (path.isAbsolute(filePath)) return filePath;
  const direct = path.resolve(filePath);
  if (fs.existsSync(direct)) return direct;

  // Support running from workspace subdirectories (e.g. packages/tui tests).
  let currentDir = process.cwd();
  while (true) {
    const candidate = path.join(currentDir, filePath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return direct;
}

export function loadHomeyAuthoringVocabulary(filePath: string): HomeyAuthoringVocabulary {
  const resolvedPath = resolveFilePath(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new HomeyAuthoringVocabularyError(
      [
        `Vocabulary artifact not found: ${resolvedPath}`,
        'Generate/refresh it with:',
        '  npm run compiler:homey-vocabulary',
      ].join('\n'),
    );
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    const object = asObject(parsed);
    if (!object || object.schemaVersion !== 'homey-authoring-vocabulary/v1') {
      throw new Error('schemaVersion must be "homey-authoring-vocabulary/v1"');
    }
    const homeyClasses = extractIds(object.homeyClasses, 'homeyClasses');
    const capabilityIds = extractIds(object.capabilityIds, 'capabilityIds');
    if (homeyClasses.length <= 0) {
      throw new Error('homeyClasses must contain at least one entry');
    }
    if (capabilityIds.length <= 0) {
      throw new Error('capabilityIds must contain at least one entry');
    }
    return {
      filePath: resolvedPath,
      homeyClasses,
      capabilityIds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HomeyAuthoringVocabularyError(
      [
        `Failed to load vocabulary artifact at ${resolvedPath}: ${message}`,
        'Regenerate it with:',
        '  npm run compiler:homey-vocabulary',
      ].join('\n'),
    );
  }
}

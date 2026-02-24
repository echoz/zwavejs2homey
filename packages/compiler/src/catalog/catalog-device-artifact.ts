import fs from 'node:fs';

export interface CatalogDeviceRecordV1 {
  catalogId: string;
  manufacturerId?: number;
  productType?: number;
  productId?: number;
  label?: string;
  sources: Array<{
    source: string;
    sourceId?: string;
    confidence?: 'high' | 'medium' | 'low';
  }>;
}

export interface CatalogDevicesArtifactV1 {
  schemaVersion: 'catalog-devices/v1';
  source: {
    generatedAt: string;
    sourceRef: string;
  };
  devices: CatalogDeviceRecordV1[];
}

export class CatalogDeviceArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogDeviceArtifactError';
  }
}

function assertRecord(record: unknown, index: number): asserts record is CatalogDeviceRecordV1 {
  if (!record || typeof record !== 'object') {
    throw new CatalogDeviceArtifactError(`devices[${index}] must be an object`);
  }
  const obj = record as Record<string, unknown>;
  if (typeof obj.catalogId !== 'string' || obj.catalogId.length === 0) {
    throw new CatalogDeviceArtifactError(`devices[${index}].catalogId must be a non-empty string`);
  }
  for (const key of ['manufacturerId', 'productType', 'productId'] as const) {
    if (obj[key] !== undefined && typeof obj[key] !== 'number') {
      throw new CatalogDeviceArtifactError(`devices[${index}].${key} must be a number`);
    }
  }
  if (obj.label !== undefined && typeof obj.label !== 'string') {
    throw new CatalogDeviceArtifactError(`devices[${index}].label must be a string`);
  }
  if (!Array.isArray(obj.sources)) {
    throw new CatalogDeviceArtifactError(`devices[${index}].sources must be an array`);
  }
  obj.sources.forEach((source, sourceIndex) => {
    if (!source || typeof source !== 'object') {
      throw new CatalogDeviceArtifactError(
        `devices[${index}].sources[${sourceIndex}] must be an object`,
      );
    }
    const sourceObj = source as Record<string, unknown>;
    if (typeof sourceObj.source !== 'string' || sourceObj.source.length === 0) {
      throw new CatalogDeviceArtifactError(
        `devices[${index}].sources[${sourceIndex}].source must be a non-empty string`,
      );
    }
    if (sourceObj.sourceId !== undefined && typeof sourceObj.sourceId !== 'string') {
      throw new CatalogDeviceArtifactError(
        `devices[${index}].sources[${sourceIndex}].sourceId must be a string`,
      );
    }
    if (
      sourceObj.confidence !== undefined &&
      sourceObj.confidence !== 'high' &&
      sourceObj.confidence !== 'medium' &&
      sourceObj.confidence !== 'low'
    ) {
      throw new CatalogDeviceArtifactError(
        `devices[${index}].sources[${sourceIndex}].confidence must be high|medium|low`,
      );
    }
  });
}

export function assertCatalogDevicesArtifactV1(
  input: unknown,
): asserts input is CatalogDevicesArtifactV1 {
  if (!input || typeof input !== 'object') {
    throw new CatalogDeviceArtifactError('Catalog artifact must be an object');
  }
  const obj = input as Record<string, unknown>;
  if (obj.schemaVersion !== 'catalog-devices/v1') {
    throw new CatalogDeviceArtifactError('schemaVersion must be "catalog-devices/v1"');
  }
  if (!obj.source || typeof obj.source !== 'object') {
    throw new CatalogDeviceArtifactError('source must be an object');
  }
  const source = obj.source as Record<string, unknown>;
  if (typeof source.generatedAt !== 'string') {
    throw new CatalogDeviceArtifactError('source.generatedAt must be a string');
  }
  if (typeof source.sourceRef !== 'string') {
    throw new CatalogDeviceArtifactError('source.sourceRef must be a string');
  }
  if (!Array.isArray(obj.devices)) {
    throw new CatalogDeviceArtifactError('devices must be an array');
  }
  obj.devices.forEach((record, index) => assertRecord(record, index));
}

export function loadCatalogDevicesArtifact(filePath: string): CatalogDevicesArtifactV1 {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assertCatalogDevicesArtifactV1(parsed);
  return parsed;
}

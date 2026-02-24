import type { CatalogDeviceRecordV1, CatalogDevicesArtifactV1 } from './catalog-device-artifact';

export interface NormalizeCatalogOptions {
  sourceRef?: string;
  generatedAt?: string;
}

export interface NormalizeCatalogReport {
  inputDevices: number;
  outputDevices: number;
  mergedDuplicates: number;
}

export interface NormalizeCatalogResult {
  artifact: CatalogDevicesArtifactV1;
  report: NormalizeCatalogReport;
}

function sourceKey(source: CatalogDeviceRecordV1['sources'][number]): string {
  return [source.source, source.sourceId ?? '', source.confidence ?? ''].join('|');
}

function mergeLabel(current: string | undefined, incoming: string | undefined): string | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  return current.length >= incoming.length ? current : incoming;
}

function mergeIds(
  field: 'manufacturerId' | 'productType' | 'productId',
  current: CatalogDeviceRecordV1,
  incoming: CatalogDeviceRecordV1,
) {
  const currentValue = current[field];
  const incomingValue = incoming[field];
  if (currentValue === undefined) {
    current[field] = incomingValue;
    return;
  }
  if (incomingValue === undefined || incomingValue === currentValue) return;
  // Keep the existing normalized identifier and preserve attribution via sources.
}

function mergeDeviceRecords(
  base: CatalogDeviceRecordV1,
  incoming: CatalogDeviceRecordV1,
): CatalogDeviceRecordV1 {
  mergeIds('manufacturerId', base, incoming);
  mergeIds('productType', base, incoming);
  mergeIds('productId', base, incoming);
  base.label = mergeLabel(base.label, incoming.label);

  const seen = new Set(base.sources.map(sourceKey));
  for (const source of incoming.sources) {
    const key = sourceKey(source);
    if (seen.has(key)) continue;
    base.sources.push(source);
    seen.add(key);
  }
  return base;
}

export function normalizeCatalogDevicesArtifactV1(
  artifact: CatalogDevicesArtifactV1,
  options: NormalizeCatalogOptions = {},
): NormalizeCatalogResult {
  const byCatalogId = new Map<string, CatalogDeviceRecordV1>();
  let mergedDuplicates = 0;

  for (const device of artifact.devices) {
    const existing = byCatalogId.get(device.catalogId);
    if (!existing) {
      byCatalogId.set(device.catalogId, {
        ...device,
        sources: [...device.sources],
      });
      continue;
    }
    mergeDeviceRecords(existing, device);
    mergedDuplicates += 1;
  }

  const devices = [...byCatalogId.values()].sort((a, b) => a.catalogId.localeCompare(b.catalogId));
  const normalizedArtifact: CatalogDevicesArtifactV1 = {
    schemaVersion: 'catalog-devices/v1',
    source: {
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      sourceRef: options.sourceRef ?? `${artifact.source.sourceRef}#normalized`,
    },
    devices,
  };

  return {
    artifact: normalizedArtifact,
    report: {
      inputDevices: artifact.devices.length,
      outputDevices: devices.length,
      mergedDuplicates,
    },
  };
}

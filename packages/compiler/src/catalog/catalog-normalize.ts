import type { CatalogDeviceRecordV1, CatalogDevicesArtifactV1 } from './catalog-device-artifact';

export interface NormalizeCatalogOptions {
  sourceRef?: string;
  generatedAt?: string;
  conflictMode?: 'warn' | 'error';
}

export interface NormalizeCatalogReport {
  inputDevices: number;
  outputDevices: number;
  mergedDuplicates: number;
  conflictsResolved: number;
  conflictsByField: Partial<
    Record<'label' | 'manufacturerId' | 'productType' | 'productId', number>
  >;
}

export interface NormalizeCatalogResult {
  artifact: CatalogDevicesArtifactV1;
  report: NormalizeCatalogReport;
}

export class CatalogNormalizeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogNormalizeConflictError';
  }
}

function sourceKey(source: CatalogDeviceRecordV1['sources'][number]): string {
  return [source.source, source.sourceId ?? '', source.confidence ?? ''].join('|');
}

const SOURCE_PRECEDENCE: Record<string, number> = {
  'official-catalog': 100,
  'zwave-js-config': 90,
  'ha-derived-catalog': 80,
  'catalog-import': 70,
  'zwjs-inspect-node-detail': 40,
};

const CONFIDENCE_PRECEDENCE: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function bestSourceRank(record: CatalogDeviceRecordV1): number {
  return Math.max(
    ...record.sources.map((source) => {
      const sourceRank = SOURCE_PRECEDENCE[source.source] ?? 10;
      const confidenceRank = source.confidence ? CONFIDENCE_PRECEDENCE[source.confidence] : 0;
      return sourceRank * 10 + confidenceRank;
    }),
  );
}

interface MergeConflictState {
  mode: 'warn' | 'error';
  resolved: number;
  byField: NormalizeCatalogReport['conflictsByField'];
}

function recordConflict(
  state: MergeConflictState,
  field: keyof NormalizeCatalogReport['conflictsByField'],
) {
  state.resolved += 1;
  state.byField[field] = (state.byField[field] ?? 0) + 1;
}

function mergeLabel(
  current: CatalogDeviceRecordV1,
  incoming: CatalogDeviceRecordV1,
  conflictState: MergeConflictState,
): string | undefined {
  const currentLabel = current.label;
  const incomingLabel = incoming.label;
  if (!currentLabel) return incomingLabel;
  if (!incomingLabel) return currentLabel;
  if (currentLabel === incomingLabel) return currentLabel;

  recordConflict(conflictState, 'label');
  const currentRank = bestSourceRank(current);
  const incomingRank = bestSourceRank(incoming);
  if (incomingRank > currentRank) return incomingLabel;
  if (currentRank > incomingRank) return currentLabel;
  return currentLabel.length >= incomingLabel.length ? currentLabel : incomingLabel;
}

function mergeIds(
  field: 'manufacturerId' | 'productType' | 'productId',
  current: CatalogDeviceRecordV1,
  incoming: CatalogDeviceRecordV1,
  conflictState: MergeConflictState,
) {
  const currentValue = current[field];
  const incomingValue = incoming[field];
  if (currentValue === undefined) {
    current[field] = incomingValue;
    return;
  }
  if (incomingValue === undefined || incomingValue === currentValue) return;
  recordConflict(conflictState, field);
  if (conflictState.mode === 'error') {
    throw new CatalogNormalizeConflictError(
      `Conflicting ${field} for catalogId ${current.catalogId}: ${currentValue} vs ${incomingValue}`,
    );
  }
  if (bestSourceRank(incoming) > bestSourceRank(current)) {
    current[field] = incomingValue;
  }
}

function mergeDeviceRecords(
  base: CatalogDeviceRecordV1,
  incoming: CatalogDeviceRecordV1,
  conflictState: MergeConflictState,
): CatalogDeviceRecordV1 {
  mergeIds('manufacturerId', base, incoming, conflictState);
  mergeIds('productType', base, incoming, conflictState);
  mergeIds('productId', base, incoming, conflictState);
  base.label = mergeLabel(base, incoming, conflictState);

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
  const conflictState: MergeConflictState = {
    mode: options.conflictMode ?? 'warn',
    resolved: 0,
    byField: {},
  };

  for (const device of artifact.devices) {
    const existing = byCatalogId.get(device.catalogId);
    if (!existing) {
      byCatalogId.set(device.catalogId, {
        ...device,
        sources: [...device.sources],
      });
      continue;
    }
    mergeDeviceRecords(existing, device, conflictState);
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
      conflictsResolved: conflictState.resolved,
      conflictsByField: conflictState.byField,
    },
  };
}

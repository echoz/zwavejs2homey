import type { CatalogDeviceRecordV1, CatalogDevicesArtifactV1 } from './catalog-device-artifact';
import { normalizeCatalogDevicesArtifactV1 } from './catalog-normalize';

export interface CatalogDeviceDiff {
  catalogId: string;
  change: 'added' | 'removed' | 'changed';
  labelChanged?: boolean;
  identifiersChanged?: Array<'manufacturerId' | 'productType' | 'productId'>;
  sourceNamesAdded?: string[];
  sourceNamesRemoved?: string[];
}

export interface DiffCatalogReport {
  fromDevices: number;
  toDevices: number;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export interface DiffCatalogResult {
  report: DiffCatalogReport;
  diffs: CatalogDeviceDiff[];
}

function sourceNames(record: CatalogDeviceRecordV1): string[] {
  return [...new Set(record.sources.map((source) => source.source))].sort();
}

function sortStrings(values: string[]): string[] {
  return [...values].sort();
}

function diffSourceNames(from: string[], to: string[]) {
  const fromSet = new Set(from);
  const toSet = new Set(to);
  return {
    added: sortStrings(to.filter((value) => !fromSet.has(value))),
    removed: sortStrings(from.filter((value) => !toSet.has(value))),
  };
}

function diffIdentifiers(from: CatalogDeviceRecordV1, to: CatalogDeviceRecordV1) {
  const changed: Array<'manufacturerId' | 'productType' | 'productId'> = [];
  for (const key of ['manufacturerId', 'productType', 'productId'] as const) {
    if (from[key] !== to[key]) changed.push(key);
  }
  return changed;
}

export function diffCatalogDevicesArtifactsV1(
  fromArtifact: CatalogDevicesArtifactV1,
  toArtifact: CatalogDevicesArtifactV1,
): DiffCatalogResult {
  const normalizedFrom = normalizeCatalogDevicesArtifactV1(fromArtifact, {
    generatedAt: fromArtifact.source.generatedAt,
    sourceRef: fromArtifact.source.sourceRef,
  }).artifact;
  const normalizedTo = normalizeCatalogDevicesArtifactV1(toArtifact, {
    generatedAt: toArtifact.source.generatedAt,
    sourceRef: toArtifact.source.sourceRef,
  }).artifact;

  const fromById = new Map(normalizedFrom.devices.map((device) => [device.catalogId, device]));
  const toById = new Map(normalizedTo.devices.map((device) => [device.catalogId, device]));
  const catalogIds = [...new Set([...fromById.keys(), ...toById.keys()])].sort();

  const diffs: CatalogDeviceDiff[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;

  for (const catalogId of catalogIds) {
    const from = fromById.get(catalogId);
    const to = toById.get(catalogId);
    if (!from && to) {
      added += 1;
      diffs.push({ catalogId, change: 'added' });
      continue;
    }
    if (from && !to) {
      removed += 1;
      diffs.push({ catalogId, change: 'removed' });
      continue;
    }
    if (!from || !to) continue;

    const identifiersChanged = diffIdentifiers(from, to);
    const labelChanged = (from.label ?? null) !== (to.label ?? null);
    const sourceNameDelta = diffSourceNames(sourceNames(from), sourceNames(to));
    const hasChange =
      identifiersChanged.length > 0 ||
      labelChanged ||
      sourceNameDelta.added.length > 0 ||
      sourceNameDelta.removed.length > 0;

    if (!hasChange) {
      unchanged += 1;
      continue;
    }

    changed += 1;
    diffs.push({
      catalogId,
      change: 'changed',
      labelChanged: labelChanged || undefined,
      identifiersChanged: identifiersChanged.length > 0 ? identifiersChanged : undefined,
      sourceNamesAdded: sourceNameDelta.added.length > 0 ? sourceNameDelta.added : undefined,
      sourceNamesRemoved: sourceNameDelta.removed.length > 0 ? sourceNameDelta.removed : undefined,
    });
  }

  return {
    report: {
      fromDevices: fromArtifact.devices.length,
      toDevices: toArtifact.devices.length,
      added,
      removed,
      changed,
      unchanged,
    },
    diffs,
  };
}

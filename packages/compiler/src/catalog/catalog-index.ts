import type { CatalogDeviceRecordV1, CatalogDevicesArtifactV1 } from './catalog-device-artifact';

export interface CatalogDeviceLookupKey {
  manufacturerId: number;
  productType: number;
  productId: number;
}

export interface CatalogIndexBuildResult {
  byCatalogId: Map<string, CatalogDeviceRecordV1>;
  byProductTriple: Map<string, CatalogDeviceRecordV1>;
  report: {
    deviceCount: number;
    productTripleIndexed: number;
    productTripleConflicts: number;
  };
}

export function catalogProductTripleKey(input: CatalogDeviceLookupKey): string {
  return `${input.manufacturerId}:${input.productType}:${input.productId}`;
}

export function buildCatalogIndexV1(artifact: CatalogDevicesArtifactV1): CatalogIndexBuildResult {
  const byCatalogId = new Map<string, CatalogDeviceRecordV1>();
  const byProductTriple = new Map<string, CatalogDeviceRecordV1>();
  let productTripleIndexed = 0;
  let productTripleConflicts = 0;

  for (const device of artifact.devices) {
    byCatalogId.set(device.catalogId, device);
    if (
      device.manufacturerId === undefined ||
      device.productType === undefined ||
      device.productId === undefined
    ) {
      continue;
    }
    const key = catalogProductTripleKey({
      manufacturerId: device.manufacturerId,
      productType: device.productType,
      productId: device.productId,
    });
    const existing = byProductTriple.get(key);
    if (!existing) {
      byProductTriple.set(key, device);
      productTripleIndexed += 1;
      continue;
    }
    if (existing.catalogId !== device.catalogId) {
      productTripleConflicts += 1;
    }
  }

  return {
    byCatalogId,
    byProductTriple,
    report: {
      deviceCount: artifact.devices.length,
      productTripleIndexed,
      productTripleConflicts,
    },
  };
}

export function findCatalogDeviceByCatalogId(
  index: Pick<CatalogIndexBuildResult, 'byCatalogId'>,
  catalogId: string,
): CatalogDeviceRecordV1 | undefined {
  return index.byCatalogId.get(catalogId);
}

export function findCatalogDeviceByProductTriple(
  index: Pick<CatalogIndexBuildResult, 'byProductTriple'>,
  lookup: CatalogDeviceLookupKey,
): CatalogDeviceRecordV1 | undefined {
  return index.byProductTriple.get(catalogProductTripleKey(lookup));
}

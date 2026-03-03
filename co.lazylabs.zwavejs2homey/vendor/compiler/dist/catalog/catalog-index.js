"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogProductTripleKey = catalogProductTripleKey;
exports.buildCatalogIndexV1 = buildCatalogIndexV1;
exports.findCatalogDeviceByCatalogId = findCatalogDeviceByCatalogId;
exports.findCatalogDeviceByProductTriple = findCatalogDeviceByProductTriple;
function catalogProductTripleKey(input) {
    return `${input.manufacturerId}:${input.productType}:${input.productId}`;
}
function buildCatalogIndexV1(artifact) {
    const byCatalogId = new Map();
    const byProductTriple = new Map();
    let productTripleIndexed = 0;
    let productTripleConflicts = 0;
    for (const device of artifact.devices) {
        byCatalogId.set(device.catalogId, device);
        if (device.manufacturerId === undefined ||
            device.productType === undefined ||
            device.productId === undefined) {
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
function findCatalogDeviceByCatalogId(index, catalogId) {
    return index.byCatalogId.get(catalogId);
}
function findCatalogDeviceByProductTriple(index, lookup) {
    return index.byProductTriple.get(catalogProductTripleKey(lookup));
}

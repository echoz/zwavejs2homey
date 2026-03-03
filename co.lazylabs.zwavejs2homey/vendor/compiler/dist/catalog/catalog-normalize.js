"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogNormalizeConflictError = void 0;
exports.normalizeCatalogDevicesArtifactV1 = normalizeCatalogDevicesArtifactV1;
class CatalogNormalizeConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CatalogNormalizeConflictError';
    }
}
exports.CatalogNormalizeConflictError = CatalogNormalizeConflictError;
function sourceKey(source) {
    return [source.source, source.sourceId ?? '', source.confidence ?? ''].join('|');
}
const SOURCE_PRECEDENCE = {
    'official-catalog': 100,
    'zwave-js-config': 90,
    'ha-derived-catalog': 80,
    'catalog-import': 70,
    'zwjs-inspect-node-detail': 40,
};
const CONFIDENCE_PRECEDENCE = {
    high: 3,
    medium: 2,
    low: 1,
};
function bestSourceRank(record) {
    return Math.max(...record.sources.map((source) => {
        const sourceRank = SOURCE_PRECEDENCE[source.source] ?? 10;
        const confidenceRank = source.confidence ? CONFIDENCE_PRECEDENCE[source.confidence] : 0;
        return sourceRank * 10 + confidenceRank;
    }));
}
function recordConflict(state, field) {
    state.resolved += 1;
    state.byField[field] = (state.byField[field] ?? 0) + 1;
}
function mergeLabel(current, incoming, conflictState) {
    const currentLabel = current.label;
    const incomingLabel = incoming.label;
    if (!currentLabel)
        return incomingLabel;
    if (!incomingLabel)
        return currentLabel;
    if (currentLabel === incomingLabel)
        return currentLabel;
    recordConflict(conflictState, 'label');
    const currentRank = bestSourceRank(current);
    const incomingRank = bestSourceRank(incoming);
    if (incomingRank > currentRank)
        return incomingLabel;
    if (currentRank > incomingRank)
        return currentLabel;
    return currentLabel.length >= incomingLabel.length ? currentLabel : incomingLabel;
}
function mergeIds(field, current, incoming, conflictState) {
    const currentValue = current[field];
    const incomingValue = incoming[field];
    if (currentValue === undefined) {
        current[field] = incomingValue;
        return;
    }
    if (incomingValue === undefined || incomingValue === currentValue)
        return;
    recordConflict(conflictState, field);
    if (conflictState.mode === 'error') {
        throw new CatalogNormalizeConflictError(`Conflicting ${field} for catalogId ${current.catalogId}: ${currentValue} vs ${incomingValue}`);
    }
    if (bestSourceRank(incoming) > bestSourceRank(current)) {
        current[field] = incomingValue;
    }
}
function mergeDeviceRecords(base, incoming, conflictState) {
    mergeIds('manufacturerId', base, incoming, conflictState);
    mergeIds('productType', base, incoming, conflictState);
    mergeIds('productId', base, incoming, conflictState);
    base.label = mergeLabel(base, incoming, conflictState);
    const seen = new Set(base.sources.map(sourceKey));
    for (const source of incoming.sources) {
        const key = sourceKey(source);
        if (seen.has(key))
            continue;
        base.sources.push(source);
        seen.add(key);
    }
    return base;
}
function normalizeCatalogDevicesArtifactV1(artifact, options = {}) {
    const byCatalogId = new Map();
    let mergedDuplicates = 0;
    const conflictState = {
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
    const normalizedArtifact = {
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

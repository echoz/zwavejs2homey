"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeCatalogDevicesArtifactsV1 = mergeCatalogDevicesArtifactsV1;
const catalog_normalize_1 = require("./catalog-normalize");
function mergeCatalogDevicesArtifactsV1(artifacts, options = {}) {
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
        throw new Error('mergeCatalogDevicesArtifactsV1 requires at least one artifact');
    }
    const combined = {
        schemaVersion: 'catalog-devices/v1',
        source: {
            generatedAt: options.generatedAt ?? new Date().toISOString(),
            sourceRef: options.sourceRef ??
                `merge:${artifacts.map((artifact) => artifact.source.sourceRef).join(',')}`,
        },
        devices: artifacts.flatMap((artifact) => artifact.devices),
    };
    const normalized = (0, catalog_normalize_1.normalizeCatalogDevicesArtifactV1)(combined, {
        generatedAt: combined.source.generatedAt,
        sourceRef: combined.source.sourceRef,
        conflictMode: options.conflictMode,
    });
    return {
        artifact: normalized.artifact,
        report: {
            ...normalized.report,
            inputArtifacts: artifacts.length,
        },
    };
}

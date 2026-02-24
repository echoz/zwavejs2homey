import type { CatalogDevicesArtifactV1 } from './catalog-device-artifact';
import {
  normalizeCatalogDevicesArtifactV1,
  type NormalizeCatalogOptions,
  type NormalizeCatalogReport,
} from './catalog-normalize';

export interface MergeCatalogOptions extends NormalizeCatalogOptions {}

export interface MergeCatalogReport extends NormalizeCatalogReport {
  inputArtifacts: number;
}

export interface MergeCatalogResult {
  artifact: CatalogDevicesArtifactV1;
  report: MergeCatalogReport;
}

export function mergeCatalogDevicesArtifactsV1(
  artifacts: CatalogDevicesArtifactV1[],
  options: MergeCatalogOptions = {},
): MergeCatalogResult {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error('mergeCatalogDevicesArtifactsV1 requires at least one artifact');
  }

  const combined: CatalogDevicesArtifactV1 = {
    schemaVersion: 'catalog-devices/v1',
    source: {
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      sourceRef:
        options.sourceRef ??
        `merge:${artifacts.map((artifact) => artifact.source.sourceRef).join(',')}`,
    },
    devices: artifacts.flatMap((artifact) => artifact.devices),
  };

  const normalized = normalizeCatalogDevicesArtifactV1(combined, {
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

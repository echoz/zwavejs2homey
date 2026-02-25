import type { CatalogDeviceRecordV1 } from '../catalog/catalog-device-artifact';
import {
  buildCatalogIndexV1,
  findCatalogDeviceByProductTriple,
  type CatalogIndexBuildResult,
} from '../catalog/catalog-index';
import type { CompiledHomeyProfilePlan, ProvenanceRecord } from '../models/homey-plan';
import type { NormalizedZwaveDeviceFacts } from '../models/zwave-facts';
import type { MappingRule } from '../rules/types';
import { compileDevice, type CompileDeviceResult } from './compile-device';

export interface CompileProfilePlanOptions {
  profileId?: string;
  homeyClass?: string;
  driverTemplateId?: string;
  confidence?: CompiledHomeyProfilePlan['classification']['confidence'];
  uncurated?: boolean;
  provenance?: Partial<ProvenanceRecord>;
  catalogArtifact?: {
    schemaVersion: 'catalog-devices/v1';
    source: { generatedAt: string; sourceRef: string };
    devices: CatalogDeviceRecordV1[];
  };
  catalogIndex?: CatalogIndexBuildResult;
}

export interface CompileProfilePlanCatalogLookup {
  matched: boolean;
  by: 'product-triple' | 'none';
  catalogId?: string;
  label?: string;
}

function deriveMatch(device: NormalizedZwaveDeviceFacts): Record<string, unknown> {
  return {
    manufacturerId: device.manufacturerId,
    productType: device.productType,
    productId: device.productId,
    firmwareVersion: device.firmwareVersion,
  };
}

function deriveProfileId(device: NormalizedZwaveDeviceFacts): string {
  return (
    device.deviceKey ||
    `mfg-${device.manufacturerId ?? 'unknown'}-type-${device.productType ?? 'unknown'}-prod-${device.productId ?? 'unknown'}`
  );
}

function deriveConfidence(
  compileResult: CompileDeviceResult,
): CompiledHomeyProfilePlan['classification']['confidence'] {
  if (
    compileResult.report.actions.some(
      (action) => action.applied && action.changed !== false && action.layer === 'project-product',
    )
  ) {
    return 'curated';
  }
  if (compileResult.capabilities.some((cap) => cap.provenance.layer === 'ha-derived')) {
    return 'ha-derived';
  }
  return 'generic';
}

function deriveClassificationFromCompileResult(
  compileResult: CompileDeviceResult,
  options: CompileProfilePlanOptions | undefined,
): CompiledHomeyProfilePlan['classification'] {
  const confidence = options?.confidence ?? deriveConfidence(compileResult);
  const uncurated = options?.uncurated ?? confidence !== 'curated';
  const identity = compileResult.deviceIdentity;
  return {
    homeyClass: options?.homeyClass ?? identity?.homeyClass ?? 'other',
    driverTemplateId: options?.driverTemplateId ?? identity?.driverTemplateId,
    confidence,
    uncurated,
  };
}

export function compileProfilePlan(
  device: NormalizedZwaveDeviceFacts,
  rules: MappingRule[],
  options?: CompileProfilePlanOptions,
): {
  profile: CompiledHomeyProfilePlan;
  report: CompileDeviceResult['report'];
  catalogLookup?: CompileProfilePlanCatalogLookup;
} {
  const compileResult = compileDevice(device, rules);
  const profileId = options?.profileId ?? deriveProfileId(device);
  const catalogIndex =
    options?.catalogIndex ??
    (options?.catalogArtifact ? buildCatalogIndexV1(options.catalogArtifact) : undefined);
  const catalogLookup =
    catalogIndex &&
    device.manufacturerId !== undefined &&
    device.productType !== undefined &&
    device.productId !== undefined
      ? findCatalogDeviceByProductTriple(catalogIndex, {
          manufacturerId: device.manufacturerId,
          productType: device.productType,
          productId: device.productId,
        })
      : undefined;

  const provenance: ProvenanceRecord = {
    layer: (options?.provenance?.layer as ProvenanceRecord['layer']) ?? 'project-generic',
    ruleId: options?.provenance?.ruleId ?? 'compiler:compile-profile-plan',
    action: options?.provenance?.action ?? 'fill',
    sourceRef: options?.provenance?.sourceRef ?? 'compiler',
    reason:
      options?.provenance?.reason ??
      `deviceKey=${device.deviceKey}${catalogLookup ? `,catalogId=${catalogLookup.catalogId}` : ''}`,
    supersedes: options?.provenance?.supersedes,
  };

  const classification = deriveClassificationFromCompileResult(compileResult, options);

  return {
    profile: {
      profileId,
      match: deriveMatch(device),
      ...(catalogLookup
        ? {
            catalogMatch: {
              by: 'product-triple' as const,
              catalogId: catalogLookup.catalogId,
              label: catalogLookup.label,
            },
          }
        : {}),
      classification,
      capabilities: compileResult.capabilities,
      ignoredValues:
        compileResult.ignoredValues.length > 0 ? compileResult.ignoredValues : undefined,
      provenance,
    },
    report: compileResult.report,
    catalogLookup: catalogLookup
      ? {
          matched: true,
          by: 'product-triple',
          catalogId: catalogLookup.catalogId,
          label: catalogLookup.label,
        }
      : options?.catalogArtifact || options?.catalogIndex
        ? {
            matched: false,
            by: 'none',
          }
        : undefined,
  };
}

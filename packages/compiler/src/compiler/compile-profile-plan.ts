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

function inboundSelectorKey(cap: CompiledHomeyProfilePlan['capabilities'][number]): string | null {
  const mapping = cap.inboundMapping;
  if (!mapping) return null;
  if (mapping.kind === 'event') {
    return `event:${(mapping.selector as { eventType: string }).eventType}`;
  }
  const selector = mapping.selector as {
    commandClass: number;
    endpoint?: number;
    property: string | number;
    propertyKey?: string | number;
  };
  return [
    'value',
    selector.commandClass,
    selector.endpoint ?? 0,
    String(selector.property),
    selector.propertyKey === undefined ? '' : String(selector.propertyKey),
  ].join(':');
}

function applyHaDerivedOverlapPolicy(
  capabilities: CompiledHomeyProfilePlan['capabilities'],
  homeyClass: string,
): {
  capabilities: CompiledHomeyProfilePlan['capabilities'];
  suppressed: Array<{ capabilityId: string; selectorKey: string; reason: string }>;
} {
  const groups = new Map<string, CompiledHomeyProfilePlan['capabilities']>();
  for (const cap of capabilities) {
    const key = inboundSelectorKey(cap);
    if (!key || cap.provenance.layer !== 'ha-derived') continue;
    if (cap.flags?.allowMulti === true) continue;
    const arr = groups.get(key) ?? [];
    arr.push(cap);
    groups.set(key, arr);
  }

  const suppressedKeys = new Set<string>();
  const suppressed: Array<{ capabilityId: string; selectorKey: string; reason: string }> = [];

  const suppress = (selectorKey: string, capabilityId: string, reason: string) => {
    const composite = `${selectorKey}|${capabilityId}`;
    if (suppressedKeys.has(composite)) return;
    suppressedKeys.add(composite);
    suppressed.push({ capabilityId, selectorKey, reason });
  };

  for (const [selectorKey, group] of groups.entries()) {
    if (group.length < 2) continue;
    const ids = new Set(group.map((c) => c.capabilityId));

    if (ids.has('number_value')) {
      const nonNumberCount = group.filter((c) => c.capabilityId !== 'number_value').length;
      if (nonNumberCount > 0) {
        suppress(
          selectorKey,
          'number_value',
          'ha-overlap-suppress:number_value-shadowed-by-specific-capability',
        );
      }
    }

    if (homeyClass === 'curtain' && ids.has('windowcoverings_set') && ids.has('dim')) {
      suppress(selectorKey, 'dim', 'ha-overlap-suppress:curtain-prefers-windowcoverings-set');
    }
  }

  if (suppressed.length === 0) return { capabilities, suppressed };
  return {
    capabilities: capabilities.filter((cap) => {
      const key = inboundSelectorKey(cap);
      if (!key) return true;
      return !suppressedKeys.has(`${key}|${cap.capabilityId}`);
    }),
    suppressed,
  };
}

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
  const overlapPruned = applyHaDerivedOverlapPolicy(
    compileResult.capabilities,
    classification.homeyClass,
  );
  if (overlapPruned.suppressed.length > 0) {
    compileResult.report.overlapPolicy = {
      suppressedCapabilities: overlapPruned.suppressed,
    };
  }

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
      capabilities: overlapPruned.capabilities,
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

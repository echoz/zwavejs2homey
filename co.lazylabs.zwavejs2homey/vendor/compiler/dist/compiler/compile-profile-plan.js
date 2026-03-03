"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileProfilePlan = compileProfilePlan;
const catalog_index_1 = require("../catalog/catalog-index");
const compile_device_1 = require("./compile-device");
const catalogIndexCache = new WeakMap();
function deriveMatch(device) {
    return {
        manufacturerId: device.manufacturerId,
        productType: device.productType,
        productId: device.productId,
        firmwareVersion: device.firmwareVersion,
    };
}
function deriveProfileId(device) {
    return (device.deviceKey ||
        `mfg-${device.manufacturerId ?? 'unknown'}-type-${device.productType ?? 'unknown'}-prod-${device.productId ?? 'unknown'}`);
}
function deriveConfidence(compileResult) {
    if (compileResult.report.summary.appliedProjectProductActions > 0) {
        return 'curated';
    }
    if (compileResult.capabilities.some((cap) => cap.provenance.layer === 'ha-derived')) {
        return 'ha-derived';
    }
    return 'generic';
}
function deriveClassificationFromCompileResult(compileResult, options) {
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
function resolveCatalogIndex(options) {
    if (options?.catalogIndex)
        return options.catalogIndex;
    if (!options?.catalogArtifact)
        return undefined;
    const cached = catalogIndexCache.get(options.catalogArtifact);
    if (cached)
        return cached;
    const built = (0, catalog_index_1.buildCatalogIndexV1)(options.catalogArtifact);
    catalogIndexCache.set(options.catalogArtifact, built);
    return built;
}
function compileProfilePlan(device, rules, options) {
    const compileResult = (0, compile_device_1.compileDevice)(device, rules, {
        reportMode: options?.reportMode,
    });
    const profileId = options?.profileId ?? deriveProfileId(device);
    const catalogIndex = resolveCatalogIndex(options);
    const catalogLookup = catalogIndex &&
        device.manufacturerId !== undefined &&
        device.productType !== undefined &&
        device.productId !== undefined
        ? (0, catalog_index_1.findCatalogDeviceByProductTriple)(catalogIndex, {
            manufacturerId: device.manufacturerId,
            productType: device.productType,
            productId: device.productId,
        })
        : undefined;
    const provenance = {
        layer: options?.provenance?.layer ?? 'project-generic',
        ruleId: options?.provenance?.ruleId ?? 'compiler:compile-profile-plan',
        action: options?.provenance?.action ?? 'fill',
        sourceRef: options?.provenance?.sourceRef ?? 'compiler',
        reason: options?.provenance?.reason ??
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
                        by: 'product-triple',
                        catalogId: catalogLookup.catalogId,
                        label: catalogLookup.label,
                    },
                }
                : {}),
            classification,
            capabilities: compileResult.capabilities,
            ignoredValues: compileResult.ignoredValues.length > 0 ? compileResult.ignoredValues : undefined,
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

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileProfilePlanFromRuleFiles = compileProfilePlanFromRuleFiles;
exports.compileProfilePlanFromLoadedRuleSetManifest = compileProfilePlanFromLoadedRuleSetManifest;
exports.compileProfilePlanFromRuleSetManifest = compileProfilePlanFromRuleSetManifest;
exports.compileProfilePlanFromRuleFilesWithCatalog = compileProfilePlanFromRuleFilesWithCatalog;
const catalog_device_artifact_1 = require("../catalog/catalog-device-artifact");
const compile_profile_plan_1 = require("./compile-profile-plan");
const rule_loader_1 = require("./rule-loader");
const TECHNICAL_CURATION_REASON_PREFIXES = ['suppressed-fill-actions:', 'high-unmatched-ratio:'];
const loadedManifestRulesCache = new WeakMap();
const loadedManifestRuleSourcesCache = new WeakMap();
function isTechnicalCurationReason(reason) {
    return TECHNICAL_CURATION_REASON_PREFIXES.some((prefix) => reason.startsWith(prefix));
}
function resolveRulesForLoadedManifest(loaded) {
    const cached = loadedManifestRulesCache.get(loaded);
    if (cached)
        return cached;
    const resolved = loaded.entries.flatMap((entry) => entry.rules);
    loadedManifestRulesCache.set(loaded, resolved);
    return resolved;
}
function resolveRuleSourcesForLoadedManifest(loaded) {
    const cached = loadedManifestRuleSourcesCache.get(loaded);
    if (cached)
        return cached;
    const resolved = Object.freeze(loaded.entries.map((entry) => Object.freeze({
        filePath: entry.filePath,
        ruleCount: entry.rules.length,
        ruleIds: Object.freeze(entry.rules.map((rule) => rule.ruleId)),
    })));
    loadedManifestRuleSourcesCache.set(loaded, resolved);
    return resolved;
}
function deriveDiagnosticDeviceKey(device, catalogLookup) {
    if (catalogLookup?.matched && catalogLookup.catalogId)
        return `catalog:${catalogLookup.catalogId}`;
    if (device.manufacturerId !== undefined &&
        device.productType !== undefined &&
        device.productId !== undefined) {
        return `product-triple:${device.manufacturerId}-${device.productType}-${device.productId}`;
    }
    return `deviceKey:${device.deviceKey ?? 'unknown'}`;
}
function groupReportByRule(report) {
    const grouped = new Map();
    for (const action of report.actions) {
        const key = `${action.layer}:${action.ruleId}`;
        const existing = grouped.get(key) ??
            {
                ruleId: action.ruleId,
                layer: action.layer,
                applied: 0,
                unmatched: 0,
                actionTypes: {},
            };
        if (!grouped.has(key))
            grouped.set(key, { ...existing });
        const entry = grouped.get(key);
        if (!entry)
            continue;
        if (action.applied && action.changed !== false)
            entry.applied += 1;
        if (action.reason === 'rule-not-matched')
            entry.unmatched += 1;
        entry.actionTypes[action.actionType] = (entry.actionTypes[action.actionType] ?? 0) + 1;
    }
    return [...grouped.values()].sort((a, b) => {
        if (a.layer !== b.layer)
            return a.layer.localeCompare(b.layer);
        return a.ruleId.localeCompare(b.ruleId);
    });
}
function groupSuppressedBySlot(report) {
    const grouped = new Map();
    for (const item of report.suppressedActions) {
        const key = `${item.layer}:${item.ruleId}:${item.slot}`;
        const existing = grouped.get(key) ?? {
            slot: item.slot,
            layer: item.layer,
            ruleId: item.ruleId,
            count: 0,
        };
        existing.count += 1;
        grouped.set(key, existing);
    }
    return [...grouped.values()].sort((a, b) => {
        if (a.layer !== b.layer)
            return a.layer.localeCompare(b.layer);
        if (a.ruleId !== b.ruleId)
            return a.ruleId.localeCompare(b.ruleId);
        return a.slot.localeCompare(b.slot);
    });
}
function deriveCurationCandidates(report, profile, catalogLookup) {
    const reasons = [];
    if (report.summary.suppressedFillActions > 0) {
        reasons.push(`suppressed-fill-actions:${report.summary.suppressedFillActions}`);
    }
    if (report.summary.appliedActions === 0) {
        reasons.push('no-applied-actions');
    }
    const totalActionCount = report.summary.totalActions ?? report.actions.length;
    const unmatchedRatio = totalActionCount > 0 ? report.summary.unmatchedActions / totalActionCount : 0;
    if (unmatchedRatio > 0.75) {
        reasons.push(`high-unmatched-ratio:${unmatchedRatio.toFixed(2)}`);
    }
    if ((profile.capabilities?.length ?? 0) === 0 && !profile.classification.driverTemplateId) {
        reasons.push('no-meaningful-mapping');
    }
    else if (profile.classification.uncurated) {
        reasons.push(`uncurated-profile:${profile.classification.confidence}`);
    }
    if (catalogLookup?.matched) {
        if ((profile.capabilities?.length ?? 0) === 0 && !profile.classification.driverTemplateId) {
            reasons.push('known-device-unmapped');
        }
        else if (profile.classification.confidence === 'generic') {
            reasons.push('known-device-generic-fallback');
        }
    }
    else if (catalogLookup && profile.classification.confidence === 'generic') {
        reasons.push('unknown-device-generic-fallback');
    }
    const actionableReasons = reasons.filter((reason) => !isTechnicalCurationReason(reason));
    return {
        likelyNeedsReview: actionableReasons.length > 0,
        reasons,
    };
}
function deriveProfileOutcome(profile) {
    if ((profile.capabilities?.length ?? 0) === 0 && !profile.classification.driverTemplateId) {
        return 'empty';
    }
    return profile.classification.confidence;
}
function deriveUnknownDeviceReport(profile, curationCandidates, diagnosticDeviceKey, catalogLookup) {
    if (!profile.classification.uncurated && curationCandidates.reasons.length === 0)
        return undefined;
    const profileOutcome = deriveProfileOutcome(profile);
    if (profileOutcome !== 'generic' && profileOutcome !== 'empty')
        return undefined;
    if (catalogLookup?.matched) {
        return {
            kind: 'known-catalog',
            diagnosticDeviceKey,
            profileOutcome,
            matchRef: `catalog:${catalogLookup.catalogId}`,
            label: catalogLookup.label,
            reasons: curationCandidates.reasons,
        };
    }
    if (catalogLookup) {
        return {
            kind: 'unknown-catalog',
            diagnosticDeviceKey,
            profileOutcome,
            reasons: curationCandidates.reasons,
        };
    }
    return {
        kind: 'no-catalog',
        diagnosticDeviceKey,
        profileOutcome,
        reasons: curationCandidates.reasons,
    };
}
function deriveClassificationProvenance(report) {
    const appliedDeviceIdentityActions = report.actions.filter((action) => action.applied && action.changed !== false && action.actionType === 'device-identity');
    const last = appliedDeviceIdentityActions[appliedDeviceIdentityActions.length - 1];
    if (!last)
        return undefined;
    return {
        layer: last.layer,
        ruleId: last.ruleId,
        action: 'derived-from-device-identity-action',
    };
}
function compileProfilePlanFromRuleFiles(device, ruleFilePaths, options) {
    const loaded = (0, rule_loader_1.loadJsonRuleSetManifest)(ruleFilePaths.map((filePath) => ({ filePath })));
    return compileProfilePlanFromLoadedRuleSetManifest(device, loaded, options);
}
function compileProfilePlanFromLoadedRuleSetManifest(device, loaded, options) {
    const rules = resolveRulesForLoadedManifest(loaded);
    const ruleSources = resolveRuleSourcesForLoadedManifest(loaded);
    const { profile, report, catalogLookup } = (0, compile_profile_plan_1.compileProfilePlan)(device, rules, options);
    const profileOutcome = deriveProfileOutcome(profile);
    const curationCandidates = deriveCurationCandidates(report, profile, catalogLookup);
    const diagnosticDeviceKey = deriveDiagnosticDeviceKey(device, catalogLookup);
    const summaryMode = options?.reportMode === 'summary';
    const byRule = summaryMode ? [] : groupReportByRule(report);
    const bySuppressedSlot = summaryMode ? [] : groupSuppressedBySlot(report);
    return {
        profile,
        report: {
            ...report,
            profileOutcome,
            byRule,
            bySuppressedSlot,
            curationCandidates,
            catalogContext: catalogLookup?.matched
                ? {
                    knownCatalogDevice: true,
                    catalogId: catalogLookup.catalogId,
                    label: catalogLookup.label,
                    matchRef: `catalog:${catalogLookup.catalogId}`,
                }
                : catalogLookup
                    ? {
                        knownCatalogDevice: false,
                    }
                    : undefined,
            unknownDeviceReport: deriveUnknownDeviceReport(profile, curationCandidates, diagnosticDeviceKey, catalogLookup),
            diagnosticDeviceKey,
        },
        ruleSources,
        classificationProvenance: summaryMode ? undefined : deriveClassificationProvenance(report),
        catalogLookup,
    };
}
function compileProfilePlanFromRuleSetManifest(device, manifestEntries, options) {
    const loaded = (0, rule_loader_1.loadJsonRuleSetManifest)(manifestEntries);
    return compileProfilePlanFromLoadedRuleSetManifest(device, loaded, options);
}
function compileProfilePlanFromRuleFilesWithCatalog(device, ruleFilePaths, catalogFilePath, options) {
    const catalogArtifact = (0, catalog_device_artifact_1.loadCatalogDevicesArtifact)(catalogFilePath);
    return compileProfilePlanFromRuleFiles(device, ruleFilePaths, {
        ...options,
        catalogArtifact,
    });
}

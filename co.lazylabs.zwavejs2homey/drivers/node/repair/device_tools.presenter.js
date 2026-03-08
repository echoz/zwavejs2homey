const recommendationReasonFallbackLabels = {
    'baseline-hash-changed': 'Compiled profile changed for this device.',
    'marker-missing-backfill': 'Profile reference metadata is missing for this curated device.',
    'baseline-hash-unchanged': 'Current curated profile still matches the compiled baseline.',
    'profile-resolution-not-ready': 'Runtime mapping has not been generated for this device yet.',
    'no-curation-entry': 'No curation exists yet for this device.',
    'missing-homey-device-id': 'Device identifier is unavailable in runtime diagnostics.',
    none: 'No recommendation is available.',
};
const actionReasonLabels = {
    'action-mismatch': 'That action is no longer applicable for this device. Refresh and retry.',
    'action-state-changed': 'Recommendation state changed while this action was running. Review latest state and retry if needed.',
    'invalid-action-selection': 'Invalid action selection.',
    'invalid-homey-device-id': 'This device ID is invalid.',
    'node-not-found': 'The device could not be found.',
    'recommendation-unavailable': 'No recommendation is available for this device.',
    'marker-backfill-required': 'Profile reference metadata must be backfilled before adopting this update.',
    'baseline-marker-unavailable': 'Unable to resolve current profile reference metadata for this device.',
    'curation-entry-missing': 'No curation entry exists for this device, so there is nothing to adopt.',
    'baseline-hash-unchanged': 'No update is needed. Device profile is already aligned.',
    'no-curation-entry': 'No curation entry exists for this device.',
    'profile-resolution-not-ready': 'Runtime mapping is not ready yet for this device.',
    'missing-homey-device-id': 'Device identifier is unavailable in runtime diagnostics.',
    none: 'No action was required.',
    'dry-run-preview': 'Dry-run preview generated. No write was performed.',
    'slot-not-found': 'The selected slot does not exist for this lock.',
    'slot-code-write-target-missing': 'This slot does not expose a writable code target.',
    'slot-remove-target-missing': 'This slot cannot be removed on this lock variant.',
    'slot-status-write-target-missing': 'This slot does not expose a writable status target.',
    'slot-state-write-value-unsupported': 'This lock does not support the requested slot state value.',
    'invalid-slot': 'Slot must be a positive integer.',
    'invalid-code': 'Code must be a non-empty string.',
    'invalid-state': 'State must be enabled or disabled.',
    'zwjs-write-failed': 'ZWJS rejected the write command.',
};
const extensionReadReasonLabels = {
    ok: 'Extension is available and runtime values were loaded.',
    'extension-not-matched': 'This node does not match lock extension predicates.',
    'missing-bridge-id': 'Bridge association is missing for this node.',
    'missing-node-id': 'Node ID is missing for this device.',
    'bridge-client-unavailable': 'Bridge transport client is unavailable.',
    'defined-value-ids-unavailable': 'Lock value definitions could not be loaded.',
    'user-code-slots-not-discovered': 'No lock user-code slots were discovered.',
    'extension-read-error': 'Failed to load extension read data.',
};
function formatIso(ts) {
    if (!ts)
        return 'n/a';
    const date = new Date(String(ts));
    if (Number.isNaN(date.getTime()))
        return String(ts);
    return date.toLocaleString();
}
function formatIsoOrNull(ts) {
    if (!ts)
        return null;
    const date = new Date(String(ts));
    if (Number.isNaN(date.getTime()))
        return String(ts);
    return date.toLocaleString();
}
function toSafeText(value) {
    if (value === null || typeof value === 'undefined' || value === '')
        return 'n/a';
    return String(value);
}
function recommendationReasonLabel(reasonCode, reasonLabel) {
    if (typeof reasonLabel === 'string' && reasonLabel.trim().length > 0) {
        return reasonLabel.trim();
    }
    if (!reasonCode)
        return null;
    const normalized = String(reasonCode);
    return recommendationReasonFallbackLabels[normalized] || normalized;
}
function toReasonDetail(code, labels) {
    if (!code)
        return 'n/a';
    const normalized = String(code);
    const label = labels[normalized];
    if (!label || label === normalized)
        return normalized;
    return `${label} (${normalized})`;
}
function toRecommendationReasonDetail(reasonCode, reasonLabel) {
    if (!reasonCode)
        return 'n/a';
    const normalized = String(reasonCode);
    const label = recommendationReasonLabel(normalized, reasonLabel);
    if (!label || label === normalized)
        return normalized;
    return `${label} (${normalized})`;
}
function buildNodeStatusSummary(nodeState) {
    const parts = [];
    if (typeof nodeState?.isFailed === 'boolean') {
        parts.push(nodeState.isFailed ? 'Failed' : 'Healthy');
    }
    if (typeof nodeState?.ready === 'boolean') {
        parts.push(nodeState.ready ? 'Ready' : 'Not Ready');
    }
    if (typeof nodeState?.interviewStage === 'string' && nodeState.interviewStage.trim()) {
        parts.push(`Interview: ${nodeState.interviewStage.trim()}`);
    }
    if (typeof nodeState?.status === 'string' && nodeState.status.trim()) {
        parts.push(`State: ${nodeState.status.trim()}`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'n/a';
}
function describeConfidence(confidence) {
    const normalized = typeof confidence === 'string' ? confidence.trim().toLowerCase() : '';
    if (normalized === 'curated')
        return 'Project rule match';
    if (normalized === 'ha-derived')
        return 'Home Assistant-derived rule match';
    if (normalized === 'generic')
        return 'Generic fallback rule';
    if (normalized.length > 0)
        return normalized;
    return 'n/a';
}
function describeProfileSourceCode(sourceCode, curationEntryPresent) {
    if (sourceCode === 'compiled+curation-override')
        return 'Compiled profile + device override';
    if (sourceCode === 'compiled-only')
        return 'Compiled profile only';
    if (curationEntryPresent)
        return 'Compiled profile + device override';
    return 'Compiled profile only (no device override)';
}
function describeInferencePolicy(profile, profileAttribution) {
    const fallbackReason = profile && typeof profile.fallbackReason === 'string'
        ? profile.fallbackReason.trim().toLowerCase()
        : '';
    const profileId = profile && typeof profile.profileId === 'string' ? profile.profileId.trim() : '';
    const sourceCode = profileAttribution && typeof profileAttribution.sourceCode === 'string'
        ? profileAttribution.sourceCode.trim().toLowerCase()
        : '';
    const sourceLabel = profileAttribution && typeof profileAttribution.sourceLabel === 'string'
        ? profileAttribution.sourceLabel.trim().toLowerCase()
        : '';
    const curationEntryPresent = profileAttribution && typeof profileAttribution.curationEntryPresent === 'boolean'
        ? profileAttribution.curationEntryPresent
        : null;
    const hasResolvedProfileSignal = profileId.length > 0 || fallbackReason.length > 0;
    const effectiveSourceCode = sourceCode.length > 0
        ? sourceCode
        : sourceLabel.includes('compiled profile + device override')
            ? 'compiled+curation-override'
            : sourceLabel.includes('compiled profile only')
                ? 'compiled-only'
                : hasResolvedProfileSignal
                    ? curationEntryPresent === true
                        ? 'compiled+curation-override'
                        : 'compiled-only'
                    : '';
    if (fallbackReason === 'no_compiled_profile_match') {
        return 'Compiled-only policy: no profile match; safe fallback (class other, no mappings).';
    }
    if (fallbackReason === 'compiled_profile_artifact_unavailable') {
        return 'Compiled-only policy: artifact unavailable; safe fallback (class other, no mappings).';
    }
    if (effectiveSourceCode === 'compiled+curation-override') {
        return 'Compiled-only policy: resolved from compiled profile, then device override applied.';
    }
    if (effectiveSourceCode === 'compiled-only') {
        return 'Compiled-only policy: resolved from compiled profile; no runtime generic inference.';
    }
    return 'Compiled-only policy: profile resolution pending.';
}
function isMissingValue(value) {
    if (value === null || typeof value === 'undefined')
        return true;
    if (typeof value === 'string' && value.trim().length === 0)
        return true;
    return false;
}
function buildProductTriple(nodeState) {
    const parts = [nodeState?.manufacturerId, nodeState?.productType, nodeState?.productId];
    if (parts.every((value) => isMissingValue(value)))
        return null;
    return parts.map((value) => (isMissingValue(value) ? 'n/a' : String(value))).join(':');
}
function formatBooleanFlag(value) {
    if (value === true)
        return 'Yes';
    if (value === false)
        return 'No';
    return 'n/a';
}
function mappingSkipReasonRows(skipReasons) {
    if (!skipReasons || typeof skipReasons !== 'object') {
        return [['Skip Reasons', 'None']];
    }
    const entries = Object.entries(skipReasons)
        .filter(([, count]) => typeof count === 'number' && count > 0)
        .sort((left, right) => right[1] - left[1]);
    if (entries.length === 0) {
        return [['Skip Reasons', 'None']];
    }
    return entries.map(([reason, count]) => [reason, count, 'mono']);
}
function toNonNegativeCount(value) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return 0;
    return value > 0 ? Math.trunc(value) : 0;
}
function buildCurationStatusSummary(curation) {
    const loaded = curation && curation.loaded === true;
    const applied = toNonNegativeCount(curation && curation.appliedActions);
    const skipped = toNonNegativeCount(curation && curation.skippedActions);
    const errors = toNonNegativeCount(curation && curation.errorCount);
    const hasEntry = curation && curation.entryPresent === true;
    if (!loaded) {
        return {
            status: 'Unavailable',
            summary: 'Curation runtime is unavailable.',
        };
    }
    if (errors > 0) {
        return {
            status: 'Error',
            summary: `${errors} error(s), ${applied} applied, ${skipped} skipped.`,
        };
    }
    if (applied > 0) {
        return {
            status: 'Applied',
            summary: `${applied} action(s) applied, ${skipped} skipped.`,
        };
    }
    if (skipped > 0) {
        return {
            status: 'Skipped',
            summary: `${skipped} action(s) skipped, no applied actions.`,
        };
    }
    if (hasEntry) {
        return {
            status: 'No Change',
            summary: 'Device override exists but produced no changes in this sync.',
        };
    }
    return {
        status: 'No Override',
        summary: 'Compiled profile is active without a device-specific override.',
    };
}
function buildNodeSnapshotWarnings(snapshot) {
    const warnings = [];
    if (!snapshot || !snapshot.runtime || !snapshot.runtime.zwjs) {
        warnings.push('Runtime diagnostics are incomplete.');
        return warnings;
    }
    if (snapshot.runtime.zwjs.available !== true) {
        warnings.push('Bridge connection is not configured.');
        return warnings;
    }
    if (snapshot.runtime.zwjs.transportConnected !== true) {
        warnings.push('Bridge transport is disconnected.');
    }
    if (!snapshot.runtime.compiledProfiles || snapshot.runtime.compiledProfiles.loaded !== true) {
        warnings.push('Compiled profiles are unavailable.');
    }
    if (!snapshot.runtime.curation || snapshot.runtime.curation.loaded !== true) {
        warnings.push('Curation runtime is unavailable.');
    }
    if (snapshot.recommendation && snapshot.recommendation.actionable === true) {
        warnings.push('Device has a pending recommendation.');
    }
    return warnings;
}
function toKvRows(rows, options) {
    const omitEmpty = options && options.omitEmpty === true;
    const normalizedRows = omitEmpty ? rows.filter((row) => !isMissingValue(row[1])) : rows;
    if (normalizedRows.length === 0) {
        return [{ key: 'Details', value: 'No data available.' }];
    }
    return normalizedRows.map((row) => ({
        key: row[0],
        value: toSafeText(row[1]),
        valueClass: row[2] ? row[2] : undefined,
    }));
}
function recommendationBadge(snapshot) {
    if (!snapshot?.recommendation?.actionable) {
        return { label: 'No Action Needed', tone: 'ok' };
    }
    if (snapshot.recommendation.suggestedAction === 'backfill-marker') {
        return { label: 'Profile Reference Missing', tone: 'warn' };
    }
    return { label: 'Profile Update Available', tone: 'danger' };
}
function extensionReasonLabel(reason) {
    if (!reason)
        return 'n/a';
    const code = String(reason);
    const label = extensionReadReasonLabels[code];
    if (!label)
        return code;
    return `${label} (${code})`;
}
function getExtensionReadSection(read, sectionId) {
    if (!read || typeof read !== 'object')
        return null;
    if (!Array.isArray(read.sections))
        return null;
    const section = read.sections.find((entry) => entry && typeof entry === 'object' && entry.sectionId === sectionId);
    return section || null;
}
function lockExtensionActionAvailable(lockRead) {
    if (!lockRead || typeof lockRead !== 'object')
        return false;
    const extensionMatched = lockRead.extension && lockRead.extension.matched === true;
    const readSupported = lockRead.read && lockRead.read.supported === true;
    const readImplemented = lockRead.read && lockRead.read.implemented === true;
    return extensionMatched && readSupported && readImplemented;
}
function buildLockExtensionRows(lockRead) {
    if (!lockRead || typeof lockRead !== 'object') {
        return toKvRows([
            ['Status', 'Unavailable'],
            ['Reason', 'Extension snapshot is unavailable.'],
        ]);
    }
    const userCodeSection = getExtensionReadSection(lockRead.read, 'user-code-slots');
    const lockoutSection = getExtensionReadSection(lockRead.read, 'lockout-diagnostics');
    const summary = userCodeSection && typeof userCodeSection.summary === 'object' ? userCodeSection.summary : {};
    const diagnostics = lockoutSection && typeof lockoutSection.diagnostics === 'object'
        ? lockoutSection.diagnostics
        : {};
    const warnings = Array.isArray(diagnostics.warnings)
        ? diagnostics.warnings.map((entry) => String(entry))
        : [];
    return toKvRows([
        ['Status', lockExtensionActionAvailable(lockRead) ? 'Available' : 'Unavailable'],
        ['Read Reason', extensionReasonLabel(lockRead.read && lockRead.read.reason)],
        ['Slots', summary.slotCount],
        ['Enabled Slots', summary.enabledSlots],
        ['Disabled Slots', summary.disabledSlots],
        ['Available Slots', summary.availableSlots],
        ['Unknown Slots', summary.unknownSlots],
        [
            'Lockout Active',
            diagnostics.lockoutActive === true
                ? 'Yes'
                : diagnostics.lockoutActive === false
                    ? 'No'
                    : 'n/a',
        ],
        ['Warnings', warnings.length > 0 ? warnings.join(', ') : 'None'],
    ], { omitEmpty: false });
}
function buildLockActionHint(lockRead) {
    if (!lockRead || typeof lockRead !== 'object') {
        return 'Lock extension data is unavailable for this device.';
    }
    if (!lockExtensionActionAvailable(lockRead)) {
        const reasonCode = lockRead.read && lockRead.read.reason ? lockRead.read.reason : 'unavailable';
        return `Lock extension unavailable: ${extensionReasonLabel(reasonCode)}`;
    }
    return 'Lock extension is active. Use slot + code/state inputs to run lock actions.';
}
(function attachDeviceToolsPresenter(root, factory) {
    const presenter = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = presenter;
    }
    const nextRoot = root || {};
    nextRoot.Zwjs2HomeyUi = nextRoot.Zwjs2HomeyUi || {};
    nextRoot.Zwjs2HomeyUi.deviceToolsPresenter = presenter;
})(typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
        ? global
        : {}, function createDeviceToolsPresenter() {
    function createInitialState() {
        return {
            loading: false,
            actionInFlight: false,
            snapshot: null,
            latestActionResult: null,
            error: null,
            statusMessage: null,
            statusTone: 'neutral',
        };
    }
    function reduce(state, event) {
        if (!event || typeof event !== 'object')
            return state;
        if (event.type === 'load_start') {
            return {
                ...state,
                loading: true,
                error: null,
                statusMessage: null,
                statusTone: 'neutral',
            };
        }
        if (event.type === 'load_success') {
            const warnings = buildNodeSnapshotWarnings(event.snapshot);
            return {
                ...state,
                loading: false,
                snapshot: event.snapshot,
                error: null,
                statusMessage: warnings.length > 0
                    ? warnings[0]
                    : `Last updated ${formatIso(event.snapshot?.generatedAt)}`,
                statusTone: warnings.length > 0 ? 'warn' : 'ok',
            };
        }
        if (event.type === 'load_error') {
            return {
                ...state,
                loading: false,
                error: event.message || 'Failed to load snapshot.',
                statusMessage: null,
                statusTone: 'error',
            };
        }
        if (event.type === 'action_start') {
            return {
                ...state,
                actionInFlight: true,
                error: null,
                statusMessage: 'Applying action...',
                statusTone: 'neutral',
            };
        }
        if (event.type === 'action_success') {
            return {
                ...state,
                actionInFlight: false,
                snapshot: event.snapshot,
                latestActionResult: event.actionResult,
                statusMessage: event.summary.message,
                statusTone: event.summary.tone,
                error: null,
            };
        }
        if (event.type === 'action_error') {
            return {
                ...state,
                actionInFlight: false,
                error: event.message || 'Action failed.',
                statusMessage: null,
                statusTone: 'error',
            };
        }
        return state;
    }
    function describeActionResult(actionResult, snapshot) {
        if (!actionResult || typeof actionResult !== 'object') {
            return { message: 'Action completed.', tone: 'ok' };
        }
        if (actionResult.execution &&
            typeof actionResult.execution === 'object' &&
            typeof actionResult.execution.reason === 'string') {
            const execution = actionResult.execution;
            const reason = execution.reason;
            if (execution.executed === true) {
                return {
                    message: 'Extension action completed.',
                    tone: 'ok',
                };
            }
            if (reason === 'dry-run-preview') {
                return {
                    message: actionReasonLabels[reason] || 'Dry-run preview generated.',
                    tone: 'warn',
                };
            }
            return {
                message: actionReasonLabels[reason] || `Extension action not executed: ${reason}`,
                tone: execution.status === 'rejected' ? 'error' : 'warn',
            };
        }
        if (actionResult.executed === true) {
            if (actionResult.selectedAction === 'backfill-marker') {
                return {
                    message: 'Backfill completed. Profile Reference metadata has been updated.',
                    tone: 'ok',
                };
            }
            if (actionResult.selectedAction === 'adopt-recommended-baseline') {
                return {
                    message: 'Profile update adopted for this device.',
                    tone: 'ok',
                };
            }
            return { message: 'Action completed.', tone: 'ok' };
        }
        const reason = actionResult.reason && typeof actionResult.reason === 'string'
            ? actionResult.reason
            : 'action-not-executed';
        if (reason === 'action-state-changed') {
            const latestReasonCode = actionResult.latestReason && typeof actionResult.latestReason === 'string'
                ? actionResult.latestReason
                : null;
            if (latestReasonCode) {
                const snapshotReasonLabel = snapshot &&
                    snapshot.recommendation &&
                    snapshot.recommendation.reason === latestReasonCode
                    ? snapshot.recommendation.reasonLabel
                    : null;
                const latestReasonLabel = recommendationReasonLabel(latestReasonCode, snapshotReasonLabel);
                const latestReasonSummary = actionReasonLabels[latestReasonCode] || latestReasonLabel || latestReasonCode;
                return {
                    message: `Action state changed while applying update. Latest state: ${latestReasonSummary}`,
                    tone: 'warn',
                };
            }
        }
        return {
            message: actionReasonLabels[reason] || `Action not executed: ${reason}`,
            tone: 'warn',
        };
    }
    function buildViewModel(state) {
        if (!state.snapshot) {
            return {
                loading: state.loading,
                actionInFlight: state.actionInFlight,
                error: state.error,
                statusTone: state.statusTone,
                statusLine: state.statusMessage || (state.loading ? 'Loading snapshot...' : 'Idle'),
                subtitle: state.loading ? 'Loading device context...' : 'No device data available.',
                zwjsNodeRows: [],
                adapterRows: [],
                recommendation: {
                    badgeLabel: 'No Action Needed',
                    badgeTone: 'ok',
                    reasonText: 'No recommendation data available.',
                    detailText: 'Rule match indicates which rule tier classified this node. Profile source shows compiled-only vs device-override resolution.',
                },
                profileRefRows: [],
                mappingSkipRows: [],
                runtimeContextRows: [],
                curationRows: [],
                decisionRows: [],
                latestActionRows: [],
                backfillDisabled: true,
                adoptDisabled: true,
                actionHint: 'No action context available.',
                lockExtensionRows: [],
                lockSetCodeDisabled: true,
                lockRemoveCodeDisabled: true,
                lockSetStateDisabled: true,
                lockActionHint: 'Lock extension data is unavailable.',
            };
        }
        const snapshot = state.snapshot;
        const isBusy = state.loading || state.actionInFlight;
        const canBackfill = snapshot.recommendation.actionable &&
            snapshot.recommendation.suggestedAction === 'backfill-marker';
        const canAdopt = snapshot.recommendation.actionable &&
            snapshot.recommendation.suggestedAction === 'adopt-recommended-baseline';
        const runtimeZwjs = snapshot.runtime && snapshot.runtime.zwjs ? snapshot.runtime.zwjs : {};
        const nodeState = snapshot.node || {};
        const productTriple = buildProductTriple(nodeState);
        const zwjsConnection = `${toSafeText(runtimeZwjs.lifecycle)} / ${runtimeZwjs.transportConnected === true ? 'connected' : 'disconnected'}`;
        const nodeStatus = buildNodeStatusSummary(nodeState);
        const profileAttribution = snapshot.profileAttribution && typeof snapshot.profileAttribution === 'object'
            ? snapshot.profileAttribution
            : null;
        const confidenceSummary = profileAttribution
            ? toSafeText(profileAttribution.confidenceLabel)
            : describeConfidence(snapshot.profile.confidence);
        const profileSourceSummary = profileAttribution
            ? toSafeText(profileAttribution.sourceLabel)
            : describeProfileSourceCode(snapshot.profile && snapshot.profile.sourceCode, snapshot.curation && snapshot.curation.entryPresent === true);
        const inferencePolicySummary = describeInferencePolicy(snapshot.profile, profileAttribution);
        const curationStatusSummary = buildCurationStatusSummary(snapshot.curation);
        const overrideSummary = profileAttribution
            ? profileAttribution.curationEntryPresent === true
                ? 'Present'
                : 'None'
            : snapshot.curation && snapshot.curation.entryPresent === true
                ? 'Present'
                : 'None';
        const deviceLabel = snapshot.device.nodeId !== null ? `Node ${snapshot.device.nodeId}` : 'Node';
        const recommendationBadgeView = recommendationBadge(snapshot);
        const lockRead = snapshot.extensions ? snapshot.extensions.lockUserCodes : null;
        const lockActionAvailable = lockExtensionActionAvailable(lockRead);
        const latestActionRows = state.latestActionResult && typeof state.latestActionResult === 'object'
            ? (() => {
                const result = state.latestActionResult;
                if (result.execution &&
                    typeof result.execution === 'object' &&
                    typeof result.execution.reason === 'string') {
                    return toKvRows([
                        ['Executed', result.execution.executed === true ? 'Yes' : 'No'],
                        ['Extension', result.extension ? result.extension.extensionId : null],
                        ['Action', result.action ? result.action.actionId : null],
                        ['Status', result.execution.status],
                        ['Reason', toReasonDetail(result.execution.reason, actionReasonLabels)],
                    ]);
                }
                const latestReasonLabel = result.latestReason &&
                    snapshot.recommendation &&
                    snapshot.recommendation.reason === result.latestReason
                    ? snapshot.recommendation.reasonLabel
                    : null;
                return toKvRows([
                    ['Executed', result.executed === true ? 'Yes' : 'No'],
                    ['Requested Action', result.requestedAction],
                    ['Selected Action', result.selectedAction],
                    ['Reason', toReasonDetail(result.reason, actionReasonLabels)],
                    [
                        'Latest State',
                        toRecommendationReasonDetail(result.latestReason, latestReasonLabel),
                    ],
                    ['State Changed', result.stateChanged === true ? 'Yes' : 'No'],
                ]);
            })()
            : toKvRows([['Latest Action', 'No action executed in this session yet.']]);
        let actionHint = 'No action is required right now. This device is already aligned with its profile state.';
        if (canBackfill) {
            actionHint = 'Profile reference metadata is missing. You can backfill marker metadata now.';
        }
        else if (canAdopt) {
            actionHint = 'A compiled profile update is available. You can adopt it for this device.';
        }
        const statusLine = state.statusMessage
            ? state.statusMessage
            : state.loading
                ? 'Refreshing device snapshot...'
                : state.actionInFlight
                    ? 'Applying action...'
                    : `Last updated ${formatIso(snapshot.generatedAt)}`;
        return {
            loading: state.loading,
            actionInFlight: state.actionInFlight,
            error: state.error,
            statusTone: state.statusTone,
            statusLine,
            subtitle: `${deviceLabel} · ${snapshot.device.homeyDeviceId}`,
            zwjsNodeRows: toKvRows([
                ['Manufacturer', nodeState.manufacturer],
                ['Product', nodeState.product],
                ['Product Triple', productTriple, 'mono'],
                ['Location', nodeState.location],
                ['Firmware', nodeState.firmwareVersion],
                ['Ready', formatBooleanFlag(nodeState.ready)],
                ['Failed', formatBooleanFlag(nodeState.isFailed)],
                ['Node Status', nodeStatus],
                ['ZWJS', zwjsConnection],
                ['ZWJS Server', runtimeZwjs.serverVersion],
            ], { omitEmpty: true }),
            adapterRows: toKvRows([
                ['Device Class', snapshot.profile.homeyClass],
                ['Rule Match', confidenceSummary],
                ['Profile Source', profileSourceSummary],
                ['Inference Policy', inferencePolicySummary],
                ['Device Override', overrideSummary],
                ['Curation Status', curationStatusSummary.status],
                ['Curation Summary', curationStatusSummary.summary],
                ['Curation Entry', snapshot.curation.entryPresent ? 'Present' : 'Missing'],
                ['Curation Source', snapshot.curation.source],
                ['Profile ID', snapshot.profile.profileId, 'mono'],
                [
                    'Match',
                    `${toSafeText(snapshot.profile.matchBy)} / ${toSafeText(snapshot.profile.matchKey)}`,
                ],
                ['Profile Fallback', snapshot.profile.fallbackReason],
                ['Uncurated', formatBooleanFlag(snapshot.profile.uncurated)],
                ['Mapped Capabilities', snapshot.mapping.capabilityCount],
                ['Vertical Slice', formatBooleanFlag(snapshot.mapping.verticalSliceApplied)],
                [
                    'Inbound Mapping',
                    `${snapshot.mapping.inboundEnabled}/${snapshot.mapping.inboundConfigured} enabled (${snapshot.mapping.inboundSkipped} skipped)`,
                ],
                [
                    'Outbound Mapping',
                    `${snapshot.mapping.outboundEnabled}/${snapshot.mapping.outboundConfigured} enabled (${snapshot.mapping.outboundSkipped} skipped)`,
                ],
            ], { omitEmpty: true }),
            recommendation: {
                badgeLabel: recommendationBadgeView.label,
                badgeTone: recommendationBadgeView.tone,
                reasonText: recommendationReasonLabel(snapshot.recommendation.reason, snapshot.recommendation.reasonLabel) || 'No recommendation data available.',
                detailText: 'Rule match indicates which rule tier classified this node. Profile source shows compiled-only vs device-override resolution.',
            },
            profileRefRows: toKvRows([
                ['Projection', snapshot.profileReference.projectionVersion],
                ['Current Hash', snapshot.profileReference.currentBaselineHash, 'mono'],
                ['Stored Hash', snapshot.profileReference.storedBaselineHash, 'mono'],
                ['Current Fingerprint', snapshot.profileReference.currentPipelineFingerprint, 'mono'],
                ['Stored Fingerprint', snapshot.profileReference.storedPipelineFingerprint, 'mono'],
            ], { omitEmpty: true }),
            mappingSkipRows: toKvRows(mappingSkipReasonRows(snapshot.mapping.skipReasons), {
                omitEmpty: false,
            }),
            runtimeContextRows: toKvRows([
                ['Sync Reason', snapshot.sync ? snapshot.sync.syncReason : null],
                ['Profile Synced At', formatIsoOrNull(snapshot.sync ? snapshot.sync.syncedAt : null)],
                ['Runtime Generated At', formatIsoOrNull(snapshot.generatedAt)],
                ['ZWJS Last Message', formatIsoOrNull(runtimeZwjs.lastMessageAt)],
                ['ZWJS Connected At', formatIsoOrNull(runtimeZwjs.connectedAt)],
                ['Curation Error', snapshot.curation.error],
            ], { omitEmpty: true }),
            curationRows: toKvRows([
                ['Loaded', formatBooleanFlag(snapshot.curation.loaded)],
                ['Entry Present', formatBooleanFlag(snapshot.curation.entryPresent)],
                ['Applied Actions', snapshot.curation.appliedActions],
                ['Skipped Actions', snapshot.curation.skippedActions],
                ['Error Count', snapshot.curation.errorCount],
                ['Source', snapshot.curation.source],
                ['Error', snapshot.curation.error],
            ], { omitEmpty: false }),
            decisionRows: toKvRows([
                [
                    'Reason',
                    toRecommendationReasonDetail(snapshot.recommendation.reason, snapshot.recommendation.reasonLabel),
                ],
                ['Reason Code', snapshot.recommendation.reason, 'mono'],
                ['Suggested Action', snapshot.recommendation.suggestedAction],
                ['Actionable', snapshot.recommendation.actionable ? 'Yes' : 'No'],
                ['Fallback Reason', snapshot.profile.fallbackReason],
                ['Product Triple', productTriple, 'mono'],
                ['Rule Profile ID', snapshot.profile.profileId, 'mono'],
                [
                    'Rule Match',
                    `${toSafeText(snapshot.profile.matchBy)} / ${toSafeText(snapshot.profile.matchKey)}`,
                ],
                ['Rule Source', profileSourceSummary],
            ], { omitEmpty: true }),
            latestActionRows,
            backfillDisabled: isBusy || !canBackfill,
            adoptDisabled: isBusy || !canAdopt,
            actionHint,
            lockExtensionRows: buildLockExtensionRows(lockRead),
            lockSetCodeDisabled: isBusy || !lockActionAvailable,
            lockRemoveCodeDisabled: isBusy || !lockActionAvailable,
            lockSetStateDisabled: isBusy || !lockActionAvailable,
            lockActionHint: buildLockActionHint(lockRead),
        };
    }
    return {
        createInitialState,
        reduce,
        buildViewModel,
        describeActionResult,
    };
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function toErrorMessage(error) {
    if (typeof error === 'string' && error.trim().length > 0)
        return error;
    return 'Failed to load bridge diagnostics.';
}
function asText(value) {
    if (value === null || typeof value === 'undefined' || value === '')
        return 'n/a';
    return String(value);
}
function asTime(value) {
    if (!value)
        return 'n/a';
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return String(value);
    return parsed.toLocaleString();
}
function asTimeOrNull(value) {
    if (!value)
        return null;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return String(value);
    return parsed.toLocaleString();
}
function asYesNoUnknown(value) {
    if (value === true)
        return 'Yes';
    if (value === false)
        return 'No';
    return 'n/a';
}
function isMissingValue(value) {
    if (value === null || typeof value === 'undefined')
        return true;
    if (typeof value === 'string' && value.trim().length === 0)
        return true;
    return false;
}
function recommendationPriority(node) {
    if (node?.recommendation?.backfillNeeded)
        return 0;
    if (node?.recommendation?.available)
        return 1;
    return 2;
}
function recommendationLabel(node) {
    if (node?.recommendation?.backfillNeeded)
        return 'Backfill Marker';
    if (node?.recommendation?.available)
        return 'Adopt Update';
    return 'No Action';
}
function recommendationTone(node) {
    if (node?.recommendation?.backfillNeeded)
        return 'warn';
    if (node?.recommendation?.available)
        return 'danger';
    return 'ok';
}
function recommendationReasonLabel(node) {
    const reasonLabel = node?.recommendation && typeof node.recommendation.reasonLabel === 'string'
        ? node.recommendation.reasonLabel.trim()
        : '';
    if (reasonLabel.length > 0)
        return reasonLabel;
    if (node?.recommendation && typeof node.recommendation.reason === 'string') {
        return node.recommendation.reason;
    }
    return recommendationLabel(node);
}
function nodeIdentityLabel(node) {
    const manufacturer = node?.node && typeof node.node.manufacturer === 'string' ? node.node.manufacturer.trim() : '';
    const product = node?.node && typeof node.node.product === 'string' ? node.node.product.trim() : '';
    if (manufacturer.length > 0 && product.length > 0)
        return `${manufacturer} ${product}`;
    if (manufacturer.length > 0)
        return manufacturer;
    if (product.length > 0)
        return product;
    return 'Unknown device';
}
function nodeStateLabel(node) {
    const parts = [];
    if (node?.node?.ready === true)
        parts.push('Ready');
    else if (node?.node?.ready === false)
        parts.push('Not ready');
    if (node?.node?.isFailed === true)
        parts.push('Failed');
    else if (node?.node?.isFailed === false)
        parts.push('Healthy');
    if (node?.node &&
        typeof node.node.interviewStage === 'string' &&
        node.node.interviewStage.trim().length > 0) {
        parts.push(`Interview: ${node.node.interviewStage.trim()}`);
    }
    if (node?.node && typeof node.node.status === 'string' && node.node.status.trim().length > 0) {
        parts.push(`Node: ${node.node.status.trim()}`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'n/a';
}
function profileMatchLabel(node) {
    const matchBy = node?.profile && typeof node.profile.matchBy === 'string' ? node.profile.matchBy : null;
    const matchKey = node?.profile && typeof node.profile.matchKey === 'string' ? node.profile.matchKey : null;
    if (!matchBy && !matchKey)
        return 'n/a';
    return `${asText(matchBy)} / ${asText(matchKey)}`;
}
function skipReasonSummary(skipReasons) {
    if (!skipReasons || typeof skipReasons !== 'object')
        return 'None';
    const entries = Object.entries(skipReasons)
        .filter(([, count]) => typeof count === 'number' && count > 0)
        .sort((left, right) => right[1] - left[1]);
    if (entries.length === 0)
        return 'None';
    return entries
        .slice(0, 2)
        .map(([reason, count]) => `${reason} (${count})`)
        .join(', ');
}
function profileConfidenceLabel(node) {
    const attribution = node?.profileAttribution && typeof node.profileAttribution === 'object'
        ? node.profileAttribution
        : null;
    if (attribution && attribution.confidenceLabel) {
        return String(attribution.confidenceLabel);
    }
    const confidence = node?.profile && typeof node.profile.confidence === 'string'
        ? node.profile.confidence.trim().toLowerCase()
        : '';
    if (confidence === 'curated')
        return 'Project rule match';
    if (confidence === 'ha-derived')
        return 'Home Assistant-derived rule match';
    if (confidence === 'generic')
        return 'Generic fallback rule';
    return 'Unknown rule match level';
}
function profileSourceLabel(node) {
    const attribution = node?.profileAttribution && typeof node.profileAttribution === 'object'
        ? node.profileAttribution
        : null;
    if (attribution && attribution.sourceLabel)
        return String(attribution.sourceLabel);
    const hasProfile = node?.profile && (node.profile.profileId || node.profile.fallbackReason);
    if (!hasProfile)
        return 'Profile resolution pending';
    if (node?.curation && node.curation.entryPresent) {
        return 'Compiled profile + device override';
    }
    return 'Compiled profile only';
}
function runtimeStatusLabel(snapshot) {
    if (!snapshot?.runtime?.zwjs || snapshot.runtime.zwjs.available !== true) {
        return 'Bridge Not Configured';
    }
    if (snapshot.runtime.zwjs.transportConnected !== true) {
        return 'Bridge Disconnected';
    }
    if (snapshot.runtime.compiledProfiles && snapshot.runtime.compiledProfiles.loaded !== true) {
        return 'Connected (Compiled Profiles Missing)';
    }
    if (snapshot.nodeSummary && snapshot.nodeSummary.total > 0) {
        return 'Connected (Imported Nodes Available)';
    }
    return 'Connected (No Imported Nodes)';
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
    if (!loaded)
        return 'Unavailable';
    if (errors > 0)
        return 'Error';
    if (applied > 0)
        return 'Applied';
    if (skipped > 0)
        return 'Skipped';
    if (hasEntry)
        return 'No Change';
    return 'No Override';
}
function buildBridgeSnapshotWarnings(snapshot) {
    const warnings = [];
    if (!snapshot || !snapshot.runtime || !snapshot.runtime.zwjs) {
        warnings.push('Bridge runtime diagnostics are incomplete.');
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
    if (snapshot.runtime.zwjs.versionReceived === false) {
        warnings.push('ZWJS server version has not been received.');
    }
    if (snapshot.runtime.zwjs.initialized === false) {
        warnings.push('ZWJS runtime reports uninitialized state.');
    }
    const reconnectAttempt = typeof snapshot.runtime.zwjs.reconnectAttempt === 'number' &&
        Number.isFinite(snapshot.runtime.zwjs.reconnectAttempt)
        ? Math.max(0, Math.trunc(snapshot.runtime.zwjs.reconnectAttempt))
        : 0;
    if (reconnectAttempt > 0) {
        warnings.push(`ZWJS reconnect attempts observed (${reconnectAttempt}).`);
    }
    const actionable = Array.isArray(snapshot.nodes)
        ? snapshot.nodes.filter((node) => recommendationPriority(node) < 2).length
        : 0;
    if (actionable > 0) {
        warnings.push(`${actionable} node(s) require action.`);
    }
    return warnings;
}
function toKvRows(rows, options) {
    const omitEmpty = options && options.omitEmpty === true;
    const filtered = omitEmpty ? rows.filter((row) => !isMissingValue(row[1])) : rows;
    if (filtered.length === 0) {
        return [{ key: 'Details', value: 'No data available.' }];
    }
    return filtered.map((row) => ({
        key: row[0],
        value: asText(row[1]),
        valueClass: row[2] ? row[2].trim() : undefined,
    }));
}
function topSkipReasonsSummary(skipReasons) {
    if (!skipReasons || typeof skipReasons !== 'object')
        return 'None';
    const entries = Object.entries(skipReasons)
        .filter(([, count]) => typeof count === 'number' && count > 0)
        .sort((left, right) => right[1] - left[1]);
    if (entries.length === 0)
        return 'None';
    return entries
        .slice(0, 3)
        .map(([reason, count]) => `${reason}:${count}`)
        .join(', ');
}
function toNodeViewRow(node) {
    const nodeLabel = node?.nodeId !== null ? `Node ${asText(node?.nodeId)}` : 'Node n/a';
    const location = node?.node && typeof node.node.location === 'string' && node.node.location.trim()
        ? node.node.location.trim()
        : null;
    const mappingSummary = `${asText(node?.mapping?.inboundEnabled)}/${asText(node?.mapping?.inboundConfigured)} in, ${asText(node?.mapping?.outboundEnabled)}/${asText(node?.mapping?.outboundConfigured)} out`;
    return {
        nodeLabel,
        homeyDeviceId: asText(node?.homeyDeviceId),
        identityLabel: nodeIdentityLabel(node),
        nodeStateLabel: nodeStateLabel(node),
        locationLabel: asText(location),
        profileId: asText(node?.profile?.profileId),
        profileClass: asText(node?.profile?.homeyClass),
        ruleMatch: profileConfidenceLabel(node),
        profileSource: profileSourceLabel(node),
        curationStatus: buildCurationStatusSummary(node?.curation),
        profileMatch: profileMatchLabel(node),
        fallbackReason: asText(node?.profile?.fallbackReason),
        recommendationLabel: recommendationLabel(node),
        recommendationTone: recommendationTone(node),
        recommendationReason: recommendationReasonLabel(node),
        mappingSummary,
        mappingDetail: `Capabilities: ${asText(node?.mapping?.capabilityCount)} · Vertical Slice: ${node?.mapping?.verticalSliceApplied ? 'Yes' : 'No'}`,
        mappingSkippedSummary: skipReasonSummary(node?.mapping?.skipReasons),
    };
}
function sortNodes(nodes) {
    return [...nodes].sort((left, right) => {
        const byPriority = recommendationPriority(left) - recommendationPriority(right);
        if (byPriority !== 0)
            return byPriority;
        const leftNodeId = typeof left?.nodeId === 'number' && Number.isInteger(left.nodeId)
            ? left.nodeId
            : Number.MAX_SAFE_INTEGER;
        const rightNodeId = typeof right?.nodeId === 'number' && Number.isInteger(right.nodeId)
            ? right.nodeId
            : Number.MAX_SAFE_INTEGER;
        if (leftNodeId !== rightNodeId)
            return leftNodeId - rightNodeId;
        const leftId = left?.homeyDeviceId ? String(left.homeyDeviceId) : '';
        const rightId = right?.homeyDeviceId ? String(right.homeyDeviceId) : '';
        return leftId.localeCompare(rightId);
    });
}
(function attachBridgeToolsPresenter(root, factory) {
    const presenter = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = presenter;
    }
    const nextRoot = root || {};
    nextRoot.Zwjs2HomeyUi = nextRoot.Zwjs2HomeyUi || {};
    nextRoot.Zwjs2HomeyUi.bridgeToolsPresenter = presenter;
})(typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
        ? global
        : {}, function createBridgeToolsPresenter() {
    function createInitialState() {
        return {
            loading: false,
            snapshot: null,
            error: null,
            status: 'Initializing...',
            tone: 'neutral',
            filterMode: 'action-needed',
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
                status: 'Refreshing diagnostics...',
                tone: 'neutral',
            };
        }
        if (event.type === 'load_success') {
            const snapshot = event.snapshot;
            const warnings = buildBridgeSnapshotWarnings(snapshot);
            const nextStatus = warnings.length > 0
                ? `${warnings[0]} Last updated ${asTime(snapshot?.generatedAt)}`
                : `Last updated ${asTime(snapshot?.generatedAt)}`;
            return {
                ...state,
                loading: false,
                snapshot,
                error: null,
                status: nextStatus,
                tone: warnings.length > 0 ? 'warn' : 'ok',
            };
        }
        if (event.type === 'load_error') {
            return {
                ...state,
                loading: false,
                error: toErrorMessage(event.message),
                status: 'Bridge diagnostics unavailable.',
                tone: 'error',
            };
        }
        if (event.type === 'set_filter') {
            const filterMode = event.filterMode === 'all' ? 'all' : 'action-needed';
            return {
                ...state,
                filterMode,
            };
        }
        return state;
    }
    function buildViewModel(state) {
        if (!state.snapshot) {
            return {
                loading: state.loading,
                status: state.status,
                tone: state.tone,
                error: state.error,
                subtitle: state.loading ? 'Loading bridge diagnostics...' : 'No diagnostics available.',
                runtimeRows: [],
                runtimeAdvancedRows: [],
                summaryRows: [],
                recommendationCodeRows: [],
                mappingSkipReasonRows: [],
                filterActionLabel: 'Action Needed',
                filterAllLabel: 'All',
                nodesMeta: '',
                nodes: [],
                nodesEmptyMessage: 'No imported node devices found.',
            };
        }
        const snapshot = state.snapshot;
        const nodes = Array.isArray(snapshot.nodes) ? sortNodes(snapshot.nodes) : [];
        const actionNeededNodes = nodes.filter((node) => recommendationPriority(node) < 2);
        const visibleNodes = state.filterMode === 'action-needed' ? actionNeededNodes : nodes;
        const recommendationCodeRows = toKvRows(nodes
            .filter((node) => !isMissingValue(node?.recommendation && node.recommendation.reason))
            .map((node) => {
            const nodeLabel = node?.nodeId !== null ? `Node ${node.nodeId}` : 'Node n/a';
            return [nodeLabel, node?.recommendation?.reason, 'mono'];
        }), { omitEmpty: true });
        const mappingSkipReasonRows = toKvRows(Object.entries(snapshot?.nodeSummary?.skipReasons || {})
            .filter(([, count]) => typeof count === 'number' && count > 0)
            .sort((left, right) => right[1] - left[1])
            .map(([reason, count]) => [reason, count, 'mono']), { omitEmpty: true });
        const nodesMeta = nodes.length === 0
            ? 'No imported nodes available.'
            : state.filterMode === 'action-needed'
                ? `Showing ${visibleNodes.length} of ${nodes.length} imported nodes that require action.`
                : `Showing all ${nodes.length} imported nodes.`;
        const nodesEmptyMessage = visibleNodes.length > 0
            ? null
            : nodes.length > 0 && state.filterMode === 'action-needed'
                ? 'No nodes currently require action. Switch to All to inspect every node.'
                : 'No imported node devices found.';
        return {
            loading: state.loading,
            status: state.status,
            tone: state.tone,
            error: state.error,
            subtitle: `Bridge ${asText(snapshot?.device?.bridgeId)} · ${asText(snapshot?.device?.homeyDeviceId)}`,
            runtimeRows: toKvRows([
                ['Runtime Status', runtimeStatusLabel(snapshot)],
                ['Lifecycle', snapshot?.runtime?.zwjs?.lifecycle],
                [
                    'Transport',
                    snapshot?.runtime?.zwjs?.transportConnected ? 'Connected' : 'Disconnected',
                ],
                ['Server Version', snapshot?.runtime?.zwjs?.serverVersion],
                ['Adapter Family', snapshot?.runtime?.zwjs?.adapterFamily],
                ['Version Received', asYesNoUnknown(snapshot?.runtime?.zwjs?.versionReceived)],
                ['Initialized', asYesNoUnknown(snapshot?.runtime?.zwjs?.initialized)],
                ['Listening', asYesNoUnknown(snapshot?.runtime?.zwjs?.listening)],
                ['Authenticated', asYesNoUnknown(snapshot?.runtime?.zwjs?.authenticated)],
                ['Reconnect Attempts', asText(snapshot?.runtime?.zwjs?.reconnectAttempt)],
                ['Compiled Loaded', snapshot?.runtime?.compiledProfiles?.loaded ? 'Yes' : 'No'],
                ['Compiled Entries', snapshot?.runtime?.compiledProfiles?.entryCount],
                ['Curation Loaded', snapshot?.runtime?.curation?.loaded ? 'Yes' : 'No'],
                ['Curation Entries', snapshot?.runtime?.curation?.entryCount],
            ], { omitEmpty: true }),
            runtimeAdvancedRows: toKvRows([
                ['Last Message', asTimeOrNull(snapshot?.runtime?.zwjs?.lastMessageAt)],
                ['Connected At', asTimeOrNull(snapshot?.runtime?.zwjs?.connectedAt)],
                [
                    'Compiled Fingerprint',
                    snapshot?.runtime?.compiledProfiles?.pipelineFingerprint,
                    'mono',
                ],
                [
                    'Compiled Generated At',
                    asTimeOrNull(snapshot?.runtime?.compiledProfiles?.generatedAt),
                ],
                ['Compiled Source', snapshot?.runtime?.compiledProfiles?.sourcePath, 'mono'],
                ['Compiled Error', snapshot?.runtime?.compiledProfiles?.errorMessage],
                ['Curation Source', snapshot?.runtime?.curation?.source],
                ['Curation Error', snapshot?.runtime?.curation?.errorMessage],
            ], { omitEmpty: true }),
            summaryRows: toKvRows([
                ['Imported Nodes', snapshot?.nodeSummary?.total],
                ['Profile Resolved', snapshot?.nodeSummary?.profileResolvedCount],
                ['Profile Pending', snapshot?.nodeSummary?.profilePendingCount],
                ['Compiled Only', snapshot?.nodeSummary?.profileSourceCompiledOnlyCount],
                ['With Override', snapshot?.nodeSummary?.profileSourceOverrideCount],
                ['Unresolved Source', snapshot?.nodeSummary?.profileSourceUnresolvedCount],
                ['Rule Match: Project', snapshot?.nodeSummary?.confidenceCuratedCount],
                ['Rule Match: HA Derived', snapshot?.nodeSummary?.confidenceHaDerivedCount],
                ['Rule Match: Generic', snapshot?.nodeSummary?.confidenceGenericCount],
                ['Rule Match: Unknown', snapshot?.nodeSummary?.confidenceUnknownCount],
                ['Ready Nodes', snapshot?.nodeSummary?.readyCount],
                ['Failed Nodes', snapshot?.nodeSummary?.failedCount],
                ['Curation Entries', snapshot?.nodeSummary?.curationEntryCount],
                ['Curation Applied', snapshot?.nodeSummary?.curationAppliedActions],
                ['Curation Skipped', snapshot?.nodeSummary?.curationSkippedActions],
                ['Curation Errors', snapshot?.nodeSummary?.curationErrorCount],
                ['Action Needed', actionNeededNodes.length],
                ['Profile Updates', snapshot?.nodeSummary?.recommendationAvailableCount],
                ['Backfill Needed', snapshot?.nodeSummary?.recommendationBackfillCount],
                ['Mapped Capabilities', snapshot?.nodeSummary?.capabilityCount],
                ['Inbound Skipped', snapshot?.nodeSummary?.inboundSkipped],
                ['Outbound Skipped', snapshot?.nodeSummary?.outboundSkipped],
                ['Top Skip Reasons', topSkipReasonsSummary(snapshot?.nodeSummary?.skipReasons), 'mono'],
            ]),
            recommendationCodeRows,
            mappingSkipReasonRows,
            filterActionLabel: `Action Needed (${actionNeededNodes.length})`,
            filterAllLabel: `All (${nodes.length})`,
            nodesMeta,
            nodes: visibleNodes.map((node) => toNodeViewRow(node)),
            nodesEmptyMessage,
        };
    }
    return {
        createInitialState,
        reduce,
        buildViewModel,
    };
});

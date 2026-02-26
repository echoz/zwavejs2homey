# Roadmap

## Phase 1: Foundation (Completed)

- [x] Bootstrap Homey app project
- [x] Create shared core package
- [x] Wire Homey app to core placeholder service
- [x] Establish workspace install/build workflow from repo root
- [x] Add baseline lint/build scripts and local quality gate (`npm run check`)

## Phase 2: Protocol Core (`ZwjsClient`) (Planned Subset Complete)

- [x] Build protocol-first `zwave-js-server` client (no Homey abstractions)
- [x] Connection lifecycle, reconnect, request correlation, typed frames/events
- [x] Read wrapper subset + mutation policy/presets
- [x] Fixture/mocked/integration tests and read-only live validation baseline
- [ ] Non-production live validation for mutation-heavy domains (zniffer/firmware)

## Phase 3: Homey Mapping Compiler (In Progress)

- [x] Phase 1 compiler core: models, rules, matcher, build-state, compile pipeline
- [x] Phase 2 HA import foundation: extractor, translators, tooling, mixed compile tests
- [x] Phase 3 catalog tooling foundation: fetch/normalize/merge/diff/index + diagnostics
- [x] Catalog-aware compiler diagnostics (`catalogLookup`, `catalogMatch`, curation hints, diagnostic keys)
- [x] Catalog-focused compiler authoring diagnostics/ergonomics (inspection, explanation, focused views)
- [x] Defer curation-seed artifact generation (schema-first curation/rule authoring for now)
- [x] Compiler/Homey boundary decision: runtime curation patch schema/apply is adapter-owned (not compiler-owned)
- [x] Compiler build/export command foundation for compiled profiles artifact (`compiler:build`)
- [x] `compiler:build` can compile directly from live ZWJS nodes (not just fixture device facts)
- [x] Real rule pipeline directory skeleton in repo (`rules/ha-derived`, `rules/project/generic`, `rules/project/product`)
- [x] Generate HA-derived ruleset from HA import pipeline for supported discovery coverage
- [x] Initial project-generic ruleset (starter/provisional; may be reduced as adapter-owned inference policy is defined)
- [x] Live ZWJS validation path can apply compiled profiles artifact (not on-the-fly compile)
- [x] Live compiler build/inspect defaults skip controller-like nodes to focus device-profile validation
- [x] Rule-owned same-selector conflict resolution (`conflict.key/mode/priority`) with deterministic overlap suppression diagnostics
- [x] First project-product overrides from live validation (`rules/project/product/live-network-overrides.json`) for identified device triples
- [x] Product-layer capability de-noising action (`remove-capability`) for targeted suppression of noisy inferred capabilities
- [x] Curate current live-node signatures into product overrides (live validation snapshot on February 25, 2026: `Outcomes: curated=33`)
- [x] Humanize compiler review diagnostics: actionable review reasons in list output + expanded technical diagnostics in summary/markdown
- [x] Code-review hardening pass before perf: strict matcher-shape validation, actionable review-flag semantics, and HA alias `property_key` fidelity in generated rules
- [x] Performance slice 1: CLI compile paths reuse loaded rule manifests (`compiler:inspect-live`, `compiler:bench`) to avoid per-node/per-iteration manifest reload overhead
- [x] Performance slice 2: compiler-core caches for loaded-manifest flattening, layer-sorted rule execution order, and catalog index reuse
- [x] Performance slice 3: command-class candidate pruning in `compileDevice` with preserved unmatched-report semantics; benchmark manifest-path resolution hardened
- [x] Performance slice 4: command-class + property + endpoint candidate intersection in `compileDevice` prior to full rule matching
- [x] Performance slice 5: device-static gating (`device` matcher + companion constraints) precomputed once per compile and fast-pathed to unmatched entries
- [x] Performance slice 6: precomputed unmatched-action templates in compile execution plan to reduce per-value report object churn
- [x] Performance slice 7: reusable stamp-based candidate scratch buffers in `compileDevice` to remove per-value candidate-mask allocations
- [x] Performance slice 8: incremental summary counters in `compileDevice` to remove post-pass scans of report actions
- [x] Performance slice 9: reuse per-value cloned/frozen `valueId` snapshots across emitted action records
- [x] Performance slice 10: optional summary report mode in `compileDevice`/`compileProfilePlan` for bench-bulk runs, with counters preserving confidence + unmatched-ratio semantics
- [x] Performance slice 11: summary-mode candidate-only execution path in `compileDevice` to avoid full rule scans while preserving full-mode parity
- [x] Performance slice 12: summary-mode action-apply fast path (`applyRuleToValueSummary`) to avoid per-action result allocations in benchmark/bulk runs
- [x] Performance slice 13: summary-mode suppressed-action collection gating with incremental `suppressedFillActions` counting
- [x] Performance slice 14: profile-plan summary-path aggregation reduction (cached `ruleSources`, skip `byRule`/`bySuppressedSlot`/classification grouping in summary mode)
- [x] Performance slice 15: compile-loop split for summary/full modes to avoid valueId snapshot allocation in summary-only runs
- [x] Performance slice 16: conflict-resolution short-circuit when no exclusive conflict metadata is present in build state
- [x] Performance slice 17: precomputed summary candidate seeds per command class (single-loop summary candidate iteration, no visited-mark dedupe)
- [x] Performance slice 18: precomputed summary candidate seeds by command-class+property with endpoint-only runtime gating in summary mode
- [x] Performance slice 19: precomputed summary candidate seeds by command-class+property+endpoint, removing summary-path candidate stamping
- [x] Performance slice 20: compact 8-bucket summary seed model + per-selector cache to avoid wildcard expansion blow-up while keeping summary-path fast lookup
- [x] Performance slice 21: bound summary selector-cache size with FIFO eviction to prevent unbounded memory growth
- [x] Performance slice 22: remove summary-path concatenated selector key churn via nested-map bucket/cache indexing
- [x] Performance slice 23: summary counter accounting rewrite to direct unmatched accumulation using cached per-selector action totals (no baseline-add/subtract loop)
- [x] Performance slice 24: precompute per-selector device-eligible summary seeds to remove per-rule eligibility branching in summary hot loops
- [x] Performance slice 25: make bounded summary selector-cache eviction amortized O(1) via head-index FIFO queue + queue compaction under long selector churn
- [x] Performance slice 26: add all-eligible summary fast path to bypass eligible-seed filtering/cache setup when device-static rule eligibility is universally true
- [x] Performance slice 27: evaluate device/companion eligibility on sparse constrained-rule indices only, with lazy ineligible-mask materialization and no-op fast paths when all checks pass
- [x] Performance slice 28: remove `Set` allocation in summary selector-seed merges via stamp-based typed-array dedupe marks
- [x] Performance slice 29: add candidate apply paths that assume prevalidated device eligibility, removing redundant device/companion matcher checks inside hot rule-apply loops
- [x] Performance slice 30: narrow candidate apply matcher checks to residual value predicates after selector gating (`propertyKey`/metadata/read-write)
- [x] Post-review correctness fix: reject empty selector arrays in optimized matcher paths so malformed direct API rules remain `rule-not-matched` (never wildcard-applied)
- [x] Runtime-validation ergonomics slice: add `compiler:validate-live` to run live build + compiled-artifact apply + markdown diagnostics in one command
- [ ] Decide and document final ownership of generic fallback inference policy (currently leaning Homey adapter-owned)
- [ ] Add second real catalog source adapter when a concrete source format is available

## Phase 4: Homey Adapter MVP (Next Major Area)

- [ ] Start only after compiler runtime-validation readiness milestone is met
- [ ] Define first supported Homey device/capability vertical slice using compiled profiles
- [ ] Implement adapter execution of inbound/outbound mappings
- [ ] Device lifecycle/sync (discovery, create/update, mapping diagnostics)
- [ ] User curation patch application in Homey runtime

## Phase 5: Reliability + UX

- [ ] Non-production operational validation runs (zniffer/firmware) with captured fixtures
- [ ] Settings/diagnostics UI for compiler/profile inspection and curation
- [ ] Logging and support bundle workflow
- [ ] Performance tuning for compiler/rule volume and catalog scale

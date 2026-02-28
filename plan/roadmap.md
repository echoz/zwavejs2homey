# Roadmap

## Current Focus (Active)

- [ ] Phase 4 reset: ship dual-root panel TUI flow (`--url` nodes root, `--rules-only` rules root)
- [ ] Hold new Homey adapter design/implementation slices until Phase 4 reset checkpoint is complete

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
- [x] First project-product overrides from live validation for identified device triples (initially in `live-network-overrides.json`, now migrated to `product-rules/v1` per-target bundles)
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
- [x] Runtime-validation gating slice: add threshold/reason gate flags and machine-summary JSON output to `compiler:validate-live` for CI-friendly pass/fail automation
- [x] Runtime-validation docs slice: add gate setup/calibration playbook (`docs/compiler-validation-gates.md`) and surface links from README/architecture
- [x] Runtime-validation gate profile slice: add `--gate-profile-file` to `compiler:validate-live` so gate/output settings can be versioned in JSON (CLI overrides profile)
- [x] Runtime-validation diagnostics slice: add `--print-effective-gates` to `compiler:validate-live` to show resolved gate/output config before execution
- [x] Runtime-validation compiled-artifact reuse slice: add `--compiled-file` mode to `compiler:validate-live` to skip build and validate against an existing compiled artifact
- [x] Runtime-validation offline replay slice: add `--input-summary-json-file` mode to `compiler:validate-live` for gate rechecks from existing summary artifacts without live ZWJS access
- [x] Runtime-validation baseline-regression slice: add baseline/delta gate controls (`--baseline-summary-json-file`, `--max-*-delta`, `--fail-on-reason-delta`) with machine-summary/log delta reporting
- [x] Runtime-validation baseline-report slice: include baseline/delta sections in markdown validation reports for fast human triage
- [x] Runtime-validation baseline-snapshot slice: add `--save-baseline-summary-json-file` to refresh baseline artifacts directly from current validation runs
- [x] Runtime-validation artifact-retention slice: add `--artifact-retention keep|delete-on-pass` to control cleanup of large generated compiled artifacts
- [x] Runtime-validation baseline-wrapper slice: add `compiler:baseline` helper command to run baseline capture + zero-delta recheck as one workflow
- [x] Runtime-validation redacted-share slice: add `--redact-share` + explicit redacted output flags for PR-safe markdown/summary artifacts
- [x] Runtime-validation baseline-wrapper redaction parity slice: add `compiler:baseline --redact-share` and stage-specific redacted output path overrides
- [x] Runtime-validation signature-targeted loop slice: add `--signature` filtering to `compiler:inspect-live` and `compiler:validate-live` for focused per-product iteration
- [x] Runtime-validation simplification reset (part 1): rename signature loop command to `compiler:simulate`
- [x] Decide and document final ownership of generic fallback inference policy (Homey adapter-owned; see ADR 0004)
- [x] DSL simplification slice 1: support compact scalar matcher syntax with deterministic load-time canonicalization to arrays
- [x] Decide compiler rule boundary: compile-time rule scope is manifest-owned; non-manifest rules are runtime/Homey-adapter scope (ADR 0005)
- [x] Decide manifest-first compiler workflow policy (canonical flows use manifest inputs; ad-hoc rules-file is non-canonical/dev-only)
- [x] Decide single-target bundle policy for compiler product rules and adapter curation rules (ADR 0007)
- [x] Decide manifest-layer single-source-of-truth policy (no per-rule layer in manifest-scoped compile-time files; ADR 0008)
- [x] Decide full migration policy for product authoring format (`project-product` uses `product-rules/v1` only; ADR 0009)
- [x] DSL simplification slice 2: add explicit action-level defaults/shorthands with canonical expansion (no runtime inference)
- [x] DSL hardening follow-up: strict unknown-field rejection for canonical mapping selector/target/watcher nested shapes
- [ ] Add second real catalog source adapter when a concrete source format is available

## Phase 4: ZWJS Explorer + Curation TUI (In Progress)

- [x] Drafted reset MVP spec and implementation plan (`plan/tui-explorer-curation-spec.md`, `plan/tui-implementation-plan.md`)
- [ ] Section 4B: migrate tests/docs/help to simulate-centric workflow
- [ ] Section 6: rich simulation view integration in nodes and rules stacks
- [ ] Section 7: convergence review (separate stacks vs shared view primitives)
- [ ] Keep Homey adapter implementation frozen until Phase 4 reset completion

## Phase 5: Homey Adapter MVP (Next Major Area)

- [ ] Start only after compiler runtime-validation readiness milestone is met
- [ ] Define first supported Homey device/capability vertical slice using compiled profiles
- [x] Lock adapter curation persistence v1 policy: `this.homey.settings` + versioned payloads (`docs/decisions/0010-homey-adapter-curation-storage-v1.md`)
- [x] Lock adapter curation execution direction: persist materialized overrides, lower to runtime rules, execute with shared engine order semantics (`docs/decisions/0012-homey-curation-execution-via-runtime-rule-lowering.md`)
- [x] Lock adapter precedence/update direction: instance-scoped curation (`homeyDeviceId`) overrides baseline by default; baseline improvements are surfaced as user-adopted recommendations (`docs/decisions/0013-homey-device-instance-curation-precedence-v1.md`)
- [x] Lock recommendation detection policy: per-device baseline markers use canonical baseline profile hash changes to trigger recommendation prompts (`docs/decisions/0014-homey-baseline-recommendation-detection-v1.md`)
- [x] Lock canonical baseline hash projection contract: explicit field whitelist/canonicalization/versioning for recommendation markers (`docs/decisions/0015-homey-baseline-hash-canonical-projection-v1.md`)
- [x] Lock concrete `curation.v1` stored schema contract (entry map by `homeyDeviceId`, baseline marker embedding, strict schema validation semantics) (`docs/decisions/0016-homey-curation-v1-storage-schema.md`)
- [ ] Implement adapter execution of inbound/outbound mappings
- [ ] Device lifecycle/sync (discovery, create/update, mapping diagnostics)
- [ ] User curation application in Homey runtime

## Phase 6: Reliability + UX

- [ ] Non-production operational validation runs (zniffer/firmware) with captured fixtures
- [ ] Settings/diagnostics UI for compiler/profile inspection and curation
- [ ] Logging and support bundle workflow
- [ ] Performance tuning for compiler/rule volume and catalog scale

# Current Sprint

## Goal

Reach compiler runtime-validation readiness before Homey adapter implementation:
build the real layered rules pipeline (HA-derived + project generic/product rules), export compiled profiles, and validate them against live ZWJS data without on-the-fly compilation.

## In Progress

- Compiler-first completion push: real rules pipeline + compiled artifact workflow + live ZWJS validation

## Recently Completed

1. Completed Phase 2 HA import foundation:
   - `discovery.py` subset extractor in `packages/compiler`
   - extracted and generated HA artifact contracts
   - translation pipeline + tooling (`ha-import:extract`, `ha-import:report`)
   - semantic propagation (`assumed_state`, `allow_multi`, `entity_registry_enabled_default`)
   - pinned-source drift guard with current full coverage on local HA checkout
2. Built Phase 3 catalog tooling baseline:
   - `catalog-devices/v1` artifact contract + loader
   - `catalog` CLI (`fetch`, `normalize`, `merge`, `diff`, `validate`, `summary`)
   - conflict precedence (`warn|error`) and diagnostics formats
   - catalog index lookups (`catalogId`, product triple)
3. Integrated catalog context into compiler diagnostics:
   - `catalogLookup` in file-based compile results
   - `profile.catalogMatch` annotation in compiled profiles
   - catalog-aware curation hints and stable `diagnosticDeviceKey`
   - explicit file-based `unknownDeviceReport` diagnostics (known/unknown/no-catalog)
4. Closed Phase 3 scope decisions:
   - catalog/diagnostics foundation accepted for now
   - curation-seed generation explicitly deferred as unnecessary abstraction at this stage
   - added `compiler:inspect-live` to inspect compiled profiles directly from a live ZWJS instance
5. Clarified runtime curation ownership:
   - runtime curation patch schema/apply behavior belongs to the Homey adapter
   - compiler remains focused on compiled profiles + provenance/diagnostics
6. Added live compile inspection tooling (`compiler:inspect-live`) for rapid validation, with a follow-up decision to prefer compiled-artifact application for runtime-style inspection
7. Added compiler artifact build foundation:
   - `compiler:build` for `compiled-homey-profiles/v1`
   - compiler artifact contract/validation
   - `rules/` directory skeleton for real HA-derived + project rulesets
8. Added live ZWJS build mode to `compiler:build`:
   - compile one node or all nodes directly from a ZWJS instance into a `compiled-homey-profiles/v1` artifact
9. Tightened live compiler tooling defaults:
   - `compiler:build` and `compiler:inspect-live` now skip controller-like nodes by default (overrideable for diagnostics)
10. Replaced hardcoded HA overlap suppression with rule-owned conflict metadata:
    - capability actions support `conflict: { key, mode, priority }`
    - compiler resolves exclusive conflicts deterministically (layer + priority + stable tiebreak)
    - overlap report now records suppressed capability + winner capability attribution
11. Extended compiler diagnostics/explain output for conflict resolution:
    - `compiler:inspect`/`compiler:inspect-live` summary + markdown now show conflict suppression counts/details
    - `--explain` / `--explain-all` now includes conflict-win context per capability
    - NDJSON diagnostics now emit `conflictSuppression` records
12. Hardened canonical layered build pipeline behavior:
    - `compiler:build` now defaults to `rules/manifest.json` when no rules source flags are provided
    - rule/manifest inputs are validated for readability and duplicate file entries before compile
    - build artifacts now embed rule-source metadata and a deterministic pipeline fingerprint for reproducibility
13. Added first live-validated project-product overrides:
    - new `rules/project/product/live-network-overrides.json` for Shelly Wave Plug US (`1120:2:136`) and Springs CSZ1 shade (`622:17235:23089`)
    - regenerated canonical HA-derived rules so conflict metadata is present in checked-in generated rules
    - live validation moved 8 nodes to `curated` outcome (`compiler:inspect-live` with compiled artifact)
14. Added `remove-capability` rule action for targeted de-noising in product overrides:
    - compiler DSL/validation/runtime now supports product-layer capability removal (`replace` semantics)
    - used on Shelly Wave Plug US to remove noisy HA-derived `button_action` and generic meter `measure_generic`
    - live validation confirms curated plug profiles now expose focused capabilities (`onoff`, `measure_power`, `meter_power`)
15. Fixed HA-derived overmatching for multilevel dimmers:
    - HA extraction/translation pipeline now preserves `device_class_generic` / `device_class_specific` constraints from Home Assistant discovery schemas
    - compiler rule matching now evaluates device class constraints against normalized live node facts
    - regenerated `rules/ha-derived/home-assistant.zwave_js.generated.json`; live validation shows Leviton dimmers now classify as `light` instead of `curtain`
16. Added curated product overrides for Leviton dimmers on the live network:
    - added product-layer dimmer rules for `29:12801:1` (DZ6HD) and `29:65:2` (ZW6HD) in `rules/project/product/live-network-overrides.json`
    - normalized to curated `light` + `dim` mapping with explicit CC38 inbound/outbound transforms
    - added compiler regression coverage to ensure both signatures remain `curated light` and do not regress to cover capability mappings
    - live rebuild/inspection now shows Leviton light nodes promoted from `ha-derived` to `curated`
17. Curated the remaining live `ha-derived` switch/lock families:
    - added product-layer switch overrides for Leviton DZ15S (`29:13313:1`) and ZW15S (`29:66:2`) with explicit on/off inbound/outbound mappings
    - added product-layer lock override for Yale YRD226-family (`297:32770:1536`) preserving `locked` + `enum_select` capability mapping under curated lock identity
    - added root-manifest regression tests to lock expected curated outcomes for these signatures
    - live rebuild now reports `Outcomes: curated=33` for the current node set
18. Improved human-readable curation diagnostics ergonomics:
    - list output now suppresses technical-only review codes (`suppressed-fill-actions`, `high-unmatched-ratio`) to keep `Review` focused on actionable signals
    - summary/markdown output now expands technical diagnostics with plain-language explanations and top suppressed-slot examples
    - added tool-level regression tests for technical-reason rendering behavior
19. Closed the latest compiler code-review fix bundle before perf work:
    - hardened rule matcher validation at load time (`device`, `value`, `constraints`) to prevent runtime matcher-shape crashes
    - aligned `curationCandidates.likelyNeedsReview` with actionable reasons only (technical reasons still retained in diagnostics)
    - preserved HA alias `property_key` semantics (including cover position vs tilt groups), regenerated HA-derived rules, and added extractor/translator regressions
20. Completed first performance slice for authoring/inspection workflows:
    - `compiler:inspect-live` now preloads rule manifests once and reuses loaded rulesets across nodes (instead of reloading/parsing per node)
    - `compiler:bench` now preloads manifests once and reports one-time setup timing separately from steady-state compile timing
    - added core-tool regression coverage for loaded-ruleset reuse path
21. Completed second performance slice in compiler core runtime:
    - `compileProfilePlanFromLoadedRuleSetManifest` now caches flattened rule arrays per loaded manifest object
    - `compileDevice` now caches layer-sorted execution order per rules array instance
    - `compileProfilePlan` now caches catalog index builds per catalog artifact instance
    - added compiler regression tests for loaded-manifest flatten caching and catalog-index reuse
22. Completed third performance slice focused on matcher candidate pruning and benchmark reliability:
    - `compileDevice` now precomputes command-class rule candidate indexes and fast-paths impossible command-class matches to direct unmatched report entries
    - preserved report semantics (`rule-not-matched` entries remain emitted for pruned rules)
    - added compiler regression coverage for no-CC rules + pruned-CC unmatched behavior
    - fixed `compiler:bench --manifest ...` to resolve manifest rule paths relative to manifest location and added regression test coverage
23. Completed fourth performance slice for value matcher dimensions:
    - `compileDevice` candidate pruning now intersects command-class, property, and endpoint indexes before invoking full matcher evaluation
    - keeps deterministic rule order and unchanged unmatched reporting semantics
    - expanded compile-device regression coverage to include command-class/property/endpoint prune cases in one pass
24. Completed fifth performance slice for device-static rule gating:
    - `compileDevice` now precomputes per-rule device eligibility (`device` matcher + companion constraints) once per compile
    - rules that cannot match the current device are fast-pathed to unmatched action entries for each value without full matcher evaluation
    - preserves report parity (`rule-not-matched` semantics) and adds regression coverage for device/constraints mismatch paths
25. Completed sixth performance slice for unmatched-report allocation churn:
    - `compileDevice` execution plan now precomputes unmatched action templates per rule/action
    - unmatched fast paths now reuse templates and only append the dynamic `valueId` payload per action
    - added regression coverage for multi-action unmatched emission shape and layer/action typing parity
26. Completed seventh performance slice for per-value candidate allocation removal:
    - replaced per-value candidate mask allocations with reusable stamp-based candidate scratch buffers in `compileDevice`
    - candidate gating still intersects command-class/property/endpoint dimensions but now avoids per-value `Uint8Array` allocations
    - added regression coverage to ensure candidate marks do not leak across values
27. Completed eighth performance slice for report-summary accounting:
    - `compileDevice` now tracks applied/unmatched counters during action emission instead of re-scanning the full action array for summary fields
    - keeps summary semantics identical while removing post-pass `filter(...)` scans over report actions
    - added regression coverage asserting summary counters remain consistent with emitted actions
28. Completed ninth performance slice for valueId allocation reduction:
    - `compileDevice` now precomputes one cloned/frozen `valueId` snapshot per input value and reuses it across emitted action records for that value
    - removes repeated per-action `valueId` object cloning while preserving immutable report snapshots
    - added regression coverage for immutable snapshot behavior and input-mutation isolation
29. Completed tenth performance slice for report-light benchmark mode:
    - added `reportMode` support (`full`/`summary`) to `compileDevice` and propagated it through `compileProfilePlan`
    - summary mode skips per-action report entry emission while retaining deterministic compile outputs and summary counters
    - added `summary.totalActions` + `summary.appliedProjectProductActions` so unmatched-ratio and confidence derivation stay correct without action arrays
    - `compiler:bench` now forces summary report mode and regression coverage verifies option wiring
30. Completed eleventh performance slice for summary-mode candidate execution:
    - `compileDevice` summary mode now baseline-counts unmatched/total action volume and executes `applyRuleToValue` only for candidate rules
    - candidate execution is limited to command-class wildcard/exact seed sets and filtered by precomputed property/endpoint/device eligibility marks
    - keeps summary parity with full mode while removing full rule-array scans in summary-only runs
    - expanded compile-device regression coverage to include candidate-but-rule-not-matched parity (e.g. propertyKey mismatch)
31. Completed twelfth performance slice for summary-path action allocation removal:
    - introduced `applyRuleToValueSummary` to mutate build-state and compute changed-action counts without allocating per-action result records
    - `compileDevice` summary mode now uses the summary apply path (full mode still emits detailed `report.actions`)
    - preserves matched/unmatched accounting semantics used by confidence + curation diagnostics
    - added apply-rule parity tests for summary/full changed-action accounting and unmatched no-mutation behavior
32. Completed thirteenth performance slice for suppressed-action diagnostics gating:
    - `createProfileBuildState` now supports `collectSuppressedActions` and tracks `suppressedFillActionsCount` independently
    - summary-mode compiles disable suppressed-action record collection while keeping `summary.suppressedFillActions` semantics intact
    - removed per-compile `suppressedActions.filter(mode===fill)` post-pass scan in favor of incremental counting
    - expanded compile-device summary-mode tests to assert suppression-count parity with full mode when detailed suppression records are omitted
33. Completed fourteenth performance slice for profile-plan summary aggregation:
    - `compileProfilePlanFromLoadedRuleSetManifest` now caches immutable `ruleSources` metadata per loaded manifest instance
    - summary-mode profile-plan reports now skip grouped `byRule` / `bySuppressedSlot` aggregation and classification-provenance scans
    - preserves output shape and curation semantics while avoiding unnecessary per-iteration aggregation work in bench/bulk summary runs
    - added regression coverage for rule-source cache reuse + summary-mode grouping bypass behavior
34. Completed fifteenth performance slice for compile-loop value snapshot gating:
    - `compileDevice` now cleanly splits summary/full execution loops
    - summary-mode runs iterate live values directly and skip per-value cloned/frozen `valueId` snapshot preparation entirely
    - full mode preserves immutable `report.actions[].valueId` semantics by retaining snapshot reuse for emitted-action paths only
    - keeps full behavioral parity while removing avoidable allocation work from summary-only compile runs
35. Completed sixteenth performance slice for conflict-resolution fast-pathing:
    - `profile-build-state` now tracks whether any exclusive conflict metadata has been introduced during rule application (`hasPotentialConflicts`)
    - `resolveCapabilityConflicts` now short-circuits immediately when no potential exclusive conflicts exist
    - preserves overlap semantics while avoiding conflict-bucket scans on devices/rulesets that never emit exclusive conflict metadata
    - added state-level regression coverage for fast-path flag transitions (no-conflict vs exclusive-conflict rule application)
36. Completed seventeenth performance slice for summary candidate seed iteration:
    - `compileDevice` execution plan now precomputes merged command-class candidate seed lists for summary-mode evaluation (`summarySeedByCommandClass`)
    - summary mode now iterates a single precomputed seed list per value (wildcard + exact command-class indices) and removes per-value visited-mark dedupe tracking
    - keeps deterministic execution and parity while reducing summary hot-loop branching/work
    - added regression coverage for duplicate command-class matcher tokens to ensure summary mode does not double-apply rules
37. Completed eighteenth performance slice for summary candidate property specialization:
    - `compileDevice` execution plan now precomputes summary candidate seeds by `(commandClass, property)` plus fallback seeds for command-class-only and unknown-command-class cases
    - summary mode now selects one precomputed seed set per value and only applies endpoint + device-eligibility gates before invoking `applyRuleToValueSummary`
    - removes property-dimension checks from the summary hot loop while preserving deterministic ordering/parity
    - added regression coverage for duplicate property matcher tokens to ensure summary mode does not double-apply rules
38. Completed nineteenth performance slice for summary candidate endpoint specialization:
    - `compileDevice` execution plan now precomputes summary candidate seeds by full selector `(commandClass, property, endpoint)` with wildcard expansion into known rule-domain tokens for parity-preserving fast lookup
    - summary mode now resolves one precomputed selector seed per value and drops all candidate-mark stamping/gating on command-class/property/endpoint dimensions (device-eligibility gating remains)
    - preserves deterministic parity across endpoint-specific and wildcard-endpoint rules while simplifying summary hot-loop logic
    - added regression coverage for duplicate endpoint matcher tokens and endpoint-specific + wildcard parity behavior
39. Completed twentieth performance slice for compact summary seed modeling + selector caching:
    - replaced wildcard-expanded summary seed generation with compact 8-bucket selector modeling (`CPE`, `CP`, `CE`, `C`, `PE`, `P`, `E`, `ANY`)
    - added per-plan selector cache keyed by `(commandClass, property, endpoint)` to memoize merged candidate seeds for repeated selectors
    - summary runtime now resolves one cached seed per selector and executes candidate rules directly with device-eligibility gating
    - preserves deterministic ordering/parity while reducing summary plan-build memory blow-up from wildcard expansion
    - added regression coverage for repeated-selector wildcard parity behavior
40. Completed twenty-first performance slice for selector-cache bounding:
    - bounded `compileDevice` summary selector cache to a fixed maximum (`1024` entries) with FIFO eviction of oldest cached selector keys
    - preserves selector-cache hit behavior while preventing unbounded cache growth on long heterogeneous runs
    - added eviction-focused regression coverage using >1k unique selectors to validate summary/full parity under cache churn
41. Completed twenty-second performance slice for selector key churn removal:
    - replaced concatenated-string summary buckets/cache keys with nested map structures keyed by native selector dimensions (`commandClass`, typed `property`, `endpoint`)
    - preserved compact 8-bucket precedence model (`CPE`, `CP`, `CE`, `C`, `PE`, `P`, `E`, `ANY`) while removing per-lookup string key construction for merged-seed/cache access
    - retained FIFO cache bounding semantics and deterministic candidate ordering
    - added regression coverage for numeric-vs-string property token parity under summary caching
42. Completed twenty-third performance slice for summary counter accounting simplification:
    - summary mode now computes unmatched counts directly from per-selector candidate action totals plus candidate non-match/ineligible paths, instead of baseline-all-actions then subtracting matched actions
    - `compileDevice` now precomputes per-rule action counts in execution entries and exposes per-selector cached seed action totals (`SummarySeedSelection.actionCount`)
    - kept total action accounting exact (`totalActionCountPerValue * valueCount`) while reducing per-value arithmetic churn in summary loops
    - added regression coverage for mixed matched/unmatched multi-action selector sets to lock full/summary counter parity
43. Completed twenty-fourth performance slice for summary eligible-seed prefiltering:
    - added compile-local eligible selector cache that filters summary candidate seeds through `deviceEligibleMask` once per selector and stores precomputed eligible action totals
    - summary runtime now iterates only eligible rule indices (no per-rule eligibility branch in the hot loop)
    - preserves direct unmatched accounting by combining non-candidate remainder with candidate non-match paths
    - added regression coverage for device-ineligible multi-action rules to lock summary/full counter parity under ineligible-rule-heavy selectors
44. Completed twenty-fifth performance slice for selector-cache eviction complexity:
    - replaced `summarySelectorCacheOrder.shift()` behavior with a head-index FIFO queue for bounded selector-cache eviction in `compileDevice`
    - added queue compaction thresholding so eviction remains amortized O(1) without unbounded tombstone growth in long-running heterogeneous selector churn
    - hardened eviction fallback to recover cleanly if queue/counter state ever diverges
    - expanded regression coverage with sustained selector-churn parity checks (multi-round >cache-capacity runs, repeated summary compiles)
45. Completed twenty-sixth performance slice for all-eligible summary fast path:
    - `compileDevice` now computes `{ mask, hasIneligibleRules }` once and uses a direct summary-seed path when every rule is device-eligible
    - all-eligible summary mode now skips compile-local eligible-seed filtering/cache construction and executes directly against base selector seeds
    - retained existing filtered path for mixed/ineligible rule sets; unmatched/applied counters remain parity-safe across both paths
    - added regression coverage that reuses a cached execution plan across eligible and ineligible devices and asserts full/summary parity
46. Completed twenty-seventh performance slice for sparse device-eligibility evaluation:
    - `compileDevice` execution plans now precompute `deviceEligibilityRuleIndices` so only rules with device/companion constraints are evaluated per device
    - device eligibility is now represented as a sparse ineligible mask (`1` = ineligible), allocated only when at least one constrained rule fails
    - summary/full compile paths now branch on `hasIneligibleRules` to skip per-rule eligibility checks entirely when all constrained rules pass
    - preserves full/summary parity and avoids unnecessary matcher work for unconstrained rule-heavy rule sets
47. Completed twenty-eighth performance slice for selector-merge dedupe allocation removal:
    - replaced `Set`-based selector merge dedupe in `resolveSummaryCandidateSeed` with stamp-based `Uint32Array` marks stored in the execution plan
    - summary selector resolution now avoids per-miss hash-set allocation while preserving deterministic merged-rule ordering
    - added overflow-safe mark-stamp rollover handling to prevent stale dedupe marks on long-running plan reuse
    - added regression coverage to ensure selector-merge marks do not leak across consecutive selector resolutions
48. Completed twenty-ninth performance slice for candidate apply-path matcher narrowing:
    - added `applyRuleToValueAssumingDeviceEligible` and `applyRuleToValueSummaryAssumingDeviceEligible` so compile loops can skip redundant device/companion re-checks for candidate rules
    - `compileDevice` now uses the assume-eligible apply paths after precomputed eligibility gating in both summary and full modes
    - refactored apply-rule internals with matched-rule helpers to preserve existing external semantics for `applyRuleToValue`/`applyRuleToValueSummary`
    - preserves report parity while reducing repeated matcher work in hot candidate-apply paths
49. Completed thirtieth performance slice for selector-gated value matcher narrowing:
    - introduced `matchesValueAfterSelectorGates` to evaluate only residual value predicates (`propertyKey`, `notPropertyKey`, metadata/read-write flags) after selector candidate gating
    - assume-eligible apply paths now use the narrowed matcher to avoid re-checking command-class/property/endpoint constraints already enforced by compile-time candidate selection
    - retained `matchesValue` semantics by delegating to the residual matcher after selector predicates, preserving existing behavior for non-optimized call sites
    - preserves compile parity while reducing redundant per-candidate predicate work in summary/full hot paths

## Next Tasks

1. Run canonical `compiler:build` pipeline against larger live node sets and review profile outcomes + curation diagnostics
2. Continue widening HA-derived rules coverage and selector semantics against live nodes
3. Tune remaining high-suppression/high-unmatched curated profiles (e.g. keep useful capabilities and suppress noisy ones where policy is clear)
4. Use `compiler:inspect-live --compiled-file ...` to validate compiled artifacts on real ZWJS data
5. Keep project-generic rules minimal/provisional; likely move generic fallback inference policy into the Homey adapter
6. Defer Homey adapter implementation until compiler runtime-validation readiness milestone is reached

## Risks / Unknowns

- Catalog source conflicts will grow as new real sources are added (official catalog, `zwave-js` config exports, observed captures)
- Compiler performance may degrade as HA-derived + project rules + catalog-aware diagnostics scale up
- Risk of overloading compiler behavior with catalog heuristics before precedence policy is explicitly designed
- Risk of boundary drift if runtime curation semantics are reintroduced into compiler package
- Risk of delaying adapter work if generic fallback inference policy remains split between compiler and adapter

## Notes

- Homey compiler architecture and phase progress:
  - `plan/homey-translation-compiler-plan.md`
- Current system architecture overview:
  - `docs/architecture.md`
- Documentation sync contract (readme/plan/docs update expectations):
  - `README.md` (Documentation Sync Contract section)
- Diagnostic CLIs support:
  - `summary`, `markdown`, `json`, `json-pretty`, `json-compact`, `ndjson`

# Current Sprint

## Goal

Reach compiler runtime-validation readiness before Homey adapter implementation:
build the real layered rules pipeline (HA-derived + project generic/product rules), export compiled profiles, and validate them against live ZWJS data without on-the-fly compilation.

## In Progress

- Phase 4 reset execution (before Homey adapter implementation):
  - follow with dual-root rich TUI implementation (`--url` nodes root, `--rules-only` rules root)
  - complete scaffold edit mode in panel TUI before convergence review
  - keep Homey adapter implementation paused until reset sections are complete

## Recently Completed

- Latest TUI values UX slices:
  - added section-level value semantics (`controls`, `sensors`, `events`, `config`, `diagnostic`, `other`)
  - values pane now renders by subsection in expanded mode and subsection previews in collapsed mode
  - added numeric subsection toggles (`1`-`6`) to collapse/expand individual value subsections
  - improved detail readability by reflowing long neighbor/value rows to pane width

- Latest TUI slice:
  - migrated panel rendering fully to `neo-blessed` widgets/layout
  - removed custom `panel-layout` renderer path and raw-data fallback quit path
  - updated panel tests to assert render snapshots (renderer-agnostic) while keeping behavior coverage
  - removed standalone panel key parser module and now route panel actions from `neo-blessed` keypress events directly
  - switched panel list/detail/bottom panes to native widget scrolling/selection behavior

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
50. Completed post-review correctness fix for malformed selector arrays:
    - `matchesValueAfterSelectorGates` now explicitly rejects empty selector arrays (`commandClass`, `property`, `endpoint`) to preserve matcher semantics in assume-eligible fast paths
    - prevents malformed in-memory rules from being treated as wildcard matches by candidate gating when invoking `compileDevice` directly
    - added full+summary regression coverage asserting empty-selector matcher rules always emit `rule-not-matched` outcomes and never apply capabilities
51. Completed live runtime-validation loop CLI slice:
    - added `compiler:validate-live` (`tools/homey-compile-validate-live*.mjs`) to run build+apply validation in one command
    - command now writes both the compiled artifact and a markdown validation report (outcomes, review reasons, top unmatched/suppressed signatures, node snapshot)
    - reuses existing build + live inspect tooling with compiled-artifact apply mode to keep runtime-style validation behavior consistent
    - added core-tool regression coverage for CLI parsing and end-to-end validation report generation
52. Completed runtime-validation quality gate slice:
    - extended `compiler:validate-live` with optional fail-fast thresholds (`--max-review-nodes`, `--max-generic-nodes`, `--max-empty-nodes`) and repeated reason gating (`--fail-on-reason`)
    - added optional machine summary artifact output (`--summary-json-file`) for CI/dashboard consumption with counts, top diagnostics, and gate outcomes
    - command now exits non-zero when configured gates are violated, while still writing artifact/report/summary outputs for triage
    - added regression coverage for gate parsing, summary JSON generation, and failure semantics when thresholds are exceeded
53. Completed runtime-validation gate setup documentation slice:
    - added `docs/compiler-validation-gates.md` with baseline collection process, threshold calibration guidance, and practical gate examples
    - documented failure semantics and expected triage workflow when gates fail but artifacts/reports are still emitted
    - linked gate setup docs from README live-validation section and architecture/docs index for discoverability
54. Completed runtime-validation gate profile slice:
    - added `--gate-profile-file` to `compiler:validate-live` so gate and output settings can be loaded from JSON
    - gate profile supports thresholds/reasons and output paths (`artifactFile`, `reportFile`, `summaryJsonFile`) with profile-relative path resolution
    - established deterministic precedence: CLI flags override profile values; profile values override tool defaults
    - expanded tool regression coverage for profile loading, CLI override behavior, and invalid profile validation
55. Completed runtime-validation effective-gate diagnostics slice:
    - added `--print-effective-gates` to `compiler:validate-live` to print resolved gate/output config before execution
    - output reflects final precedence resolution (CLI > gate profile > defaults) for thresholds, reasons, and output paths
    - expanded tool regression coverage for parse wiring and runtime diagnostics logging behavior
56. Completed runtime-validation compiled-artifact reuse slice:
    - added `--compiled-file` mode to `compiler:validate-live` to reuse an existing compiled artifact and skip the build phase
    - parser now enforces clear mode boundaries (`--compiled-file` cannot be combined with rules-source flags or `--artifact-file`)
    - runtime now reads the provided compiled artifact and runs apply/gate/report flow unchanged, with explicit "Using compiled artifact" logging
    - expanded tool regression coverage for parse mode selection/conflict validation and build-skip runtime behavior
57. Completed runtime-validation offline summary replay slice:
    - added `--input-summary-json-file` mode to `compiler:validate-live` to re-evaluate gates from an existing summary artifact without any live ZWJS/build/apply work
    - summary-input mode now enforces explicit flag boundaries (disallows live/build flags) to keep offline behavior deterministic
    - runtime now loads summary counts/reason histograms, evaluates configured gates, and can optionally write refreshed summary JSON via `--summary-json-file`
    - expanded tool regression coverage for summary-input parsing and offline gate-evaluation execution path
58. Completed runtime-validation baseline regression-gate slice:
    - added `--baseline-summary-json-file` support to `compiler:validate-live` so current runs can be compared against a baseline summary artifact
    - added delta-gate controls: `--max-review-delta`, `--max-generic-delta`, `--max-empty-delta`, and `--fail-on-reason-delta <reason>:<delta>`
    - gate profile schema now supports baseline/delta config (`max*Delta`, `failOnReasonDeltas`, `baselineSummaryJsonFile`) with CLI override precedence preserved
    - machine summary JSON now includes baseline counts and computed deltas; CLI logs now print baseline source + delta snapshot when enabled
59. Completed baseline markdown diagnostics slice:
    - live/compiled validation markdown reports now include `Baseline Delta` and `Reason Deltas` sections when baseline mode is active
    - report header now includes baseline summary source for traceability
    - expanded tool regression coverage to assert baseline-delta markdown output shape
60. Completed baseline snapshot helper slice:
    - added `--save-baseline-summary-json-file` to `compiler:validate-live` so the current run can directly emit a baseline-ready summary artifact
    - helper works across live-build, compiled-artifact reuse, and summary-input replay modes
    - CLI now logs the saved baseline path when written; parser validates required path value
    - expanded tool regression coverage for save-baseline parsing and offline replay write behavior
61. Completed validation artifact-retention slice:
    - added `--artifact-retention keep|delete-on-pass` to `compiler:validate-live` with gate-profile support (`artifactRetention`)
    - default retention remains `keep`; `delete-on-pass` removes generated live-build compiled artifacts only after gates pass
    - machine summary/effective-gates output now include retention config for reproducibility
    - expanded tool regression coverage for parse wiring and delete-on-pass runtime behavior
62. Completed baseline workflow wrapper slice:
    - added `compiler:baseline` (`tools/homey-compile-baseline*.mjs`) to orchestrate baseline capture + immediate recheck in one command
    - wrapper emits timestamped baseline/recheck artifacts under `plan/baselines/` (configurable output dir/stamp)
    - recheck stage enforces delta gates (default strict zero deltas) and supports optional gate-profile + reason-delta flags
    - baseline workflow defaults artifact retention to `delete-on-pass` to avoid local compiled-artifact bloat
63. Completed runtime-validation redacted-share output slice:
    - added share-safe output support to `compiler:validate-live` (`--redact-share`) with optional explicit output paths (`--redacted-report-file`, `--redacted-summary-json-file`)
    - redacted markdown hides URL/path/node identifiers while preserving diagnostics structure for review
    - redacted machine summary JSON now emits sanitized source/config paths and URL-safe metadata (`redaction.mode=share`)
    - gate profiles now support redaction output fields (`redactShare`, `redactedReportFile`, `redactedSummaryJsonFile`) with normal CLI precedence
64. Completed baseline-workflow redacted-share parity slice:
    - extended `compiler:baseline` with `--redact-share` so baseline capture and recheck can emit share-safe artifacts in one run
    - added stage-specific redacted output overrides (`--baseline-redacted-report-file`, `--baseline-redacted-summary-json-file`, `--recheck-redacted-report-file`, `--recheck-redacted-summary-json-file`)
    - baseline wrapper now forwards redaction flags into both internal `compiler:validate-live` stages with deterministic default redacted paths
    - added parse/orchestration regression coverage for redaction wiring and invalid flag combinations
    - summary command supports ranked list/markdown/json/ndjson outputs for quick curation prioritization
    - scaffold command emits starter `project-product` identity-rule snippets for a selected product-triple signature
65. Completed signature-targeted validation loop slice:
    - added `--signature <manufacturerId:productType:productId>` filter support to `compiler:inspect-live` and `compiler:validate-live`
    - live inspection now skips non-matching nodes before compile/apply, enabling focused triage on a single product signature
    - expanded parse/runtime regression coverage for signature flag validation, summary-input incompatibility, and inspect/validate wiring
    - diff mode defaults to `--only worsened` and supports fallback-to-summary selection (`--fallback summary|none`)
66. Completed signature loop wrapper slice:
    - wrapper forwards non-loop flags into inspect/validate parsers and defaults to `rules/manifest.json` when no rules source flags are provided
    - added `compiler:loop --dry-run` to resolve signature + validate command shapes without executing inspect/validate network flows
    - loop output now reports dry-run status and treats gate status as `n/a` when no live execution occurred
    - default policy is now `curation`, so next-target selection ignores technical-pressure-only signatures unless explicitly requested
    - pressure policy remains available for optimization passes (`suppressed/unmatched` tuning) when curation is already clean
67. Started DSL simplification slice 1 (deterministic compact matcher syntax):
    - rule loader/validator now accepts scalar matcher inputs for device/value/constraint fields and normalizes them to canonical array forms at load-time
    - supported scalar shorthand includes: `manufacturerId`, `productType`, `productId`, `deviceClassGeneric`, `deviceClassSpecific`, `commandClass`, `endpoint`, `property`, `propertyKey`, `notPropertyKey`, and `metadataType`
    - added regression fixture coverage to verify compact syntax expansion and preserved strict invalid-shape rejection for malformed matcher types
68. Added rule grammar/vocabulary reference doc:
    - documented current canonical rule grammar, matcher/action vocabulary, layer/mode semantics, and deterministic shorthand expansion policy
    - captured simplification direction for filesystem/manifest-driven layer inference and product-targeted rule bundle shape
69. Locked compiler rule boundary decision:
    - compile-time rule scope is manifest-owned (`rules/manifest.json`)
    - non-manifest rules are runtime/Homey-adapter scope
    - broad rule-defaults abstraction is deferred in favor of structured context (manifest layer + product-target bundles)
70. Locked manifest-first workflow decision:
    - canonical compiler workflows should run manifest-first (`--manifest-file` or default manifest)
    - ad-hoc `--rules-file` usage is treated as non-canonical local experimentation only
71. Locked single-target bundle decision for product + curation:
    - compiler product rules should be authored as one-target bundles (top-level product triple, inherited by contained rules)
    - adapter curation rules should be one-target bundles (product triple or `diagnosticDeviceKey`)
    - per-rule/per-entry target overrides are disallowed in bundle scope for v1
72. Locked manifest-layer single-source-of-truth decision:
    - manifest-scoped compile-time files must not declare per-rule `layer`
    - manifest entry layer is the only authoring-time source; canonical internal expansion may still include explicit layer for diagnostics
73. Locked full migration decision for product-rule format:
    - `project-product` compile-time authoring migrates fully to `product-rules/v1` single-target bundles
    - no legacy raw-array product rule authoring path remains as a canonical supported format
74. Migrated live product overrides to `product-rules/v1` per-target bundles:
    - replaced `rules/project/product/live-network-overrides.json` with one bundle file per product triple
    - updated `rules/manifest.json` to enumerate all per-target product bundle files
    - updated compiler rule loading/validation to enforce manifest-owned layer, product bundle requirements, and bundle target inheritance
75. Drafted unified ZWJS Explorer + Curation TUI spec:
    - documented MVP scope, screens, backend integration, safety model, and phased slices
76. Locked Homey adapter curation persistence for v1:
    - selected `this.homey.settings` as the single persistence backend for adapter curation deltas
    - documented versioned payload policy (`curation.v1`) and adapter-owned migration expectation
    - recorded backend abstraction expectation (`loadCuration`/`saveCuration`) for future backend swap without apply-logic churn
77. Locked Homey adapter curation execution direction for v1:
    - curation source-of-truth remains persisted materialized overrides
    - adapter lowers overrides into in-memory runtime curation rules at runtime
    - runtime execution reuses rules engine semantics (generic first, curation second)
78. Locked Homey adapter precedence/update direction for v1:
    - curation is instance-scoped (`homeyDeviceId`) and remains authoritative over compiler baseline updates
    - pairing starts from compiler baseline; user curation becomes device-static effective override
    - when baseline improves, adapter surfaces recommendation/adopt flow instead of auto-replacing local curation
79. Locked baseline recommendation detection policy for v1:
    - store per-device baseline markers (`pipelineFingerprint` + canonical baseline profile hash)
    - recommendation prompts are based on canonical hash changes, not timestamp-only artifact churn
    - missing legacy markers are backfilled without raising prompt on first backfill pass
80. Locked canonical baseline hash projection contract for v1:
    - defined exact semantic field whitelist for hash projection (classification identity, capabilities mapping surface, subscriptions, ignored values)
    - defined explicit canonicalization rules (capability sort, key sort, undefined-drop, null-preserve, stable value-id normalization policy)
    - versioned marker contract (`projectionVersion`) with no-prompt backfill on projection-version migrations
81. Locked concrete `curation.v1` stored schema contract for v1:
    - top-level storage key/value shape (`schemaVersion`, `updatedAt`, `entries` map keyed by `homeyDeviceId`)
    - entry contract includes `targetDevice`, `baselineMarker`, `overrides`, optional note/metadata
    - strict validation rules (unknown-field reject, key/target match, add/remove overlap reject, deterministic dedupe)
82. Completed compiler DSL simplification slice 2 (action shorthand canonicalization):
    - added deterministic action shorthand expansion for capability mappings:
      - inbound value-id shorthand -> canonical `{ kind: "value", selector: ... }`
      - inbound event shorthand (`eventType`) -> canonical `{ kind: "event", selector: ... }`
      - outbound value-id shorthand -> canonical `{ kind: "set_value", target: ... }`
      - outbound command shorthand (`command`) -> canonical `{ kind: "zwjs_command", target: ... }`
    - added `device-identity.driverId` alias normalization to `driverTemplateId`
    - hardened malformed action-shorthand validation with clear load-time errors
    - added fixture-backed regression tests and docs updates (`README.md`, `docs/rules-grammar.md`)
83. Completed compiler review pass + newcomer cold-start DSL usability audit:
    - reviewed compiler rule-loading/validation behavior after shorthand additions
    - hardened capability mapping schema validation to reject unsupported fields and malformed canonical mapping metadata
    - added regression coverage for post-expansion unknown-field rejection in shorthand mappings
    - ran no-context authoring exercise from docs for product+generic rules; resulting ergonomics updates:
      - refreshed `CONTRIBUTING.md` minimal example to use new shorthand and alias forms
      - added explicit shorthand/alias expansion notes for newcomer clarity
84. Completed DSL review hardening follow-up for nested canonical mapping shapes:
    - capability inbound/outbound canonical `selector`/`target` payloads now reject unknown nested fields
    - inbound watcher entries now validate strict value-id/event selector shapes
    - strict nested-shape validation also applied to `ignore-value.valueId`
    - added fixture-backed regression coverage for unsupported canonical selector/target fields
    - updated grammar/readme docs to make strict nested mapping semantics explicit
85. Completed Phase 4 TUI slice 1 (app shell + connect + node list/detail, read-only):
    - introduced `@zwavejs2homey/tui` package with view/presenter/service layering
    - added read-only ZWJS explorer service adapter over core client (`connect`, `listNodes`, `getNodeDetail`, `disconnect`)
    - added presenter state transitions and run-log tracking for connect/refresh/show workflows
    - added interactive shell command loop via `npm run compiler:tui` (`list`, `refresh`, `show <nodeId>`, `help`, `quit`)
    - added slice-1 tests (presenter transitions, service adapter behavior, and app smoke path)
    - folded TUI package tests/build into root workspace quality gates (`npm run check`)
    - introduced parent+child presenter workflow split (`packages/tui/src/presenter/*`) over service/core layers
    - added signature workflow commands:
      - `signature [triple] [--from-node <id>]`
      - `inspect [--manifest <file>]`
      - `validate [--manifest <file>]`
    - added compiler curation service integration for signature inspect/validate via existing tool libs
      - `scaffold preview [--product-name ...]`, `scaffold write [filePath] --force`
    - scaffold writes are path-guarded to `rules/project/product/*` and require explicit confirmation (`--force`)
    - added run-log command (`log [--limit N]`) and per-command error handling so interactive sessions continue after failures
    - expanded TUI tests for child-presenter delegation, command parsing, and presenter/app signature-curation flows
86. Completed Phase 4 TUI slice 6 (manifest helper + run-log polish):
    - added manifest helper command:
      - `manifest add [filePath] [--manifest <file>] --force`
    - manifest writes are confirmed and path-guarded through workspace file service
    - manifest helper deduplicates existing entries and enforces layer consistency for product entries
    - added workspace status snapshot command (`status`) for fast iteration context
    - expanded tests for manifest confirmation/delegation and status/command parsing coverage
87. Locked Phase 4 reset plan and navigation decisions:
    - core CLI contract changes now execute before TUI follow-up work
    - accepted hard rename from `compiler:loop` to `compiler:simulate`
    - locked dual-root startup model:
      - `--url` => live nodes root
      - `--rules-only` (+ optional `--manifest-file`) => rules root
    - locked simulation-centric curation flow for both roots, with rich simulation result view in TUI
    - locked implementation sequencing and convergence checkpoint (`plan/tui-implementation-plan.md`)
88. Synced docs/plans with the Phase 4 reset direction:
    - rewrote `plan/tui-implementation-plan.md` with locked section ordering (4A/4B core CLI first, then TUI sections)
    - updated roadmap/current-focus to track reset execution instead of prior slice-complete state
89. Completed Section 4A cutover part 1 (`compiler:simulate` rename):
    - added new `compiler:simulate` CLI command and renamed loop library/wrapper to `homey-compile-simulate*.mjs`
    - removed `compiler:loop` npm script and loop tool files
    - migrated loop-tool regression coverage to `homey-compile-simulate-tool.test.js`
    - simplified `compiler:simulate` to explicit-signature mode only (`--signature` required)
    - updated simulate parser/runtime tests and readme/architecture notes to match signature-only simulate behavior
90. Completed Section 4B tests/docs/help migration:
    - enforced strict CLI flag validation across `compiler:validate-live`, `compiler:baseline`, and `compiler:simulate` (unknown/removed flags fail fast with explicit errors)
    - updated parser regression coverage for removed/unsupported flag cases
    - aligned user-facing docs/help with simulate-centric wording and scaffold preview class override support
    - synced roadmap and TUI implementation plan to mark Section 4B complete
91. Completed Phase 4 Section 6A (dual-root shell simulation integration):
    - added TUI startup routing with explicit mode in session config:
      - nodes root (`--url ...`)
      - rules root (`--rules-only [--manifest-file ...]` with optional `--url` for live simulation)
    - added rules stack support:
      - manifest rule listing and rule detail inspection
      - signature selection from rule targets (`signature --from-rule <index>`)
    - integrated `simulate` command across both roots, wired to `compiler:simulate` via curation service
    - expanded renderers/help for rules root and simulation summaries
    - extended tests: parser/app/rules-presenter/workspace-file-service coverage for dual-root + simulate flow
    - synced roadmap and implementation plan to mark Section 6A complete, and leave Section 6B (panel-rich UI) pending
92. Started Phase 4 Section 6B (panel-first rich UI) first slice:
    - added default panel UI runtime (`--ui panel`) with shell fallback (`--ui shell`)
    - introduced full-screen panel frame rendering and key-intent mapping modules
    - implemented panel event loop for nodes/rules roots on top of existing presenters/services
    - wired panel actions for refresh/open/inspect/validate/simulate/scaffold preview plus confirmed write helpers (`W` scaffold write, `A` manifest add)
    - added panel view/runtime tests (`panel-view`, `panel-app`) and updated CLI arg tests for ui mode
93. Completed Section 6B list ergonomics slice:
    - added viewported list navigation ergonomics:
      - page movement (`pgup`/`pgdn`) and boundary jumps (`home`/`end`)
      - stable selection persistence by item key across filtering/refresh
    - added interactive panel filter mode (`/`) with inline query editing and match counts
    - hardened quit/data handling to avoid arrow-sequence misclassification while preserving fallback quit paths
    - added/expanded panel tests for filtering, viewport scrolling, and low-level key parsing
94. Completed remaining Section 6B rich-panel slices:
    - richer detail panes:
      - panel-optimized node detail renderer with value previews
      - panel-optimized rule detail renderer with concise rule/action summaries
      - panel-optimized validation/simulation summaries for bottom-pane readability
    - safer curation write UX:
      - explicit in-panel two-step confirmation flow for scaffold write (`W`) and manifest add (`A`)
    - diagnostics UX:
      - active operation tracking in panel footer
      - cancel support (`c`) for running operations
      - timeout handling with configurable panel timeout for tests and deterministic timeout reporting
    - expanded panel tests:
      - confirmation workflow coverage
      - cancel workflow coverage
      - timeout workflow coverage
95. Completed Section 6C foundation slice (before full edit UX):
    - added scaffold edit-mode scaffolding in panel (`e` enter, `esc` exit)
    - added draft-editor state/model APIs in presenters (nodes + rules) with initial validation/commit lifecycle
    - added panel + presenter regression tests for edit-mode entry and draft-editor mutation/commit behavior
96. Completed Section 6C metadata editing slice:
    - panel draft editor now supports typed edits for scaffold metadata fields (`productName`, `homeyClass`, `ruleIdPrefix`, `fileHint`)
    - edit interactions now support field selection (`up/down`), select-field cycling (`left/right`), and text field editing (`enter`, type, `enter`)
    - `esc` in edit mode now commits draft editor state before returning to detail mode
    - panel test harness updated for arrow-left/right key mapping and metadata edit flow coverage
97. Completed Section 6C capability rows + typed capability field editing slice:
    - draft editors (nodes + rules presenters) now support capability row add/clone/remove/reorder operations
    - capability field editing is typed for `capabilityId` and `directionality` (`bidirectional` / `inbound-only` / `outbound-only`)
    - panel edit mode now supports capability operations with direct key actions (`+`, `*`, `-`, `<`, `>`)
    - validation now includes capability row constraints (`capabilityId` required, directionality validity, duplicate capability warnings)
    - added presenter + panel regression tests for capability row operations and defaults
98. Completed panel chrome presenter slice (view/presenter separation step):
    - extracted header/footer contextual help generation into a dedicated presenter (`PanelChromePresenter`)
    - `runPanelApp` now consumes presenter-produced chrome view-model output instead of composing footer/header directly in the view loop
    - added focused regression coverage for panel chrome contexts (filter, detail, scaffold edit, confirm/cancel hints)
99. Completed panel layout presenter slice (view/presenter separation step):
    - extracted list/detail/output pane title composition into a dedicated presenter (`PanelLayoutPresenter`)
    - `runPanelApp` now consumes presenter-produced pane title view-model output for list/detail/output labels
    - added focused regression coverage for list pagination/filter titles, detail range titles, and compact-vs-expanded output labels
100. Completed panel output presenter slice (view/presenter separation step):
    - extracted bottom-pane output shaping (line split, scroll clamp, compact/full visible lines) into a dedicated presenter (`PanelOutputPresenter`)
    - `runPanelApp` now consumes presenter-produced output view-model data for status-bar compact rendering, full output pane rendering, and panel snapshots
    - added focused regression coverage for compact/full output behavior and scroll clamping edge cases
101. Completed Section 6C typed mapping editor slice:
    - draft editors (nodes + rules presenters) now support typed inbound/outbound mapping field edits per capability
    - mapping kinds are typed/selectable (`inbound: value|event`, `outbound: set_value|invoke_cc_api|zwjs_command`) with path-specific field coercion
    - command-class/endpoint fields are validated/coerced as integers at edit time; property/propertyKey fields are normalized as string|number
    - panel draft editor now exposes selector/target mapping fields and capability-level inbound/outbound mapping summaries
    - added presenter regression coverage for mapping field edits and invalid numeric input rejection
102. Completed Section 6C live validation + write gating slice:
    - panel draft editing now surfaces validation status in update feedback (`Validation: ok|warnings|errors`)
    - scaffold write (`W`) and manifest add (`A`) now validate active draft state before confirmation/write
    - write actions are blocked when draft errors exist; warning-only drafts remain writable with warning context on confirmation
    - added panel regression coverage for write-block-on-errors and warning-only write flow
103. Completed Section 6C in-panel diff preview slice:
    - first-step write confirmations (`W`/`A`) now include draft diff preview context (`baseDraft` -> `workingDraft`) before execution
    - diff preview summarizes change counts (`+/-/~`) and includes deterministic path-level change lines with truncation guards
    - warning-first + diff preview messaging now renders in compact and expanded bottom panes
    - added panel regression coverage for changed-draft preview and no-change preview confirmation flows

## Next Tasks

1. Execute Section 6C scaffold edit mode:
   - expand panel tests for draft edit flows
   - follow with data-driven vocabulary cutover:
     - audit hardcoded TUI/presenter type vocab (Homey classes, capability IDs, directionality)
     - determine source-of-truth strategy per vocab (SDK-derived vs compiler artifact vs intentionally static)
     - replace hardcoded typed-select vocab with data providers/artifacts where feasible
     - keep strict editor-time validation/erroring for unsupported values
2. Plan compiler-managed Homey vocabulary artifact pipeline:
   - add a compiler-produced vocabulary artifact for authoring enums (classes/capability IDs) with provenance
   - wire artifact consumption into TUI draft editor selects and compiler-side rule validation
   - keep static/deterministic generation (no runtime dependency on Homey cloud/API)
3. Execute Section 7 convergence review:
   - decide whether to keep separate stacks or extract shared view primitives
4. Keep Homey adapter implementation paused until Phase 4 reset is complete

Note:

- Section 7 is intentionally blocked until Section 6C scaffold edit mode is complete.

## Risks / Unknowns

- Catalog source conflicts will grow as new real sources are added (official catalog, `zwave-js` config exports, observed captures)
- Compiler performance may degrade as HA-derived + project rules + catalog-aware diagnostics scale up
- Risk of overloading compiler behavior with catalog heuristics before precedence policy is explicitly designed
- Risk of boundary drift if runtime curation semantics are reintroduced into compiler package
- Risk of boundary drift if compiler-side generic rules grow beyond provisional static coverage and blur adapter-owned fallback policy

## Notes

- Homey compiler architecture and phase progress:
  - `plan/homey-translation-compiler-plan.md`
- TUI implementation plan (phase 4):
  - `plan/tui-implementation-plan.md`
- Current system architecture overview:
  - `docs/architecture.md`
- Documentation sync contract (readme/plan/docs update expectations):
  - `README.md` (Documentation Sync Contract section)
- Diagnostic CLIs support:
  - `summary`, `markdown`, `json`, `json-pretty`, `json-compact`, `ndjson`

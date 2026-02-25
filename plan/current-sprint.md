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

# Homey Translation Rules Engine and Static Profile Compiler (v1)

## Summary

Design and implement a static-first Homey translation compiler that converts Z-Wave device/value facts (from `ZwjsClient`) directly into Homey-targeted compiled mapping plans consumed by the Homey adapter.

The compiler will use layered rule sources, in order:

1. Device/catalog facts (normalized source facts; no mappings)
2. HA-derived inference rules (imported/translated from Home Assistant `zwave_js` discovery concepts)
3. Project product-specific rules (curated overrides/enhancements)
4. Project generic fallback rules (fill-gaps only)
5. Validation/reporting

The runtime Homey adapter will apply:

6. Homey adapter runtime curation (constrained runtime overrides with provenance; adapter-owned)

Key design principles:

- Static by default
- Deterministic compilation
- Minimal runtime dynamism
- Full provenance/attribution per compiled output
- Compiler is intentionally Homey-specific (not target-agnostic)

## Goals (v1)

- Build a rule/compiler system that produces a fully resolved compiled mapping plan for Homey
- Make rule behavior deterministic and explainable via provenance
- Reuse HA discovery concepts as a compile layer (not runtime dependency)
- Support product-specific and generic fallback rules with fill-gaps semantics
- Allow constrained user curation at runtime without undermining static compilation
- Define a stable interface between compiler output and Homey adapter runtime

## Non-Goals (v1)

- Implement the full Homey adapter runtime (pairing, device creation, capability update loop)
- Full code generation of Homey drivers/manifests (can be added later)
- Full ingestion of every Z-Wave catalog source on day one
- Automatic runtime inference/scoring in production
- Arbitrary user scripting in curation patches

## Core Architecture

### High-Level Flow

1. Collect source facts
   - Z-Wave device facts, value definitions, metadata, endpoints, capabilities
   - from `ZwjsClient` snapshots / exported capture fixtures
   - optionally enriched by known catalog metadata
2. Normalize Z-Wave inputs to factual models
   - canonical device/value identity model
   - canonical metadata and signatures
3. Apply compile layers (ordered, deterministic)
   - HA-derived rules -> fill/augment
   - project-product rules -> fill/augment/replace (explicit only)
   - project-generic rules -> fill only
4. Emit compiled Homey mapping plan
   - fully resolved Homey-facing mapping profiles with provenance
   - no runtime ambiguity resolution required for known cases
5. Emit compile reports
   - unknown devices
   - unmapped values
   - ambiguous candidates
   - conflicts / suppressed rule applications
6. Homey runtime adapter loads compiled plan
   - selects compiled profile
   - applies runtime user curation patch (adapter-owned behavior; compiler does not apply patches)
   - executes mappings

## Important Public Interfaces / Types (New)

### 1) Normalized Z-Wave Facts Models (device facts)

Introduce compiler-facing normalized Z-Wave facts models in a new package/module:

- `CompilerDeviceFacts`
- `CompilerEndpointFacts`
- `CompilerValueFacts`
- `CompilerNodeSignature`

#### `CompilerDeviceFacts` (conceptual fields)

- `deviceKey: string` (stable compiler key)
- `manufacturerId?: number`
- `productType?: number`
- `productId?: number`
- `firmwareVersion?: string`
- `deviceClass?: { basic?: string|number; generic?: string|number; specific?: string|number }`
- `endpoints: CompilerEndpointFacts[]`
- `values: CompilerValueFacts[]`
- `source: { zwjsServerVersion?: string; schemaVersion?: number }`

#### `CompilerValueFacts`

- `valueId`: normalized value-id shape (command class, endpoint, property, propertyKey)
- `metadata`: normalized readable/writeable/type/label/unit/states/stateful/min/max/etc.
- `ccSpecific?: Record<string, unknown>`
- `currentValue?: unknown` (optional; compile should not depend heavily on dynamic value)
- `isKnown?: boolean`

Note:

- Compile-time matching should be based primarily on static-ish fields (identity + metadata), not volatile values.

### 2) Rule DSL (authoring source schema)

Rule files are JSON/YAML and compile into Homey-targeted mapping actions (via validated rule models).

Rule sets:

- `ha-derived` (generated/imported into our DSL/rule models)
- `project-product`
- `project-generic`

#### Rule Action Modes

- `fill` (default)
- `augment`
- `replace` (explicit, restricted to product rules + runtime curation)

#### Core Rule Types (v1)

- `MatchRule` (match device/value conditions)
- `CapabilityMappingRule`
- `DeviceProfileRule`
- `TransformTemplateRule` (reference, not arbitrary code)
- `IgnoreRule`

### 3) Compiled Runtime Plan Artifact (primary v1 output)

Primary v1 compiler output:

- `compiled-runtime-plan.json`

Top-level conceptual schema:

- `version`
- `compilerVersion`
- `rulesetVersion`
- `generatedAt`
- `profiles[]`
- `genericFallbackProfiles[]`
- `indexes`
- `compileReportSummary`

#### `CompiledProfile`

- `profileId`
- `match` (compiled match signature / selector)
- `homeyDevicePlan`
- `capabilityPlans[]`
- `subscriptions[]`
- `ignoredValues[]`
- `provenance`
- `flags` (`uncurated`, `genericFallback`, etc.)

#### `CapabilityPlan`

- `capabilityId` (Homey capability)
- `inboundMapping?` (ZWJS -> Homey mapping)
- `outboundMapping?` (Homey -> ZWJS mapping)
- `directionality` (`inbound-only` | `outbound-only` | `bidirectional`)
- `homeyMetadata` (title/unit/step/icon hints where applicable)
- `provenance`
- `overrides?` (if replaced during compile)

### 4) Runtime Curation Patch Schema (Homey adapter input)

Runtime curation is a patch layer, not arbitrary rules.

- `RuntimeCurationPatchSet`
- `RuntimeCurationPatch`
- `PatchOperation`

Allowed patch targets (v1):

1. `device.identity`
2. `device.capabilities[]`
3. `capability.inboundMapping`
4. `capability.outboundMapping`
5. `capability.flags`
6. `subscriptions/watchers`
7. `ignoredValues[]`

Allowed patch ops (v1):

- `replace`
- `disable`
- `add` (limited to supported slots)
- `remove` (limited to supported slots)

Every applied patch must produce provenance:

- `origin.source = user-curation`
- `origin.patchId`
- `origin.appliedAt`
- `supersedes`

## Rule Layering and Semantics (Decision Complete)

### Layer Order (fixed)

1. `catalog-facts`
2. `ha-derived`
3. `project-product`
4. `project-generic`
5. compile validation/reporting
6. runtime user curation (adapter side)

### Semantics by Layer

#### `catalog-facts`

- no mappings
- only normalized facts and known device metadata
- can enrich signatures and identifiers

#### `ha-derived`

- action modes allowed: `fill`, `augment`
- no `replace` in v1
- role: broad curated inference baseline inspired by HA discovery schemas

#### `project-product`

- action modes allowed: `fill`, `augment`, `replace`
- role: targeted corrections / vendor quirks / composite device handling

#### `project-generic`

- action mode allowed: `fill` only
- role: last-pass fallback to fill unresolved gaps
- must never replace existing outputs from prior layers

#### `runtime user curation`

- action modes allowed: constrained patch ops (replace/add/remove/disable in allowed slots)
- role: user-deemed correct local adjustments
- applied after compiled profile selection
- stored separately from compiled plan

### Slot-Level Fill Semantics (important)

Layer application is slot-based, not only profile-level.

Slots (v1):

1. `device.identity` (driver/class/template)
2. `device.capabilities[]`
3. `capability.binding`
4. `capability.transform`
5. `capability.flags`
6. `subscriptions/watchers`
7. `ignoredValues[]`

This allows:

- product rules to define `onoff` and `dim`
- generic fallback to still add `measure_power` later if missing

## HA-Inspired Rule Import Layer (Compile Input)

### Why Use It

HA’s `zwave_js` integration has a mature discovery system using static match criteria and curated exceptions. It is a strong input layer.

### What We Reuse (Conceptually)

From `homeassistant/components/zwave_js`:

- value-centric discovery schemas
- match fields:
  - `command_class`
  - `endpoint`
  - `property`
  - `property_key`
  - metadata type/readable/writeable/stateful
  - available states / cc-specific metadata
- node identity constraints:
  - manufacturer/product/productType
  - firmware ranges
  - device classes
- `required_values`
- `absent_values`
- `allow_multi`
- data-template-like transforms

### What We Do Not Reuse

- HA runtime entity creation model
- HA platform/entity classes (`Platform`, `EntityDescription`)
- HA Python runtime dependencies
- direct dependency on HA code at runtime

### Import Strategy (v1)

- Build an extract/normalize step that translates HA discovery concepts into our DSL/rule models
- Treat imported rules as generated source for the `ha-derived` layer
- Preserve provenance:
  - `origin.source = ha`
  - `origin.externalRuleRef` (file + schema index / generated ID)

### Important Mapping Rule

HA rules are entity-platform oriented; our compiler is Homey capability/device-plan oriented.

Therefore:

- HA-derived layer provides match logic + inferred capability candidates / profile hints
- final Homey device/capability output is produced in Homey-targeted mapping plan models and compiler semantics

## Tooling and Source Sync Pipeline (v1)

These tools are part of the compiler system, not optional extras. They keep compiler inputs reproducible and reviewable.

### 1) Catalog Ingestion / Sync Tooling

Purpose:

- fetch known Z-Wave device catalogs
- normalize and merge sources
- preserve attribution and source versions
- generate reviewable diffs before updating compiler inputs

Proposed commands (CLI names illustrative):

- `catalog fetch <source>`
- `catalog normalize`
- `catalog merge`
- `catalog validate`
- `catalog diff`

Expected outputs:

- normalized source artifacts (per source)
- merged catalog artifact/index used by compiler
- source-attribution metadata
- diff/report artifacts for review

v1 requirements:

- deterministic normalization
- stable IDs/signatures for dedupe
- source version stamping (timestamp + upstream identifier if available)
- merge conflict reporting (not silent last-write-wins)

### 2) HA Rule Import / Translation Tooling

Purpose:

- extract HA `zwave_js` discovery schemas
- translate them into our normalized rule models / generated `ha-derived` rules
- detect upstream drift and unsupported patterns

Proposed commands (CLI names illustrative):

- `ha-import extract`
- `ha-import translate`
- `ha-import validate`
- `ha-import diff`
- `ha-import report`

Expected outputs:

- generated `rules/ha-derived/*` artifacts
- translation report:
  - translated rules count
  - skipped rules count
  - unsupported constructs
  - source refs (file + index/identifier)
- diff artifacts to review upstream changes before accepting regenerated rules

v1 requirements:

- preserve provenance to HA source references
- deterministic generated rule IDs
- explicit handling/reporting for unsupported HA constructs (no silent drops)

### 3) Tooling Integration Expectations

- Tool outputs should be commit-friendly (stable ordering, stable formatting)
- Generated artifacts should be clearly separated from hand-authored rules
- Compiler should be able to run from generated artifacts without re-running import/fetch tools
- Future CI check (post-v1 acceptable): fail if generated artifacts are stale relative to source snapshots

## Performance and Scaling (v1)

The compiler is correctness-first in early slices, but performance must be treated as a first-class requirement before HA-import and large rule sets land.

### Performance Goals (v1)

- Keep single-device compilation responsive for local rule authoring/inspection workflows
- Avoid obvious `O(values x all_rules)` bottlenecks once rule counts grow
- Preserve deterministic output while optimizing
- Make performance regressions measurable (not anecdotal)

### Expected Hot Paths

- Rule matching across many values and rules
- Repeated layer-order sorting / per-compile setup
- Report generation with per-action entries
- Repeated device-identity/classification actions across multiple matching values

### Planned Optimizations (Phase 1 exit / early Phase 2)

1. **Rule candidate pruning**
   - Pre-index rules by common selectors (`commandClass`, `property`, maybe `endpoint`)
   - Only evaluate plausible rule subsets per value

2. **Rule-set compile context**
   - Precompute sorted rules and indexes once per rule set
   - Reuse across many device compiles

3. **Device-level vs value-level action split**
   - Separate or dedupe actions that should not be re-applied for every matching value (especially `device-identity`)

4. **Report mode controls (if needed)**
   - Keep full detail for debugging
   - Allow lighter summaries for bulk compilation runs

### Measurement and Guardrails

- Add a small benchmark fixture set for compiler perf smoke tests (non-CI or optional CI initially)
- Track simple metrics during benchmark runs:
  - rules count
  - values count
  - compile time
  - report generation time (if separated)
- Record baseline numbers in docs/plan before and after major optimization slices

Initial local fixture baseline (single switch+meter fixture, small ruleset):

- command: `npm run compiler:bench -- --device-file packages/compiler/test/fixtures/device-switch-meter.json --rules-file packages/compiler/test/fixtures/rules-switch-meter.json --iterations 20 --warmup 5`
- observed: ~`0.128ms` avg / `0.226ms` p95 (local machine, indicative only)

### Performance Review Checkpoint

Before starting HA import at scale (Phase 2), run a focused compiler code review that includes:

- algorithmic complexity of matching/application
- memory/report overhead tradeoffs
- optimization opportunities that do not compromise provenance/report fidelity

## Device Catalog / Known Device Universe (Initial Design)

The user wants to pull all Z-Wave devices we know of and compile profiles from that.

### v1 Approach (recommended and assumed)

Use a merged catalog strategy:

- official catalog source(s) where practical (e.g. Z-Wave Alliance data)
- `zwave-js`/config-derived metadata where available
- observed device facts from local captures / runtime exports

Why merged:

- official catalogs are broad but often awkward/incomplete for mapping details
- `zwave-js` ecosystem data has useful practical metadata
- observed facts close the gap for real devices

### Catalog Compiler Responsibilities

- normalize identifiers and signatures
- deduplicate products
- track source attribution per catalog fact
- produce `catalog_index` for profile compilation
- preserve confidence/source-quality metadata

### Unknown Device Policy (captured)

If no specific compiled product rule matches:

- apply compiled generic fallback rules to infer a best-effort Homey mapping
- mark device/profile as `uncurated` / `genericFallback`
- allow user curation at runtime
- emit compile/runtime reports for curation follow-up

## Rules DSL (JSON/YAML) — v1 Design

### Authoring Layers (files/folders)

Proposed structure:

- `rules/ha-derived/` (generated)
- `rules/project/product/`
- `rules/project/generic/`
- `rules/transforms/`
- `rules/schema/` (JSON Schema definitions for rule files)

### Rule File Types (v1)

1. `device-profile` rules
2. `capability-mapping` rules
3. `ignore` rules
4. `transform-template` definitions
5. `layer-config` (priority/order config, if not hardcoded)

### Match Inputs (v1)

Supported match predicates (subset based on HA-inspired model):

- device:
  - `manufacturerId`, `productType`, `productId`
  - `firmwareVersion` / range
  - device class (basic/generic/specific)
- value:
  - `commandClass`
  - `endpoint`
  - `property`
  - `propertyName` (optional)
  - `propertyKey`
  - `notPropertyKey`
  - metadata:
    - `type`
    - `readable`
    - `writeable`
    - `stateful`
    - `states` contains key/value / keys
    - `ccSpecific` contains entries
- companion constraints:
  - `requiredValues[]`
  - `absentValues[]`

### Actions (v1)

- create/fill `device.identity`
- add/fill `device.capabilities[]`
- bind capability to value/event
- assign transform template + params
- add watchers/subscriptions
- ignore values
- annotate flags (`assumedState`, `entityCategory`-like internal hints)

### No Arbitrary Code in DSL

Transforms are references to known transform templates:

- `transformRef`
- `params`

This preserves static behavior and safety.

## Compiler Pipeline (Decision Complete)

### Phase A: Input Normalization

- Normalize `ZwjsClient` snapshots / exported facts into normalized Z-Wave facts models
- Normalize catalog data into `CatalogFacts`
- Validate source schemas
- Canonicalize value IDs and metadata fields

### Phase B: Rule Loading and Validation

- Parse JSON/YAML rule files
- Validate against rule JSON Schema
- Normalize to internal rule models
- Validate action-mode restrictions by layer (`generic` cannot `replace`)

### Phase C: HA Rule Import/Normalization

- Translate HA discovery schemas into our normalized rule models
- Preserve source references and generated rule IDs
- Emit generated `ha-derived` rules (artifact or in-memory during compile)

### Phase D: Layered Application (slot-based)

For each device profile candidate:

- apply `ha-derived` (`fill`, `augment`)
- apply `project-product` (`fill`, `augment`, explicit `replace`)
- apply `project-generic` (`fill` only)
- record suppressed actions (e.g., fallback attempted to fill occupied slot)

### Phase E: Validation and Conflict Checks

- detect unresolved required slots for supported targets
- detect duplicate capability inbound mappings / conflicting outbound mappings
- detect invalid transform refs/params
- detect disallowed `replace` actions by layer
- detect contradictory flags
- detect writable Homey capabilities missing `outboundMapping` where driver template requires bidirectional support
- validate profile completeness levels (`curated`, `genericFallback`, `unknown`)

### Phase F: Emit Outputs

Primary:

- `compiled-runtime-plan.json`

Secondary:

- `compile-report.json`
- `unknown-devices-report.json`
- `rule-attribution-report.json` (optional v1 if cheap; otherwise fold into compile report)

## Compiled Runtime Plan Schema (v1, more concrete)

### Top-Level

- `schemaVersion`
- `compiler`
  - `version`
  - `rulesetHash`
  - `generatedAt`
- `catalog`
  - `version`
  - `sources[]`
- `profiles[]`
- `indexes`
- `reportsSummary`

### `profiles[]`

Each profile represents a compiled Homey mapping profile for a device signature (or generic fallback-inferred signature).

Fields:

- `profileId`
- `match`
  - exact product IDs and optional firmware constraints
  - or generic matcher signature
- `classification`
  - `homeyClass`
  - `driverTemplateId` (runtime template reference)
  - `confidence` (`curated`, `ha-derived`, `generic`)
  - `uncurated: boolean`
- `capabilities[]`
- `subscriptions[]`
- `ignoredValues[]`
- `provenance`
- `notes[]` (optional compile notes)

### `capabilities[]`

- `capabilityId` (e.g. Homey capability key)
- `inboundMapping?`
  - `kind`: `value` | `event`
  - `selector`: normalized value ID or event selector
  - `transform`
    - `ref`
    - `params`
  - `watchers[]` (additional values/events)
- `outboundMapping?`
  - `kind`: `set_value` | `invoke_cc_api` | `zwjs_command`
  - `target`: normalized value ID / endpoint-CC selector / command selector
  - `transform`
    - `ref`
    - `params`
  - `validation`
    - `range?`
    - `step?`
    - `enum?`
  - `executionHints`
    - `optimisticState?`
    - `debounceMs?`
    - `throttleMs?`
- `directionality` (`inbound-only` | `outbound-only` | `bidirectional`)
- `flags`
  - `readable`
  - `writeable`
  - `assumedState`
  - `debounceMs?`
- `provenance`

### Provenance (required on profile and capability/inbound/outbound mappings)

- `origin.layer` (`ha-derived`, `project-product`, `project-generic`, `user-curation`)
- `origin.ruleId` / `patchId`
- `origin.action` (`fill`, `augment`, `replace`)
- `origin.sourceRef` (file path / generated reference)
- `origin.reason` (compact match trace)
- `supersedes[]` (if replacement occurred)

## Runtime Homey Adapter Interface to Compiler Output (v1 contract)

This plan does not implement the adapter, but it defines what it consumes.

### Runtime Adapter Responsibilities

- Load compiled runtime plan artifact
- Build lookup index by device signature
- Select best compiled profile (exact > product range > generic fallback)
- Apply runtime curation patch set (allowed slots only)
- Expose final resolved mapping to Homey-specific execution layer
- Execute `outboundMapping` definitions for Homey -> ZWJS operations via `ZwjsClient` (runtime execution, not compile-time)
- Track provenance for debugging/explanation

### Runtime Adapter Must Not Do (v1)

- Run dynamic rule matching/scoring beyond compiled profile selection
- Interpret arbitrary user scripts
- Re-resolve rule precedence

### Unknown Devices at Runtime

When no exact profile matches:

- try compiled generic fallback profiles
- mark device as `uncurated`
- emit a curation-needed report/event for Homey UI/admin
- still expose functionality if generic mapping succeeded

## Runtime User Curation Model (v1)

### Purpose

Allow the user to correct mapping outcomes without rebuilding the compiler pipeline immediately.

### Scope (v1 constraints)

Allowed user curation patch targets:

1. `device.identity` (including Homey class/driver template selection)
2. `device.capabilities[]`
3. `capability.inboundMapping`
4. `capability.outboundMapping`
5. `capability.flags`
6. `subscriptions/watchers`
7. `ignoredValues[]`

### Out of Scope (v1)

- Arbitrary custom code/transforms
- New custom DSL rules authored in Homey UI
- Mutating compiler-layer ordering at runtime

### Persistence (assumption pending explicit confirmation)

Recommended default:

- Homey app storage/settings as primary persistence
- export/import JSON support later (or v1.1) for backup/share

If desired, this can be made `both` in v1, but primary should remain Homey-managed storage.

## Testing Strategy (Compiler + Plan Contracts)

### 1) Rule Parsing / Schema Validation Tests

- Valid rule files parse and normalize
- Invalid rule files fail with actionable errors
- Layer action restrictions enforced (`generic` cannot `replace`)

### 2) HA Import Normalization Tests

- Translate representative HA discovery schemas to our normalized rule models
- Preserve required/absent constraints, allow_multi, metadata predicates
- Provenance refs preserved (`origin.source = ha`)

### 3) Layered Application Semantics Tests (critical)

- `fill` only applies to empty slots
- `augment` adds non-conflicting supplemental data
- `replace` only allowed where permitted
- generic rules do not overwrite prior layers
- slot-level fill works (e.g., generic adds missing capability while preserving curated ones)

### 4) Conflict / Validation Tests

- duplicate capability inbound mapping / conflicting outbound mapping detection
- invalid transform references
- unresolved required slots for curated profiles
- contradictory actions across layers
- suppressed fallback actions logged correctly

### 5) Compiled Plan Snapshot / Golden Tests

- compile representative device fact fixtures
- assert compiled profile output + provenance + flags
- golden files for:
  - exact product curated device
  - HA-only inferred device
  - generic fallback device
  - unknown/uncurated report case

### 6) Runtime Curation Patch Tests (contract-level)

- allowed patch targets apply correctly
- disallowed patch targets fail
- patch provenance appended correctly
- `replace` semantics preserve superseded origin chain

### 7) Adapter Contract Tests (later, but define now)

- Given compiled plan + facts, profile selection is deterministic
- Generic fallback selected only if no specific profile match
- `uncurated` flag propagates to adapter-facing model

## Acceptance Criteria (v1 for Rules Engine + Compiler)

The v1 compiler/rules-engine effort is complete when:

1. A layered JSON/YAML rule DSL exists for:
   - `ha-derived` (generated/imported)
   - `project-product`
   - `project-generic`
2. HA discovery concepts are imported/normalized into our rule models (at least representative subset for the first Homey slice)
3. Compiler produces `compiled-runtime-plan.json` with:
   - profiles
   - inbound/outbound capability mappings
   - transforms (direction-specific where applicable)
   - subscriptions
   - provenance at profile/capability level
4. Layer application is slot-based and deterministic:
   - generic layer is fill-only
   - no accidental overwrites
5. Unknown-device flow is supported:
   - generic fallback profile application if possible
   - `uncurated` marking
   - curation-needed reporting
6. Compiler output preserves stable identifiers/provenance/diagnostics sufficient for adapter-owned runtime curation
7. Tests cover:
   - parsing/validation
   - HA import normalization
   - layering semantics
   - compiled output snapshots
   - unknown-device / curation-needed reporting
8. Documentation exists for:
   - rule layer semantics
   - compiler outputs
   - provenance model
   - compiler/Homey adapter curation boundary

## Proposed Repository Structure (for Implementation)

### New package (recommended)

- `packages/compiler/` (or `packages/mapping-compiler/`)

Suggested folders:

- `src/models/` (normalized input/output models and internal build state types)
- `src/rules/` (DSL schemas, parsers, validators)
- `src/importers/ha/` (HA rule import normalization)
- `src/catalog/` (catalog normalization/merge)
- `src/compiler/` (layer application pipeline)
- `src/emit/` (compiled plan + reports)
- `test/fixtures/` (device facts, rulesets, expected compiled outputs)
- `test/`

### Rule data files (workspace root or package-owned)

Recommended (workspace-level for easy curation):

- `rules/ha-derived/` (generated)
- `rules/project/product/`
- `rules/project/generic/`
- `rules/transforms/`
- `rules/schema/`

### Documentation

- `docs/homey-translation-compiler-architecture.md`
- `docs/homey-mapping-provenance-model.md`
- `plan/homey-translation-compiler-plan.md` (this plan)

## Implementation Phasing (Recommended)

### Phase 1 — Normalized Models + Rule DSL + Layer Semantics (no HA import yet)

Status: Completed (models, rule loading/validation, layered application semantics, reporting, local inspect/bench tooling, Phase 1 review fixes)

- Define normalized input/output models and internal build-state types
- Define rule DSL schema + parser/validator
- Implement slot-based `fill/augment/replace`
- Implement provenance model
- Golden tests on hand-authored rules
- Output compiled runtime plan + reports

### Phase 2 — HA Rule Import Tooling + Representative Import Layer

Status: Complete (current scope)

Progress:

- Completed generated `ha-derived` artifact contract + loader (`ha-derived-rules/v1`)
- Added fixture-based mock HA discovery translator contract (input -> generated artifact + translation report)
- Added mixed compile compatibility tests (`ha-derived` + project rules) without HA Python parsing yet
- Expanded mock HA translator to preserve a representative subset of HA-style predicates and companion constraints (`metadataType`, `readable`/`writeable`, `requiredValues`, `absentValues`) with compile-behavior tests
- Added explicit mock translator unsupported-reason reporting (`unsupported-match-field`, `unsupported-output-shape`) and manifest/CLI compatibility for `ha-derived` generated artifact entries
- Fixed Phase 2 review follow-ups: accurate translation `skipped` counts, unsupported nested constraint-field detection, explicit manifest `kind` validation, and extracted shared rule-array validation to avoid loader/importer coupling
- Added a parser-free HA extracted-schema fixture contract and adapter translator (`ha-extracted-discovery/v1`) that feeds the existing generated `ha-derived` artifact path with compatibility tests
- Added an initial `ha-import:report` tooling skeleton (fixture/parser-free path) to exercise extracted input -> generated `ha-derived` artifact -> translation report flow
- Tightened extracted translator boundary validation for `companions` matchers and hardened `ha-import:report` CLI parsing so `--output-generated` requires an explicit file path
- Phase 2 contract baseline sub-checkpoint reviewed and stabilized (generated artifact, mock translator, extracted adapter, manifests/inspect, and `ha-import:report` fixture pipeline) before real parser work
- Added `ha-import:extract` tooling skeleton plus extracted-artifact loader/validator (`ha-extracted-discovery/v1`) so extraction and translation stages now have separate contract-checked CLI entry points
- Replaced the `ha-import:extract` source parser stub with a narrow real-source probe parser for `discovery.py` (Honeywell fan + thermostat setpoint-without-mode examples), producing `ha-extracted-discovery/v1` output directly from a Home Assistant checkout path
- Extended the narrow real-source probe parser to include a second fan pattern (GE/Jasco 12730 / ZW4002), extracted parser logic into a dedicated helper module, and added an end-to-end `ha-import:extract (source)` -> `ha-import:report` tool test
- Added a compiler-owned constrained HA `discovery.py` subset extractor (`extractHaDiscoverySubsetFromFile/Source`) that scans many `ZWaveDiscoverySchema(...)` blocks, translates supported `FAN|CLIMATE|SWITCH` subset fields into `ha-extracted-discovery/v1`, and reports unsupported/skipped schema blocks for extraction coverage tracking
- Added a real-source extraction probe fixture derived from Home Assistant `discovery.py` examples (including `required_values` and `absent_values`) and verified it through translation, compile behavior, and `ha-import:report`
- Expanded the compiler-owned HA subset extractor iteratively to cover inline command-class/property-set patterns and additional platform mappings, reaching `71/71` translated `ZWaveDiscoverySchema(...)` blocks with `0` skipped on the current checked-out `discovery.py` (coverage-guided subset milestone)
- Hardened extracted semantics capture/preservation for `allow_multi`, `assumed_state`, and `entity_registry_enabled_default`, and preserve all three into generated capability flags for downstream compiler behavior
- V1 semantic handling policy: `assumed_state` is compiler/runtime-actionable via capability flags; `allow_multi` and `entity_registry_enabled_default` are preserved as annotations for adapter/policy decisions and future compiler semantics (no implicit behavior yet)
- Added Phase 2 drift-guard coverage:
  - real-source extractor test now asserts full translation coverage on the checked-out `discovery.py` (`translated == scanned`, `skipped == 0`) and empty `unsupportedByReason`
- Expanded mixed HA-derived + project-rule compiler tests so HA-derived `measure_power` can suppress generic fallback fills, with provenance/suppression reporting assertions
- Phase 2 exit checkpoint reviewed with no blockers after extractor robustness hardening and pinned-source drift-guard clarification

- Build HA extract/translate/validate tooling pipeline
- Generate `ha-derived` rule artifacts with provenance
- Import HA-inspired schema subset needed for first Homey slice (lights/switches/sensors)
- Normalize to our rule models
- Add translation tests and provenance
- Compile mixed HA + project rules

### Phase 3 — Catalog Ingestion / Merge Tooling + Unknown Device Reporting

Status: In progress (extended scope: compiler runtime-validation readiness before Homey adapter implementation)

Progress:

- Added `catalog-devices/v1` artifact contract, loader/validator, and fixture coverage
- Added `catalog` CLI skeleton with `summary`, `validate`, and `fetch` (stub) subcommands plus format support (`summary|markdown|json|json-pretty|json-compact|ndjson`)
- Added first real catalog fetch source adapter: `zwjs-inspect-node-detail` -> `catalog-devices/v1`
- Added catalog fetch conversion fixture coverage and CLI tests for `catalog fetch --source zwjs-inspect-node-detail`
- Added `catalog normalize` dedupe/canonicalization flow for `catalog-devices/v1` with merge reporting and CLI coverage
- Added `catalog merge` for combining multiple `catalog-devices/v1` artifacts with dedupe + merge stats reporting
- Added `catalog diff` summary flow for added/removed/changed devices and source/label drift diagnostics
- Added catalog conflict precedence + `conflictMode` (`warn|error`) for normalize/merge, with conflict reporting and strict-mode failures on ID conflicts
- Added compiler-side catalog index prep (`catalogId` + product-triple lookup maps) and surfaced index stats in catalog CLI summaries
- Added `catalog diff --only <added|removed|changed>` filtering for focused diagnostics views
- Integrated catalog lookup into compiler profile compilation (product-triple match) with optional `catalogArtifact` / `catalogIndex` inputs
- Added file/manifest compile result `catalogLookup` reporting and `compileProfilePlanFromRuleFilesWithCatalog(...)`
- Added catalog-aware curation diagnostics in file-based compiler reports (`catalogContext`, known/unknown catalog fallback/unmapped reasons)
- Added compiled profile catalog annotation (`profile.catalogMatch`) for downstream adapter/tooling use (annotation only; no rule precedence changes)
- Added catalog references to compiler diagnostics/provenance (`catalogId` in profile provenance reason, report `catalogContext.matchRef`)
- Added stable report `diagnosticDeviceKey` (`catalog:<id>` or product-triple fallback) and surfaced it in `compiler:inspect` outputs
- Added file-based `unknownDeviceReport` diagnostics (known/unknown/no-catalog) and surfaced them in `compiler:inspect` (`summary|markdown|ndjson`)
- Explicitly deferred curation-seed generation; current decision is to keep curation/rule authoring schema-first and avoid an extra seed artifact/workflow until proven necessary
- Added `compiler:inspect-live` tooling to compile profiles directly from a live ZWJS instance (`--all-nodes`/`--node`) with a list overview and diagnostic output formats

Phase 3 compiler-complete-before-adapter additions (required before Homey adapter implementation):

- Add a compiler build/export command that compiles all layers into a reusable compiled profiles artifact (no on-the-fly compile)
- Establish real rule directories and pipeline outputs:
  - `rules/ha-derived/` generated from HA extraction/translation
  - `rules/project/generic/` curated generic inference rules
  - `rules/project/product/` curated product overrides
- Generate HA-derived rules to cover the full set of HA `zwave_js` discovery rules supported by the current extractor/translator path
- Build and iterate a real project-generic rule set that infers Homey device profiles/capabilities from Z-Wave configuration/metadata (not just test fixtures)
- Add a compiled-artifact inspection/apply path for live ZWJS data (so live validation uses compiled profiles, not compile-on-the-fly)
- Use live ZWJS validation to tighten generic/profile inference before adapter implementation

Deferred / later Phase 3 expansion (not required for compiler runtime-validation readiness):

- Additional real catalog source adapters (beyond `zwjs-inspect-node-detail`)
- Deeper catalog-informed compile-time guidance (still no silent precedence changes)
- Generic fallback compilation refinements beyond the initial real project-generic ruleset
- Catalog-driven workflows that add new authoring artifacts (e.g. curation seeds) unless a real pain point appears

### Phase 4 — Runtime Curation Patch Schema + Patch Apply Helper

Status: Moved out of compiler scope (Homey adapter-owned)

Decision:

- Runtime curation schema and patch-apply semantics belong to the Homey adapter, not the compiler.
- Compiler responsibility is limited to compiled profile outputs plus provenance/diagnostics that adapter-side curation can use.
- Compiler-side curation patch prototype was removed to preserve the boundary.

### Phase 5 — Adapter Integration Planning/Execution (separate plan)

- Build Homey runtime adapter against compiled plan contract
- Start first vertical slice (lights/switches/sensors)

## Explicit Assumptions and Defaults Chosen

- Static-first design is the primary constraint.
- Generic fallback rules are part of the compile process, not runtime inference.
- Rule layers use slot-based fill semantics; later layers only fill gaps unless explicit `replace` is allowed.
- “Our rules” are split into:
  - `project-product` (curated targeted rules)
  - `project-generic` (fallback fill-only rules)
- HA `zwave_js` discovery logic is used as compile inspiration/input, not a runtime dependency.
- Compiler primary output is a compiled runtime plan artifact (JSON), not codegen-first.
- Runtime curation is allowed, but constrained to a patch model with provenance.
- Unknown devices may still get generic fallback-inferred Homey mappings and are marked `uncurated`.
- Provenance is required at least at:
  - profile level
  - capability level
  - binding level

## Open Decisions (Need User Confirmation Before Implementation)

These do not block the architectural plan, but should be locked before implementation begins:

1. Catalog source strategy detail (v1)
   - Merged strategy is assumed, but exact first sources need confirmation (official catalog vs `zwave-js` config exports vs observed captures priority)

2. Runtime curation persistence
   - Recommended: Homey app storage as primary in v1
   - Export/import JSON can be added later or included in v1 if desired

3. Compiler output variant
   - Plan assumes a Homey-targeted compiled runtime plan as primary v1 output
   - If a parallel codegen-oriented export format is desired in v1, define it now to avoid schema churn

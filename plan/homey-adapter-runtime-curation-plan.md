# Homey Adapter Runtime Curation Layer (v1)

## Summary

Design and implement a Homey adapter-owned runtime curation system that applies user corrections to compiled Homey device profiles at runtime, without changing compiler responsibilities.

## Implementation Status

- [x] Phase A (schema + validation) baseline is in place via `co.lazylabs.zwavejs2homey/curation.js`:
  - strict `curation.v1` top-level + entry schema validation
  - entry key/target identity enforcement
  - deterministic collection dedupe + add/remove overlap rejection
- [x] Phase B (override lowering + apply helper) baseline is in place:
  - deterministic lowerer: `lowerCurationEntryToRuntimeActions`
  - apply helper/report: `applyCurationEntryToProfile` (applied/skipped/errors + summary)
  - stable curation runtime rule IDs derived from device/path
- [x] Phase C (collection overrides) baseline support is in place:
  - `capabilitiesAdd/remove`, `subscriptionsAdd/remove`, `ignoredValuesAdd/remove` lowering + apply semantics
- [x] Phase D (storage integration) baseline is in place:
  - app runtime loads `curation.v1` from Homey settings at startup
  - app runtime reloads curation on `curation.v1` settings updates
  - curation updates trigger node runtime refresh (`curation-updated`)
- [x] Phase E (baseline marker + recommendation detection) baseline is in place:
  - canonical baseline projection/hash helpers implemented in `curation.js`
  - marker create/evaluate helpers implemented (`createBaselineMarkerV1`, `evaluateBaselineRecommendationState`)
  - node runtime computes recommendation state and persists recommendation diagnostics to `profileResolution`
- [~] Phase F is partially in place:
  - app-level normalized diagnostics snapshot API exists (`getNodeRuntimeDiagnostics`)
  - app-level non-UI adopt/backfill action APIs now exist:
    - `backfillCurationBaselineMarker`
    - `adoptRecommendedBaseline`
  - app-level non-UI recommendation workflow orchestration now exists:
    - `getRecommendationActionQueue`
    - `executeRecommendationAction`
    - `executeRecommendationActions`
    - `backfillMissingCurationBaselineMarkers`
  - bridge-device non-UI forwarding hooks now exist for runtime UX wiring:
    - `getRuntimeDiagnostics`
    - `getRecommendationActionQueue`
    - `executeRecommendationAction`
    - `executeRecommendationActions`
  - remaining work: Homey UX wiring for diagnostics + adopt/backfill interaction flows

Related ADRs:

- `docs/decisions/0002-compiler-adapter-boundary.md`
- `docs/decisions/0004-generic-fallback-ownership.md`
- `docs/decisions/0006-homey-adapter-runtime-rule-order.md`
- `docs/decisions/0007-product-and-curation-single-target-bundles.md`
- `docs/decisions/0010-homey-adapter-curation-storage-v1.md`
- `docs/decisions/0011-homey-curation-model-v1-materialized-overrides.md`
- `docs/decisions/0012-homey-curation-execution-via-runtime-rule-lowering.md`
- `docs/decisions/0013-homey-device-instance-curation-precedence-v1.md`
- `docs/decisions/0014-homey-baseline-recommendation-detection-v1.md`
- `docs/decisions/0015-homey-baseline-hash-canonical-projection-v1.md`
- `docs/decisions/0016-homey-curation-v1-storage-schema.md`
- `docs/decisions/0017-homey-mvp-driver-topology-and-pairing-model.md`

Compiler remains responsible for:

- compiled profile JSON
- provenance/diagnostics
- stable identifiers (`catalogId`, `diagnosticDeviceKey`, capability IDs)

Homey adapter becomes responsible for:

- curation schema (runtime override format)
- curation storage
- override-to-rule lowering semantics
- runtime curation apply semantics
- device-instance precedence and recommendation update UX
- curation UX/workflow

## MVP Topology Assumptions (Locked)

Per ADR 0017, runtime curation work in this plan assumes:

- two Homey drivers exist:
  - `bridge` driver/device: control-plane endpoint actions/status
  - `node` driver/devices: compiled-profile execution per imported node
- node onboarding is explicit import/link from ZWJS into Homey (pairing flow)
- no automatic cross-driver pairing handoff is required in v1
- per-device curation UX lives on node-level flows (for example node repair/custom view), not bridge settings

Current implementation baseline:

- `bridge` and `node` driver scaffolds exist in `co.lazylabs.zwavejs2homey/drivers`
- bridge pairing singleton gating is implemented (`zwjs-bridge-main`)
- node pairing imports/dedupes ZWJS nodes using `bridgeId + nodeId`

## Goals (v1)

- Let users correct mappings in the Homey app without rebuilding compiler outputs
- Keep runtime behavior deterministic (curation applies to explicit targets only)
- Keep curated device behavior stable across compiler/rule updates unless user chooses to adopt new recommendations
- Preserve auditability (what changed, why, when)
- Maintain a strict compiler/adapter boundary
- Support both:
  - known catalog devices
  - unknown devices (`diagnosticDeviceKey` targeting)

## Non-Goals (v1)

- User-authored rule DSL in Homey UI
- Runtime inference/scoring engine
- Arbitrary code/transforms in curation
- Compiler-side curation application
- Full curation UI polish (basic workflow first)

## Ownership Boundary (Decision Locked)

### Compiler (already done)

- Produces compiled profiles
- Emits diagnostics/provenance
- Emits catalog annotations (`profile.catalogMatch`, report catalog context, unknown-device report)

### Homey Adapter (new)

- Defines runtime curation schema
- Stores curation override sets
- Lowers overrides to runtime rules and executes runtime curation against compiled profiles
- Keeps curation instance-scoped (`homeyDeviceId`) and authoritative over baseline updates
- Surfaces “recommended profile available” decisions to users
- Surfaces curation diagnostics to users/admins
- Handles migration/versioning of adapter-owned curation schema

## Runtime Curation Model (v1)

### Apply Strategy

Apply curation to compiled profiles (not raw Z-Wave facts).

Runtime flow:

1. Load compiled profile
2. Apply adapter generic inference (`fill`-oriented cleanup)
3. Apply curation overrides/rules (final authority)
4. Execute final profile

### Targeting (device selection)

Each curation entry targets one Homey device instance by:

- `homeyDeviceId` (primary key)

Compiler identity fields (`catalogId`/`diagnosticDeviceKey`) remain baseline identity/provenance context and may be stored as metadata for recommendation checks.

### Allowed Curation Scope (v1)

#### Device-level

- `classification.homeyClass`
- `classification.driverTemplateId`

#### Capability-level (existing capability)

- `inboundMapping`
- `outboundMapping`
- `flags`

#### Collection-level (limited)

- `capabilities` (`add` / `remove`)
- `subscriptions` (`add` / `remove`)
- `ignoredValues` (`add` / `remove`)

### Explicitly Out of Scope (v1)

- overriding provenance internals directly
- arbitrary nested writes by JSONPath
- changing compiler confidence flags directly
- overriding rule layer semantics

## Curation Data Model (`curation.v1` Stored Contract)

Use a versioned JSON document in Homey settings key `curation.v1`.

Decision locked:

- materialized override state per device instance is the persisted source-of-truth
- concrete stored schema is now locked (not deferred)
- operation-log patch shape is not used as persisted primary model

### Top-level (concrete)

- `schemaVersion`: `homey-curation/v1`
- `updatedAt`: ISO timestamp
- `entries`: object map keyed by `homeyDeviceId`

### Entry (concrete)

- `targetDevice`:
  - `homeyDeviceId` (required; must equal map key)
  - `catalogId?` (metadata/context)
  - `diagnosticDeviceKey?` (metadata/context)
- `baselineMarker`:
  - `projectionVersion` (required)
  - `pipelineFingerprint?`
  - `baselineProfileHash` (required)
  - `updatedAt` (required)
- `overrides`
- `note?`
- `updatedAt` (required)

### Override scope (concrete)

Use structured override domains (not arbitrary JSON pointer writes):

- `overrides.deviceIdentity`:
  - `homeyClass?`
  - `driverTemplateId?`
- `overrides.capabilities.{capabilityId}`:
  - `inboundMapping?`
  - `outboundMapping?`
  - `flags?`
- `overrides.collections`:
  - `capabilitiesAdd[]`
  - `capabilitiesRemove[]`
  - `subscriptionsAdd[]`
  - `subscriptionsRemove[]`
  - `ignoredValuesAdd[]`
  - `ignoredValuesRemove[]`

### Validation rules (concrete)

- strict schema: unknown fields rejected
- `targetDevice.homeyDeviceId` must match map key
- collection arrays are deterministically deduped
- same element cannot appear in both add/remove arrays in one collection pair

## Override-to-Rule Lowering Contract (v1)

Decision locked:

- persisted curation in Homey settings is materialized overrides
- adapter lowers overrides to an in-memory runtime curation ruleset
- lowered runtime curation rules run after generic runtime rules (curation wins)
- lowered rules are derived execution artifacts and are not persisted as source-of-truth state

Lowering mapping (conceptual):

- `overrides.deviceIdentity.homeyClass` -> `device-identity` action (`replace`)
- `overrides.deviceIdentity.driverTemplateId` -> `device-identity` action (`replace`)
- `overrides.capabilities.{id}.inboundMapping` -> capability inbound mapping action (`replace`)
- `overrides.capabilities.{id}.outboundMapping` -> capability outbound mapping action (`replace`)
- `overrides.capabilities.{id}.flags` -> capability flags action (`replace`)
- collection add/remove intents -> capability/subscription/ignored-value collection actions

Determinism requirements:

- stable lowering output for the same curation input
- stable rule IDs derived from target + override path
- invalid override fields are skipped and surfaced in diagnostics

## Curation Apply Helper (Adapter module)

### Responsibility

Pure function (or near-pure helper) in the Homey adapter layer:

- input: compiled profile + matching curation entry set
- output: overridden profile + application report

### Behavior (v1)

- Apply curation entries in deterministic order
- Lower entries into runtime curation rules
- Execute lowered rules via shared rules engine semantics
- Validate override targets before/while lowering
- Record skipped/invalid override fields (missing capability, invalid target domain, duplicate add/remove intent, etc.)
- Preserve provenance by adding user-curation provenance records / supersedes references (adapter-defined)
- Never mutate original compiled profile in place

### Return type (conceptual)

- `profile`
- `loweredRules[]` (optional diagnostics shape)
- `appliedOverrides[]`
- `skippedOverrides[]`
- `errors[]`
- `provenanceUpdates[]` (or embedded only)

### Error posture

- Invalid stored curation schema -> reject curation set and log clearly
- Valid entry but non-applicable target/field -> skip + report (not fatal)
- Fatal apply bug -> fail safe (use base compiled profile + log)

## Persistence Model (v1)

Decision locked:

- Homey app settings/storage (`this.homey.settings`) is the only persistence backend in v1

Store:

- versioned full curation set JSON (for example key `curation.v1` + schema version)
- per-entry baseline marker metadata (`projectionVersion`, `pipelineFingerprint?`, `baselineProfileHash`, `updatedAt`)
- optional metadata per entry (author, last edited UI version)

Optional later:

- export/import JSON for backup/share
- alternate storage backend behind the adapter storage interface

### Migration

- Curation schema is versioned
- storage is accessed through an adapter interface (`loadCuration`, `saveCuration`) to allow backend migration in future versions
- Adapter owns migrations (e.g. `v1 -> v2`)
- Compiler version upgrades should not require curation rewrites unless compiled profile target fields change

## Adapter Integration Flow (Runtime)

1. Load compiled profile from compiler artifact
2. Resolve Homey device instance key (`homeyDeviceId`)
3. Resolve compiler identity context for baseline/provenance:

- `catalogId` if available
- else `diagnosticDeviceKey`

4. Load matching curation overrides from Homey storage by `homeyDeviceId`
5. Validate curation schema
6. Lower overrides -> runtime curation rules
7. Execute rules engine in runtime order (generic first, curation second)
8. Use resulting runtime profile for:

- inbound updates (ZWJS -> Homey)
- outbound commands (Homey -> ZWJS)

9. Surface curation diagnostics in logs/UI if:

- skipped override fields
- invalid curation set
- target mismatch after compiler profile changes

## Baseline Update Behavior (v1)

When compiler/rule updates produce a newer recommended baseline:

1. Recompute/reload baseline for the device identity.
2. Keep instance-scoped curation override active by default.
3. Mark device as having a newer recommended profile available.
4. Expose user action in Homey UX:
   - adopt recommended baseline (v1 full replace)
   - keep current curated configuration

Not in v1:

- auto-overwrite local curation when recommendation changes
- selective field-by-field merge UX

## Recommendation Detection (v1)

To decide whether to show "new recommended profile available", keep per-device baseline markers:

- `pipelineFingerprint` (from compiled artifact source metadata when available)
- `baselineProfileHash` (`sha256` of canonical baseline profile projection)
- `projectionVersion` (starts at `1`)

Canonical baseline projection should include mapping semantics used at runtime:

- `classification.homeyClass`
- `classification.driverTemplateId`
- capabilities + mappings + flags:
  - `capabilityId`
  - `inboundMapping`
  - `outboundMapping`
  - `flags`
- subscriptions
- ignored values

Canonical projection should exclude volatile/report-only fields:

- timestamps
- validation/report diagnostics
- provenance/provenance-history metadata
- confidence/uncurated labels

Canonicalization rules:

- sort `capabilities` by `capabilityId`
- sort object keys lexicographically
- remove `undefined` fields
- preserve explicit `null`
- use one fixed v1 value-id normalization policy (for example endpoint defaulting) consistently

Marker payload (conceptual):

- `projectionVersion`
- `pipelineFingerprint?`
- `baselineProfileHash`
- `updatedAt`

Detection flow:

1. Recompute marker for current baseline.
2. Compare with stored marker for `homeyDeviceId`.
3. If `baselineProfileHash` changed: recommendation available.
4. If hash unchanged: no recommendation prompt, even if `pipelineFingerprint` differs.
5. If marker missing (legacy entry): backfill marker and skip prompt on that first backfill pass.
6. If `projectionVersion` changed: recompute/backfill marker for the new version and skip prompt on that migration pass.

## Diagnostics & UX (v1 Minimal)

### Must-have diagnostics

- “Curation applied” summary per device
- skipped override reasons
- invalid curation schema errors
- target not found warnings

### Nice-to-have (later)

- preview diff before apply
- “reset curation for device”
- export/import curation set
- curation provenance timeline

No seed generator needed in v1.

## Tests (Adapter curation layer)

### 1) Schema validation tests

- valid curation set accepted
- invalid override target/value combos rejected
- missing target device identity rejected
- unknown fields rejected (strict schema)
- entry key vs `targetDevice.homeyDeviceId` mismatch rejected
- add/remove overlap in same collection pair rejected

### 2) Lowering + apply helper tests (core)

- replace device class/template
- replace capability inbound/outbound mapping
- replace capability flags
- add/remove profile collection entries
- missing capability target -> skipped override

### 3) Determinism tests

- lowering from same curation input produces stable runtime rules
- repeated apply on same input curation set yields same result
- original compiled profile object remains unchanged

### 4) Provenance tests

- user curation provenance added
- supersedes/origin references preserved (adapter-defined model)

### 5) Integration tests (adapter-level)

- curated runtime profile actually changes runtime mapping behavior
- outbound mapping correction affects command execution target
- invalid curation set falls back safely to base compiled profile
- instance-scoped curation remains active after baseline refresh until user adopts recommendation

### 6) Recommendation detection tests

- changed canonical baseline profile hash triggers recommendation-available status
- unchanged canonical hash does not trigger recommendation even when `pipelineFingerprint` changes
- missing stored marker backfills without raising recommendation on first backfill pass
- semantically-equivalent profile key-order differences produce identical hash
- projection-version migration backfills marker without recommendation prompt on that migration pass

## Acceptance Criteria (v1)

- Adapter-owned curation schema is versioned and documented
- Concrete `curation.v1` stored schema contract is implemented (map-by-`homeyDeviceId`, baseline marker embedding, strict validation)
- Curation validation exists with clear errors
- Override-to-rule lowering + apply helper exist and are unit-tested
- Adapter applies curation (via runtime lowering) before executing compiled profiles
- Skipped/failing curation fields are observable in diagnostics
- Device-instance curation precedence over baseline updates is enforced by default
- Recommendation prompts are driven by baseline marker/hash detection rules
- Canonical baseline hash projection contract is implemented and versioned
- Compiler remains unchanged in responsibility (no runtime curation apply logic in compiler package)
- Docs and roadmap reflect compiler/adapter boundary clearly

## Implementation Phases (for adapter curation)

### Phase A — Schema + Validation

- Define `homey-curation/v1` schema/types (including `entries` map contract and `baselineMarker`)
- Implement validator
- Unit tests for valid/invalid schemas

### Phase B — Override Lowering + Apply Helper (Core)

- Implement deterministic override-to-rule lowering
- Implement apply helper/report (`applied/skipped/errors`)
- Unit tests

### Phase C — Collection Overrides

- Add `add/remove` for profile collections
- Unit tests for edge cases

### Phase D — Homey Storage Integration

- Persist curation set in Homey settings/storage
- Load/validate/apply at adapter runtime
- Safe fallback behavior + diagnostics

### Phase E — Baseline Marker + Recommendation Detection

- Implement canonical baseline projection + canonicalization helper
- Implement `baselineProfileHash` computation (`sha256` over canonical JSON)
- Version marker contract (`projectionVersion`)
- Persist marker metadata per `homeyDeviceId`
- Compute recommendation-available status on baseline refresh
- Backfill missing/version-mismatched markers without first-run prompt spam

### Phase F — Minimal Curation Admin Flow

- Basic internal/admin-facing way to inspect and edit curation entries (CLI/log/manual JSON first if needed)
- Optional UI later

## Repo Placement (recommended)

Since this is adapter-owned:

- `co.lazylabs.zwavejs2homey/src/curation/` (or similar inside app package)
  - `types.ts`
  - `validate-curation.ts`
  - `lower-curation-to-rules.ts`
  - `apply-curation.ts`
  - `storage.ts`
  - `tests/` (or app test folder)

If the adapter later grows a substantial shared runtime library:

- extract to `packages/homey-adapter-core/`

But v1 should stay close to the Homey app.

## Risks / Tradeoffs

- If override scope is too broad, runtime curation becomes a second rule engine
- If override scope is too narrow, users can’t fix real issues without compiler changes
- Compiler profile schema changes may require adapter curation migrations
- Provenance handling can get messy if not defined early (keep it simple in v1)

## Recommended First Slice (immediately actionable)

1. Add adapter curation types + schema validation (`homey-curation/v1`)
2. Unit tests for schema validation only
3. Update plans/docs to reference this adapter plan as the owner of runtime curation

# Homey Adapter Runtime Curation Layer (v1)

## Summary

Design and implement a Homey adapter-owned runtime curation system that applies user corrections to compiled Homey device profiles at runtime, without changing compiler responsibilities.

Related ADRs:

- `docs/decisions/0002-compiler-adapter-boundary.md`
- `docs/decisions/0004-generic-fallback-ownership.md`
- `docs/decisions/0006-homey-adapter-runtime-rule-order.md`
- `docs/decisions/0007-product-and-curation-single-target-bundles.md`

Compiler remains responsible for:

- compiled profile JSON
- provenance/diagnostics
- stable identifiers (`catalogId`, `diagnosticDeviceKey`, capability IDs)

Homey adapter becomes responsible for:

- curation schema (runtime patch format)
- patch storage
- patch application semantics
- curation UX/workflow

## Goals (v1)

- Let users correct mappings in the Homey app without rebuilding compiler outputs
- Keep runtime behavior deterministic (patches apply to explicit targets only)
- Preserve auditability (what changed, why, when)
- Maintain a strict compiler/adapter boundary
- Support both:
  - known catalog devices
  - unknown devices (`diagnosticDeviceKey` targeting)

## Non-Goals (v1)

- User-authored rule DSL in Homey UI
- Runtime inference/scoring engine
- Arbitrary code/transforms in curation
- Compiler-side patch application
- Full curation UI polish (basic workflow first)

## Ownership Boundary (Decision Locked)

### Compiler (already done)

- Produces compiled profiles
- Emits diagnostics/provenance
- Emits catalog annotations (`profile.catalogMatch`, report catalog context, unknown-device report)

### Homey Adapter (new)

- Defines runtime curation schema
- Stores patch sets
- Applies patches to compiled profiles before runtime execution
- Surfaces curation diagnostics to users/admins
- Handles migration/versioning of adapter-owned patch schema

## Runtime Curation Model (v1)

### Patching Strategy

Patch the compiled profile (not raw Z-Wave facts, not rules).

Runtime flow:

1. Load compiled profile
2. Apply adapter generic inference (`fill`-oriented cleanup)
3. Apply curation patches (final authority)
4. Execute final profile

### Patch Targeting (device selection)

Each patch targets one device by:

- `catalogId` (preferred when available)
- or `diagnosticDeviceKey` (fallback for unknown devices)

### Allowed Patch Scope (v1)

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

- patching provenance internals directly
- patching arbitrary nested fields by JSONPath
- changing compiler confidence flags directly
- patching rule layer semantics

## Patch Schema (Adapter-owned, v1)

Use a versioned JSON format in the Homey adapter.

### Top-level

- `schemaVersion` (e.g. `homey-runtime-curation/v1`)
- `updatedAt`
- `patches[]`

### Patch

- `patchId`
- `targetDevice`
  - `catalogId?`
  - `diagnosticDeviceKey?`
- `operations[]`
- `note?`
- `updatedAt?`

### Operations

Allowed ops:

- `replace`
- `add`
- `remove`
- `disable`

Operation shape:

- `op`
- `target`
- `value?` (required for `replace`/`add`, disallowed for `disable`, optional for `remove`)

### Target model (structured, not string paths)

Use structured targets (not raw JSON pointers) for safety:

- `device.classification.homeyClass`
- `device.classification.driverTemplateId`
- `capability:{capabilityId}.inboundMapping`
- `capability:{capabilityId}.outboundMapping`
- `capability:{capabilityId}.flags`
- `profile.capabilities`
- `profile.subscriptions`
- `profile.ignoredValues`

## Patch Apply Helper (Adapter module)

### Responsibility

Pure function (or near-pure helper) in the Homey adapter layer:

- input: compiled profile + matching patch set
- output: patched profile + application report

### Behavior (v1)

- Apply patches in deterministic order:
  - patch order in storage
  - operation order within patch
- Validate targets before mutation
- Record skipped operations (missing capability, invalid target, duplicate add, etc.)
- Preserve provenance by adding user-curation provenance records / supersedes references (adapter-defined)
- Never mutate original compiled profile in place

### Return type (conceptual)

- `profile`
- `appliedOps[]`
- `skippedOps[]`
- `errors[]`
- `provenanceUpdates[]` (or embedded only)

### Error posture

- Invalid stored patch schema -> reject patch set and log clearly
- Valid patch op but non-applicable target -> skip + report (not fatal)
- Fatal apply bug -> fail safe (use unpatched compiled profile + log)

## Persistence Model (v1)

Recommended:

- Homey app settings/storage as primary store

Store:

- full patch set JSON
- optional metadata per patch (author, last edited UI version)

Optional later:

- export/import JSON for backup/share

### Migration

- Patch schema is versioned
- Adapter owns migrations (e.g. `v1 -> v2`)
- Compiler version upgrades should not require patch rewrites unless compiled profile target fields change

## Adapter Integration Flow (Runtime)

1. Load compiled profile from compiler artifact
2. Determine device target identity:

- `catalogId` if available
- else `diagnosticDeviceKey`

3. Load matching curation patches from Homey storage
4. Validate patch schema
5. Apply patch helper
6. Use patched profile for:

- inbound updates (ZWJS -> Homey)
- outbound commands (Homey -> ZWJS)

7. Surface curation diagnostics in logs/UI if:

- skipped ops
- invalid patch set
- target mismatch after compiler profile changes

## Diagnostics & UX (v1 Minimal)

### Must-have diagnostics

- “Curation applied” summary per device
- skipped op reasons
- invalid patch schema errors
- target not found warnings

### Nice-to-have (later)

- preview diff before apply
- “reset curation for device”
- export/import patch set
- patch provenance timeline

No seed generator needed in v1.

## Tests (Adapter curation layer)

### 1) Schema validation tests

- valid patch set accepted
- invalid op/target/value combos rejected
- missing target device identity rejected

### 2) Apply helper tests (core)

- replace device class/template
- replace capability inbound/outbound mapping
- replace capability flags
- add/remove profile collection entries
- disable mapping/flag semantics
- missing capability target -> skipped op

### 3) Determinism tests

- patch ordering produces stable result
- repeated apply on same input patch set yields same result
- original compiled profile object remains unchanged

### 4) Provenance tests

- user curation provenance added
- supersedes/origin references preserved (adapter-defined model)

### 5) Integration tests (adapter-level)

- patched profile actually changes runtime mapping behavior
- outbound mapping correction affects command execution target
- invalid patch set falls back safely to unpatched profile

## Acceptance Criteria (v1)

- Adapter-owned patch schema is versioned and documented
- Patch validation exists with clear errors
- Patch apply helper exists and is unit-tested
- Adapter applies patches before executing compiled profiles
- Skipped/failing patch operations are observable in diagnostics
- Compiler remains unchanged in responsibility (no patch apply logic in compiler package)
- Docs and roadmap reflect compiler/adapter boundary clearly

## Implementation Phases (for adapter curation)

### Phase A — Schema + Validation

- Define `homey-runtime-curation/v1` schema/types
- Implement validator
- Unit tests for valid/invalid schemas

### Phase B — Patch Apply Helper (Core)

- Implement pure apply helper for replace ops on device/capability slots
- Add apply report (`applied/skipped/errors`)
- Unit tests

### Phase C — Collection Ops + Disable Semantics

- Add `add/remove` for profile collections
- Define and implement `disable` behavior clearly
- Unit tests for edge cases

### Phase D — Homey Storage Integration

- Persist patch set in Homey settings/storage
- Load/validate/apply at adapter runtime
- Safe fallback behavior + diagnostics

### Phase E — Minimal Curation Admin Flow

- Basic internal/admin-facing way to inspect and edit patches (CLI/log/manual JSON first if needed)
- Optional UI later

## Repo Placement (recommended)

Since this is adapter-owned:

- `co.lazylabs.zwavejs2homey/src/curation/` (or similar inside app package)
  - `types.ts`
  - `validate-patch.ts`
  - `apply-patch.ts`
  - `storage.ts`
  - `tests/` (or app test folder)

If the adapter later grows a substantial shared runtime library:

- extract to `packages/homey-adapter-core/`

But v1 should stay close to the Homey app.

## Risks / Tradeoffs

- If patch scope is too broad, runtime curation becomes a second rule engine
- If patch scope is too narrow, users can’t fix real issues without compiler changes
- Compiler profile schema changes may require adapter patch migrations
- Provenance handling can get messy if not defined early (keep it simple in v1)

## Recommended First Slice (immediately actionable)

1. Add adapter curation types + schema validation (`homey-runtime-curation/v1`)
2. Unit tests for schema validation only
3. Update plans/docs to reference this adapter plan as the owner of runtime curation

# Architecture

## Purpose

Bridge Z-Wave JS data and behavior into a Homey app with a clear separation between core bridge logic and Homey-specific integration.

## Repository Layout

- `packages/core/`: Shared bridge/domain logic (no Homey SDK dependencies)
- `co.lazylabs.zwavejs2homey/`: Homey app wrapper, manifest, drivers, capabilities, Homey lifecycle
- `docs/`: Durable project documentation
- `plan/`: Working plans and execution notes

## Boundaries

### Core (`packages/core`)

Owns:

- Z-Wave JS Server protocol client (`zwjs` client)
- Z-Wave JS connection/session lifecycle
- Protocol request/response/event handling
- Version/schema adaptation and normalization
- Thin protocol-oriented command wrappers

Does not own:

- Homey SDK classes
- Homey capability mappings
- Homey pairing UI
- Homey app manifest/runtime config
- Homey-specific abstractions in the protocol client API

### Homey App (`co.lazylabs.zwavejs2homey`)

Owns:

- App lifecycle (`onInit`, `onUninit`)
- Driver/device registration
- Pairing flows
- Capability mapping and updates
- Homey settings and user-facing diagnostics

### Homey MVP Topology (Locked)

Per ADR 0017, the Homey adapter runtime shape in v1 is:

- `bridge` driver:
  - singleton-like bridge device for ZWJS endpoint/control-plane actions and status
  - inclusion controls can be exposed here
- `node` driver:
  - one Homey device per imported ZWJS node
  - owns compiled profile resolution and runtime mapping execution

Pairing model in v1:

- Homey pairing is an import/link flow for already-managed ZWJS nodes.
- Recommended onboarding path is inclusion + add within `node` pairing.
- If inclusion is started from bridge UX, node creation is still explicit via node pairing.
- no automatic cross-driver pairing handoff is assumed in v1.

Implementation status:

- `drivers/bridge` and `drivers/node` scaffolds are in place in `co.lazylabs.zwavejs2homey`.
- bridge pairing currently enforces singleton add via a stable `device.data.id`.
- node pairing currently lists import candidates from live ZWJS (`getNodeList`), skipping controller node (`nodeId = 1`) and already paired `bridgeId + nodeId` entries.
- app runtime now loads a local compiled-profiles artifact at startup into a shared resolver index; node devices resolve match/fallback classification from that shared runtime state.
- runtime mapping execution runs through a generic kernel for compatible compiled slices (`inboundMapping.kind=value`, `outboundMapping.kind=set_value`):
  - no capability-ID contract whitelist in runtime mapping extraction
  - inbound/outbound coercion is transform-driven (`transformRef`) with typed fallback via live value metadata (`type`)
  - non-transformed values use primitive pass-through (string/number/boolean)
  - outbound writes are gated by live node facts (selector/target presence + writeability), not capability ID
  - runtime mapping now gates selectors/targets against live node defined-value facts and metadata before wiring listeners
  - per-device mapping diagnostics are persisted in `profileResolution.mappingDiagnostics` for operational visibility
  - runtime bindings are re-synced on startup and on relevant app settings updates (`zwjs_connection`, `compiled_profiles_file`) to avoid stale listeners/mappings
  - runtime bindings are also re-synced for affected node devices on selected node lifecycle events (`interview-completed`, `value-added`, `metadata-updated`)

Related locked MVP runtime policies:

- shared app-level ZWJS session ownership + inclusion lock (`docs/decisions/0018-homey-zwjs-session-and-inclusion-lock-v1.md`)
- node identity and import dedupe contract (`docs/decisions/0019-homey-node-identity-and-dedupe-v1.md`)
- compiled profile source and refresh policy (`docs/decisions/0020-homey-compiled-profile-source-and-refresh-policy-v1.md`)
- no-profile-match fallback behavior (`docs/decisions/0021-homey-no-profile-match-runtime-policy-v1.md`)
- class/capability structural mutation policy (`docs/decisions/0022-homey-device-class-and-capability-mutation-policy-v1.md`)

## Integration Contract (Draft)

The Homey app will import a protocol-first `zwjs` client surface from `@zwavejs2homey/core`.

Current direction:

- `createZwjsClient()`
- typed lifecycle/status/events
- protocol commands (`messageId` + `command`) and thin wrappers

Future likely additions:

- Higher-level bridge layer (still in core or separate package)
- Homey integration adapter (outside protocol client)
- Device discovery/mapping abstractions
- Command translation layer

## Capability Tracking

- `docs/zwjs-capability-matrix.md`: 3-way comparison of `zwave-js-server`, `zwave-js-ui`, and our `ZwjsClient`
- `docs/zwjs-nonprod-live-validation-checklist.md`: repeatable non-production validation procedure for zniffer and firmware workflows
- `plan/zwjs-parity-roadmap.md`: execution roadmap for closing prioritized parity gaps

## Homey Compiler (In Progress)

Current implemented foundation in `packages/compiler`:

- Homey-targeted rules compiler (layered rule semantics, matching, slot-level build state, compiled profile output)
- HA `zwave_js` discovery import pipeline:
  - source extractor subset from `discovery.py`
  - extracted artifact contract
  - translation to generated `ha-derived` rules
  - policy-driven platform output mapping/conflict resolution (`platform-output-policy.ts`) instead of inline importer switches
  - device class constraint propagation (`device_class_generic` / `device_class_specific`) to prevent over-broad matches (e.g. dimmer vs cover on CC 38)
  - tooling (`ha-import:extract`, `ha-import:report`)
- Catalog tooling and artifacts:
  - `catalog-devices/v1` artifact contract
  - `catalog` CLI (`fetch`, `normalize`, `merge`, `diff`, `validate`, `summary`)
  - conflict precedence and strict conflict mode
  - catalog indexing by `catalogId` and product triple
- Compiler diagnostics enriched with catalog context:
  - `catalogLookup` in file-based compile results
  - `profile.catalogMatch` annotation
  - catalog-aware curation hints, explicit `unknownDeviceReport`, and stable diagnostic device keys
- Added live compile inspection tooling:
  - `compiler:inspect-live` connects to a ZWJS instance, fetches node details, converts them to compiler device facts, and renders compiled profile results (including list view)
  - supports signature-targeted runs via `--signature <manufacturerId:productType:productId>` to focus curation on one product family at a time
  - live inspection/build tooling skips controller-like nodes by default (override with `--include-controller-nodes` for diagnostics)
  - supports both compile-on-the-fly (rule authoring) and compiled-artifact apply mode (runtime-style validation)
  - `compiler:validate-live` runs build + compiled-artifact apply in one pass and writes a markdown validation report (outcomes, review reasons, unmatched/suppressed hotspots)
  - supports optional validation gates (`--max-review-nodes`, `--max-generic-nodes`, `--max-empty-nodes`, `--fail-on-reason`) and machine summary JSON for CI automation
  - supports config ergonomics and replay modes:
    - gate profiles (`--gate-profile-file`) and merged config diagnostics (`--print-effective-gates`)
    - compiled-artifact reuse (`--compiled-file`) to skip build
    - offline summary replay (`--input-summary-json-file`) for gate-only rechecks
    - baseline regression deltas (`--baseline-summary-json-file`, `--max-*-delta`, `--fail-on-reason-delta`)
    - baseline snapshot helper (`--save-baseline-summary-json-file`) to refresh baseline artifacts from the current run
    - artifact retention policy (`--artifact-retention delete-on-pass`) to avoid keeping large generated compiled files after successful runs
    - signature iteration command is `compiler:simulate` (explicit-signature, simulate-centric flow)
    - baseline workflow wrapper (`compiler:baseline`) to run capture + zero-delta recheck in one command (including redacted-share support)
    - baseline-enabled markdown reports include delta sections for fast human triage
  - gate calibration/setup playbook lives in `docs/compiler-validation-gates.md`
- Added compiler artifact build foundation:
  - `compiler:build` emits `compiled-homey-profiles/v1` from compiler device facts files or directly from a live ZWJS instance (`--url` + `--all-nodes`/`--node`) plus layered rules inputs
  - `rules/` directory skeleton established for real `ha-derived`, `project/generic`, and `project/product` rulesets
  - canonical layered manifest now lives at `rules/manifest.json`
  - HA-derived generated rules and an initial project-generic ruleset are now checked in
  - rule authoring now supports compact scalar matcher syntax that is deterministically normalized to canonical array-based matcher models at load-time
  - policy decision: keep compiler generic rules minimal/provisional; generic fallback inference ownership is in the Homey adapter (ADR 0004)
  - compiler now applies a small HA-derived overlap suppression policy for same-selector conflicts (initially focused on curtain/multilevel duplicates and generic `number_value` shadowing)
  - compiler now exposes compiled-profile artifact runtime resolution helpers (index + match precedence) for shared tooling and upcoming Homey adapter orchestration
- Catalog/curation workflow decision:
  - no curation-seed artifact for now; rule/curation authoring remains schema-first using compiler diagnostics and stable device identifiers
- Runtime curation boundary decision:
  - compiler does not own runtime curation schema/apply semantics
  - Homey adapter owns runtime curation behavior and may define curation semantics to fit adapter needs
  - compiler compile-time rule scope is manifest-owned; non-manifest rules are adapter/runtime scope (`docs/decisions/0005-manifest-owned-compile-rule-scope.md`)
  - compile-time layer is manifest-only; per-rule `layer` fields are forbidden in manifest-scoped files (`docs/decisions/0008-manifest-layer-is-single-source-of-truth.md`)
  - adapter runtime order (v1) is generic inference first, then curation (curation wins) per `docs/decisions/0006-homey-adapter-runtime-rule-order.md`
  - product/compiler and adapter-curation authoring both prefer single-target bundles in v1 (`docs/decisions/0007-product-and-curation-single-target-bundles.md`)
  - product compile-time authoring is fully migrated to `product-rules/v1` bundle format (`docs/decisions/0009-product-rules-v1-only.md`)
  - adapter curation persistence (v1) uses Homey settings (`this.homey.settings`) with versioned payloads (`docs/decisions/0010-homey-adapter-curation-storage-v1.md`)
  - adapter curation model direction (v1) is materialized overrides, with concrete persisted schema now locked under `curation.v1` (`docs/decisions/0011-homey-curation-model-v1-materialized-overrides.md`, `docs/decisions/0016-homey-curation-v1-storage-schema.md`)
  - adapter executes curation by lowering persisted overrides into in-memory runtime rules and reusing rules-engine order semantics (`docs/decisions/0012-homey-curation-execution-via-runtime-rule-lowering.md`)
  - adapter runtime now loads + validates `curation.v1` from Homey settings, refreshes node runtime mappings on `curation.v1` changes, and applies per-device curation overrides before runtime capability mapping extraction
  - adapter curation precedence (v1) is per-device-instance override (`homeyDeviceId`) over compiler baseline, with explicit user adoption flow for new recommendations (`docs/decisions/0013-homey-device-instance-curation-precedence-v1.md`)
  - adapter recommendation prompts are driven by per-device baseline markers (`pipelineFingerprint` + canonical baseline profile hash) to detect meaningful baseline changes (`docs/decisions/0014-homey-baseline-recommendation-detection-v1.md`)
  - canonical baseline hash projection is versioned and explicitly defined (`docs/decisions/0015-homey-baseline-hash-canonical-projection-v1.md`)
  - Homey adapter topology/pairing model is locked to bridge+node drivers and explicit node import semantics (`docs/decisions/0017-homey-mvp-driver-topology-and-pairing-model.md`)
  - decisions are recorded in `docs/decisions/0002-compiler-adapter-boundary.md`, `docs/decisions/0003-defer-curation-seed-artifact.md`, `docs/decisions/0004-generic-fallback-ownership.md`, `docs/decisions/0005-manifest-owned-compile-rule-scope.md`, `docs/decisions/0006-homey-adapter-runtime-rule-order.md`, `docs/decisions/0007-product-and-curation-single-target-bundles.md`, `docs/decisions/0008-manifest-layer-is-single-source-of-truth.md`, `docs/decisions/0009-product-rules-v1-only.md`, `docs/decisions/0010-homey-adapter-curation-storage-v1.md`, `docs/decisions/0011-homey-curation-model-v1-materialized-overrides.md`, `docs/decisions/0012-homey-curation-execution-via-runtime-rule-lowering.md`, `docs/decisions/0013-homey-device-instance-curation-precedence-v1.md`, `docs/decisions/0014-homey-baseline-recommendation-detection-v1.md`, `docs/decisions/0015-homey-baseline-hash-canonical-projection-v1.md`, `docs/decisions/0016-homey-curation-v1-storage-schema.md`, `docs/decisions/0017-homey-mvp-driver-topology-and-pairing-model.md`, `docs/decisions/0018-homey-zwjs-session-and-inclusion-lock-v1.md`, `docs/decisions/0019-homey-node-identity-and-dedupe-v1.md`, `docs/decisions/0020-homey-compiled-profile-source-and-refresh-policy-v1.md`, `docs/decisions/0021-homey-no-profile-match-runtime-policy-v1.md`, and `docs/decisions/0022-homey-device-class-and-capability-mutation-policy-v1.md`
- Sequencing decision:
  - complete the compiler runtime-validation pipeline first (real HA-derived + project rulesets, compiled profiles export, live ZWJS validation using compiled artifacts)
  - defer Homey adapter implementation until compiled profiles can be validated end-to-end outside Homey

Reference plan:

- `plan/homey-translation-compiler-plan.md`
- `plan/tui-implementation-plan.md`

## Phase 4 TUI Architecture (Reset Completed)

Phase 4 completed this reset sequence:

1. test/docs/help migration for CLI cutover
2. dual-root TUI implementation on top of the updated CLI/tooling contracts
3. structured scaffold edit mode in panel TUI
4. convergence review and shared presenter/app flow extraction

Reset architecture direction:

- two startup roots:
  - nodes root (`--url ws://...`)
  - rules root (`--rules-only [--manifest-file ...]`)
- simulation-centric curation flow in both roots
- current status: panel-first runtime is implemented as default (`--ui panel`) with shell fallback (`--ui shell`)
- panel renderer implementation is now fully `neo-blessed`-based (custom frame-string renderer removed)
- value semantic annotation + relevance scoring now read from policy tables (`value-semantics-policy.ts`) instead of inline capability switch logic
- TUI startup is strict on `homey-authoring-vocabulary/v1`: missing/invalid/empty artifacts are fatal and surface regeneration guidance (`npm run compiler:homey-vocabulary`)

Implementation structure (delivered):

1. separate nodes stack (views + presenters)
2. separate rules stack (views + presenters)
3. shared services/core adapters where practical
4. typed scaffold edit mode for panel authoring UX
5. shared convergence layers for draft editing, signature workflows, and mode-adapter dispatch

Data flow remains:

- intent -> presenter -> services -> core/tooling -> presenter -> view-model -> view

Guardrails remain:

- no ZWJS mutation behavior in this phase
- no compiler semantic redesign in this phase
- Homey adapter implementation can resume on top of this completed Phase 4 baseline

## Runtime Flow (Target, Locked MVP Shape)

1. Homey app starts and initializes shared ZWJS session service from `zwjs_connection`.
2. Bridge driver/device surfaces control-plane state and actions (including inclusion controls).
3. Node driver pairing imports/link-selects ZWJS nodes (explicit add).
4. Node device resolves compiled profile using shared compiler resolver (product triple -> nodeId -> deviceKey).
5. Node device executes inbound/outbound mappings for runtime I/O.
6. Node-level curation is applied as adapter-owned runtime overrides (generic first, curation second).

## Open Questions

- How should capability support be declared (static tables vs dynamic feature detection)?

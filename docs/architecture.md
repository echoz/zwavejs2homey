# Architecture

## Goal

Deliver a Homey app that uses a live `zwave-js-server` backend, with:

- protocol/runtime concerns isolated from Homey SDK concerns
- compile-time profile generation separated from runtime adaptation
- deterministic, testable behavior across tooling and app runtime
- an explicit structure that supports the project's learning goal: practicing Codex-assisted development workflows

## Repo Map (High-Level)

```text
zwavejs2homey/
├─ packages/
│  ├─ core/        # ZwjsClient: transport, typed wrappers/events, mutation policies
│  ├─ compiler/    # Rule engine + HA import + catalogs + compiled artifacts
│  └─ tui/         # Contributor UX (panel/shell), simulation, scaffold editing
├─ co.lazylabs.zwavejs2homey/
│  └─ Homey app    # app lifecycle, drivers, pairing, runtime mapping, curation runtime
├─ rules/          # Manifest + generated HA-derived + project generic/product rules
├─ tools/          # CLI entrypoints for inspect/build/validate/simulate/catalog/vocab
├─ docs/           # Architecture + ADRs + capability matrix
└─ plan/           # Roadmaps and working execution plans
```

## System Shape

### Compile-Time Path

```text
HA source + project rules + catalog + vocabulary
                |
                v
        @zwavejs2homey/compiler
        - load manifest/rules
        - apply layered rules
        - emit diagnostics
                |
                v
   compiled-homey-profiles/v1 artifact
```

### Runtime Path (Homey)

```text
Homey App (app.ts)
  |
  +-- bridge-session seam
  |    - default session id: `main`
  |    - owns per-bridge ZwjsClient attachment/status
  |    - current behavior remains singleton, but runtime access is now bridge-scoped
  +-- compiled profile runtime (artifact + resolver index)
  +-- curation runtime (curation.v1 load/validate)
  |
  +--> drivers/bridge  (singleton-like control plane)
  +--> drivers/node    (one Homey device per imported ZWJS node)
             |
             v
       node runtime sync
       1) resolve compiled profile
       2) apply per-device curation overrides
       3) extract runtime mappings
       4) gate by live readable/writeable facts
       5) wire inbound/outbound listeners
       6) persist diagnostics to device store
```

## Ownership Boundaries

### `@zwavejs2homey/core`

Owns:

- websocket transport/session lifecycle
- protocol command wrappers and typed guards/events
- mutation policy enforcement

Does not own:

- Homey driver/device behavior
- profile rule semantics
- curation persistence/apply policy

### `@zwavejs2homey/compiler`

Owns:

- rule DSL + layered compile engine
- HA import translation
- catalog diagnostics/indexing
- compiled profile artifact + resolver helpers

Does not own:

- Homey SDK runtime behavior
- adapter-owned curation persistence semantics

### `@zwavejs2homey/tui`

Owns:

- contributor-facing node/rule exploration
- simulation/inspect workflows
- scaffold authoring/editing UX

Does not own:

- Homey runtime orchestration
- live device execution logic

### `co.lazylabs.zwavejs2homey` (Homey app)

Owns:

- app lifecycle and settings orchestration
- pairing/import model (`bridge` + `node`)
- bridge-session ownership (`getBridgeSession(bridgeId?)`) and default-session routing
- runtime compiled profile resolution + mapping execution
- `curation.v1` load/validate/lower/apply integration
- pairing UX policy:
  - current MVP keeps Homey system templates for selection/add (`list_devices` -> `add_devices`)
  - custom post-add guidance/summary views are now used for onboarding clarity:
    - bridge: `next_steps`
    - node: `import_summary`
  - deep custom pairing layouts beyond template steps remain post-MVP

## Current State

Delivered:

- protocol client (`core`) is stable and tested
- compiler pipeline and diagnostics/tooling are fully operational
- TUI is delivered (panel-first, dual-root, simulation/scaffold workflows)
- Homey app topology is in place:
  - `bridge` singleton-like pairing
  - `node` import flow with dedupe (`bridgeId + nodeId`)
- bridge-session abstraction is in place:
  - app runtime now owns bridge sessions explicitly instead of relying on implicit global client state
  - drivers/devices resolve runtime through bridge session first (`getBridgeSession`) with legacy fallbacks retained
  - current runtime behavior is unchanged (`main` session only), but multi-bridge seams are now test-backed
- runtime mapping kernel is live:
  - generic `value` inbound + `set_value` outbound path
  - transform-aware coercion
  - live read/write gating and mapping diagnostics
- curation baseline is live:
  - strict `curation.v1` validation
  - deterministic lowering + apply helper
  - per-device curation applied before runtime mapping extraction

Partially complete / next:

- baseline recommendation detection is now wired:
  - canonical projection/hash helpers in adapter curation runtime
  - per-device recommendation state computed during node profile sync
  - recommendation diagnostics persisted in `profileResolution`
- app now exposes normalized node runtime diagnostics via `getNodeRuntimeDiagnostics(...)`
- bridge device diagnostics snapshots are now refreshed from app lifecycle/settings/events and persisted in device store (`runtimeDiagnostics`)
- bridge device now exposes app-facing non-UI runtime hooks for settings/custom views:
  - `getRuntimeDiagnostics(...)`
  - `getRecommendationActionQueue(...)`
  - `executeRecommendationAction(...)`
  - `executeRecommendationActions(...)`
- Homey app API route surface now exposes diagnostics/recommendation orchestration endpoints:
  - `GET /runtime/diagnostics`
  - `GET /runtime/recommendations`
  - `POST /runtime/recommendations/execute`
  - `POST /runtime/recommendations/execute-batch`
  - all endpoints now return a stable response envelope (`schemaVersion`, `ok`, `data`, `error`)
- API parity guard test now verifies:
  - `.homeycompose/app.json` and `app.json` route parity
  - route-key parity with exported route handlers
  - canonical method/path constraints for runtime routes
- runtime API smoke tool now exists for live app route reachability/envelope checks:
  - `tools/homey-runtime-api-smoke.mjs`
  - npm alias: `npm run homey:runtime-api:smoke -- ...`
- a runtime API client helper now exists for settings/custom-view consumers:
  - `co.lazylabs.zwavejs2homey/runtime-api-client.js`
  - contract reference: `docs/homey-api-contract.md`
- node Device Tools host path is now wired:
  - node driver `onRepair` session handlers:
    - `device_tools:get_snapshot`
    - `device_tools:refresh`
    - `device_tools:execute_action`
  - app-level targeted snapshot API:
    - `getNodeDeviceToolsSnapshot({ homeyDeviceId })`
    - stable schema: `node-device-tools/v1`
  - read-only custom view scaffold:
    - `co.lazylabs.zwavejs2homey/drivers/node/repair/device_tools.html`
  - Device Tools actions now execute explicit recommendation updates:
    - `backfill-marker` and `adopt-recommended-baseline`
    - action handler returns `{ actionResult, snapshot }` for single-roundtrip UI refresh
  - host-path/UX hardening:
    - canonical host now uses only `drivers/node/repair/device_tools.html`
    - duplicate `drivers/node/pair/device_tools.html` fallback removed
    - no-op/mismatch outcomes now surface friendlier action status messaging
    - recommendation UI now shows raw reason codes alongside human labels
    - `Latest Action` diagnostics panel shows requested/selected/executed/reason/latest-state fields
- app now exposes non-UI recommendation action APIs:
  - `backfillCurationBaselineMarker(homeyDeviceId)`
  - `adoptRecommendedBaseline(homeyDeviceId)`
- app now exposes non-UI recommendation workflow APIs:
  - `getRecommendationActionQueue(...)`
  - `executeRecommendationAction(...)`
  - `executeRecommendationActions(...)`
  - `backfillMissingCurationBaselineMarkers(...)`
- recommendation execution semantics now handle churn/no-op explicitly:
  - single-action execution revalidates latest queue state when adopt/backfill does not execute
  - stale requests now return `action-state-changed` with `latestReason` context
  - batch execution reuses single-action executor for semantic parity
  - Device Tools action messaging now includes churn/no-op reason labels
- additional Homey Device Tools UX polish beyond current action flow baseline
- expanded runtime mapping vertical coverage
  - added explicit mixed numeric/boolean runtime mapping coverage for capability families such as `target_temperature` and `alarm_contact` in node-runtime + harness tests
  - added explicit mixed numeric/string runtime mapping coverage for capability families such as `measure_humidity` and `thermostat_mode` in node-runtime + harness tests
  - added edge-case diagnostics coverage for enum-like mappings with unreadable inbound selectors and unknown outbound writeability

Deferred:

- non-production firmware/zniffer parity validation (`ZWJS-G2`, `ZWJS-G3`)

## Runtime Events and Refresh

```text
Settings changes
  zwjs_connection          -> reload client -> refresh node mappings
  compiled_profiles_file   -> reload resolver -> refresh node mappings
  curation.v1              -> reload curation -> refresh node mappings

Selected ZWJS node lifecycle events
  interview-completed / value-added / metadata-updated
    -> targeted node refresh (not global refresh)
```

## Quality and Guardrails

Primary gate: `npm run check`

- format check
- Homey lint
- policy guard (`npm run policy:guard`) for hardcoding boundaries
- test suites across compiler/core/tui/homey app

## Where We Are Going

Near-term:

1. close Phase 6 reliability + UX scope:
   - settings/pairing/repair diagnostics clarity
   - runtime mapping drift-proofing gates
   - support/log bundle workflow
2. keep pairing/settings flows defect-driven while preserving MVP template constraints
3. prepare session registry evolution from singleton default (`main`) to multi-bridge enrollment when pairing model changes

After that:

1. per-node capability expansion and broader runtime vertical coverage
2. non-production parity validation for deferred protocol domains
3. deeper custom pairing views for richer bridge/node onboarding UX beyond system template constraints

## Key ADRs

- topology/pairing/session/runtime contracts: `0017`..`0022`
- curation storage/model/precedence/recommendation contracts: `0010`..`0016`
- compiler/adapter boundary contracts: `0002`, `0004`, `0005`, `0008`, `0009`

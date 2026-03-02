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
  +-- shared ZwjsClient session (@zwavejs2homey/core)
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
- runtime compiled profile resolution + mapping execution
- `curation.v1` load/validate/lower/apply integration

## Current State

Delivered:

- protocol client (`core`) is stable and tested
- compiler pipeline and diagnostics/tooling are fully operational
- TUI is delivered (panel-first, dual-root, simulation/scaffold workflows)
- Homey app topology is in place:
  - `bridge` singleton-like pairing
  - `node` import flow with dedupe (`bridgeId + nodeId`)
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
- app now exposes non-UI recommendation action APIs:
  - `backfillCurationBaselineMarker(homeyDeviceId)`
  - `adoptRecommendedBaseline(homeyDeviceId)`
- app now exposes non-UI recommendation workflow APIs:
  - `getRecommendationActionQueue(...)`
  - `executeRecommendationAction(...)`
  - `executeRecommendationActions(...)`
  - `backfillMissingCurationBaselineMarkers(...)`
- Homey settings/diagnostics UX consumption around curation and recommendations
- expanded runtime mapping vertical coverage

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

1. wire diagnostics snapshot API into Homey-facing UX/settings surfaces
2. harden recommendation adoption/backfill flows in app-facing paths
3. continue capability vertical expansion with runtime + harness tests

After that:

1. support/log bundle workflows
2. non-production parity validation for deferred protocol domains

## Key ADRs

- topology/pairing/session/runtime contracts: `0017`..`0022`
- curation storage/model/precedence/recommendation contracts: `0010`..`0016`
- compiler/adapter boundary contracts: `0002`, `0004`, `0005`, `0008`, `0009`

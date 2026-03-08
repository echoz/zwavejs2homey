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
  |    - runtime is now multi-bridge capable (`main`, `bridge-2`, ...)
  +-- compiled profile runtime (artifact + resolver index)
  +-- curation runtime (curation.v1 load/validate)
  |
  +--> drivers/bridge  (one control-plane device per ZWJS instance)
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
       7) optionally apply curated-profile extension handlers (custom panel/actions)
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
  - custom pair UX is now applied where it removes ambiguity without broad flow complexity:
    - bridge: `bridge_config` (per-bridge URL/auth setup, inline save feedback, then close)
    - node: `import_summary` (post-add import status/diagnostics)
  - deep custom pairing layouts beyond template steps remain post-MVP

## Current State

Delivered:

- protocol client (`core`) is stable and tested
- compiler pipeline and diagnostics/tooling are fully operational
- curated artifact shipping path is explicit and deterministic:
  - bundled artifact build (`compiler:build:bundled`)
  - bundled artifact freshness verification (`compiler:verify:bundled`)
- TUI is delivered (panel-first, dual-root, simulation/scaffold workflows)
- Homey app topology is in place:
  - `bridge` multi-instance pairing (`main`, `bridge-2`, `bridge-3`, ...)
  - `node` import flow with dedupe (`bridgeId + nodeId`)
- bridge-session abstraction is in place:
  - app runtime now owns bridge sessions explicitly instead of relying on implicit global client state
  - drivers/devices resolve runtime through bridge session first (`getBridgeSession`) with legacy fallbacks retained
  - bridge device settings now configure per-bridge transport (`zwjs_url`, optional bearer auth)
- runtime mapping kernel is live:
  - generic `value` inbound + `set_value` outbound path
  - transform-aware coercion
  - live read/write gating and mapping diagnostics
- runtime generic inference expansion is explicitly frozen in v1:
  - adapter runtime remains compiled-profile-first plus instance curation
  - no additional runtime generic-inference layer is applied today
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
  - `GET /runtime/support-bundle`
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
  - supports optional bridge scoping (`--bridge-id`)
- support bundle CLI now exists for read-only diagnostics/recommendation capture:
  - `tools/homey-support-bundle.mjs`
  - npm alias: `npm run homey:support-bundle -- ...`
  - supports optional bridge scoping (`--bridge-id`)
  - optional share redaction via `--redact-share`
- settings diagnostics page now applies request-order gating:
  - stale async diagnostics/inventory responses are ignored
  - bridge scope selector + refresh action disable while in-flight requests are active
  - bootstrap now fails open: when shared gate script wiring is unavailable, a local gate fallback keeps settings functional
  - bridge inventory rows now surface diagnostics refresh telemetry per bridge:
    - last successful refresh timestamp
    - last failure timestamp/reason
    - last refresh trigger reason
- panel liveness gate coverage now exists for active custom panel session handlers:
  - pair/repair event handlers are exercised in table-driven tests with deadline-based liveness checks
  - timed session handler timeout behavior is explicitly locked to prevent spinner/hang regressions
  - callback-mode handler invocation paths are also covered, including timeout/error propagation behavior
  - timed-handler event inventories are contract-checked per driver to detect accidental panel event drift
- a runtime API client helper now exists for settings/custom-view consumers:
  - `co.lazylabs.zwavejs2homey/runtime-api-client.js`
  - contract reference: `docs/homey-api-contract.md`
- bridge diagnostics snapshots now include refresh telemetry:
  - app tracks per-bridge refresh success/failure markers
  - `getNodeRuntimeDiagnostics(...)` and `getBridgeRuntimeInventory()` now expose this telemetry
  - bridge tools and settings surfaces render those markers for operator triage
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
  bridge device settings   -> reload that bridge session -> refresh node mappings
  zwjs_connection          -> reload default session (`main`) [legacy fallback, no longer app-UI editable]
  compiled_profiles_file   -> reload resolver -> refresh node mappings
  curation.v1              -> reload curation -> refresh node mappings

Bridge lifecycle
  bridge device deleted    -> cascade delete node devices bound to that bridgeId -> remove bridge session/connection

Selected ZWJS node lifecycle events
  interview-completed / value-added / metadata-updated
    -> targeted node refresh (not global refresh)
```

## Curated Profile Extension Lane (In Progress)

```text
compiled profile match (profileId + driverTemplateId)
                    |
                    v
           extension registry lookup
           (curated profile specific)
                    |
        +-----------+-----------+
        |                       |
        v                       v
  standard Homey caps      custom panel/actions
  (locked, alarms, etc.)   (example: lock user-code admin)
```

Design intent:

- system Homey capabilities stay the baseline contract for all devices
- extension behavior is additive and explicitly scoped to curated profile identity
- extension handlers remain adapter-owned runtime behavior (not compiler mutation logic)
- first target extension vertical is lock user-code management

Current status:

- registry + contract foundation has landed in Homey runtime:
  - `homey-profile-extension-contract/v1` typed schema
  - deterministic predicate matching (`profileId`, `driverTemplateId`, `homeyClass`)
  - explainable mismatch reasons for diagnostics/UX
  - contract validation coverage in `test/profile-extension.test.ts`
- discovery/read API slice has landed:
  - runtime methods: `getProfileExtensionInventory(...)`, `getProfileExtensionRead(...)`
  - route surface: `GET /runtime/extensions`, `GET /runtime/extensions/read`
  - client wrappers + route/runtime tests in place

## Quality and Guardrails

Primary gate: `npm run check`

- format check
- Homey lint
- policy guard (`npm run policy:guard`) for hardcoding boundaries
- test suites across compiler/core/tui/homey app

## Where We Are Going

Near-term:

1. Phase 6 closure is complete:
   - settings/pairing/repair diagnostics clarity
   - runtime mapping drift-proofing gates
   - support/log bundle workflow
2. preserve current pairing/settings reliability baseline while Phase 7 work begins
3. node pairing discovery now aggregates all configured bridges by default:
   - candidates remain bridge-attributed (`bridgeId + nodeId` identity)
   - one-bridge discovery failures do not block healthy bridges
4. capability expansion loop is now tooling-backed:
   - `homey:capability-audit` ranks capability expansion pressure from bundled profiles + runtime support-bundle diagnostics
   - runtime includes specialized coercion for `measure_battery` and `enum_select` as first Phase 7 expansion slice

After that:

1. per-node capability expansion and broader runtime vertical coverage
2. deeper custom UX where Homey system templates are too constrained
3. reusable curated-profile extension framework (registry + runtime API + safety constraints)
4. non-production parity validation for deferred protocol domains

## Key ADRs

- topology/pairing/session/runtime contracts: `0017`..`0022`
- curation storage/model/precedence/recommendation contracts: `0010`..`0016`
- compiler/adapter boundary contracts: `0002`, `0004`, `0005`, `0008`, `0009`

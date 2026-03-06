# Roadmap

## Snapshot (2026-03-02)

```text
Phase 1  Foundation                  [DONE]
Phase 2  ZwjsClient core             [DONE*]
Phase 3  Homey compiler              [DONE*]
Phase 4  TUI explorer/curation       [DONE]
Phase 5  Homey adapter MVP           [ACTIVE]
Phase 6  Reliability + UX            [NEXT]

* remaining deferred items are environment-dependent follow-ups
```

## Project Context

- Personal side project focused on learning Codex-assisted engineering workflows while shipping a real Homey + ZWJS bridge.
- Roadmap phases prioritize clear boundaries, observable diagnostics, and test-backed iteration to make learning and maintenance explicit.

## North Star

Ship a Homey app that:

- uses a shared live `zwave-js-server` session
- applies compiler-produced profiles deterministically at runtime
- supports device-instance curation (`curation.v1`) with clear diagnostics
- remains maintainable through strict package boundaries

## Phase Status

## Phase 1 — Foundation (Done)

- monorepo/workspaces established
- build/test/check workflow established
- Homey app scaffold validated

## Phase 2 — Protocol Core (`ZwjsClient`) (Done, with deferred validation)

Done:

- protocol-first client with typed wrappers/events
- reconnect/session handling
- mutation policy controls
- fixture/mocked/integration tests

Deferred:

- non-production live validation for zniffer/firmware (`ZWJS-G2`, `ZWJS-G3`)

## Phase 3 — Homey Mapping Compiler (Done for MVP)

Done:

- layered rule compiler + strict DSL validation
- HA import pipeline + generated `ha-derived` rules
- catalog tooling + catalog-aware diagnostics
- compiled artifact build/inspect/validate/simulate CLIs
- vocabulary artifact pipeline
- performance and diagnostic hardening

Deferred:

- second real catalog source adapter

## Phase 4 — TUI Explorer + Curation Tooling (Done)

Done:

- dual-root UX (`--url` nodes root, `--rules-only` rules root)
- panel-first runtime (`neo-blessed`) + shell fallback
- simulation-centric workflows
- scaffold authoring/editing with typed vocabulary-backed inputs
- convergence refactors to shared presenter cores

## Phase 5 — Homey Adapter MVP (Active)

Done so far:

- locked topology (`bridge` + `node`) and pairing model
- app-level shared ZWJS session ownership
- compiled profile runtime loader/resolver integration
- node runtime mapping kernel with live read/write gating + diagnostics
- runtime rebind on startup/settings/events
- `curation.v1` load/validate baseline
- deterministic curation lowering/apply integrated into node runtime path
- baseline marker hash/recommendation-state runtime detection integrated into node sync diagnostics
- app-facing normalized diagnostics snapshot API for node runtime state (`getNodeRuntimeDiagnostics`)
- bridge-device diagnostics refresh wiring (startup/settings/events) with compact stored summary snapshots
- bridge-device non-UI runtime API forwarding for diagnostics/recommendation queue/action execution
- Homey app API routes for diagnostics/recommendation execution (settings/custom-view ready)
- stable API response envelope for diagnostics/recommendation routes (`schemaVersion`, `ok`, `data`, `error`)
- runtime API client helper + contract doc for settings/custom-view consumers
- API manifest parity guard test (route manifest <-> handler exports <-> canonical runtime route shape)
- live runtime API smoke tool for route/envelope health checks against running Homey app endpoints
- app-facing recommendation actions:
  - baseline marker backfill (`backfillCurationBaselineMarker`)
  - recommendation adopt/full-replace (`adoptRecommendedBaseline`)
- recommendation workflow orchestration APIs:
  - action queue (`getRecommendationActionQueue`)
  - single-action execution (`executeRecommendationAction`)
  - queued execution summary (`executeRecommendationActions`)
  - batch backfill (`backfillMissingCurationBaselineMarkers`)
- node Device Tools host wiring:
  - node `onRepair` session handlers for per-device snapshots (`device_tools:get_snapshot`, `device_tools:refresh`)
  - targeted app snapshot API (`getNodeDeviceToolsSnapshot`) with stable read-only schema (`node-device-tools/v1`)
  - first read-only custom view scaffold in driver custom view files (`drivers/node/repair/device_tools.html`)
- node Device Tools action wiring:
  - session action handler (`device_tools:execute_action`) with strict action validation
  - action flow returns refreshed per-device snapshot for immediate UI refresh
  - Device Tools custom view now supports explicit confirm + execute for backfill/adopt
- node Device Tools host/UX hardening:
  - canonical host path consolidated to `drivers/node/repair/device_tools.html`
  - duplicate fallback view removed from `drivers/node/pair/device_tools.html`
  - action outcomes now surface friendlier no-op/mismatch/error statuses
  - recommendation panel now includes explicit reason-code visibility
  - added `Latest Action` diagnostics panel for requested/selected/executed/reason/latest-state troubleshooting
- recommendation churn hardening:
  - single-action execution now revalidates latest recommendation state on mutation no-op/failure
  - stale execution now returns explicit `action-state-changed` diagnostics with latest reason context
  - batch execution now reuses single-action semantics for consistent mismatch/churn behavior
  - Device Tools action summaries now cover churn/no-op reasons with explicit labels
- runtime-mapping coverage broadening:
  - added generic mixed numeric/boolean vertical harness coverage (`target_temperature`, `alarm_contact`)
  - added generic mixed numeric/string vertical harness coverage (`measure_humidity`, `thermostat_mode`)
  - added enum-like mapping diagnostics edge-case coverage (`thermostat_mode` unreadable inbound + unknown outbound writeability)
  - validated inbound/outbound/event update flows remain capability-agnostic
- adapter no-profile-match policy locked in harness coverage:
  - compiled resolver loaded + no match -> deterministic `no_compiled_profile_match` fallback
  - compiled resolver unavailable + no match -> deterministic `compiled_profile_artifact_unavailable` fallback
  - both no-match paths lock classification fallback contract (`other` + `generic` + `uncurated`) and no mapping/listener side effects
- Homey CLI workspace/prod-dependency compatibility hardening:
  - removed Homey app package from root npm workspace membership
  - switched root Homey-targeted scripts to `npm --prefix` invocation
  - pinned linked-package runtime/toolchain deps in app package (`ws`, `typescript`, `@types/ws`) so `homey app run` preprocess `npm ls --only=prod` succeeds with local `file:` links
  - added root `postinstall` to install nested Homey app dependencies automatically

In progress / next:

1. continue broadening runtime mapping coverage with tests
2. prepare adapter bridge-session abstraction for future multi-bridge support without changing current singleton behavior
3. maintain pairing/settings/repair UX as MVP-frozen unless defects are reported

Exit criteria:

- recommendation state computed per device and persisted/observable
- curation diagnostics are actionable for operators/users
- stable runtime behavior under app restart/settings reload/node event churn

## Phase 6 — Reliability + UX (Next)

Planned:

1. iterate on Homey settings/diagnostics UX for profile + curation state
2. support/log bundle workflows
3. non-production protocol validation runs (deferred Phase 2 items)
4. optional deeper custom Homey pairing layouts where system templates remain too constrained

## Active Risks

- recommendation workflow semantics may need refinement during real UX integration
- runtime mapping breadth may outpace validation coverage if not expanded with tests
- deferred non-production validation leaves blind spots in less-used mutation domains

## References

- architecture: `docs/architecture.md`
- active sprint log: `plan/current-sprint.md`
- curation execution plan: `plan/homey-adapter-runtime-curation-plan.md`
- decision records: `docs/decisions/`

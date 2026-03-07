# Roadmap

## Snapshot (2026-03-06)

```text
Phase 1  Foundation                  [DONE]
Phase 2  ZwjsClient core             [DONE*]
Phase 3  Homey compiler              [DONE*]
Phase 4  TUI explorer/curation       [DONE]
Phase 5  Homey adapter MVP           [DONE]
Phase 6  Reliability + UX            [ACTIVE]

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

## Phase 5 — Homey Adapter MVP (Done)

Done so far:

- locked topology (`bridge` + `node`) and pairing model
- app-level shared ZWJS session ownership
- explicit bridge-session seam for runtime ownership:
  - default session id `main` remains canonical first bridge id
  - runtime now supports multiple bridge sessions (`main`, `bridge-N`)
  - app now exposes `getBridgeSession(bridgeId?)` and routes runtime lifecycle through session state
  - app now exposes per-bridge lifecycle APIs:
    - `listBridgeSessions()`
    - `configureBridgeConnection({ bridgeId, settings })`
    - `removeBridgeConnection({ bridgeId })`
  - bridge/node drivers and devices resolve session-scoped client access first, with legacy fallbacks retained
- compiled profile runtime loader/resolver integration
- node runtime mapping kernel with live read/write gating + diagnostics
- runtime rebind on startup/settings/events
- `curation.v1` load/validate baseline
- deterministic curation lowering/apply integrated into node runtime path
- baseline marker hash/recommendation-state runtime detection integrated into node sync diagnostics
- app-facing normalized diagnostics snapshot API for node runtime state (`getNodeRuntimeDiagnostics`)
- bridge-device diagnostics refresh wiring (startup/settings/events) with compact stored summary snapshots
- bridge read-only diagnostics enrichment:
  - expanded runtime session/transport facts on pairing/repair surfaces
  - added profile source + confidence breakdown aggregates and skip-reason rollups for imported nodes
- node read-only diagnostics enrichment:
  - expanded node import-summary session/transport facts and profile attribution detail rows
  - added action-needed and profile attribution aggregate counters for node import diagnostics
- pairing UX polish within Homey template limits:
  - dynamic bridge/node follow-up guidance in pairing summary views based on runtime state
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

Completion notes:

1. closure-gate code review completed for pairing/runtime/diagnostics paths
2. hard gates passing: `npm --prefix co.lazylabs.zwavejs2homey test`, `homey app validate` (publish level)
3. pairing and repair UX are now defect-driven only for MVP scope

Exit criteria:

- recommendation state computed per device and persisted/observable
- curation diagnostics are actionable for operators/users
- stable runtime behavior under app restart/settings reload/node event churn

## Phase 6 — Reliability + UX (Active)

Active focus:

1. iterate on Homey settings/diagnostics UX for profile + curation state
2. continue reliability hardening and drift-proofing gates for runtime mapping/policy
3. support/log bundle workflows
4. non-production protocol validation runs (deferred Phase 2 items)
5. optional deeper custom Homey pairing layouts where system templates remain too constrained

Not in Phase 6 scope:

- per-node capability expansion beyond the current mapped vertical set (tracked for the next phase)

Delivered in Phase 6 so far:

- runtime support-bundle workflow CLI (`homey:support-bundle`) for read-only diagnostics/recommendation capture
- canonical runtime support-bundle API route (`GET /runtime/support-bundle`) with app/client/smoke coverage
- settings UI support-bundle export action with optional redaction toggle
- optional `--redact-share` mode for safer external issue/report sharing
- generic inference policy checkpoint closed:
  - runtime generic inference remains frozen in v1
  - adapter runtime stays compiled-profile-first + curation-only
- bridge configuration moved to bridge-device settings (multi-instance model):
  - bridge pairing now generates deterministic per-bridge ids (`main`, `bridge-2`, ...)
  - bridge session transport config is now device-scoped (`zwjs_url`, optional bearer auth)
  - diagnostics/recommendation APIs now support bridge filtering (`bridgeId`)
- pairing/settings UX simplification:
  - bridge pairing now completes from `bridge_config` with inline success/error messaging (no `next_steps` screen in active flow)
  - app settings page is diagnostics/support-bundle focused; global connection editing is removed from app settings UI
- app settings bridge visibility:
  - added read-only runtime bridge inventory endpoint (`GET /runtime/bridges`)
  - settings page now lists configured bridges with connection/runtime status and imported-node counts
  - settings diagnostics/support-bundle flows now support per-bridge scope selection and row-level quick actions (`Use Scope`/`Help`)
  - settings diagnostics/inventory requests now use stale-response guards to prevent older async payloads from overriding newer scope selections
- panel liveness gate coverage:
  - table-driven tests now assert active pair/repair handlers are registered and return valid payload shapes within deadlines
  - timed session handler behavior is now regression-tested to reject stalled panel events instead of hanging indefinitely
  - callback-mode panel invocation paths are now regression-tested for the same handlers
  - driver timed-handler event inventories are now locked to active panel contracts
- operator CLI parity for bridge scoping:
  - runtime API smoke CLI supports `--bridge-id` for bridge-scoped read-route checks
  - support-bundle CLI supports `--bridge-id` and records bridge scope in exported metadata
- bridge diagnostics telemetry visibility:
  - app now tracks per-bridge diagnostics refresh success/failure markers
  - `GET /runtime/bridges` and bridge-scoped diagnostics now expose refresh timestamps + last failure reason
  - settings bridge table + bridge tools surface those markers for faster triage

## Active Risks

- recommendation workflow semantics may need refinement during real UX integration
- runtime mapping breadth may outpace validation coverage if not expanded with tests
- deferred non-production validation leaves blind spots in less-used mutation domains

## References

- architecture: `docs/architecture.md`
- active sprint log: `plan/current-sprint.md`
- curation execution plan: `plan/homey-adapter-runtime-curation-plan.md`
- decision records: `docs/decisions/`

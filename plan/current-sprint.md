# Current Sprint

## Goal

Complete Phase 5 Homey adapter MVP runtime and pairing-readiness:

- keep runtime mapping/capability behavior deterministic and test-backed
- improve bridge/node read-only operational visibility from live ZWJS data
- keep pairing flow understandable within Homey system-template constraints
- keep compiler/TUI artifacts and adapter runtime behavior aligned

## In Progress

- Phase 5 Homey adapter stabilization and UX pass:
  - bridge/node pairing and runtime flows are working; focus is now quality, diagnostics, and usability
  - continue expanding read-only bridge/node details surfaced from ZWJS runtime
  - keep docs/ADRs/roadmap synchronized as MVP pairing constraints and UX direction evolve
  - preserve strict package boundaries (`core`/`compiler`/`tui`/Homey app)

## Recently Completed

- Latest node read-only enrichment slice:
  - expanded node Device Tools read-only diagnostics to surface richer operator context:
    - ZWJS identity/status: product triple, firmware, ready/failed flags
    - adapter context: fallback reason, uncurated flag, vertical-slice state, mapped capability count
    - curation context: loaded/source/applied/skipped/error counters
  - split advanced diagnostics into clearer sections:
    - `Profile Reference`
    - `Mapping Skip Reasons`
    - `Runtime Context`
    - `Decision Context`
  - added mapping skip-reason breakdown rendering and sync/runtime timestamp visibility in node repair UI
  - extended node Device Tools snapshot contract with `sync` payload and locked behavior in runtime tests

- Latest bridge read-only enrichment slice:
  - expanded bridge diagnostics snapshot node payload to include:
    - ZWJS identity/status fields (`manufacturer`, `product`, `location`, readiness/failure/interview state)
    - sync metadata (`syncedAt`, `syncReason`)
    - full profile/mapping/curation context used by adapter runtime
  - expanded bridge summary metrics:
    - resolved vs pending profiles
    - ready vs failed nodes
    - curation applied/skipped/error totals
    - mapped capability total and aggregated mapping skip-reason counters
  - updated Bridge Tools UI to surface richer read-only context:
    - node identity + status + location
    - profile match/fallback context
    - mapping capability/slice/skip-reason summaries
    - advanced mapping skip-reason diagnostics section
  - added/updated harness coverage for enriched snapshot fields and compatibility defaults

- Latest profile terminology clarity slice:
  - replaced ambiguous `curated profile match` wording with rule-origin terminology:
    - `Project rule match`
    - `Home Assistant-derived rule match`
    - `Generic fallback rule`
  - updated node Device Tools labels to reduce conflation between rule matching and per-device overrides:
    - `Rule Match Level`
    - `Effective Source`
    - `Device Override`
  - aligned bridge fallback attribution wording with the same terminology

- Latest bridge triage count UX slice:
  - added live counts to bridge node filters:
    - `Action Needed (N)`
    - `All (N)`
  - added node-list meta line to clarify current scope:
    - action-needed subset vs full list
  - keeps default action-needed triage while making list scope explicit at a glance

- Latest bridge triage filter UX slice:
  - added one-click node list filters in Bridge Tools:
    - `Action Needed` (default)
    - `All`
  - filtering uses recommendation state priority and keeps action-needed triage focused by default
  - empty-state messaging now explains when no nodes currently require action and guides switching to `All`

- Latest bridge profile-attribution UX slice:
  - propagated node `profileAttribution` into bridge repair snapshots, with fallback derivation when older runtime payloads omit attribution fields
  - updated Bridge Tools node rows to surface profile confidence/source semantics consistently with node Device Tools
  - added harness coverage for:
    - attribution pass-through in bridge snapshots
    - fallback attribution derivation behavior

- Latest profile-attribution contract slice (backend-first):
  - added normalized `profileAttribution` payload to node diagnostics snapshots:
    - `confidenceCode` / `confidenceLabel`
    - `sourceCode` / `sourceLabel`
    - `summary`
    - `curationEntryPresent`
  - wired node Device Tools to consume attribution contract directly instead of inferring confidence/source semantics in the view layer
  - clarified adapter diagnostics rendering so compiled confidence and per-device curation are presented as independent signals
  - added app runtime tests for:
    - curated + curation-present attribution
    - curated + no-curation-entry attribution
    - profile-resolution-pending attribution

- Latest node Device Tools clarity split slice:
  - split node repair diagnostics into two explicit sections:
    - `ZWJS Node` (manufacturer/product/location/status/transport context)
    - `Adapter` (profile class/match/confidence/source/mapping/curation state)
  - renamed confidence display to `Profile Confidence` and added explicit meaning copy
  - added `Profile Source` row so `high/curated confidence + no curation entry` is explicitly represented as compiled-profile-only behavior
  - updated recommendation copy to explain confidence vs per-device curation responsibility

- Latest bridge Device Tools essentials/advanced UX slice:
  - aligned bridge repair screen with node repair ergonomics by moving verbose runtime metadata into a collapsed `Advanced` section
  - kept bridge essentials prominent (runtime health + summary) and suppressed empty-value rows in advanced diagnostics
  - improved node table readability with recommendation status pills and deterministic sorting:
    - backfill-needed first
    - adopt-update next
    - no-action last
    - then node ID / Homey device ID

- Latest node Device Tools essentials/advanced UX slice:
  - reduced default diagnostics view to essential operator context (class/confidence/profile/manufacturer/product/location/status/mapping/curation)
  - moved verbose metadata into a collapsed `Advanced` section:
    - profile reference hashes/fingerprints
    - raw recommendation reason code
    - product triple and runtime timestamps
  - added empty-value suppression in key/value rendering to reduce noisy `n/a` rows in normal repair workflows
  - consolidated recommendation panel copy to human-readable reason by default

- Latest node pairing reliability + diagnostics correctness slice:
  - fixed node pairing timeout race so discovered candidates are preserved when late-stage inference overruns global flow timeout
  - split icon-inference timeout from global pair-flow timeout and added partial-candidate fallback logging
  - restored explicit missing-client pair error (`zwjs_connection.url` + bridge setup guidance) instead of silent empty-list behavior
  - fixed bridge Tools summary to correctly count curated nodes (`nodeSummary.curationEntryCount`)
  - expanded harness coverage for:
    - global-timeout-after-discovery partial candidate return
    - bridge curation summary counting
    - explicit missing-client error contract

- Latest node pairing spinner-lock hardening slice:
  - wrapped node pairing flow with defensive global timeout and fail-safe empty-list fallback
  - node list lookup timeout failures now return gracefully instead of blocking pairing indefinitely
  - icon inference timeout is now isolated so pairing can still return candidates even when per-node state lookups stall
  - added harness coverage for hanging node-list and node-state lookups

- Latest node pairing timeout-hardening slice:
  - added defensive timeouts for pairing-time node list lookup, zone lookup, and per-node state/icon inference
  - icon inference now runs with bounded concurrency and timeout guards so one slow node no longer blocks the pair list
  - pairing now degrades gracefully when zone lookup times out (continues without zone hints)
  - added harness regression coverage for hanging node-state lookups to prevent spinner-lock regressions

- Latest bridge pairing guidance slice:
  - added post-add bridge pairing guidance custom view (`next_steps`) to keep node import flow explicit within Homey template constraints
  - bridge pair flow now navigates:
    - `list_devices -> add_devices -> next_steps`
  - added pairing-flow test coverage for bridge custom guidance view wiring

- Latest bridge read-only tools slice:
  - added bridge repair custom view host (`bridge_tools`) with read-only diagnostics and per-node summary rendering
  - wired bridge driver repair session handlers:
    - `bridge_tools:get_snapshot`
    - `bridge_tools:refresh`
  - snapshot payload now exposes a stable `bridge-device-tools/v1` shape with runtime status, compiled/curation status, node summary, and node-level recommendation/mapping overview
  - added bridge-driver harness coverage for snapshot handlers and API-unavailable failure path

- Latest node read-only metadata fallback slice:
  - node runtime state snapshot now falls back to `state.deviceConfig.*` when friendly manufacturer/product strings are missing
  - product label formatting now supports `description (label)` fallback for clearer diagnostics display (for example Leviton DZ6HD style metadata)
  - added harness coverage to lock fallback behavior

- Latest docs/alignment slice:
  - documented Homey pairing-template constraints and future custom-view direction:
    - `README.md`
    - `docs/architecture.md`
    - `plan/roadmap.md`
    - `docs/decisions/0017-homey-mvp-driver-topology-and-pairing-model.md`
  - clarified that MVP keeps system pairing templates (`list_devices -> add_devices`) while richer onboarding UX is tracked post-MVP

- Latest tooling/workspace compatibility slice:
  - removed Homey app package from root npm workspace membership to avoid `homey app run` preprocess copy failures under npm workspaces (`Cannot copy ... to a subdirectory of itself`)
  - switched root scripts that target the Homey app from workspace flags to explicit prefix invocation:
    - `npm --prefix co.lazylabs.zwavejs2homey run build`
    - `npm --prefix co.lazylabs.zwavejs2homey run lint`
    - `npm --prefix co.lazylabs.zwavejs2homey run test`
  - replaced workspace-external file links for Homey runtime packages:
    - Homey app now depends on local vendored packages:
      - `@zwavejs2homey/core -> file:vendor/core`
      - `@zwavejs2homey/compiler -> file:vendor/compiler`
    - added sync tool: `tools/sync-homey-vendor-packages.mjs`
    - root scripts now refresh vendor packages before Homey app install/build:
      - `postinstall`
      - `build`
      - `build:homey`
    - fixes runtime module resolution crash in Homey runner container:
      - `Cannot find module '@zwavejs2homey/core'`
  - added root `postinstall` hook to ensure nested Homey app dependencies are installed automatically after root install
  - updated plan command references to the new invocation style

- Latest Homey pairing-runtime entrypoint slice:
  - fixed empty pairing results (`bridge` and `node`) when Homey skips TS preprocess compilation
  - source runtime JS entrypoints are now present in app package:
    - `co.lazylabs.zwavejs2homey/app.js`
    - `co.lazylabs.zwavejs2homey/drivers/bridge/{driver,device}.js`
    - `co.lazylabs.zwavejs2homey/drivers/node/{driver,device}.js`
  - added app build sync helper:
    - `co.lazylabs.zwavejs2homey/scripts/sync-runtime-js.mjs`
    - wired into app build script (`tsc && node scripts/sync-runtime-js.mjs`)
  - validated with app test suite + `homey app validate`

- Latest Homey app-settings connection UX slice:
  - added app settings UI page:
    - `co.lazylabs.zwavejs2homey/settings/index.html`
  - supports editing `zwjs_connection` with validation:
    - ws/wss URL
    - auth type (`none` or bearer token)
  - save/reset actions persist via `Homey.set(...)` and leverage existing runtime settings listeners for hot reload
  - documented run + configuration flow in `README.md`

- Latest Homey connection-start policy slice:
  - app now requires explicit `zwjs_connection.url` before starting ZWJS client
  - removed implicit startup attempt against default URL when setting is absent
  - connection can still be started dynamically after startup by saving settings
  - expanded app-runtime tests:
    - no connection attempt when setting is missing
    - deferred connect after runtime settings update

- Latest Homey pairing UX flow slice:
  - fixed pairing flow to include explicit add action step in both drivers
  - updated pair templates:
    - `list_devices -> add_devices` navigation
    - explicit `add_devices` template view
  - added guard test to keep flow shape stable:
    - `co.lazylabs.zwavejs2homey/test/pairing-flow.test.js`

- Latest Phase 5 runtime-mapping diagnostics edge-case slice:
  - added enum-like mapping diagnostics harness coverage for `thermostat_mode`
  - validated unreadable inbound selectors are blocked with explicit diagnostics (`inbound_selector_not_readable`)
  - validated unknown outbound writeability falls back to metadata check and reports deterministic diagnostics (`outbound_target_writeability_unknown`)
  - validated no inbound read / no outbound listener behavior under those gates
  - file:
    - `co.lazylabs.zwavejs2homey/test/node-device-harness.test.js`

- Latest Phase 5 runtime-mapping coverage broadening slice:
  - added generic mixed numeric/string runtime-mapping validation (`measure_humidity`, `thermostat_mode`) without capability-specific adapter branches
  - expanded node-runtime coercion coverage for string-typed mappings and keyed event selector matching (`propertyKeyName`)
  - expanded node-device harness coverage for:
    - inbound numeric/string coercion
    - outbound string write path
    - value-updated event refresh path
    - outbound-gating behavior for inbound-only numeric capabilities
  - files:
    - `co.lazylabs.zwavejs2homey/test/node-runtime.test.js`
    - `co.lazylabs.zwavejs2homey/test/node-device-harness.test.js`

- Latest Phase 5 Device Tools diagnostics-clarity slice:
  - recommendation panel now shows both human label and raw reason code for runtime state
  - added a new `Latest Action` panel in node Device Tools:
    - executed/requested/selected action
    - action reason detail
    - latest-state reason detail
    - state-changed indicator
  - action execution now persists per-session latest action result in the custom view model for post-action troubleshooting
  - added app runtime test coverage that locks batch executor delegation through the single-action executor and preserves churn metadata (`latestReason`, `stateChanged`)

- Latest Phase 5 recommendation-churn hardening slice:
  - app recommendation execution now revalidates per-device queue state when an adopt/backfill mutation reports no-op/failure
  - action execution result now carries churn context fields:
    - `latestReason`
    - `stateChanged`
  - stale-action scenarios now return explicit `action-state-changed` with latest recommendation reason for deterministic UI handling
  - queue/batch execution now routes through the single-action executor to keep mismatch/churn semantics consistent
  - expanded app runtime tests for:
    - state-changed execution races
    - unchanged-action no-op failures preserving underlying failure reason
    - mismatch responses including latest queue reason context
  - Device Tools action UX hardening:
    - fixed action-result summary shape bug (always returns `{ message, tone }`)
    - added user-facing labels for churn/no-op action reasons (`action-state-changed`, `marker-backfill-required`, `curation-entry-missing`, `baseline-marker-unavailable`)
    - stale-action UI now surfaces latest recommendation reason context

- Latest Phase 5 runtime-mapping vertical coverage slice:
  - expanded generic runtime-mapping validation for numeric/boolean capability families without capability-specific adapter branches
  - added node-runtime coercion coverage for:
    - `target_temperature` numeric type coercion
    - `alarm_contact` boolean type coercion
  - added node-device harness flow coverage for mixed numeric/boolean verticals:
    - inbound read
    - outbound write
    - value-updated event refresh path
  - files:
    - `co.lazylabs.zwavejs2homey/test/node-runtime.test.js`
    - `co.lazylabs.zwavejs2homey/test/node-device-harness.test.js`

- Latest Phase 5 node Device Tools host/UX hardening slice:
  - canonical custom-view host path is now `co.lazylabs.zwavejs2homey/drivers/node/repair/device_tools.html`
  - removed fallback duplicate view file (`drivers/node/pair/device_tools.html`) to keep one source of truth
  - strengthened action outcome UX in Device Tools:
    - friendly reason mapping for no-op/mismatch states
    - status tone rendering (`ok` / `warn` / `error`)
    - clearer inline action feedback after confirm + execute
  - expanded repair/session harness coverage for:
    - default `auto` action selection when payload omits action
    - missing recommendation action API
    - missing snapshot API during action flow

- Latest Phase 5 node Device Tools action slice:
  - enabled explicit per-device recommendation actions in Device Tools custom view:
    - `Backfill Marker` (for marker-missing recommendations)
    - `Adopt Update` (for baseline-change recommendations)
  - added node repair session action handler in `co.lazylabs.zwavejs2homey/drivers/node/driver.ts`:
    - `device_tools:execute_action`
    - strict action enum validation (`auto`, `backfill-marker`, `adopt-recommended-baseline`, `none`)
  - action handler now returns action result + refreshed per-device snapshot in one call
  - upgraded Device Tools view scaffold to interactive action UX with confirmation prompts + inline status updates:
    - `co.lazylabs.zwavejs2homey/drivers/node/repair/device_tools.html`
  - expanded repair/session harness coverage for action forwarding and invalid selection rejection

- Latest Phase 5 node Device Tools read-only slice:
  - added node-driver repair host wiring in `co.lazylabs.zwavejs2homey/drivers/node/driver.ts`:
    - `onRepair(session, device)` session handlers:
      - `device_tools:get_snapshot`
      - `device_tools:refresh`
  - added targeted app snapshot API in `co.lazylabs.zwavejs2homey/app.ts`:
    - `getNodeDeviceToolsSnapshot({ homeyDeviceId })`
    - stable read-only payload schema: `node-device-tools/v1`
  - enabled node repair manifest entry in:
    - `co.lazylabs.zwavejs2homey/drivers/node/driver.compose.json`
    - `co.lazylabs.zwavejs2homey/app.json`
  - added first custom Device Tools view scaffold:
    - `co.lazylabs.zwavejs2homey/drivers/node/repair/device_tools.html`
  - expanded harness/runtime coverage:
    - `co.lazylabs.zwavejs2homey/test/driver-harness.test.js`
    - `co.lazylabs.zwavejs2homey/test/app-runtime-refresh.test.js`

- Latest Phase 5 runtime API smoke-tool slice:
  - added `tools/homey-runtime-api-smoke.mjs` + `tools/homey-runtime-api-smoke-lib.mjs`
  - smoke now validates all runtime routes against a live Homey app endpoint and checks envelope/HTTP health
  - added `npm run homey:runtime-api:smoke` entrypoint
  - added tool regression coverage in `packages/core/test/homey-runtime-api-smoke-tool.test.js`
  - documented usage in `docs/homey-api-contract.md` and `README.md`

- Latest Phase 5 API manifest parity-guard slice:
  - added `co.lazylabs.zwavejs2homey/test/api-manifest-parity.test.js`
  - guard now enforces:
    - `.homeycompose/app.json` and generated `app.json` API parity
    - route key parity between manifest entries and `api.js` exports
    - canonical runtime route constraints (allowed methods, `/runtime/*` path prefix, no duplicate signatures)

- Latest Phase 5 API client-contract slice:
  - added `co.lazylabs.zwavejs2homey/runtime-api-client.js` for settings/custom-view route consumption
  - helper now normalizes inputs, invokes Homey API routes, validates envelopes, and raises typed route/client errors
  - added `co.lazylabs.zwavejs2homey/test/runtime-api-client.test.js` coverage for callback/promise invocation, forwarding, and envelope/error handling
  - added route contract reference doc: `docs/homey-api-contract.md`

- Latest Phase 5 API response-contract slice:
  - upgraded Homey API routes to return a stable envelope:
    - `schemaVersion`
    - `ok`
    - `data`
    - `error`
  - added structured validation/runtime error payloads for deterministic settings/custom-view handling
  - expanded API route tests to validate success and error envelopes

- Latest Phase 5 Homey app API routing slice:
  - added Homey app API routes in `co.lazylabs.zwavejs2homey/api.js` for diagnostics and recommendation orchestration
  - registered API endpoints in `.homeycompose/app.json` + `app.json`:
    - `GET /runtime/diagnostics`
    - `GET /runtime/recommendations`
    - `POST /runtime/recommendations/execute`
    - `POST /runtime/recommendations/execute-batch`
  - added strict input normalization/validation for query/body payloads
  - added route-level tests for forwarding and validation behavior

- Latest Phase 5 bridge runtime API surface slice:
  - extended `BridgeDevice` with non-UI runtime orchestration hooks:
    - `getRuntimeDiagnostics(...)`
    - `getRecommendationActionQueue(...)`
    - `executeRecommendationAction(...)`
    - `executeRecommendationActions(...)`
  - added strict option validation on bridge-device recommendation action entrypoints
  - recommendation action execution now refreshes persisted bridge diagnostics snapshots after mutation calls
  - expanded bridge harness tests for option forwarding, validation failures, and post-action diagnostics refresh behavior

- Latest Phase 5 recommendation execution entrypoint slice:
  - added single-device recommendation executor (`executeRecommendationAction`) with `auto` selection + explicit action mismatch protection
  - added queue-driven executor (`executeRecommendationActions`) that runs deterministic recommendation actions and returns execution summaries
  - expanded app runtime tests for auto-backfill execution, explicit mismatch handling, and queued execution summaries

- Latest Phase 5 recommendation-workflow orchestration slice:
  - added app-level recommendation queue API (`getRecommendationActionQueue`) with deterministic action ordering (`backfill` -> `adopt` -> `none`)
  - added batch marker backfill API (`backfillMissingCurationBaselineMarkers`) to update all missing/outdated markers in one settings write
  - queue/batch logic now uses node runtime diagnostics as canonical non-UI input surface
  - expanded app runtime tests for queue classification and batch-backfill behavior

- Latest Phase 5 recommendation-action API slice:
  - added curation mutation helpers in `curation.js`:
    - `upsertCurationBaselineMarkerV1`
    - `removeCurationEntryV1`
  - added app-level recommendation action APIs:
    - `backfillCurationBaselineMarker(homeyDeviceId)`
    - `adoptRecommendedBaseline(homeyDeviceId)`
  - backfill now creates/updates `curation.v1` baseline markers from live node diagnostics
  - adopt now removes per-device curation entry when recommendation is available (v1 full replace)
  - expanded tests for curation mutations and app-level backfill/adopt behavior

- Latest Phase 5 bridge-diagnostics wiring slice:
  - app runtime now refreshes bridge diagnostics on startup/settings changes and targeted node lifecycle events
  - bridge device now exposes `onRuntimeDiagnosticsRefresh` and stores compact `runtimeDiagnostics` snapshots in device store
  - snapshots include zwjs/compiled/curation status and aggregated node summary counters (curation/recommendation/mapping skips)
  - expanded app + driver harness tests for refresh orchestration and bridge-device diagnostics persistence

- Latest Phase 5 driver-harness test slice:
  - added new Homey driver/device harness tests in `co.lazylabs.zwavejs2homey/test/driver-harness.test.js`
  - covered bridge singleton pairing semantics in `drivers/bridge/driver.ts`
  - covered node pairing error/filter behavior in `drivers/node/driver.ts`
  - covered bridge-device runtime status logging contract in `drivers/bridge/device.ts`

- Latest Phase 5 diagnostics-surface slice:
  - added app-facing runtime diagnostics snapshot API: `getNodeRuntimeDiagnostics(...)`
  - API now normalizes node `profileResolution` into stable sections (`sync`, `profile`, `curation`, `recommendation`, `mapping`)
  - added mapping summary aggregation (configured/enabled/skipped counts + skip reason histogram)
  - added optional `homeyDeviceId` filter and deterministic node sorting
  - expanded app tests for diagnostics payload shape and filtering behavior

- Latest Phase 5 recommendation-marker slice:
  - added canonical baseline projection/hash helpers in `co.lazylabs.zwavejs2homey/curation.js`
  - added marker/recommendation helpers (`createBaselineMarkerV1`, `evaluateBaselineRecommendationState`)
  - threaded compiled artifact `pipelineFingerprint` into app/runtime status (`compiled-profiles` + app logging)
  - node runtime now computes recommendation state per sync and stores recommendation diagnostics in `profileResolution`
  - added regression coverage for unchanged/changed hash and marker backfill/version-mismatch paths

- Latest Phase 5 curation-apply slice:
  - implemented deterministic `curation.v1` override lowering to runtime actions (`lowerCurationEntryToRuntimeActions`)
  - implemented profile apply helper (`applyCurationEntryToProfile`) with applied/skipped/error diagnostics and stable rule IDs
  - integrated node runtime to resolve per-device curation entries and apply curation before capability runtime slice extraction
  - profile resolution store now includes curation diagnostics (`curationLoaded`, `curationEntryPresent`, `curationReport`)
  - added regression tests for lowering/apply semantics and node runtime curation integration

- Latest Phase 5 curation-foundation slice:
  - added adapter curation runtime module (`co.lazylabs.zwavejs2homey/curation.js`) for `curation.v1` load + strict schema validation
  - enforced entry-key identity contract (`entries[homeyDeviceId]` must match `targetDevice.homeyDeviceId`)
  - implemented deterministic collection-array dedupe and add/remove overlap rejection for curation collections
  - integrated app runtime curation load on startup and `curation.v1` settings updates with node runtime refresh trigger (`curation-updated`)
  - added regression coverage for curation schema/runtime behavior and settings-driven refresh orchestration

- Latest policy-boundary guard slice:
  - added repo-level hardcoding policy guard tooling (`tools/hardcoding-policy-guard*.mjs`)
  - guard scans runtime source roots for protected Homey class/capability literals and fails outside approved policy modules
  - integrated `npm run policy:guard` into root `npm run check`
  - added regression tests for parser strictness and violation/pass detection (`packages/core/test/hardcoding-policy-guard-tool.test.js`)

- Latest hardcoding audit pass:
  - completed repo-wide scan for capability/class mapping hardcoding patterns outside policy modules
  - moved remaining TUI command-class magic numbers into policy constants consumed by `value-semantics.ts`
  - recorded audit scope/findings in `docs/hardcoding-audit-2026-03-01.md`

- Latest TUI vocabulary policy slice:
  - removed fallback Homey class behavior from vocabulary loading
  - TUI now fails fast when `homey-authoring-vocabulary/v1` is missing/invalid/empty and prints regeneration guidance (`npm run compiler:homey-vocabulary`)
  - hardened relative vocabulary path resolution to locate repo-root artifacts when running from workspace subdirectories
  - refreshed TUI tests for strict vocabulary requirements

- Latest compiler hardcoding-cleanup slice:
  - refactored HA importer output/conflict decisions to shared policy tables:
    - moved platform -> (`homeyClass`, `driverTemplateId`, `capabilityId`) mapping into `packages/compiler/src/importers/ha/platform-output-policy.ts`
    - replaced inline switch/ternary logic in extraction + translation paths with `resolveHaPlatformOutput` / `resolveHaCapabilityConflict`
  - added dedicated regression coverage (`packages/compiler/test/ha-platform-output-policy.test.js`)

- Latest TUI hardcoding-cleanup slice:
  - extracted value semantics/scoring policy constants into `packages/tui/src/view/value-semantics-policy.ts`
  - rewired semantic annotation + section classification + command-class relevance scoring to use policy tables/sets instead of inline switches
  - preserved existing behavior with full TUI workspace test pass

- Latest Phase 5 slice:
  - removed capability-ID hardcoded runtime contracts in `node-runtime`:
    - runtime slice extraction now accepts any valid `value`/`set_value` selector-target pair from compiled profiles
    - outbound mapping is no longer auto-disabled for unknown capability IDs
  - refactored runtime coercion to be transform-driven + typed fallback:
    - transform handlers remain keyed by `transformRef` (`zwave_level_0_99_to_homey_dim`, `homey_dim_to_zwave_level_0_99`)
    - generic typed coercion now uses live `defined_value_ids.type` hints (e.g. boolean normalization for binary values)
  - removed legacy single-capability helper exports (`extractOnOffCapabilityVertical`, `extractDimCapabilityVertical`) from runtime API surface
  - refreshed harness/runtime tests to assert capability-agnostic behavior and value-type gated coercion

- Latest Phase 5 slice:
  - expanded runtime capability contract/coercion coverage in `node-runtime`:
    - added `windowcoverings_set` contract (CC38 in/out + dim-style transform coercion)
    - added `locked` contract (inbound CC98/CC118, outbound CC118 with boolean coercion)
  - kept unknown capability IDs outbound-disabled by default (inbound-only primitive pass-through remains)
  - expanded regression coverage:
    - runtime extraction/coercion tests for new contracts (`test/node-runtime.test.js`)
    - headless harness test for `windowcoverings_set` outbound write path (`test/node-device-harness.test.js`)

- Latest Phase 5 slice:
  - added targeted node runtime rebind dispatch from ZWJS node lifecycle events in app runtime:
    - `zwjs.event.node.interview-completed`
    - `zwjs.event.node.value-added`
    - `zwjs.event.node.metadata-updated`
  - event handler now resolves affected node ID and refreshes only matching `node` driver devices (same `bridgeId + nodeId`) instead of refreshing all devices
  - keeps lifecycle-queue ordering guarantees by routing event refresh through app lifecycle queue
  - expanded app-level orchestration tests to verify targeted refresh dispatch and non-refresh for unrelated event families

- Latest Phase 5 slice:
  - refactored node runtime binding into reusable sync flow (`syncRuntimeMappings`) and added explicit refresh entrypoint (`onRuntimeMappingsRefresh`)
  - node profile resolution metadata now records `syncReason` + `syncedAt` in `profileResolution`
  - app lifecycle now triggers node runtime rebinds:
    - startup after compiled-profile load + ZWJS client start
    - settings updates for `zwjs_connection` and `compiled_profiles_file`
  - app now iterates paired node devices and invokes runtime refresh to replace stale listeners/mappings after runtime source changes
  - added regression coverage:
    - headless node harness refresh test for listener replacement + sync metadata updates
    - app-level refresh orchestration test for startup/settings-triggered node refresh calls

- Latest Phase 5 slice:
  - added runtime mapping capability gates in `drivers/node/device.ts` before listener wiring:
    - inbound mappings require selector presence in `node.get_defined_value_ids` (and non-`readable:false`)
    - outbound mappings require target presence + writeability checks (`defined_value_ids.writeable` with `node.get_value_metadata` fallback)
  - added per-capability mapping diagnostics persisted to `profileResolution.mappingDiagnostics`:
    - configured/enabled flags and explicit skip reasons (missing selector/target, not readable/writeable, writeability unknown, missing capability on Homey device)
  - expanded headless harness tests to cover gated execution and diagnostics, including:
    - healthy `onoff`/`dim` mapping path with value-index gating
    - generic inbound-only path (outbound blocked by contract)
    - diagnostics for missing inbound selector and non-writeable outbound target
  - expanded runtime helper tests for contract enforcement and malformed mapping skip behavior

- Latest Phase 5 slice:
  - implemented a generic compiled-mapping runtime kernel for node devices (value/set_value path), replacing per-capability wiring in `drivers/node/device.ts`
  - node runtime now iterates all resolver-matched capability mappings and applies compatible slices when the Homey device exposes that capability
  - added generic capability value coercion hooks in `co.lazylabs.zwavejs2homey/node-runtime.js`:
    - specialized coercion still applies for `onoff` and `dim`
    - non-specialized capabilities use inbound primitive pass-through only; outbound writes remain blocked by default unless capability contracts are defined
    - added shape + contract guards to runtime slice extraction (malformed selector/target skipped; `onoff`/`dim` command-class constraints enforced)
  - preserved existing event-driven inbound sync path (`zwjs.event.node.value-updated`) and outbound `node.set_value` writes for compatible mappings
  - extended tests:
    - runtime helper coverage for generic extraction/coercion (`co.lazylabs.zwavejs2homey/test/node-runtime.test.js`)
    - headless harness coverage for generic non-specialized mapping execution (`co.lazylabs.zwavejs2homey/test/node-device-harness.test.js`)

- Latest Phase 5 slice:
  - implemented first compiled-profile-backed runtime capability vertical set for node devices (`onoff` + `dim`)
  - added profile vertical extraction/matching helpers in `co.lazylabs.zwavejs2homey/node-runtime.js`
  - node init now applies compiled `onoff`/`dim` inbound/outbound mappings when compatible profile is resolved:
    - initial state pull via `getNodeValue` and Homey capability sync
    - outbound capability listeners issue `node.set_value`
    - inbound live updates consume `zwjs.event.node.value-updated`
    - `dim` uses transform refs for 0..99 <-> 0..1 scaling (`zwave_level_0_99_to_homey_dim`, `homey_dim_to_zwave_level_0_99`)
  - app/runtime command ownership for `node.set_value` is now core-defined (`ZwjsClient.setNodeValue`, `ZWJS_COMMAND_NODE_SET_VALUE`) rather than adapter-local command strings
  - added node-runtime helper regression tests for both verticals (`co.lazylabs.zwavejs2homey/test/node-runtime.test.js`)

- Latest Phase 5 slice:
  - added compiled-profile runtime module (`co.lazylabs.zwavejs2homey/compiled-profiles.js`) with artifact path resolution, schema validation, resolver index build, and degraded-status reporting
  - app startup now loads compiled profiles into a shared in-memory resolver runtime; `compiled_profiles_file` settings changes trigger explicit reload
  - node device init now fetches node identity (`manufacturerId/productType/productId`) from ZWJS node state, resolves through shared resolver runtime, and persists match/fallback metadata in device store
  - no-match behavior now explicitly records minimal safe fallback classification (`homeyClass=other`, `confidence=generic`, `uncurated=true`) with reason codes (`no_compiled_profile_match` / artifact unavailable variants)
  - added runtime helper regression tests in `co.lazylabs.zwavejs2homey/test/compiled-profiles.test.js`

- Latest Phase 5 slice:
  - implemented Homey driver scaffolds in `co.lazylabs.zwavejs2homey/drivers/bridge` and `co.lazylabs.zwavejs2homey/drivers/node`
  - bridge pairing now enforces singleton behavior via stable `device.data.id` and returns one `ZWJS Bridge` candidate only when unpaired
  - node pairing now imports live ZWJS nodes via shared app session, excludes controller node (`nodeId = 1`), dedupes by `bridgeId + nodeId`, and stores lightweight metadata
  - app runtime now exposes shared accessors (`getZwjsClient()`, `getBridgeId()`) used by both drivers/devices
  - extracted pairing logic into `co.lazylabs.zwavejs2homey/pairing.ts` with regression coverage in `co.lazylabs.zwavejs2homey/test/pairing.test.js`

- Latest Phase 5 decision sync:
  - locked Homey MVP runtime topology to two drivers:
    - `bridge` driver/device for endpoint control plane (singleton-like)
    - `node` driver/devices for imported ZWJS nodes and profile-driven mappings
  - locked pairing/import semantics:
    - Homey pairing is explicit node import/link from ZWJS
    - inclusion can be triggered by bridge UX but does not auto-create node devices or auto-jump pairing
  - locked supporting runtime policies:
    - app-level shared ZWJS session ownership + inclusion lock (`ADR 0018`)
    - node identity/dedupe contract via `bridgeId + nodeId` (`ADR 0019`)
    - compiled profile source + refresh policy (`ADR 0020`)
    - no-profile-match fallback policy (`ADR 0021`)
    - class/capability structural mutation policy (`ADR 0022`)
  - recorded policies in `docs/decisions/0017-homey-mvp-driver-topology-and-pairing-model.md`, `docs/decisions/0018-homey-zwjs-session-and-inclusion-lock-v1.md`, `docs/decisions/0019-homey-node-identity-and-dedupe-v1.md`, `docs/decisions/0020-homey-compiled-profile-source-and-refresh-policy-v1.md`, `docs/decisions/0021-homey-no-profile-match-runtime-policy-v1.md`, and `docs/decisions/0022-homey-device-class-and-capability-mutation-policy-v1.md`
  - synced architecture/readme/roadmap references to the locked model

- Latest TUI values UX slices:
  - added section-level value semantics (`controls`, `sensors`, `events`, `config`, `diagnostic`, `other`)
  - values pane now renders by subsection in expanded mode and subsection previews in collapsed mode
  - added numeric subsection toggles (`1`-`6`) to collapse/expand individual value subsections
  - improved detail readability by reflowing long neighbor/value rows to pane width

- Latest TUI slice:
  - migrated panel rendering fully to `neo-blessed` widgets/layout
  - removed custom `panel-layout` renderer path and raw-data fallback quit path
  - updated panel tests to assert render snapshots (renderer-agnostic) while keeping behavior coverage
  - removed standalone panel key parser module and now route panel actions from `neo-blessed` keypress events directly
  - switched panel list/detail/bottom panes to native widget scrolling/selection behavior

- Latest convergence slice (Section 7.1):
  - extracted shared presenter draft-editing core into `packages/tui/src/presenter/draft-editor-core.ts`
  - rewired both `ExplorerPresenter` and `RulesPresenter` to delegate typed draft edit operations to the shared core
  - preserved behavior and validation semantics with full workspace gate pass (`npm run check`)

- Latest convergence slice (Section 7.2):
  - extracted shared signature workflow core into `packages/tui/src/presenter/signature-workflow-core.ts`
  - rewired both `ExplorerPresenter` and `RulesPresenter` to delegate signature selection + inspect/validate/simulate/scaffold flows
  - added focused regression tests for default-manifest wiring and scaffold homey-class inference in `packages/tui/test/signature-workflow-core.test.js`

- Latest convergence slice (Section 7.3):
  - introduced mode adapters in `packages/tui/src/app.ts` for shell and panel shared workflows
  - rewired shell command dispatch to adapter methods (init/list/show/signature/inspect/validate/simulate/scaffold/status/log)
  - rewired panel shared curation + draft-editing dispatch through adapter/draft surfaces while preserving nodes-only behaviors

- Latest Phase 5 slice:
  - added compiler-owned compiled profile resolver/index runtime API in `@zwavejs2homey/compiler`:
    - `buildCompiledProfileResolverIndexV1`
    - `resolveCompiledProfileEntryFromIndexV1` / `resolveCompiledProfileEntryFromArtifactV1`
    - `toCompiledProfileResolverSelector` / `compiledProfileProductTripleKey`
  - added compiler regression coverage for resolver precedence, duplicate-key behavior, selector normalization, and helper parity (`packages/compiler/test/compiled-profile-resolver.test.js`)
  - rewired `compiler:inspect-live --compiled-file` to use the shared compiler resolver API (single source of matching semantics for tooling + upcoming adapter integration)

- Latest Phase 5 slice:
  - added settings-backed ZWJS connection config resolution in `packages/core/src/zwjs-connection-config.ts`
  - added core regression coverage for defaults/settings/auth/url validation (`packages/core/test/zwjs-connection-config.test.js`)
  - hardened Homey app bootstrap lifecycle to reload ZWJS client on `zwjs_connection` settings changes and stop cleanly on app uninit (`co.lazylabs.zwavejs2homey/app.ts`)

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
29. Completed tenth performance slice for report-light benchmark mode:
    - added `reportMode` support (`full`/`summary`) to `compileDevice` and propagated it through `compileProfilePlan`
    - summary mode skips per-action report entry emission while retaining deterministic compile outputs and summary counters
    - added `summary.totalActions` + `summary.appliedProjectProductActions` so unmatched-ratio and confidence derivation stay correct without action arrays
    - `compiler:bench` now forces summary report mode and regression coverage verifies option wiring
30. Completed eleventh performance slice for summary-mode candidate execution:
    - `compileDevice` summary mode now baseline-counts unmatched/total action volume and executes `applyRuleToValue` only for candidate rules
    - candidate execution is limited to command-class wildcard/exact seed sets and filtered by precomputed property/endpoint/device eligibility marks
    - keeps summary parity with full mode while removing full rule-array scans in summary-only runs
    - expanded compile-device regression coverage to include candidate-but-rule-not-matched parity (e.g. propertyKey mismatch)
31. Completed twelfth performance slice for summary-path action allocation removal:
    - introduced `applyRuleToValueSummary` to mutate build-state and compute changed-action counts without allocating per-action result records
    - `compileDevice` summary mode now uses the summary apply path (full mode still emits detailed `report.actions`)
    - preserves matched/unmatched accounting semantics used by confidence + curation diagnostics
    - added apply-rule parity tests for summary/full changed-action accounting and unmatched no-mutation behavior
32. Completed thirteenth performance slice for suppressed-action diagnostics gating:
    - `createProfileBuildState` now supports `collectSuppressedActions` and tracks `suppressedFillActionsCount` independently
    - summary-mode compiles disable suppressed-action record collection while keeping `summary.suppressedFillActions` semantics intact
    - removed per-compile `suppressedActions.filter(mode===fill)` post-pass scan in favor of incremental counting
    - expanded compile-device summary-mode tests to assert suppression-count parity with full mode when detailed suppression records are omitted
33. Completed fourteenth performance slice for profile-plan summary aggregation:
    - `compileProfilePlanFromLoadedRuleSetManifest` now caches immutable `ruleSources` metadata per loaded manifest instance
    - summary-mode profile-plan reports now skip grouped `byRule` / `bySuppressedSlot` aggregation and classification-provenance scans
    - preserves output shape and curation semantics while avoiding unnecessary per-iteration aggregation work in bench/bulk summary runs
    - added regression coverage for rule-source cache reuse + summary-mode grouping bypass behavior
34. Completed fifteenth performance slice for compile-loop value snapshot gating:
    - `compileDevice` now cleanly splits summary/full execution loops
    - summary-mode runs iterate live values directly and skip per-value cloned/frozen `valueId` snapshot preparation entirely
    - full mode preserves immutable `report.actions[].valueId` semantics by retaining snapshot reuse for emitted-action paths only
    - keeps full behavioral parity while removing avoidable allocation work from summary-only compile runs
35. Completed sixteenth performance slice for conflict-resolution fast-pathing:
    - `profile-build-state` now tracks whether any exclusive conflict metadata has been introduced during rule application (`hasPotentialConflicts`)
    - `resolveCapabilityConflicts` now short-circuits immediately when no potential exclusive conflicts exist
    - preserves overlap semantics while avoiding conflict-bucket scans on devices/rulesets that never emit exclusive conflict metadata
    - added state-level regression coverage for fast-path flag transitions (no-conflict vs exclusive-conflict rule application)
36. Completed seventeenth performance slice for summary candidate seed iteration:
    - `compileDevice` execution plan now precomputes merged command-class candidate seed lists for summary-mode evaluation (`summarySeedByCommandClass`)
    - summary mode now iterates a single precomputed seed list per value (wildcard + exact command-class indices) and removes per-value visited-mark dedupe tracking
    - keeps deterministic execution and parity while reducing summary hot-loop branching/work
    - added regression coverage for duplicate command-class matcher tokens to ensure summary mode does not double-apply rules
37. Completed eighteenth performance slice for summary candidate property specialization:
    - `compileDevice` execution plan now precomputes summary candidate seeds by `(commandClass, property)` plus fallback seeds for command-class-only and unknown-command-class cases
    - summary mode now selects one precomputed seed set per value and only applies endpoint + device-eligibility gates before invoking `applyRuleToValueSummary`
    - removes property-dimension checks from the summary hot loop while preserving deterministic ordering/parity
    - added regression coverage for duplicate property matcher tokens to ensure summary mode does not double-apply rules
38. Completed nineteenth performance slice for summary candidate endpoint specialization:
    - `compileDevice` execution plan now precomputes summary candidate seeds by full selector `(commandClass, property, endpoint)` with wildcard expansion into known rule-domain tokens for parity-preserving fast lookup
    - summary mode now resolves one precomputed selector seed per value and drops all candidate-mark stamping/gating on command-class/property/endpoint dimensions (device-eligibility gating remains)
    - preserves deterministic parity across endpoint-specific and wildcard-endpoint rules while simplifying summary hot-loop logic
    - added regression coverage for duplicate endpoint matcher tokens and endpoint-specific + wildcard parity behavior
39. Completed twentieth performance slice for compact summary seed modeling + selector caching:
    - replaced wildcard-expanded summary seed generation with compact 8-bucket selector modeling (`CPE`, `CP`, `CE`, `C`, `PE`, `P`, `E`, `ANY`)
    - added per-plan selector cache keyed by `(commandClass, property, endpoint)` to memoize merged candidate seeds for repeated selectors
    - summary runtime now resolves one cached seed per selector and executes candidate rules directly with device-eligibility gating
    - preserves deterministic ordering/parity while reducing summary plan-build memory blow-up from wildcard expansion
    - added regression coverage for repeated-selector wildcard parity behavior
40. Completed twenty-first performance slice for selector-cache bounding:
    - bounded `compileDevice` summary selector cache to a fixed maximum (`1024` entries) with FIFO eviction of oldest cached selector keys
    - preserves selector-cache hit behavior while preventing unbounded cache growth on long heterogeneous runs
    - added eviction-focused regression coverage using >1k unique selectors to validate summary/full parity under cache churn
41. Completed twenty-second performance slice for selector key churn removal:
    - replaced concatenated-string summary buckets/cache keys with nested map structures keyed by native selector dimensions (`commandClass`, typed `property`, `endpoint`)
    - preserved compact 8-bucket precedence model (`CPE`, `CP`, `CE`, `C`, `PE`, `P`, `E`, `ANY`) while removing per-lookup string key construction for merged-seed/cache access
    - retained FIFO cache bounding semantics and deterministic candidate ordering
    - added regression coverage for numeric-vs-string property token parity under summary caching
42. Completed twenty-third performance slice for summary counter accounting simplification:
    - summary mode now computes unmatched counts directly from per-selector candidate action totals plus candidate non-match/ineligible paths, instead of baseline-all-actions then subtracting matched actions
    - `compileDevice` now precomputes per-rule action counts in execution entries and exposes per-selector cached seed action totals (`SummarySeedSelection.actionCount`)
    - kept total action accounting exact (`totalActionCountPerValue * valueCount`) while reducing per-value arithmetic churn in summary loops
    - added regression coverage for mixed matched/unmatched multi-action selector sets to lock full/summary counter parity
43. Completed twenty-fourth performance slice for summary eligible-seed prefiltering:
    - added compile-local eligible selector cache that filters summary candidate seeds through `deviceEligibleMask` once per selector and stores precomputed eligible action totals
    - summary runtime now iterates only eligible rule indices (no per-rule eligibility branch in the hot loop)
    - preserves direct unmatched accounting by combining non-candidate remainder with candidate non-match paths
    - added regression coverage for device-ineligible multi-action rules to lock summary/full counter parity under ineligible-rule-heavy selectors
44. Completed twenty-fifth performance slice for selector-cache eviction complexity:
    - replaced `summarySelectorCacheOrder.shift()` behavior with a head-index FIFO queue for bounded selector-cache eviction in `compileDevice`
    - added queue compaction thresholding so eviction remains amortized O(1) without unbounded tombstone growth in long-running heterogeneous selector churn
    - hardened eviction fallback to recover cleanly if queue/counter state ever diverges
    - expanded regression coverage with sustained selector-churn parity checks (multi-round >cache-capacity runs, repeated summary compiles)
45. Completed twenty-sixth performance slice for all-eligible summary fast path:
    - `compileDevice` now computes `{ mask, hasIneligibleRules }` once and uses a direct summary-seed path when every rule is device-eligible
    - all-eligible summary mode now skips compile-local eligible-seed filtering/cache construction and executes directly against base selector seeds
    - retained existing filtered path for mixed/ineligible rule sets; unmatched/applied counters remain parity-safe across both paths
    - added regression coverage that reuses a cached execution plan across eligible and ineligible devices and asserts full/summary parity
46. Completed twenty-seventh performance slice for sparse device-eligibility evaluation:
    - `compileDevice` execution plans now precompute `deviceEligibilityRuleIndices` so only rules with device/companion constraints are evaluated per device
    - device eligibility is now represented as a sparse ineligible mask (`1` = ineligible), allocated only when at least one constrained rule fails
    - summary/full compile paths now branch on `hasIneligibleRules` to skip per-rule eligibility checks entirely when all constrained rules pass
    - preserves full/summary parity and avoids unnecessary matcher work for unconstrained rule-heavy rule sets
47. Completed twenty-eighth performance slice for selector-merge dedupe allocation removal:
    - replaced `Set`-based selector merge dedupe in `resolveSummaryCandidateSeed` with stamp-based `Uint32Array` marks stored in the execution plan
    - summary selector resolution now avoids per-miss hash-set allocation while preserving deterministic merged-rule ordering
    - added overflow-safe mark-stamp rollover handling to prevent stale dedupe marks on long-running plan reuse
    - added regression coverage to ensure selector-merge marks do not leak across consecutive selector resolutions
48. Completed twenty-ninth performance slice for candidate apply-path matcher narrowing:
    - added `applyRuleToValueAssumingDeviceEligible` and `applyRuleToValueSummaryAssumingDeviceEligible` so compile loops can skip redundant device/companion re-checks for candidate rules
    - `compileDevice` now uses the assume-eligible apply paths after precomputed eligibility gating in both summary and full modes
    - refactored apply-rule internals with matched-rule helpers to preserve existing external semantics for `applyRuleToValue`/`applyRuleToValueSummary`
    - preserves report parity while reducing repeated matcher work in hot candidate-apply paths
49. Completed thirtieth performance slice for selector-gated value matcher narrowing:
    - introduced `matchesValueAfterSelectorGates` to evaluate only residual value predicates (`propertyKey`, `notPropertyKey`, metadata/read-write flags) after selector candidate gating
    - assume-eligible apply paths now use the narrowed matcher to avoid re-checking command-class/property/endpoint constraints already enforced by compile-time candidate selection
    - retained `matchesValue` semantics by delegating to the residual matcher after selector predicates, preserving existing behavior for non-optimized call sites
    - preserves compile parity while reducing redundant per-candidate predicate work in summary/full hot paths
50. Completed post-review correctness fix for malformed selector arrays:
    - `matchesValueAfterSelectorGates` now explicitly rejects empty selector arrays (`commandClass`, `property`, `endpoint`) to preserve matcher semantics in assume-eligible fast paths
    - prevents malformed in-memory rules from being treated as wildcard matches by candidate gating when invoking `compileDevice` directly
    - added full+summary regression coverage asserting empty-selector matcher rules always emit `rule-not-matched` outcomes and never apply capabilities
51. Completed live runtime-validation loop CLI slice:
    - added `compiler:validate-live` (`tools/homey-compile-validate-live*.mjs`) to run build+apply validation in one command
    - command now writes both the compiled artifact and a markdown validation report (outcomes, review reasons, top unmatched/suppressed signatures, node snapshot)
    - reuses existing build + live inspect tooling with compiled-artifact apply mode to keep runtime-style validation behavior consistent
    - added core-tool regression coverage for CLI parsing and end-to-end validation report generation
52. Completed runtime-validation quality gate slice:
    - extended `compiler:validate-live` with optional fail-fast thresholds (`--max-review-nodes`, `--max-generic-nodes`, `--max-empty-nodes`) and repeated reason gating (`--fail-on-reason`)
    - added optional machine summary artifact output (`--summary-json-file`) for CI/dashboard consumption with counts, top diagnostics, and gate outcomes
    - command now exits non-zero when configured gates are violated, while still writing artifact/report/summary outputs for triage
    - added regression coverage for gate parsing, summary JSON generation, and failure semantics when thresholds are exceeded
53. Completed runtime-validation gate setup documentation slice:
    - added `docs/compiler-validation-gates.md` with baseline collection process, threshold calibration guidance, and practical gate examples
    - documented failure semantics and expected triage workflow when gates fail but artifacts/reports are still emitted
    - linked gate setup docs from README live-validation section and architecture/docs index for discoverability
54. Completed runtime-validation gate profile slice:
    - added `--gate-profile-file` to `compiler:validate-live` so gate and output settings can be loaded from JSON
    - gate profile supports thresholds/reasons and output paths (`artifactFile`, `reportFile`, `summaryJsonFile`) with profile-relative path resolution
    - established deterministic precedence: CLI flags override profile values; profile values override tool defaults
    - expanded tool regression coverage for profile loading, CLI override behavior, and invalid profile validation
55. Completed runtime-validation effective-gate diagnostics slice:
    - added `--print-effective-gates` to `compiler:validate-live` to print resolved gate/output config before execution
    - output reflects final precedence resolution (CLI > gate profile > defaults) for thresholds, reasons, and output paths
    - expanded tool regression coverage for parse wiring and runtime diagnostics logging behavior
56. Completed runtime-validation compiled-artifact reuse slice:
    - added `--compiled-file` mode to `compiler:validate-live` to reuse an existing compiled artifact and skip the build phase
    - parser now enforces clear mode boundaries (`--compiled-file` cannot be combined with rules-source flags or `--artifact-file`)
    - runtime now reads the provided compiled artifact and runs apply/gate/report flow unchanged, with explicit "Using compiled artifact" logging
    - expanded tool regression coverage for parse mode selection/conflict validation and build-skip runtime behavior
57. Completed runtime-validation offline summary replay slice:
    - added `--input-summary-json-file` mode to `compiler:validate-live` to re-evaluate gates from an existing summary artifact without any live ZWJS/build/apply work
    - summary-input mode now enforces explicit flag boundaries (disallows live/build flags) to keep offline behavior deterministic
    - runtime now loads summary counts/reason histograms, evaluates configured gates, and can optionally write refreshed summary JSON via `--summary-json-file`
    - expanded tool regression coverage for summary-input parsing and offline gate-evaluation execution path
58. Completed runtime-validation baseline regression-gate slice:
    - added `--baseline-summary-json-file` support to `compiler:validate-live` so current runs can be compared against a baseline summary artifact
    - added delta-gate controls: `--max-review-delta`, `--max-generic-delta`, `--max-empty-delta`, and `--fail-on-reason-delta <reason>:<delta>`
    - gate profile schema now supports baseline/delta config (`max*Delta`, `failOnReasonDeltas`, `baselineSummaryJsonFile`) with CLI override precedence preserved
    - machine summary JSON now includes baseline counts and computed deltas; CLI logs now print baseline source + delta snapshot when enabled
59. Completed baseline markdown diagnostics slice:
    - live/compiled validation markdown reports now include `Baseline Delta` and `Reason Deltas` sections when baseline mode is active
    - report header now includes baseline summary source for traceability
    - expanded tool regression coverage to assert baseline-delta markdown output shape
60. Completed baseline snapshot helper slice:
    - added `--save-baseline-summary-json-file` to `compiler:validate-live` so the current run can directly emit a baseline-ready summary artifact
    - helper works across live-build, compiled-artifact reuse, and summary-input replay modes
    - CLI now logs the saved baseline path when written; parser validates required path value
    - expanded tool regression coverage for save-baseline parsing and offline replay write behavior
61. Completed validation artifact-retention slice:
    - added `--artifact-retention keep|delete-on-pass` to `compiler:validate-live` with gate-profile support (`artifactRetention`)
    - default retention remains `keep`; `delete-on-pass` removes generated live-build compiled artifacts only after gates pass
    - machine summary/effective-gates output now include retention config for reproducibility
    - expanded tool regression coverage for parse wiring and delete-on-pass runtime behavior
62. Completed baseline workflow wrapper slice:
    - added `compiler:baseline` (`tools/homey-compile-baseline*.mjs`) to orchestrate baseline capture + immediate recheck in one command
    - wrapper emits timestamped baseline/recheck artifacts under `plan/baselines/` (configurable output dir/stamp)
    - recheck stage enforces delta gates (default strict zero deltas) and supports optional gate-profile + reason-delta flags
    - baseline workflow defaults artifact retention to `delete-on-pass` to avoid local compiled-artifact bloat
63. Completed runtime-validation redacted-share output slice:
    - added share-safe output support to `compiler:validate-live` (`--redact-share`) with optional explicit output paths (`--redacted-report-file`, `--redacted-summary-json-file`)
    - redacted markdown hides URL/path/node identifiers while preserving diagnostics structure for review
    - redacted machine summary JSON now emits sanitized source/config paths and URL-safe metadata (`redaction.mode=share`)
    - gate profiles now support redaction output fields (`redactShare`, `redactedReportFile`, `redactedSummaryJsonFile`) with normal CLI precedence
64. Completed baseline-workflow redacted-share parity slice:
    - extended `compiler:baseline` with `--redact-share` so baseline capture and recheck can emit share-safe artifacts in one run
    - added stage-specific redacted output overrides (`--baseline-redacted-report-file`, `--baseline-redacted-summary-json-file`, `--recheck-redacted-report-file`, `--recheck-redacted-summary-json-file`)
    - baseline wrapper now forwards redaction flags into both internal `compiler:validate-live` stages with deterministic default redacted paths
    - added parse/orchestration regression coverage for redaction wiring and invalid flag combinations
    - summary command supports ranked list/markdown/json/ndjson outputs for quick curation prioritization
    - scaffold command emits starter `project-product` identity-rule snippets for a selected product-triple signature
65. Completed signature-targeted validation loop slice:
    - added `--signature <manufacturerId:productType:productId>` filter support to `compiler:inspect-live` and `compiler:validate-live`
    - live inspection now skips non-matching nodes before compile/apply, enabling focused triage on a single product signature
    - expanded parse/runtime regression coverage for signature flag validation, summary-input incompatibility, and inspect/validate wiring
    - diff mode defaults to `--only worsened` and supports fallback-to-summary selection (`--fallback summary|none`)
66. Completed signature loop wrapper slice:
    - wrapper forwards non-loop flags into inspect/validate parsers and defaults to `rules/manifest.json` when no rules source flags are provided
    - added `compiler:loop --dry-run` to resolve signature + validate command shapes without executing inspect/validate network flows
    - loop output now reports dry-run status and treats gate status as `n/a` when no live execution occurred
    - default policy is now `curation`, so next-target selection ignores technical-pressure-only signatures unless explicitly requested
    - pressure policy remains available for optimization passes (`suppressed/unmatched` tuning) when curation is already clean
67. Started DSL simplification slice 1 (deterministic compact matcher syntax):
    - rule loader/validator now accepts scalar matcher inputs for device/value/constraint fields and normalizes them to canonical array forms at load-time
    - supported scalar shorthand includes: `manufacturerId`, `productType`, `productId`, `deviceClassGeneric`, `deviceClassSpecific`, `commandClass`, `endpoint`, `property`, `propertyKey`, `notPropertyKey`, and `metadataType`
    - added regression fixture coverage to verify compact syntax expansion and preserved strict invalid-shape rejection for malformed matcher types
68. Added rule grammar/vocabulary reference doc:
    - documented current canonical rule grammar, matcher/action vocabulary, layer/mode semantics, and deterministic shorthand expansion policy
    - captured simplification direction for filesystem/manifest-driven layer inference and product-targeted rule bundle shape
69. Locked compiler rule boundary decision:
    - compile-time rule scope is manifest-owned (`rules/manifest.json`)
    - non-manifest rules are runtime/Homey-adapter scope
    - broad rule-defaults abstraction is deferred in favor of structured context (manifest layer + product-target bundles)
70. Locked manifest-first workflow decision:
    - canonical compiler workflows should run manifest-first (`--manifest-file` or default manifest)
    - ad-hoc `--rules-file` usage is treated as non-canonical local experimentation only
71. Locked single-target bundle decision for product + curation:
    - compiler product rules should be authored as one-target bundles (top-level product triple, inherited by contained rules)
    - adapter curation rules should be one-target bundles (product triple or `diagnosticDeviceKey`)
    - per-rule/per-entry target overrides are disallowed in bundle scope for v1
72. Locked manifest-layer single-source-of-truth decision:
    - manifest-scoped compile-time files must not declare per-rule `layer`
    - manifest entry layer is the only authoring-time source; canonical internal expansion may still include explicit layer for diagnostics
73. Locked full migration decision for product-rule format:
    - `project-product` compile-time authoring migrates fully to `product-rules/v1` single-target bundles
    - no legacy raw-array product rule authoring path remains as a canonical supported format
74. Migrated live product overrides to `product-rules/v1` per-target bundles:
    - replaced `rules/project/product/live-network-overrides.json` with one bundle file per product triple
    - updated `rules/manifest.json` to enumerate all per-target product bundle files
    - updated compiler rule loading/validation to enforce manifest-owned layer, product bundle requirements, and bundle target inheritance
75. Drafted unified ZWJS Explorer + Curation TUI spec:
    - documented MVP scope, screens, backend integration, safety model, and phased slices
76. Locked Homey adapter curation persistence for v1:
    - selected `this.homey.settings` as the single persistence backend for adapter curation deltas
    - documented versioned payload policy (`curation.v1`) and adapter-owned migration expectation
    - recorded backend abstraction expectation (`loadCuration`/`saveCuration`) for future backend swap without apply-logic churn
77. Locked Homey adapter curation execution direction for v1:
    - curation source-of-truth remains persisted materialized overrides
    - adapter lowers overrides into in-memory runtime curation rules at runtime
    - runtime execution reuses rules engine semantics (generic first, curation second)
78. Locked Homey adapter precedence/update direction for v1:
    - curation is instance-scoped (`homeyDeviceId`) and remains authoritative over compiler baseline updates
    - pairing starts from compiler baseline; user curation becomes device-static effective override
    - when baseline improves, adapter surfaces recommendation/adopt flow instead of auto-replacing local curation
79. Locked baseline recommendation detection policy for v1:
    - store per-device baseline markers (`pipelineFingerprint` + canonical baseline profile hash)
    - recommendation prompts are based on canonical hash changes, not timestamp-only artifact churn
    - missing legacy markers are backfilled without raising prompt on first backfill pass
80. Locked canonical baseline hash projection contract for v1:
    - defined exact semantic field whitelist for hash projection (classification identity, capabilities mapping surface, subscriptions, ignored values)
    - defined explicit canonicalization rules (capability sort, key sort, undefined-drop, null-preserve, stable value-id normalization policy)
    - versioned marker contract (`projectionVersion`) with no-prompt backfill on projection-version migrations
81. Locked concrete `curation.v1` stored schema contract for v1:
    - top-level storage key/value shape (`schemaVersion`, `updatedAt`, `entries` map keyed by `homeyDeviceId`)
    - entry contract includes `targetDevice`, `baselineMarker`, `overrides`, optional note/metadata
    - strict validation rules (unknown-field reject, key/target match, add/remove overlap reject, deterministic dedupe)
82. Completed compiler DSL simplification slice 2 (action shorthand canonicalization):
    - added deterministic action shorthand expansion for capability mappings:
      - inbound value-id shorthand -> canonical `{ kind: "value", selector: ... }`
      - inbound event shorthand (`eventType`) -> canonical `{ kind: "event", selector: ... }`
      - outbound value-id shorthand -> canonical `{ kind: "set_value", target: ... }`
      - outbound command shorthand (`command`) -> canonical `{ kind: "zwjs_command", target: ... }`
    - added `device-identity.driverId` alias normalization to `driverTemplateId`
    - hardened malformed action-shorthand validation with clear load-time errors
    - added fixture-backed regression tests and docs updates (`README.md`, `docs/rules-grammar.md`)
83. Completed compiler review pass + newcomer cold-start DSL usability audit:
    - reviewed compiler rule-loading/validation behavior after shorthand additions
    - hardened capability mapping schema validation to reject unsupported fields and malformed canonical mapping metadata
    - added regression coverage for post-expansion unknown-field rejection in shorthand mappings
    - ran no-context authoring exercise from docs for product+generic rules; resulting ergonomics updates:
      - refreshed `CONTRIBUTING.md` minimal example to use new shorthand and alias forms
      - added explicit shorthand/alias expansion notes for newcomer clarity
84. Completed DSL review hardening follow-up for nested canonical mapping shapes:
    - capability inbound/outbound canonical `selector`/`target` payloads now reject unknown nested fields
    - inbound watcher entries now validate strict value-id/event selector shapes
    - strict nested-shape validation also applied to `ignore-value.valueId`
    - added fixture-backed regression coverage for unsupported canonical selector/target fields
    - updated grammar/readme docs to make strict nested mapping semantics explicit
85. Completed Phase 4 TUI slice 1 (app shell + connect + node list/detail, read-only):
    - introduced `@zwavejs2homey/tui` package with view/presenter/service layering
    - added read-only ZWJS explorer service adapter over core client (`connect`, `listNodes`, `getNodeDetail`, `disconnect`)
    - added presenter state transitions and run-log tracking for connect/refresh/show workflows
    - added interactive shell command loop via `npm run compiler:tui` (`list`, `refresh`, `show <nodeId>`, `help`, `quit`)
    - added slice-1 tests (presenter transitions, service adapter behavior, and app smoke path)
    - folded TUI package tests/build into root workspace quality gates (`npm run check`)
    - introduced parent+child presenter workflow split (`packages/tui/src/presenter/*`) over service/core layers
    - added signature workflow commands:
      - `signature [triple] [--from-node <id>]`
      - `inspect [--manifest <file>]`
      - `validate [--manifest <file>]`
    - added compiler curation service integration for signature inspect/validate via existing tool libs
      - `scaffold preview [--product-name ...]`, `scaffold write [filePath] --force`
    - scaffold writes are path-guarded to `rules/project/product/*` and require explicit confirmation (`--force`)
    - added run-log command (`log [--limit N]`) and per-command error handling so interactive sessions continue after failures
    - expanded TUI tests for child-presenter delegation, command parsing, and presenter/app signature-curation flows
86. Completed Phase 4 TUI slice 6 (manifest helper + run-log polish):
    - added manifest helper command:
      - `manifest add [filePath] [--manifest <file>] --force`
    - manifest writes are confirmed and path-guarded through workspace file service
    - manifest helper deduplicates existing entries and enforces layer consistency for product entries
    - added workspace status snapshot command (`status`) for fast iteration context
    - expanded tests for manifest confirmation/delegation and status/command parsing coverage
87. Locked Phase 4 reset plan and navigation decisions:
    - core CLI contract changes now execute before TUI follow-up work
    - accepted hard rename from `compiler:loop` to `compiler:simulate`
    - locked dual-root startup model:
      - `--url` => live nodes root
      - `--rules-only` (+ optional `--manifest-file`) => rules root
    - locked simulation-centric curation flow for both roots, with rich simulation result view in TUI
    - locked implementation sequencing and convergence checkpoint (`plan/tui-implementation-plan.md`)
88. Synced docs/plans with the Phase 4 reset direction:
    - rewrote `plan/tui-implementation-plan.md` with locked section ordering (4A/4B core CLI first, then TUI sections)
    - updated roadmap/current-focus to track reset execution instead of prior slice-complete state
89. Completed Section 4A cutover part 1 (`compiler:simulate` rename):
    - added new `compiler:simulate` CLI command and renamed loop library/wrapper to `homey-compile-simulate*.mjs`
    - removed `compiler:loop` npm script and loop tool files
    - migrated loop-tool regression coverage to `homey-compile-simulate-tool.test.js`
    - simplified `compiler:simulate` to explicit-signature mode only (`--signature` required)
    - updated simulate parser/runtime tests and readme/architecture notes to match signature-only simulate behavior
90. Completed Section 4B tests/docs/help migration:
    - enforced strict CLI flag validation across `compiler:validate-live`, `compiler:baseline`, and `compiler:simulate` (unknown/removed flags fail fast with explicit errors)
    - updated parser regression coverage for removed/unsupported flag cases
    - aligned user-facing docs/help with simulate-centric wording and scaffold preview class override support
    - synced roadmap and TUI implementation plan to mark Section 4B complete
91. Completed Phase 4 Section 6A (dual-root shell simulation integration):
    - added TUI startup routing with explicit mode in session config:
      - nodes root (`--url ...`)
      - rules root (`--rules-only [--manifest-file ...]` with optional `--url` for live simulation)
    - added rules stack support:
      - manifest rule listing and rule detail inspection
      - signature selection from rule targets (`signature --from-rule <index>`)
    - integrated `simulate` command across both roots, wired to `compiler:simulate` via curation service
    - expanded renderers/help for rules root and simulation summaries
    - extended tests: parser/app/rules-presenter/workspace-file-service coverage for dual-root + simulate flow
    - synced roadmap and implementation plan to mark Section 6A complete, and leave Section 6B (panel-rich UI) pending
92. Started Phase 4 Section 6B (panel-first rich UI) first slice:
    - added default panel UI runtime (`--ui panel`) with shell fallback (`--ui shell`)
    - introduced full-screen panel frame rendering and key-intent mapping modules
    - implemented panel event loop for nodes/rules roots on top of existing presenters/services
    - wired panel actions for refresh/open/inspect/validate/simulate/scaffold preview plus confirmed write helpers (`W` scaffold write, `A` manifest add)
    - added panel view/runtime tests (`panel-view`, `panel-app`) and updated CLI arg tests for ui mode
93. Completed Section 6B list ergonomics slice:
    - added viewported list navigation ergonomics:
      - page movement (`pgup`/`pgdn`) and boundary jumps (`home`/`end`)
      - stable selection persistence by item key across filtering/refresh
    - added interactive panel filter mode (`/`) with inline query editing and match counts
    - hardened quit/data handling to avoid arrow-sequence misclassification while preserving fallback quit paths
    - added/expanded panel tests for filtering, viewport scrolling, and low-level key parsing
94. Completed remaining Section 6B rich-panel slices:
    - richer detail panes:
      - panel-optimized node detail renderer with value previews
      - panel-optimized rule detail renderer with concise rule/action summaries
      - panel-optimized validation/simulation summaries for bottom-pane readability
    - safer curation write UX:
      - explicit in-panel two-step confirmation flow for scaffold write (`W`) and manifest add (`A`)
    - diagnostics UX:
      - active operation tracking in panel footer
      - cancel support (`c`) for running operations
      - timeout handling with configurable panel timeout for tests and deterministic timeout reporting
    - expanded panel tests:
      - confirmation workflow coverage
      - cancel workflow coverage
      - timeout workflow coverage
95. Completed Section 6C foundation slice (before full edit UX):
    - added scaffold edit-mode scaffolding in panel (`e` enter, `esc` exit)
    - added draft-editor state/model APIs in presenters (nodes + rules) with initial validation/commit lifecycle
    - added panel + presenter regression tests for edit-mode entry and draft-editor mutation/commit behavior
96. Completed Section 6C metadata editing slice:
    - panel draft editor now supports typed edits for scaffold metadata fields (`productName`, `homeyClass`, `ruleIdPrefix`, `fileHint`)
    - edit interactions now support field selection (`up/down`), select-field cycling (`left/right`), and text field editing (`enter`, type, `enter`)
    - `esc` in edit mode now commits draft editor state before returning to detail mode
    - panel test harness updated for arrow-left/right key mapping and metadata edit flow coverage
97. Completed Section 6C capability rows + typed capability field editing slice:
    - draft editors (nodes + rules presenters) now support capability row add/clone/remove/reorder operations
    - capability field editing is typed for `capabilityId` and `directionality` (`bidirectional` / `inbound-only` / `outbound-only`)
    - panel edit mode now supports capability operations with direct key actions (`+`, `*`, `-`, `<`, `>`)
    - validation now includes capability row constraints (`capabilityId` required, directionality validity, duplicate capability warnings)
    - added presenter + panel regression tests for capability row operations and defaults
98. Completed panel chrome presenter slice (view/presenter separation step):
    - extracted header/footer contextual help generation into a dedicated presenter (`PanelChromePresenter`)
    - `runPanelApp` now consumes presenter-produced chrome view-model output instead of composing footer/header directly in the view loop
    - added focused regression coverage for panel chrome contexts (filter, detail, scaffold edit, confirm/cancel hints)
99. Completed panel layout presenter slice (view/presenter separation step):
    - extracted list/detail/output pane title composition into a dedicated presenter (`PanelLayoutPresenter`)
    - `runPanelApp` now consumes presenter-produced pane title view-model output for list/detail/output labels
    - added focused regression coverage for list pagination/filter titles, detail range titles, and compact-vs-expanded output labels
100. Completed panel output presenter slice (view/presenter separation step):


    - extracted bottom-pane output shaping (line split, scroll clamp, compact/full visible lines) into a dedicated presenter (`PanelOutputPresenter`)
    - `runPanelApp` now consumes presenter-produced output view-model data for status-bar compact rendering, full output pane rendering, and panel snapshots
    - added focused regression coverage for compact/full output behavior and scroll clamping edge cases

101. Completed Section 6C typed mapping editor slice:


    - draft editors (nodes + rules presenters) now support typed inbound/outbound mapping field edits per capability
    - mapping kinds are typed/selectable (`inbound: value|event`, `outbound: set_value|invoke_cc_api|zwjs_command`) with path-specific field coercion
    - command-class/endpoint fields are validated/coerced as integers at edit time; property/propertyKey fields are normalized as string|number
    - panel draft editor now exposes selector/target mapping fields and capability-level inbound/outbound mapping summaries
    - added presenter regression coverage for mapping field edits and invalid numeric input rejection

102. Completed Section 6C live validation + write gating slice:


    - panel draft editing now surfaces validation status in update feedback (`Validation: ok|warnings|errors`)
    - scaffold write (`W`) and manifest add (`A`) now validate active draft state before confirmation/write
    - write actions are blocked when draft errors exist; warning-only drafts remain writable with warning context on confirmation
    - added panel regression coverage for write-block-on-errors and warning-only write flow

103. Completed Section 6C in-panel diff preview slice:


    - first-step write confirmations (`W`/`A`) now include draft diff preview context (`baseDraft` -> `workingDraft`) before execution
    - diff preview summarizes change counts (`+/-/~`) and includes deterministic path-level change lines with truncation guards
    - warning-first + diff preview messaging now renders in compact and expanded bottom panes
    - added panel regression coverage for changed-draft preview and no-change preview confirmation flows

104. Completed Section 6C vocabulary audit slice:


    - audited hardcoded authoring vocab usage across TUI editor, presenters, and compiler validation surfaces
    - classified vocab domains by ownership (`compiler-artifact-derived` vs `intentionally static`; SDK enum source not available)
    - documented cutover matrix and next actions in `docs/homey-authoring-vocabulary-audit.md`

105. Completed Section 6C vocabulary cutover slice:


    - added compiler `homey-authoring-vocabulary/v1` artifact contract (`create/assert/load/lookup`)
    - added `compiler:homey-vocabulary` build CLI (`tools/homey-authoring-vocabulary-build*.mjs`) sourcing system vocab from `homey-lib` and custom capability IDs from `.homeycompose/capabilities`
    - wired vocabulary-aware compiler rule validation hooks (`RuleValidationOptions.vocabulary`) for `homeyClass`/`capabilityId` membership enforcement
    - wired TUI draft editor to load vocabulary artifact (`--vocabulary-file`, default `rules/homey-authoring-vocabulary.json`)
    - replaced hardcoded Homey class select with vocabulary-backed options
    - switched capability ID field to vocabulary-backed select when capability vocab exists
    - added strict draft validation for unknown `homeyClass` / `capabilityId` values
    - added compiler/core/tui regression coverage for artifact, tool, loader, and validation behavior

106. Completed docs consistency cleanup pass:


    - resolved stale “planned/pending” wording in compiler/runtime curation persistence plan with the accepted v1 storage ADR reference
    - updated vocabulary audit doc to mark cutover sections/work items as implemented/current
    - rewrote ZWJS capability matrix gap section into explicit actionable gap IDs (`ZWJS-G1..G7`) with current date context and pointers to execution/checklist docs

107. Completed `ZWJS-G1` capture-tooling slice:


    - expanded `zwjs:inspect` with `logs capture` command (`summary|json` output, duration/max-event controls, optional log filter flags)
    - added typed `driver.logging` capture summary diagnostics (typed-field counters + payload-shape histogram + sample payload extraction)
    - added artifact export flags for repeatable validation (`--output-file` JSON report, `--events-file` NDJSON captured payloads)
    - added regression coverage for CLI parsing and capture behavior (max-event stop path + typed summary classification)
    - updated README/capability-matrix/parity-roadmap docs with the concrete `ZWJS-G1` workflow command

108. Completed `ZWJS-G1` live-observation + typing-tightening slice:


    - captured active `driver.logging` traffic from the live ZWJS instance (10 events over 120s) and confirmed end-to-end specialized event emission
    - tightened specialized logging guard semantics to require valid `message` shape (`string|string[]`) and object-shaped `context` when present
    - extended `ZwjsDriverLoggingEventPayload` with observed stable fields (`level`, tags, direction, context, label, timestamp, multiline, secondaryTagPadding)
    - added observed multiline driver-logging fixture and normalizer regression tests (positive observed-shape case + invalid-message negative case)
    - updated parity/capability docs to mark `ZWJS-G1` as closed and move follow-on variant capture into on-demand backlog

109. Completed `ZWJS-G4` node-value typing closure slice:


    - sampled live node value/value-metadata payloads across representative production nodes (read-only)
    - expanded `ZwjsNodeValueMetadataResult` with observed stable fields (`minLength`, `maxLength`, `valueSize`, `format`, `allowManualEntry`, `isFromConfig`, `name`, `info`, `ccSpecific`, `valueChangeOptions`)
    - added runtime metadata guards (`isZwjsNodeValueMetadataResult`, `hasZwjsNodeValueMetadataBounds`, `isZwjsNodeValueMetadataDuration`)
    - added command-class-specific sample guards/extractors for observed value families:
      - CC 37/38 duration objects
      - CC 98 lock-handle boolean arrays
      - CC 134 firmware-version string arrays
    - added observed fixtures + regression tests for value and metadata sample shapes
    - updated parity/capability docs to mark `ZWJS-G4` as closed and move future variant expansion to on-demand follow-up

110. Completed actionable-gap triage pass for ZwjsClient parity:


    - updated capability matrix to mark code-actionable gaps as closed (`ZWJS-G1`, `ZWJS-G4`)
    - reclassified `ZWJS-G2`/`ZWJS-G3` as external validation blockers (non-production hardware/setup required)
    - synced roadmap wording so remaining open parity items clearly reflect environment dependency rather than code implementation gaps

111. Logged parity-validation deferral decision:


    - confirmed `ZWJS-G2` (zniffer non-prod validation) and `ZWJS-G3` (firmware non-prod validation) are intentionally deferred for now
    - documented that focus remains on Homey adapter delivery until a safe non-production validation setup is available
    - synced capability matrix + roadmap + parity roadmap language to reflect “deferred, environment-dependent” status

## Next Tasks

1. Bridge/read-only enrichment:
   - surface more actionable bridge diagnostics and runtime facts from ZWJS session state in Homey-facing surfaces.
2. Node/read-only enrichment:
   - flesh out node detail metadata (resolved profile, classification/mapping diagnostics, key identity fields) without broadening write paths.
3. Pairing UX polish within template limits:
   - keep `list_devices -> add_devices` flow clear and add stronger post-bridge guidance for node import.
4. Generic inference policy checkpoint:
   - keep compile-time generic layer (`project-generic`) active;
   - explicitly decide whether/when adapter runtime generic inference (beyond compiled artifact resolution + safe no-match fallback) should be introduced.
5. Keep compiler/TUI maintenance pass active for regressions found during adapter integration.

Note:

- Phase 4 reset sections (through Section 7.3 convergence) are complete.

## Risks / Unknowns

- Catalog source conflicts will grow as new real sources are added (official catalog, `zwave-js` config exports, observed captures)
- Compiler performance may degrade as HA-derived + project rules + catalog-aware diagnostics scale up
- Risk of overloading compiler behavior with catalog heuristics before precedence policy is explicitly designed
- Risk of boundary drift if runtime curation semantics are reintroduced into compiler package
- Risk of boundary drift if compiler-side generic rules grow beyond provisional static coverage and blur adapter-owned fallback policy

## Notes

- Homey compiler architecture and phase progress:
  - `plan/homey-translation-compiler-plan.md`
- TUI implementation plan (phase 4):
  - `plan/tui-implementation-plan.md`
- Current system architecture overview:
  - `docs/architecture.md`
- Documentation sync contract (readme/plan/docs update expectations):
  - `README.md` (Documentation Sync Contract section)
- Diagnostic CLIs support:
  - `summary`, `markdown`, `json`, `json-pretty`, `json-compact`, `ndjson`

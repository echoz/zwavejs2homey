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

In progress / next:

1. surface recommendation/curation diagnostics in app-facing UX paths
2. implement recommendation backfill/adopt flows
3. continue broadening runtime mapping coverage with tests

Exit criteria:

- recommendation state computed per device and persisted/observable
- curation diagnostics are actionable for operators/users
- stable runtime behavior under app restart/settings reload/node event churn

## Phase 6 — Reliability + UX (Next)

Planned:

1. Homey settings/diagnostics UX for profile + curation state
2. support/log bundle workflows
3. non-production protocol validation runs (deferred Phase 2 items)

## Active Risks

- recommendation workflow semantics may need refinement during real UX integration
- runtime mapping breadth may outpace validation coverage if not expanded with tests
- deferred non-production validation leaves blind spots in less-used mutation domains

## References

- architecture: `docs/architecture.md`
- active sprint log: `plan/current-sprint.md`
- curation execution plan: `plan/homey-adapter-runtime-curation-plan.md`
- decision records: `docs/decisions/`

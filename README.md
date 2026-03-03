# zwavejs2homey

`zwavejs2homey` is a monorepo for bridging a `zwave-js-server` network into Homey.

## Project Context

- This is a personal side project used to learn Codex-assisted software development.
- The repo favors small, test-backed slices and explicit architecture/doc updates so decisions stay understandable.

It is built as four explicit layers:

- `@zwavejs2homey/core`: protocol client (`ZwjsClient`)
- `@zwavejs2homey/compiler`: static profile compiler + diagnostics
- `@zwavejs2homey/tui`: contributor tooling (panel/shell)
- `co.lazylabs.zwavejs2homey`: Homey app runtime adapter

## Current State

- Phase 1 foundation: complete
- Phase 2 protocol core: complete for current scope (non-prod firmware/zniffer validation deferred)
- Phase 3 compiler: complete for MVP goals (second catalog source adapter deferred)
- Phase 4 TUI: complete
- Phase 5 Homey adapter: in progress (runtime mapping + curation baseline + recommendation-state detection + diagnostics snapshot APIs + node Device Tools host/view with explicit adopt/backfill actions delivered)

## Architecture At A Glance

```text
                    Compile-Time

HA import + project rules + catalog + vocabulary
                    |
                    v
         @zwavejs2homey/compiler
                    |
                    v
      compiled-homey-profiles/v1 artifact

---------------------------------------------------

                     Runtime

Homey App (co.lazylabs.zwavejs2homey)
  |
  +-- shared ZwjsClient session (@zwavejs2homey/core)
  +-- compiled profile resolver runtime
  +-- curation.v1 runtime (load/validate/apply)
  |
  +--> bridge driver (singleton-like control plane)
  +--> node driver (one Homey device per ZWJS node)
           |
           v
      profile resolve -> curation apply -> mapping wire
```

## Repository Layout

```text
packages/
  core/       protocol client, transport, wrappers, tests
  compiler/   rule engine, HA import, catalog tooling, artifact runtime helpers
  tui/        dual-root contributor UX (nodes/rules), simulation, scaffold editing

co.lazylabs.zwavejs2homey/
  Homey app runtime: app lifecycle, drivers, pairing/import, node runtime mapping, curation

rules/
  manifest + generated HA-derived rules + project generic/product rules

tools/
  CLI entrypoints for inspect/build/validate/simulate/catalog/vocabulary

docs/ and plan/
  architecture, ADRs, capability matrix, execution plans
```

## Homey Runtime Model (MVP)

```text
Pairing:
  bridge driver -> add singleton bridge device
  node driver   -> import ZWJS nodes (skip nodeId=1, dedupe by bridgeId+nodeId)

Node runtime sync:
  1) read node state + value metadata
  2) resolve compiled profile
  3) apply device-instance curation (curation.v1)
  4) extract compatible runtime mappings
  5) gate by readable/writeable facts
  6) wire inbound/outbound listeners
  7) persist diagnostics (profileResolution)
```

## Quickstart

Prerequisites:

- Node.js + npm
- Homey CLI (`homey`) for app validation/deploy workflows
- reachable `zwave-js-server` instance for live tooling

Install and run the quality gate:

```bash
npm install
npm run check
```

Notes:

- Root `npm install` now also installs Homey app dependencies via `postinstall`.
- If you install with scripts disabled, run `npm --prefix co.lazylabs.zwavejs2homey install` manually.

## High-Value Commands

ZWJS read-only inspect:

```bash
npm run zwjs:inspect -- nodes list --url ws://HOST:PORT --format table
npm run zwjs:inspect -- nodes show 12 --url ws://HOST:PORT --format json --include-values summary
```

Build compiled profiles from live nodes:

```bash
npm run compiler:build -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --output-file /tmp/compiled-live.json
```

Inspect/validate/simulate compile results:

```bash
npm run compiler:inspect-live -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --format list
npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json
npm run compiler:simulate -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --signature 29:66:2
```

Run the TUI:

```bash
npm run compiler:tui -- --url ws://HOST:PORT
npm run compiler:tui -- --rules-only --manifest-file rules/manifest.json
```

Rebuild Homey authoring vocabulary artifact:

```bash
npm run compiler:homey-vocabulary
```

Validate the Homey app package:

```bash
npm run build:homey
cd co.lazylabs.zwavejs2homey && homey app validate
```

`build:homey` also refreshes vendored runtime packages in `co.lazylabs.zwavejs2homey/vendor/`
so `homey app run` does not depend on workspace-external package links.

Smoke-test Homey runtime API routes:

```bash
npm run homey:runtime-api:smoke -- --base-url http://HOMEY/api/app/co.lazylabs.zwavejs2homey --token <token>
```

## Rules and Artifacts

Canonical compile-time inputs:

- `rules/manifest.json`
- `rules/ha-derived/home-assistant.zwave_js.generated.json`
- `rules/project/generic/base-generic.json`
- `rules/project/product/*.json`

Canonical artifacts:

- compiled profiles: `compiled-homey-profiles/v1`
- authoring vocabulary: `homey-authoring-vocabulary/v1`

## Boundary Rules

- Compiler owns compile-time profile generation and diagnostics.
- Homey app owns runtime curation persistence/application semantics.
- Runtime curation is `curation.v1` in Homey settings.
- Compile-time layers are manifest-owned; runtime-only rules are out of compiler scope.

See `docs/decisions/` for locked ADRs.

## Documentation Map

- architecture: `docs/architecture.md`
- compiler rules grammar: `docs/rules-grammar.md`
- validation gates: `docs/compiler-validation-gates.md`
- capability matrix: `docs/zwjs-capability-matrix.md`
- homey runtime API contract: `docs/homey-api-contract.md`
- roadmap: `plan/roadmap.md`
- current sprint log: `plan/current-sprint.md`
- homey curation plan: `plan/homey-adapter-runtime-curation-plan.md`

## Development Workflow

- implement in small slices
- add/update tests
- run `npm run check`
- commit with descriptive message
- sync docs/plans with behavior changes

## Contributing

See `CONTRIBUTING.md`.

## Attribution

This repository is developed in a tight human+AI workflow:

- Jeremy Foo drives architecture, scope, sequencing, and acceptance
- Codex (OpenAI) has implemented a substantial portion of code, tests, tooling, and refactors under that direction

## License

Apache-2.0 (`LICENSE`).

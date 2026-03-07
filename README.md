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
- Phase 5 Homey adapter MVP: complete
- Phase 6 reliability + UX: complete
- Phase 7 capability expansion + custom UX: planned

Per-node capability expansion is now the primary next-phase focus.

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
  +-- bridge session registry (@zwavejs2homey/core client per bridgeId)
  +-- compiled profile resolver runtime
  +-- curation.v1 runtime (load/validate/apply)
  |
  +--> bridge driver (one control-plane device per ZWJS instance)
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
  bridge driver -> add bridge device(s): main, bridge-2, bridge-3...
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

Pairing UI note:

- Homey system pairing templates (`list_devices`, `add_devices`) are intentionally constrained and not deeply styleable.
- Rich onboarding UX (multi-step guidance, richer status panes, custom control flow) requires custom pairing views and is tracked as post-MVP work.

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

Build the bundled Homey runtime compiled artifact (static, rule-derived):

```bash
npm run compiler:build:bundled
```

Inspect/validate/simulate compile results:

```bash
npm run compiler:inspect-live -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --format list
npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json
npm run compiler:simulate -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --signature 29:66:2
```

Rank live product-triple expansion candidates from inspect output:

```bash
npm run compiler:inspect-live -- --url ws://HOST:PORT --all-nodes --compiled-file co.lazylabs.zwavejs2homey/assets/compiled/compiled-homey-profiles.v1.json --format json-pretty --output-file /tmp/inspect-live.json
npm run compiler:expansion-candidates -- --inspect-live-file /tmp/inspect-live.json --top 12 --format markdown --output-file /tmp/expansion-candidates.md
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
It also compiles and syncs Homey runtime JS entrypoints (`app.js`, `drivers/*/*.js`) used by
Homey preprocess, and regenerates the bundled compiled profiles artifact from `rules/manifest.json`.

Run the Homey app in development:

```bash
cd co.lazylabs.zwavejs2homey
homey app run --path .
```

Then in Homey:

1. Add a `ZWJS Bridge` device.
2. Open that bridge device's Advanced Settings.
3. Configure:
   - `WebSocket URL`: `ws://192.168.1.15:3000` (or your ZWJS URL)
   - `Auth Type`: `None` or `Bearer Token`
   - `Bearer Token`: required only when auth type is bearer

Bridge settings are per-device. The app runtime creates one bridge session per `bridgeId`.
If a bridge has no `WebSocket URL`, that bridge session will stay disconnected.

Smoke-test Homey runtime API routes:

```bash
npm run homey:runtime-api:smoke -- --base-url http://HOMEY/api/app/co.lazylabs.zwavejs2homey --token <token>
```

Generate a support bundle (read-only diagnostics + recommendations snapshot):

```bash
npm run homey:support-bundle -- \
  --base-url http://HOMEY/api/app/co.lazylabs.zwavejs2homey \
  --bridge-id main \
  --token <token> \
  --format markdown \
  --output-file /tmp/zwjs2homey-support.md \
  --redact-share
```

Both CLIs support optional bridge scoping via `--bridge-id <bridgeId>`.

Run capability expansion pressure audit (compiled artifact + optional support bundle):

```bash
npm run homey:capability-audit -- \
  --artifact-file co.lazylabs.zwavejs2homey/assets/compiled/compiled-homey-profiles.v1.json \
  --support-bundle-file /tmp/zwjs2homey-support.json \
  --top 12 \
  --format markdown \
  --output-file /tmp/zwjs2homey-capability-audit.md
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
- Current runtime policy is compiled-profile-first plus device-instance curation; runtime generic inference expansion is intentionally frozen for v1.
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

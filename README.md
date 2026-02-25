# zwavejs2homey

`zwavejs2homey` is a bridge project for mapping Z-Wave devices (via `zwave-js-server` / Z-Wave JS UI) into Homey-compatible device profiles and, later, a Homey app adapter.

The project is intentionally split into layers:

- `packages/core`: protocol-first `ZwjsClient` (WebSocket client for `zwave-js-server`)
- `packages/compiler`: Homey-targeted profile compiler (rules + HA import + catalog tooling)
- `co.lazylabs.zwavejs2homey`: Homey app package (adapter/runtime integration, in progress)

## Project Goals

- Build a robust `zwave-js-server` client with strong typing and tests
- Compile layered rules (HA-derived + project rules) into reusable Homey device profile artifacts
- Validate compiled profiles against live ZWJS data before implementing the Homey adapter runtime
- Keep compiler and Homey adapter responsibilities separate

## Interesting Project Characteristics

- **Protocol-first foundation**: `packages/core` is a standalone `zwave-js-server` client, not a Homey-specific wrapper. This keeps protocol work testable and reusable.
- **HA-assisted compiler pipeline**: Home Assistant `zwave_js` discovery rules are extracted and translated into a generated `ha-derived` rule layer, then combined with project rules.
- **Static-first mapping design**: the compiler emits reusable Homey profile artifacts (`compiled-homey-profiles/v1`) instead of relying on runtime inference (with Homey-specific fallback inference likely owned by the adapter layer).
- **Diagnostics-heavy workflow**: the compiler and import tools support `summary`, `markdown`, `json-*`, and `ndjson` outputs for debugging and review.
- **Live validation loop**: tooling can inspect live ZWJS nodes and compare/validate compiler behavior against real device data.
- **Catalog-aware diagnostics**: compiler reporting can attach catalog context (`catalogId`, known vs unknown device) without changing rule precedence.

## Repository Layout

- `co.lazylabs.zwavejs2homey/`
  - Homey app scaffold and Homey-specific runtime code
- `packages/core/`
  - `ZwjsClient`, protocol types, transport, normalizers, tests
- `packages/compiler/`
  - compiler models, rule loading/matching/application, HA import pipeline, catalog tooling
- `tools/`
  - local CLIs for inspection, import, catalog operations, benchmarking, and compiler builds
- `rules/`
  - real rule pipeline inputs (HA-derived + project generic/product rules)
- `docs/`
  - architecture notes, capability matrix, validation checklists
- `plan/`
  - roadmaps, active plans, sprint notes

## Key CLI Tools

### ZWJS inspection (live, read-only)

- `npm run zwjs:inspect -- --help`
- `npm run zwjs:inspect -- nodes list --url ws://HOST:PORT --format table`
- `npm run zwjs:inspect -- nodes show <nodeId> --url ws://HOST:PORT --format json --include-values full`

### Compiler inspection (device facts -> compiled profile)

- `npm run compiler:inspect -- --help`
- `npm run compiler:inspect -- --device-file <device.json> --rules-file <rules.json> --format summary`
- `npm run compiler:inspect -- --device-file <device.json> --manifest-file <manifest.json> --format markdown --explain-all`

### Live compiler inspection (ZWJS -> compile on the fly)

- `npm run compiler:inspect-live -- --help`
- `npm run compiler:inspect-live -- --url ws://HOST:PORT --all-nodes --manifest-file <manifest.json> --format list`

Compiled-artifact apply mode is now also supported for runtime-style validation:

- `npm run compiler:inspect-live -- --url ws://HOST:PORT --all-nodes --compiled-file /tmp/compiled-profiles.json --format list`
  - live inspection/build tools skip controller-like nodes by default; use `--include-controller-nodes` to include them for diagnostics

### Compiler build/export (compiled profiles artifact)

- `npm run compiler:build -- --help`
- `npm run compiler:build -- --device-file <device.json> --manifest-file <manifest.json> --output-file /tmp/compiled-profiles.json --format summary`
- `npm run compiler:build -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --output-file /tmp/compiled-live.json --format summary`

This emits a `compiled-homey-profiles/v1` artifact.

Using the canonical layered rules pipeline:

- `rules/manifest.json`
- `rules/ha-derived/home-assistant.zwave_js.generated.json`
- `rules/project/generic/base-generic.json`

### HA import pipeline

- `npm run ha-import:extract -- --help`
- `npm run ha-import:extract -- --source-home-assistant docs/external/home-assistant --format summary --timing`
- `npm run ha-import:report -- --input-file <ha-extracted.json> --format markdown`

### Catalog tooling

- `npm run catalog -- summary --input-file <catalog.json>`
- `npm run catalog -- normalize --input-file <catalog.json> --conflict-mode warn`
- `npm run catalog -- merge --input-file <a.json> --input-file <b.json>`
- `npm run catalog -- diff --from-file <a.json> --to-file <b.json> --only changed`

## Rules Pipeline (Current State)

`rules/` is the canonical location for real compiler rules:

- `rules/ha-derived/` (generated from Home Assistant extraction/translation)
- `rules/project/generic/` (starter/provisional generic rules; fallback inference policy may move to the Homey adapter)
- `rules/project/product/` (product-specific overrides)

At the moment, many examples still live in `packages/compiler/test/fixtures/`. The next compiler slices will populate `rules/` with the real working rulesets.

## Development Workflow

The project is being built incrementally in slices:

- implement one slice
- add/update tests
- run formatting + checks
- commit with a descriptive message

Primary local validation command:

- `npm run check`

This runs:

- formatting check
- lint (Homey app)
- compiler tests
- core tests
- Homey app TypeScript build

### Collaboration / Attribution

This repository has been developed using a tight human+AI workflow:

- Jeremy Foo drives architecture, sequencing, and acceptance criteria
- Codex (OpenAI) performed a large portion of the implementation/code generation, test scaffolding, CLI tooling, and refactors under Jeremy's direction

Working style used in this repo:

- small scoped slices
- tests + validation for each slice
- Prettier + `npm run check` before commit
- descriptive commits
- periodic code reviews and plan/doc sync

This attribution is included to make the development process explicit and auditable, not to replace normal code ownership/review standards.

## Current Boundary Decisions

- Compiler owns:
  - compiled profile artifacts
  - rule layering
  - HA import pipeline
  - catalog tooling
  - provenance and diagnostics
- Homey adapter owns:
  - runtime curation behavior
  - patch storage/application semantics
  - runtime execution of compiled inbound/outbound mappings

## Where to look next

- `docs/architecture.md`
- `plan/homey-translation-compiler-plan.md`
- `plan/roadmap.md`
- `plan/current-sprint.md`

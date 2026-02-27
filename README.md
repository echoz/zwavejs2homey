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
- **Actionable review output**: list output favors actionable review reasons; technical signals (like suppressed fill/unmatched ratio) are expanded in human-readable summary/markdown diagnostics instead of surfaced as terse review codes.
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

### Live validation loop (build + apply + markdown summary)

- `npm run compiler:validate-live -- --help`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --artifact-file /tmp/compiled-live.json --report-file /tmp/compiled-live.validation.md --top 10`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --summary-json-file /tmp/compiled-live.summary.json --max-review-nodes 5 --max-generic-nodes 2 --fail-on-reason known-device-generic-fallback`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --gate-profile-file plan/validation-gates.example.json`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --gate-profile-file plan/validation-gates.example.json --print-effective-gates`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --compiled-file /tmp/compiled-live.json --report-file /tmp/compiled-live.validation.md`
- `npm run compiler:validate-live -- --input-summary-json-file /tmp/compiled-live.summary.json --gate-profile-file plan/validation-gates.example.json --print-effective-gates`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --baseline-summary-json-file /tmp/compiled-live.baseline.summary.json --max-review-delta 1 --max-generic-delta 0 --fail-on-reason-delta known-device-unmapped:0`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --save-baseline-summary-json-file /tmp/compiled-live.baseline.summary.json --artifact-retention delete-on-pass`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --summary-json-file /tmp/compiled-live.summary.json --redact-share`
- `npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --curation-backlog-json-file /tmp/compiled-live.curation-backlog.json --redact-share`
- `npm run compiler:baseline -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json`
- `npm run compiler:baseline -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --redact-share`

This runs the canonical live validation loop in one command:

- builds a compiled artifact from live nodes
- reapplies that artifact against live nodes (runtime-style)
- writes a markdown validation summary with outcomes/review reasons/top unmatched/suppressed signatures
- optionally enforces quality gates and exits non-zero (CI-friendly) via `--max-*` and `--fail-on-reason`
- gate/output settings can be loaded from `--gate-profile-file` (CLI flags override profile values)
- `--print-effective-gates` prints the merged gate/output config (after CLI/profile/default precedence) before execution
- `--compiled-file` reuses an existing compiled artifact and skips the build phase
- `--input-summary-json-file` re-evaluates gates from an existing summary JSON (offline gate tuning; no ZWJS connection)
- regression deltas are supported with `--baseline-summary-json-file`, `--max-*-delta`, and `--fail-on-reason-delta <reason>:<delta>`
- when baseline is configured, markdown reports include baseline/delta tables for quick human triage
- `--save-baseline-summary-json-file` writes the current machine summary in baseline-friendly form so refreshing baseline snapshots is one command
- `--artifact-retention delete-on-pass` removes large generated compiled artifacts after successful validation runs
- `--redact-share` writes PR-safe artifacts (`*.redacted.md`, `*.redacted.json`) with URL/path/node identity redaction
- redacted output paths can also be set explicitly via `--redacted-report-file` and `--redacted-summary-json-file`
- `--curation-backlog-json-file` writes a ranked per-signature curation queue (review/generic pressure + reasons + sample nodes) to guide next rule slices
- when backlog output is enabled with `--redact-share`, a redacted backlog file is also emitted (default `*.redacted.json`, overridable via `--redacted-curation-backlog-json-file`)
- `compiler:baseline` orchestrates baseline capture + immediate recheck in one command and writes timestamped artifacts under `plan/baselines/` by default
- `compiler:baseline --redact-share` emits redacted baseline/recheck markdown+summary artifacts in the same run (with optional stage-specific redacted path overrides)

Gate setup guide: `docs/compiler-validation-gates.md`

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

`rules/` is now the primary runtime-validation rules source. `packages/compiler/test/fixtures/` remains for isolated unit/integration test scenarios.

## Documentation Sync Contract

To keep repo memory consistent, each behavior-changing slice updates these files together:

- `README.md`: high-level architecture/workflow/CLI contract
- `plan/current-sprint.md`: latest completed slices + live validation outcomes
- `plan/roadmap.md`: phase-level completion state
- `docs/architecture.md`: ownership boundaries + system structure
- `rules/project/product/README.md` and/or `rules/ha-derived/README.md` when rule coverage changes

Rule of thumb:

- If code/rules changed and at least one of the above docs did not change, the slice is not done.

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

## Contributing

See `CONTRIBUTING.md` for code + rule/profile contribution workflow, evidence expectations, and PR checklist.

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

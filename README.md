# zwavejs2homey

`zwavejs2homey` is a bridge project for mapping Z-Wave devices (via `zwave-js-server` / Z-Wave JS UI) into Homey-compatible device profiles and, later, a Homey app adapter.

The project is intentionally split into layers:

- `packages/core`: protocol-first `ZwjsClient` (WebSocket client for `zwave-js-server`)
- `packages/compiler`: Homey-targeted profile compiler (rules + HA import + catalog tooling)
- `packages/tui`: Phase 4 ZWJS explorer/curation terminal UI (view/parent+child presenters/service shell over existing tooling)
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
- **Shared profile resolution semantics**: compiled artifact matching (product triple/node/device-key precedence) now lives in compiler runtime helpers so tooling and the upcoming Homey adapter use the same resolver behavior.
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
- `packages/tui/`
  - terminal UI app shell with strict view/parent+child presenters/service layering
- `tools/`
  - local CLIs for inspection, import, catalog operations, benchmarking, and compiler builds
- `rules/`
  - real rule pipeline inputs (HA-derived + project generic/product rules)
- `docs/`
  - architecture notes, capability matrix, validation checklists
- `plan/`
  - roadmaps, active plans, sprint notes

## Homey MVP Shape (Locked)

Per `docs/decisions/0017-homey-mvp-driver-topology-and-pairing-model.md`, the Homey adapter MVP uses two drivers:

- `bridge` driver:
  - singleton-like bridge device for ZWJS endpoint status and control-plane actions
  - can expose inclusion controls
- `node` driver:
  - one Homey device per imported ZWJS node
  - applies compiled profile resolution + runtime mappings

Pairing semantics:

- Homey does not become Z-Wave inclusion authority in this architecture.
- Node onboarding is an import/link flow from ZWJS into Homey.
- Preferred UX is inclusion + add from node pairing flow.
- If inclusion is started from bridge UX, node add remains explicit via node pairing.
- No automatic cross-driver pairing handoff is assumed in v1.

Current implementation status:

- driver scaffolds are implemented in `co.lazylabs.zwavejs2homey/drivers/bridge` and `co.lazylabs.zwavejs2homey/drivers/node`
- bridge pairing is singleton-gated via stable bridge identity (`zwjs-bridge-main`)
- node pairing imports candidates from live ZWJS, skips controller node (`nodeId = 1`), and dedupes already paired `bridgeId + nodeId`

Additional locked MVP runtime policies:

- one shared app-level ZWJS session service with serialized inclusion/exclusion lock (`docs/decisions/0018-homey-zwjs-session-and-inclusion-lock-v1.md`)
- node identity/dedupe keyed by `bridgeId + nodeId` (`docs/decisions/0019-homey-node-identity-and-dedupe-v1.md`)
- compiled profile source/refresh is explicit and local in v1 (`docs/decisions/0020-homey-compiled-profile-source-and-refresh-policy-v1.md`)
- no-profile-match imports use minimal safe fallback + curation recommendation (`docs/decisions/0021-homey-no-profile-match-runtime-policy-v1.md`)
- class/capability structural changes are explicit user-driven updates, not automatic runtime mutation (`docs/decisions/0022-homey-device-class-and-capability-mutation-policy-v1.md`)

## Homey App Connection Setting

The Homey app bootstrap reads ZWJS transport settings from `this.homey.settings` key:

- `zwjs_connection`

Supported setting shapes:

- URL string: `"ws://192.168.1.15:3000"`
- Object:
  - `{ "url": "ws://192.168.1.15:3000", "token": "..." }`
  - `{ "url": "wss://example", "auth": { "type": "none" } }`
  - `{ "url": "wss://example", "auth": { "type": "bearer", "token": "..." } }`

Invalid/missing values fall back to `ws://127.0.0.1:3000` with auth `none`.

## Key CLI Tools

### ZWJS inspection (live, read-only)

- `npm run zwjs:inspect -- --help`
- `npm run zwjs:inspect -- nodes list --url ws://HOST:PORT --format table`
- `npm run zwjs:inspect -- nodes show <nodeId> --url ws://HOST:PORT --format json --include-values full`
- `npm run zwjs:inspect -- logs capture --url ws://HOST:PORT --duration-seconds 60 --max-events 200 --format summary`
- `npm run zwjs:inspect -- logs capture --url ws://HOST:PORT --filter-source driver --filter-label Zw* --output-file /tmp/zwjs-driver-logging-report.json --events-file /tmp/zwjs-driver-logging-events.ndjson`

### ZWJS Explorer TUI (Dual Root)

- `npm run compiler:tui -- --help`
- `npm run compiler:tui -- --url ws://HOST:PORT --include-values summary`
- `npm run compiler:tui -- --url ws://HOST:PORT --start-node 12 --include-values full`
- `npm run compiler:tui -- --rules-only --manifest-file rules/manifest.json`
- `npm run compiler:tui -- --rules-only --url ws://HOST:PORT --manifest-file rules/manifest.json`
- `npm run compiler:tui -- --url ws://HOST:PORT --vocabulary-file rules/homey-authoring-vocabulary.json`
- `npm run compiler:tui -- --url ws://HOST:PORT --ui shell` (fallback shell mode)

Phase 4 reset status:

- complete
- core CLI cutover complete (`compiler:simulate`)
- dual-root startup active (`--url` nodes root, `--rules-only` rules root)
- signature simulation workflow available in both roots
- panel-first UI is now the default runtime (`--ui panel`), with shell fallback (`--ui shell`)
- convergence cleanup complete (shared draft editor core, shared signature workflow core, and mode-adapter dispatch in `app.ts`)

Panel keys (default `--ui panel`):

- `up/down` or `k/j`: move selection
- `pgup/pgdn`: move by page
- `home/end`: jump to first/last item
- `/`: enter filter mode (type query, `backspace`, `enter` apply)
- `tab`: switch focused pane
- `enter`: open selected node/rule detail
- `r`: refresh list
- `i` / `v` / `m` / `d`: inspect / validate / simulate / simulate dry-run
- `n`: toggle neighbors section in node detail
- `z`: toggle values section in node detail
- `1` / `2` / `3` / `4` / `5` / `6`: toggle value subsections (`controls` / `sensors` / `events` / `config` / `diagnostic` / `other`)
- `p`: scaffold preview
- `W`: scaffold write (press twice within confirmation window)
- `A`: manifest add (press twice within confirmation window)
- `c`: cancel active inspect/validate/simulate operation
- `s` / `l` / `h` / `q`: status / log / help / quit

Shell commands (`--ui shell`):

- `list`
- `refresh`
- `show <id>` (`nodeId` in nodes root, `rule index` in rules root)
- `signature [<manufacturerId:productType:productId>] [--from-node <id>] [--from-rule <index>]`
- `inspect [--manifest <file>]`
- `validate [--manifest <file>]`
- `simulate [--manifest <file>] [--dry-run] [--skip-inspect] [--inspect-format <fmt>]`
- `scaffold preview [--product-name "..."] [--homey-class <class>]`
- `scaffold write [filePath] --force`
- `manifest add [filePath] [--manifest <file>] --force`
- `status`
- `log [--limit N]`
- `help`
- `quit`

### Compiler inspection (device facts -> compiled profile)

- `npm run compiler:inspect -- --help`
- `npm run compiler:inspect -- --device-file <device.json> --rules-file <rules.json> --format summary`
- `npm run compiler:inspect -- --device-file <device.json> --manifest-file <manifest.json> --format markdown --explain-all`

### Live compiler inspection (ZWJS -> compile on the fly)

- `npm run compiler:inspect-live -- --help`
- `npm run compiler:inspect-live -- --url ws://HOST:PORT --all-nodes --manifest-file <manifest.json> --format list`
- `npm run compiler:inspect-live -- --url ws://HOST:PORT --all-nodes --manifest-file <manifest.json> --signature 29:66:2 --format list`

Compiled-artifact apply mode is now also supported for runtime-style validation:

- `npm run compiler:inspect-live -- --url ws://HOST:PORT --all-nodes --compiled-file /tmp/compiled-profiles.json --format list`
  - live inspection/build tools skip controller-like nodes by default; use `--include-controller-nodes` to include them for diagnostics

### Compiler build/export (compiled profiles artifact)

- `npm run compiler:build -- --help`
- `npm run compiler:build -- --device-file <device.json> --manifest-file <manifest.json> --output-file /tmp/compiled-profiles.json --format summary`
- `npm run compiler:build -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --output-file /tmp/compiled-live.json --format summary`

This emits a `compiled-homey-profiles/v1` artifact.

### Homey vocabulary artifact build

- `npm run compiler:homey-vocabulary -- --help`
- `npm run compiler:homey-vocabulary -- --output-file rules/homey-authoring-vocabulary.json`
- `npm run compiler:homey-vocabulary -- --homey-lib-root <path/to/homey-lib> --compose-capabilities-dir co.lazylabs.zwavejs2homey/.homeycompose/capabilities`
- legacy alias: `npm run compiler:vocabulary -- ...`

This emits a `homey-authoring-vocabulary/v1` artifact consumed by TUI authoring and compiler vocabulary-aware validation paths.

Rule vocabulary enforcement is built into compiler workflows:

- `compiler:build`
- `compiler:inspect`
- `compiler:inspect-live` (manifest/rules mode)
- `compiler:validate-live` / `compiler:baseline` / `compiler:simulate` (through build/inspect stages)

These commands load `rules/homey-authoring-vocabulary.json` by default and fail fast on unknown
`homeyClass` / `capabilityId` in rules. Use `--vocabulary-file <path>` to point at a different
artifact.

### Live validation workflow (build + apply + markdown summary)

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
- `npm run compiler:baseline -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json`
- `npm run compiler:baseline -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --redact-share`
- `npm run compiler:simulate -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --signature 29:66:2`
- `npm run compiler:simulate -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --signature 29:66:2 --dry-run --format markdown`

This runs the canonical live validation workflow in one command:

- builds a compiled artifact from live nodes
- reapplies that artifact against live nodes (runtime-style)
- writes a markdown validation summary with outcomes/review reasons/top unmatched/suppressed signatures
- optionally enforces quality gates and exits non-zero (CI-friendly) via `--max-*` and `--fail-on-reason`
- gate/output settings can be loaded from `--gate-profile-file` (CLI flags override profile values)
- `--print-effective-gates` prints the merged gate/output config (after CLI/profile/default precedence) before execution
- `--compiled-file` reuses an existing compiled artifact and skips the build phase
- `--input-summary-json-file` re-evaluates gates from an existing summary JSON (offline gate tuning; no ZWJS connection)
- `--signature <manufacturerId:productType:productId>` scopes live inspect/validate runs to a single product signature for tight curation iteration
- regression deltas are supported with `--baseline-summary-json-file`, `--max-*-delta`, and `--fail-on-reason-delta <reason>:<delta>`
- when baseline is configured, markdown reports include baseline/delta tables for quick human triage
- `--save-baseline-summary-json-file` writes the current machine summary in baseline-friendly form so refreshing baseline snapshots is one command
- `--artifact-retention delete-on-pass` removes large generated compiled artifacts after successful validation runs
- `--redact-share` writes PR-safe artifacts (`*.redacted.md`, `*.redacted.json`) with URL/path/node identity redaction
- redacted output paths can also be set explicitly via `--redacted-report-file` and `--redacted-summary-json-file`
- unsupported/removed CLI flags fail fast with explicit errors in compiler tools
- `compiler:baseline` orchestrates baseline capture + immediate recheck in one command and writes timestamped artifacts under `plan/baselines/` by default
- `compiler:baseline --redact-share` emits redacted baseline/recheck markdown+summary artifacts in the same run (with optional stage-specific redacted path overrides)
- `compiler:simulate` runs one signature end-to-end from explicit `--signature`, with `--dry-run` to preview resolved inspect/validate command lines without network calls

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
- `rules/project/product/` (product-specific overrides authored as `product-rules/v1` single-target bundles)

`rules/` is now the primary runtime-validation rules source. `packages/compiler/test/fixtures/` remains for isolated unit/integration test scenarios.

Compile-time boundary:

- `rules/manifest.json` defines which rule files are compile-time inputs and their layer context
- rules not in the compiler manifest are treated as runtime/Homey-adapter scope
- canonical compiler workflows should use `--manifest-file` (or default manifest) rather than ad-hoc `--rules-file` lists
- in manifest-scoped compile-time files, layer comes from manifest context (per-rule `layer` is not part of authoring surface)

Authoring ergonomics:

- matcher fields accept compact scalar syntax and are normalized to canonical arrays at load-time
- example: `"commandClass": 37` is equivalent to `"commandClass": [37]`
- same for `property`, `propertyKey`, `endpoint`, and product/device matcher fields
- action fields support deterministic shorthand expansion at load-time:
  - `inboundMapping` value-id object -> `{ kind: "value", selector: ... }`
  - `outboundMapping` value-id object -> `{ kind: "set_value", target: ... }`
  - `inboundMapping` `{ eventType: "..." }` -> `{ kind: "event", selector: ... }`
  - `outboundMapping` `{ command: "..." }` -> `{ kind: "zwjs_command", target: ... }`
  - `device-identity.driverId` alias -> `driverTemplateId`
- canonical mapping payloads are strict:
  - unknown nested fields in `selector`/`target`/watchers are rejected at load-time

## Documentation Sync Contract

To keep repo memory consistent, each behavior-changing slice updates these files together:

- `README.md`: high-level architecture/workflow/CLI contract
- `plan/current-sprint.md`: latest completed slices + live validation outcomes
- `plan/roadmap.md`: phase-level completion state
- `docs/architecture.md`: ownership boundaries + system structure
- `docs/rules-grammar.md`: rule DSL grammar and vocabulary
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

## License

Licensed under the Apache License, Version 2.0. See `LICENSE`.

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
  - curation storage/application semantics
  - v1 persistence backend: `this.homey.settings` with versioned curation payloads
  - v1 curation model direction: materialized per-device-instance overrides with concrete persisted `curation.v1` schema (entries keyed by `homeyDeviceId`)
  - v1 execution direction: lower overrides into in-memory runtime rules and execute through shared rules-engine semantics
  - v1 precedence direction: per-device (`homeyDeviceId`) curation overrides stay authoritative; new baseline recommendations are surfaced for explicit user adoption
  - v1 recommendation detection: per-device baseline markers compare canonical baseline profile hashes (with `pipelineFingerprint` metadata) to decide when to prompt
  - v1 baseline hash contract: explicit canonical projection + canonicalization rules + `projectionVersion` marker field
  - runtime execution of compiled inbound/outbound mappings

## Where to look next

- `docs/architecture.md`
- `plan/homey-translation-compiler-plan.md`
- `plan/roadmap.md`
- `plan/current-sprint.md`

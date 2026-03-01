# ZWJS Explorer + Curation TUI Implementation Plan (Reset)

## Scope and Guardrails

- Phase: 4 (must complete before Homey adapter implementation resumes)
- Goal: deliver a panel-first dual-root TUI over existing compiler/ZWJS workflows
- Non-goals:
  - no ZWJS mutation behavior
  - no compiler semantic redesign in this phase
- Safety:
  - network interactions are read-only
  - local writes only under allowed rule paths
  - local writes require explicit confirmation

## Execution Order (Locked)

1. **Core CLI contract cutover**
   - rename `compiler:loop` -> `compiler:simulate` (hard rename)
2. **Core tests/docs migration**
3. **TUI structural pivot**
   - startup routing: `--url` (nodes root) or `--rules-only` (rules root)
4. **Simulate integration**
   - add rich simulation result view in both roots
5. **Structured scaffold edit mode**
   - panel-first draft editing before write/manifest operations
6. **Convergence review**
   - evaluate separate stacks vs shared view primitives

### Section 6B/6C Completion Order (Locked Before Section 7)

- [x] list ergonomics:
  - filtering/search
  - paging + selection persistence
- [x] richer detail panes:
  - node/rule/simulation drill-down readability
  - sectioned value detail rendering (`controls`/`sensors`/`events`/`config`/`diagnostic`/`other`)
  - per-subsection value toggles via numeric keys (`1`-`6`)
- [x] safer curation write UX:
  - explicit in-panel confirmation flow before writes
- [x] diagnostics UX:
  - clear long-run progress states
  - timeout/cancel behavior for live operations
- [x] panel test expansion for Section 6B behavior
- [x] panel renderer cutover:
  - runtime rendering uses `neo-blessed` widgets/layout only
  - removed custom string-frame renderer path (`panel-layout`)
  - panel tests consume render snapshots from `runPanelApp` (renderer-agnostic assertions)
- [ ] structured scaffold edit mode (Section 6C):
  - [x] edit mode entry/exit scaffolding in panel (`e` / `esc`) with draft editor placeholder rendering
  - [x] presenter draft-editor API foundation (`start/get/set/validate/reset/commit/clear`)
  - [x] typed draft editing (no freeform JSON editor in v1)
  - [x] editable draft metadata (`productName`, `homeyClass`, `ruleIdPrefix`, output `filePath`)
  - [x] capability row operations (add/remove/clone/reorder)
  - [x] capability field editing (`capabilityId`, `directionality`)
  - [ ] typed mapping editors for inbound/outbound selector/target fields
  - [ ] live draft validation with write-blocking errors and non-blocking warnings
  - [ ] in-panel diff preview before write confirmation

Section 7 does not start until all 6B and 6C slices above are complete.

## Startup and Root Flows

- `--url ws://HOST:PORT` -> nodes-root stack
- `--rules-only [--manifest-file <path>]` -> rules-root stack
- default manifest in rules-only mode: `rules/manifest.json`

### Nodes Root

- nodes list -> node detail -> signature context -> inspect/validate/scaffold/edit/simulate

### Rules Root

- manifest-driven rule list -> rule detail/create/edit -> signature context -> simulate

## Architecture Direction

Start with separate mode stacks, then evaluate convergence:

1. nodes stack: mode-specific views + presenters
2. rules stack: mode-specific views + presenters
3. shared services/core adapters where practical
4. no coordinator layer
5. run convergence review after both simulate flows and scaffold edit mode are complete

Data flow in both stacks:

- intent -> presenter -> services -> tooling/core -> presenter -> view model -> view
- panel rendering implementation: `neo-blessed` (widget tree + terminal layout)

## State Model (High Level)

- `mode` (`nodes` | `rules`)
- `sessionConfig`
- `connectionState` (for nodes mode)
- `selectedNodeId`
- `selectedRuleFile`
- `selectedSignature`
- `scaffoldDraft`
- `validationSummary`
- `simulationSummary`
- `runLog`

## Implementation Sections

- [x] Section 1: scope + guardrails lock (docs/plans)
- [x] Section 2: startup + dual-root IA lock (docs/plans)
- [x] Section 3: curation flow lock with simulation center (docs/plans)
- [x] Section 4B: tests/docs migration for cutover
- [x] Section 6A: dual-root shell workflow parity (simulate integration in both stacks)
- [x] Section 6B: panel-first rich TUI UI integration in both stacks
- [ ] Section 6C: panel scaffold edit mode (typed draft editing + diff/validation)
- [ ] Section 7: convergence review + final cleanup

## Testing Strategy

Per section:

- parser/command contract tests for CLI cutover
- presenter/service tests for nodes and rules stacks
- app-level flow tests for:
  - nodes-root curation with simulation
  - rules-root curation with simulation
  - scaffold edit mode (draft mutation, validation, write confirmation)

Quality gate:

- `npm run check` must remain green
- docs/plan sync in same slice as behavior changes

## Done Criteria

- contributor can complete rule curation from either root using simulation + scaffold edit workflow
- ZWJS operations remain read-only
- Homey adapter work remains paused until this reset plan is complete

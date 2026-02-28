# ZWJS Explorer + Curation TUI Implementation Plan (Reset)

## Scope and Guardrails

- Phase: 4 (must complete before Homey adapter implementation resumes)
- Goal: deliver a panel-first dual-root TUI over existing compiler/ZWJS workflows
- Non-goals:
  - no ZWJS mutation behavior
  - no backlog feature set
  - no compiler semantic redesign in this phase
- Safety:
  - network interactions are read-only
  - local writes only under allowed rule paths
  - local writes require explicit confirmation

## Execution Order (Locked)

1. **Core CLI contract cutover**
   - rename `compiler:loop` -> `compiler:simulate` (hard rename)
   - remove backlog command family and backlog-driven workflow flags
2. **Core tests/docs migration**
   - replace loop/backlog docs/tests with simulate-centric guidance
3. **TUI structural pivot**
   - startup routing: `--url` (nodes root) or `--rules-only` (rules root)
   - remove backlog UI/actions
4. **Simulate integration**
   - add rich simulation result view in both roots
5. **Convergence review**
   - evaluate separate stacks vs shared view primitives

## Startup and Root Flows

- `--url ws://HOST:PORT` -> nodes-root stack
- `--rules-only [--manifest-file <path>]` -> rules-root stack
- default manifest in rules-only mode: `rules/manifest.json`

### Nodes Root

- nodes list -> node detail -> signature context -> inspect/validate/scaffold/simulate

### Rules Root

- manifest-driven rule list -> rule detail/create -> signature context -> simulate

## Architecture Direction

Start with separate mode stacks, then evaluate convergence:

1. nodes stack: mode-specific views + presenters
2. rules stack: mode-specific views + presenters
3. shared services/core adapters where practical
4. no coordinator layer
5. run convergence review after both simulate flows are complete

Data flow in both stacks:

- intent -> presenter -> services -> tooling/core -> presenter -> view model -> view

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
- [ ] Section 4A: core CLI cutover (rename complete; backlog command + simulate backlog mode removed; validate/baseline backlog flags pending)
- [ ] Section 4B: tests/docs migration for cutover
- [ ] Section 5: dual-stack TUI structure without backlog
- [ ] Section 6: rich simulation integration in both stacks
- [ ] Section 7: convergence review + final cleanup

## Testing Strategy

Per section:

- parser/command contract tests for CLI cutover
- presenter/service tests for nodes and rules stacks
- app-level flow tests for:
  - nodes-root curation with simulation
  - rules-root curation with simulation
- regression tests for removed commands (`compiler:loop`, backlog commands) with clear failure messaging

Quality gate:

- `npm run check` must remain green
- docs/plan sync in same slice as behavior changes

## Done Criteria

- contributor can complete rule curation from either root using simulation loop
- no backlog references in contributor-facing TUI/CLI docs/help
- ZWJS operations remain read-only
- Homey adapter work remains paused until this reset plan is complete

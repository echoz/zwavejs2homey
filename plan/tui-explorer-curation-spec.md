# ZWJS Explorer + Curation TUI Spec (Reset MVP)

## Summary

Build a rich terminal UI that supports two contributor-first entry points:

- live-node curation from a ZWJS instance
- rules-first curation from the manifest

The TUI is panel-first, while CLI remains equally supported.

## Goals

- make single-signature curation fast and obvious
- keep ZWJS access read-only from this workflow
- keep local rule/manifest authoring guarded and explicit
- use one simulation-oriented diagnostic loop for both entry points

## Non-Goals (Reset MVP)

- no ZWJS mutation commands
- no compiler semantic redesign
- no Homey runtime curation UI

## Startup Contract

- `npm run compiler:tui -- --url ws://HOST:PORT ...` -> **Nodes Root**
- `npm run compiler:tui -- --rules-only [--manifest-file <path>] ...` -> **Rules Root**
- `--rules-only` defaults manifest to `rules/manifest.json`
- no connect screen in this MVP shape

## User Workflows

### A) Curate from live nodes (Nodes Root)

1. open node list
2. inspect node detail and derive/select signature
3. run inspect/validate for signature context
4. scaffold/edit product rules
5. run simulation diagnostics
6. iterate until outcome is acceptable

### B) Curate from rule files (Rules Root)

1. open manifest-driven rules list
2. inspect rule detail or create new rule
3. select/bind target signature
4. run simulation diagnostics
5. adjust rules and iterate

## Information Architecture

1. `Nodes Root` (list)
2. `Node Detail`
3. `Rules Root` (manifest list)
4. `Rule Detail / Create`
5. `Simulation Result`
6. `Run Log`

## Backend Integration

Use existing tooling/libs as backend primitives:

- `zwjs:inspect` (node discovery/detail)
- `compiler:inspect-live` (signature-focused inspect)
- `compiler:validate-live` (signature-focused validate)
- `compiler:simulate` (single-signature inspect+validate orchestration; replaces `compiler:loop`)

## What This Replaces

- ad-hoc inspect/validate command choreography for contributors
- legacy `compiler:loop` naming (already replaced by `compiler:simulate`)

## Safety Model

- ZWJS transport remains read-only
- local writes allowed only for repo rule paths
- scaffold/manifest writes require explicit confirmation
- workflow errors are non-fatal and should keep the session alive

## Delivery Order (Locked)

2. tests/docs migration for that cutover
3. simulate integration in both root workflows
4. convergence review for optional view/presenter de-duplication

## Success Criteria

- contributor can complete curation iteration from either root without leaving the TUI:
  - pick target signature
  - scaffold/update rules
  - run simulation and review diagnostics
- no ZWJS mutation capabilities introduced

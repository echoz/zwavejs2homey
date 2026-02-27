# ZWJS Explorer + Curation TUI Implementation Plan

## Scope and Guardrails

- Phase: 4 (must complete before Homey adapter implementation work starts)
- Goal: implement a contributor-focused TUI that orchestrates existing compiler/ZWJS workflows
- Non-goals:
  - no compiler behavior changes
  - no ZWJS mutation commands in MVP
  - no Homey adapter runtime curation UI
- Safety:
  - default read-only network behavior
  - file writes only under allowed rule paths with explicit confirmation

## Screen Flow

1. `Connect`
2. `Node List`
3. `Node Detail`
4. `Signature Workspace`
5. `Scaffold Preview`
6. `Validation Result`
7. `Backlog` (optional)
8. `Run Log` (visible across flows)

Primary flow:

- `Connect -> Node List -> Node Detail -> Signature Workspace -> Validation Result`

Optional branches:

- `Signature Workspace -> Scaffold Preview`
- `Backlog -> Signature Workspace`

## Architecture

Use a strict data-driven layering model:

1. View (`packages/tui/src/view/*`)
   - pure render/input
   - no business logic
2. Presenter (`packages/tui/src/presenter/*`)
   - handles intents, state transitions, loading/error behavior
   - maps use-case results to view models
3. Application Service (`packages/tui/src/service/*`)
   - typed orchestration wrapper over existing tooling/libs
   - normalized return/error contracts
4. Core (existing `tools/*-lib.mjs`, compiler/core APIs)
   - domain/protocol/compiler work only

Data flow:

- `Intent -> Presenter -> Application Service -> Core -> Presenter -> ViewModel -> View`

## State Model

Single in-memory state with these top-level sections:

- `sessionConfig`
- `connectionState`
- `nodes`
- `nodeDetailCache`
- `signatureContext`
- `workspace`
- `validation`
- `backlog`
- `runLog`

## Implementation Slices

1. Slice 1: app shell + connect + node list/detail (read-only)
2. Slice 2: signature workspace + compiled inspect view
3. Slice 3: scaffold preview + guarded write flow
4. Slice 4: targeted validate action + result panels
5. Slice 5: optional backlog panel + next-target picker
6. Slice 6: manifest helper + run-log polish

## Package and Module Layout

- `packages/tui/src/app.ts`
- `packages/tui/src/model/*`
- `packages/tui/src/view/*`
- `packages/tui/src/presenter/*`
- `packages/tui/src/service/*`
- `tools/homey-compile-tui.mjs` (thin launcher)

## Testing Strategy

Per slice:

- presenter transition tests
- service adapter tests with mocked core/tool calls
- at least one app-level happy-path smoke test

Quality gate:

- `npm run check` green before merge/commit
- docs/plan sync updated in same slice

## Commit Strategy

- one commit per slice with descriptive message
- include tests and doc sync in each slice commit

## Done Criteria

- contributor can connect, inspect nodes, select signature, scaffold rule, and run targeted validation from one UI flow
- backlog-assisted target picking works (optional panel)
- no ZWJS mutation capabilities introduced
- existing non-TUI CLI workflows remain unchanged

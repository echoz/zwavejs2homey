# ZWJS Explorer + Curation TUI Spec (MVP)

## Summary

Build one terminal UI that unifies:

- ZWJS instance exploration (nodes/values/signatures)
- Rule curation workflow (scaffold -> edit -> validate loop)

The TUI is the primary UX. Existing CLI commands remain backend primitives.

## Goals

- Make contribution workflow discoverable without memorizing CLI flags
- Make single-device curation the default path
- Keep backlog as optional prioritization view (not required)
- Preserve existing deterministic compiler contracts

## Non-Goals (MVP)

- No replacement of compiler/core logic
- No destructive ZWJS operations by default
- No Homey runtime curation UI yet
- No graphical app; terminal-only

## User Workflows

### A) Explore a ZWJS instance

1. Connect to `ws://HOST:PORT`
2. List nodes with key metadata
3. Select node -> inspect values and identity
4. Show derived product signature and command classes

### B) Curate one product

1. Pick a node/signature
2. Open compiled profile summary + review reasons
3. Scaffold `product-rules/v1` bundle
4. Edit rule file
5. Run targeted validate loop for that signature
6. Repeat until curated outcome is acceptable

### C) Optional prioritization

1. Generate/Load backlog artifact
2. View ranked signatures
3. Pick next target from list

## Information Architecture (Screens)

1. `Connect`
2. `Node List`
3. `Node Detail`
4. `Signature Workspace`
5. `Rule Scaffold Preview`
6. `Validation Result`
7. `Backlog` (optional tab/panel)
8. `Run Log`

## Backend Integration

Use existing tools/libs as backend, wrapped by the TUI flow:

- `zwjs:inspect` (node discovery/detail)
- `compiler:inspect-live` (compiled outcome inspection)
- `compiler:validate-live` (validation + reasons)
- `compiler:backlog` (optional queueing/scaffold helper)
- `compiler:loop` (targeted iteration)

Prefer direct library calls where available; fallback to command invocation only when needed.

## What This Replaces

The TUI replaces manual command choreography for day-to-day contribution.

Primary replacement:

- `compiler:backlog summary|next|scaffold` + `compiler:loop` as a manual sequence
- ad-hoc command copy/paste from README

Still retained (advanced/automation):

- raw CLI commands for CI, scripting, and power users
- validation gates and baseline/delta workflows

## Replacement Mapping

- `Explore nodes`:
  - Before: `zwjs:inspect nodes list/show`
  - TUI: `Node List` + `Node Detail`
- `Pick next curation target`:
  - Before: `compiler:backlog next`
  - TUI: `Backlog` selection (optional)
- `Scaffold product bundle`:
  - Before: `compiler:backlog scaffold`
  - TUI: `Scaffold` action
- `Iterate on one signature`:
  - Before: `compiler:loop --signature ...`
  - TUI: `Validate` action in `Signature Workspace`

## Safety Model

- Default read-only network behavior
- File writes only under repo rule paths (`rules/`, `plan/` artifacts as configured)
- Explicit confirmation before writing scaffold files or manifest updates

## MVP Slices

1. `Slice 1`: App shell + connect + node list/detail (read-only)
2. `Slice 2`: Signature workspace + compiled profile inspect view
3. `Slice 3`: Scaffold preview + write product bundle file
4. `Slice 4`: Targeted validate action + result panels
5. `Slice 5`: Optional backlog panel + next-target picker
6. `Slice 6`: Manifest update helper + run log polish

## Success Criteria

- New contributor can curate one product without reading full CLI docs
- Single-signature iteration completes in one screen flow
- Existing `npm run check` remains green after TUI-assisted edits

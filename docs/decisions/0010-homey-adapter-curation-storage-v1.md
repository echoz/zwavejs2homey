# ADR 0010: Homey Adapter Curation Storage Uses `this.homey.settings` in v1

- Status: Accepted
- Date: 2026-02-27

## Context

The Homey adapter needs persistent runtime curation state for user corrections to compiled profiles.

Storage options considered for v1:

- Homey settings store (`this.homey.settings`)
- Homey Pro `/userdata` files
- external service/store

v1 priority is a small operational surface with clear migration paths.

## Decision

For v1, the adapter stores runtime curation only in Homey settings:

- use `this.homey.settings` as the single persistent backend
- store adapter-owned curation deltas (not compiled artifacts)
- version payloads from day one (for example `curation.v1` + schema version)
- keep an adapter storage interface (`loadCuration`, `saveCuration`) so backend can change later without changing apply logic

Out of scope for v1:

- `/userdata`-based persistence
- external curation persistence services

## Consequences

Positive:

- lowest complexity path for adapter MVP
- no extra runtime dependencies
- deterministic, local persistence behavior
- straightforward schema migration ownership in adapter

Tradeoffs:

- constrained by Homey settings operational characteristics (payload size/shape considerations)
- no built-in external sharing/sync in v1
- future backend move requires a migration step (planned via versioned schema + storage interface)

# ADR 0011: Homey Adapter Uses Materialized Override Curation Model in v1

- Status: Accepted
- Date: 2026-02-27

## Context

The adapter needs a runtime curation model for applying user corrections to compiled profiles.

Two candidate approaches:

- operation-log patches (ordered `add`/`remove`/`replace` operations)
- materialized per-target overrides (final desired values by target)

Detailed schema and UI coupling are still phase-4 concerns and should be decided while implementing the Homey adapter.

## Decision

Lock only the v1 model direction now:

- adapter runtime curation is represented as materialized override state per device target
- adapter applies overrides onto compiled profiles deterministically at runtime
- exact stored JSON field shape is deferred to Homey adapter implementation phase

Target key selection and precedence/update behavior are defined separately in `docs/decisions/0013-homey-device-instance-curation-precedence-v1.md`.

Not selected for v1 baseline:

- operation-log patch model as the primary persistence shape

## Consequences

Positive:

- simpler mental model and diagnostics
- easier deterministic replay (no operation ordering edge cases)
- better fit for Homey app UI editing semantics

Tradeoffs:

- less low-level change-history fidelity in the persisted shape
- exact schema contract remains open until adapter implementation starts

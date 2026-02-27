# ADR 0002: Runtime Curation Is Adapter-Owned

- Status: Accepted
- Date: 2026-02-27

## Context

The compiler and Homey adapter both touch profile behavior, and runtime curation logic (user overrides/patches) can easily leak into compiler scope if boundaries are not explicit.

## Decision

Keep runtime curation out of the compiler package.

- Compiler responsibility:
  - compile static Homey profile artifacts from rules/catalog inputs
  - emit deterministic outputs with provenance/diagnostics
- Homey adapter responsibility:
  - own runtime curation semantics, storage, and patch apply behavior
  - decide how user curation is applied during runtime execution

## Consequences

Positive:

- Cleaner separation of concerns and lower coupling
- Compiler remains testable/offline and environment-agnostic
- Adapter can evolve runtime behavior without compiler churn

Tradeoffs:

- Some mapping logic may exist in both compile-time and runtime layers
- Adapter needs its own strong tests for runtime patch behavior

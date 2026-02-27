# ADR 0008: Manifest Layer Is the Single Source of Truth

- Status: Accepted
- Date: 2026-02-27

## Context

If compile-time layer can be defined in both manifest and per-rule fields, we create dual-truth ambiguity and drift risk.

## Decision

For manifest-scoped compile-time files:

- `layer` inside rule entries is forbidden
- manifest entry `layer` is the only compile-time layer source of truth

Canonical internal model may still carry explicit layer after deterministic expansion.

## Consequences

Positive:

- No layer drift between file contents and manifest metadata
- Cleaner authoring surface in compile-time files
- Simpler validation model

Tradeoffs:

- Manifest maintenance is mandatory for compile-time files
- Existing rules that include per-rule layer need migration/normalization

# ADR 0003: Defer Curation-Seed Artifact in V1

- Status: Accepted
- Date: 2026-02-27

## Context

We considered generating a separate curation-seed artifact/workflow to bootstrap rule authoring from live systems.

## Decision

Do not introduce a curation-seed artifact in v1.

Use schema-first authoring with existing stable identifiers and diagnostics:

- stable product signature (`manufacturerId:productType:productId`)
- compiler inspect/validate diagnostics

## Consequences

Positive:

- Fewer artifacts and less workflow complexity
- Lower maintenance overhead for contributors
- Keeps authoring centered on stable, portable identifiers

Tradeoffs:

- Authoring may be slightly less guided for first-time contributors
- We may revisit seed generation if real authoring friction appears

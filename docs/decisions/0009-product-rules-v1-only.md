# ADR 0009: Product Rules Migrate Fully to `product-rules/v1`

- Status: Accepted
- Date: 2026-02-27

## Context

We considered keeping legacy raw-array product rule files for compatibility while introducing single-target product bundles.

## Decision

Migrate fully to bundle-based product authoring:

- compile-time `project-product` rules use `product-rules/v1` bundle format
- legacy raw-array product files are not kept as a long-term supported authoring format

`product-rules/v1` bundle constraints:

- one bundle/file targets one product triple
- bundle-level target is inherited by contained rules
- no per-rule target override
- layer is manifest-owned (no per-rule layer in file)

## Consequences

Positive:

- one consistent product authoring model
- better discoverability and lower drift risk
- simpler validation and tooling expectations

Tradeoffs:

- requires migration of existing product rule files
- short-term migration effort before feature work

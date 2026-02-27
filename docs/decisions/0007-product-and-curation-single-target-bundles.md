# ADR 0007: Product and Curation Rules Use Single-Target Bundles (v1)

- Status: Accepted
- Date: 2026-02-27

## Context

Per-rule repeated device targeting is verbose and can drift, causing accidental mixed-target files.

We want stronger discoverability and safer authoring for both:

- compiler product rules
- adapter curation rules

## Decision

Use single-target bundle shape in v1.

1. Compiler product rules:

- one bundle/file targets one product triple
- top-level target context is inherited by contained rules
- no per-rule target override in the same bundle

2. Adapter curation rules:

- one bundle/file targets one device identity context:
  - product triple (known devices), or
  - `diagnosticDeviceKey` (unknown devices)
- no per-rule target override in the same bundle

## Consequences

Positive:

- Strong ownership/discoverability (`one file = one target`)
- Lower risk of mixed-target mistakes
- Cleaner authoring with less repeated matcher noise

Tradeoffs:

- Less flexible for multi-target authoring in one file
- May require creating additional files for adjacent variants

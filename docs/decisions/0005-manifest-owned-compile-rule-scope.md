# ADR 0005: Manifest-Owned Compile Rule Scope

- Status: Accepted
- Date: 2026-02-27

## Context

Rule authoring is growing, and we need a clear boundary between:

- compiler-time rule inputs
- runtime/Homey-adapter curation or policy inputs

We also want simpler authoring without introducing hidden implicit defaults.

## Decision

1. Compiler compile-time rule scope is manifest-owned.

- `rules/manifest.json` is the source of truth for compile-time rule locations.
- Layer ownership for compile-time rule files is defined by manifest context.
- Canonical compiler workflows are manifest-first (`--manifest-file` or default manifest).

2. Rules not listed in the compiler manifest are runtime/Homey-adapter scope.

- Compiler does not apply non-manifest rules.
- Homey adapter may apply its own runtime curation/policy rules separately.

3. Do not add broad file-level defaults.

- Keep context explicit and structured via manifest layer + product-target bundles.
- Preserve deterministic expansion to canonical rule models.

## Consequences

Positive:

- Clear compile/runtime boundary
- Better discoverability for compile-time rule sources
- Simpler authoring model without introducing opaque default cascades

Tradeoffs:

- Manifest maintenance becomes part of rule authoring workflow
- Runtime rules require separate adapter-owned documentation/tooling

# Architecture Decisions (ADR)

Decision records for major technical boundaries and policy choices.

## Index

- `0001-project-structure.md`: Monorepo with shared core + Homey app wrapper
- `0002-compiler-adapter-boundary.md`: Runtime curation is adapter-owned
- `0003-defer-curation-seed-artifact.md`: No curation-seed artifact in v1
- `0004-generic-fallback-ownership.md`: Generic fallback inference is adapter-owned (compiler stays static-first)
- `0005-manifest-owned-compile-rule-scope.md`: Compiler layers/scope are manifest-owned; non-manifest rules are runtime-adapter scope
- `0006-homey-adapter-runtime-rule-order.md`: Adapter runtime order is generic inference first, curation second (curation wins)
- `0007-product-and-curation-single-target-bundles.md`: Product and curation rules use one-target-per-bundle in v1
- `0008-manifest-layer-is-single-source-of-truth.md`: Compile-time rule files must not declare per-rule layer; manifest owns layer
- `0009-product-rules-v1-only.md`: Product rules migrate fully to `product-rules/v1` bundle authoring

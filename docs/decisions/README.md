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
- `0010-homey-adapter-curation-storage-v1.md`: Adapter runtime curation persistence uses Homey settings (`this.homey.settings`) in v1
- `0011-homey-curation-model-v1-materialized-overrides.md`: Adapter runtime curation model direction is materialized overrides (with concrete persisted schema later locked in ADR 0016)
- `0012-homey-curation-execution-via-runtime-rule-lowering.md`: Adapter executes curation by lowering persisted overrides into runtime rules and reusing rules-engine ordering semantics
- `0013-homey-device-instance-curation-precedence-v1.md`: Adapter curation is instance-scoped (`homeyDeviceId`) override over compiler baseline; updated recommendations are user-adopted, not auto-applied
- `0014-homey-baseline-recommendation-detection-v1.md`: Adapter detects "new recommended baseline" with stored per-device baseline markers (`pipelineFingerprint` + canonical baseline profile hash)
- `0015-homey-baseline-hash-canonical-projection-v1.md`: Defines exact v1 canonical projection, canonicalization rules, and marker versioning contract for `baselineProfileHash`
- `0016-homey-curation-v1-storage-schema.md`: Locks concrete persisted `curation.v1` schema (entry map by `homeyDeviceId`, baseline marker embedding, override/collection validation rules)
- `0017-homey-mvp-driver-topology-and-pairing-model.md`: Locks Homey MVP runtime shape to `bridge` + `node` drivers and explicit node import pairing semantics (no automatic cross-driver pairing handoff)

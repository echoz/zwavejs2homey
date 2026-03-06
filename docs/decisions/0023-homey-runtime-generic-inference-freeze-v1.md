# ADR 0023: Homey Runtime Generic Inference Freeze (v1)

- Status: Accepted
- Date: 2026-03-06
- Supersedes: `0006-homey-adapter-runtime-rule-order.md`

## Context

The adapter currently behaves as:

1. resolve compiled profile (or deterministic no-match fallback),
2. apply device-instance curation (`curation.v1`),
3. execute runtime mappings derived from the effective profile.

`0006` modeled an additional runtime generic-inference layer before curation, but this is not the current implementation and introduces ambiguity about ownership and diagnostics.

## Decision

For v1 and current Phase 6 scope:

- adapter runtime generic inference is frozen (disabled);
- runtime behavior remains compiled-profile-first plus curation-only;
- no new runtime generic-inference rule path is introduced in adapter code.

Compiler-side `project-generic` remains compile-time only and is still part of artifact generation.

## Consequences

Positive:

- runtime behavior matches shipped implementation and operator diagnostics
- clearer ownership boundary: compiler generates baseline; adapter applies instance curation
- lower risk of implicit capability/class mutation drift at runtime

Tradeoffs:

- unmatched devices remain limited until curated or compiler coverage improves
- future runtime generic inference work requires an explicit new ADR and rollout plan

## Follow-up Guardrails

- keep fallback policy deterministic (`other` + no mappings on no-match)
- keep runtime diagnostics explicit about compiled-only inference policy
- keep harness coverage that no-match paths do not wire listeners or mappings

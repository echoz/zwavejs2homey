# ADR 0012: Homey Curation Executes via Override-to-Rule Lowering

- Status: Accepted
- Date: 2026-02-27

## Context

We want both:

- simple adapter-owned persisted curation data (materialized overrides)
- reuse of the existing rules engine execution semantics

Without a lowering contract, runtime behavior could drift between storage handling and rule-engine behavior.

## Decision

In v1:

- persisted curation remains materialized override state
- adapter lowers overrides into an in-memory runtime curation rule bundle
- adapter executes rules using the rules engine with deterministic runtime order:
  - generic runtime rules first
  - lowered curation rules second (curation wins)
- lowered rules are derived execution artifacts and are not persisted as the source of truth

Lowering and execution requirements:

- deterministic lowering for the same input curation document
- stable rule IDs derived from target + override path
- invalid override fields are skipped with diagnostics

Target selection for curation entries is defined in `docs/decisions/0013-homey-device-instance-curation-precedence-v1.md`.

## Consequences

Positive:

- one execution model for generic inference and curation
- simple persistence model for Homey UI/editing
- clear boundary between authoring shape and execution shape

Tradeoffs:

- requires maintaining a lowering mapper
- runtime diagnostics must cover both override validation and lowering outcomes

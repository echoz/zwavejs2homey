# ADR 0014: Baseline Recommendation Detection Uses Stored Baseline Markers in v1

- Status: Accepted
- Date: 2026-02-27

## Context

With instance-scoped curation precedence (ADR 0013), the adapter must decide when to show:

- "a newer recommended baseline is available"

We need a deterministic signal that avoids false positives from volatile metadata (for example artifact timestamps).

## Decision

For each curated Homey device instance, store a baseline marker snapshot at the time curation is created/adopted:

- `pipelineFingerprint` from compiler artifact source metadata when available
- `baselineProfileHash`: `sha256` of a canonical baseline profile projection

Canonical baseline profile projection (v1 direction):

- include effective profile semantics used by runtime mapping:
  - classification identity fields
  - capabilities + inbound/outbound mappings + flags
  - subscriptions
  - ignored values
- exclude volatile/non-semantic fields:
  - generated timestamps
  - diagnostics/report-only metadata

The concrete canonical projection/canonicalization contract is defined in `docs/decisions/0015-homey-baseline-hash-canonical-projection-v1.md`.

Recommendation detection on refresh:

1. Recompute marker for current recommended baseline.
2. Compare with stored marker for `homeyDeviceId`.
3. If `baselineProfileHash` differs -> recommendation available.
4. If hash matches -> no recommendation prompt, even if `pipelineFingerprint` changed.

Fallback behavior:

- missing marker (legacy/migrated entry): backfill marker from current baseline and do not raise recommendation on that first backfill pass

Review note:

- this policy is expected to be revisited once adapter implementation validates Homey SDK/runtime constraints in practice

## Consequences

Positive:

- deterministic recommendation signal per device instance
- resilient to non-semantic artifact churn
- keeps user prompts focused on meaningful mapping changes

Tradeoffs:

- adapter must maintain canonical projection + hash logic
- marker migration/backfill path required for old entries

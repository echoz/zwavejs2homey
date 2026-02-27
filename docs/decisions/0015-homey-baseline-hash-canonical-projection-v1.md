# ADR 0015: Baseline Hash Canonical Projection Contract (v1)

- Status: Accepted
- Date: 2026-02-27

## Context

ADR 0014 locks recommendation detection to `baselineProfileHash`, but v1 still needs an explicit canonical projection contract so hashing is deterministic and auditable.

## Decision

For v1, `baselineProfileHash` is computed as `sha256` (lowercase hex) over UTF-8 canonical JSON for this projection:

Included fields (semantic runtime mapping surface):

- `classification.homeyClass`
- `classification.driverTemplateId`
- `capabilities[]`:
  - `capabilityId`
  - `inboundMapping`
  - `outboundMapping`
  - `flags`
- `subscriptions[]`
- `ignoredValues[]`

Excluded fields (non-semantic or volatile):

- generated timestamps and artifact build metadata
- diagnostics/report-only data
- provenance/provenance-history metadata
- confidence/uncurated labels

Canonicalization rules:

- sort `capabilities` by `capabilityId`
- sort all object keys lexicographically
- remove `undefined` fields
- preserve explicit `null` values
- normalize value-id shapes according to one fixed v1 policy (for example endpoint defaulting behavior), and use that policy consistently

Marker payload requirements per `homeyDeviceId`:

- `projectionVersion` (starts at `1`)
- `pipelineFingerprint` (optional metadata)
- `baselineProfileHash`
- `updatedAt`

Comparison rules:

- recommendation prompt triggers only when `baselineProfileHash` changes
- `pipelineFingerprint` changes alone never trigger recommendation prompt

Migration/backfill rules:

- missing marker -> backfill marker and skip prompt on first backfill pass
- projection version change -> recompute/backfill marker under new version and skip prompt on that migration pass

## Consequences

Positive:

- deterministic hash behavior across runs/environments
- recommendation prompts tied to meaningful runtime mapping changes
- explicit versioned contract for future projection evolution

Tradeoffs:

- adapter must maintain canonicalization helper and tests
- projection-version migrations must be handled explicitly

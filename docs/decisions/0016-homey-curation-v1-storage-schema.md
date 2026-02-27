# ADR 0016: Homey `curation.v1` Stored Schema Contract

- Status: Accepted
- Date: 2026-02-27

## Context

Previous decisions lock:

- storage backend (`this.homey.settings`)
- model direction (materialized overrides)
- runtime execution (override-to-rule lowering)
- precedence/recommendation behavior

v1 still needs one concrete persisted schema contract.

## Decision

Persist curation at Homey settings key `curation.v1` with this top-level contract:

- `schemaVersion`: `"homey-curation/v1"`
- `updatedAt`: ISO timestamp
- `entries`: object map keyed by `homeyDeviceId`

Entry contract (`entries[homeyDeviceId]`):

- `targetDevice`:
  - `homeyDeviceId` (required; must equal map key)
  - `catalogId?` (metadata/context)
  - `diagnosticDeviceKey?` (metadata/context)
- `baselineMarker`:
  - `projectionVersion` (required)
  - `pipelineFingerprint?`
  - `baselineProfileHash` (required)
  - `updatedAt` (required)
- `overrides`:
  - `deviceIdentity?`:
    - `homeyClass?`
    - `driverTemplateId?`
  - `capabilities?` (map keyed by capability id):
    - `inboundMapping?`
    - `outboundMapping?`
    - `flags?`
  - `collections?`:
    - `capabilitiesAdd[]`
    - `capabilitiesRemove[]`
    - `subscriptionsAdd[]`
    - `subscriptionsRemove[]`
    - `ignoredValuesAdd[]`
    - `ignoredValuesRemove[]`
- `note?`
- `updatedAt` (required)

Validation/normalization requirements:

- strict schema: unknown fields are rejected
- one entry per device instance by construction (`entries` map key)
- `targetDevice.homeyDeviceId` must match entry key
- collection arrays are deduped deterministically
- same value must not appear in both add/remove arrays within one collection pair

Apply/runtime semantics:

- runtime order remains baseline -> generic -> lowered curation rules
- `catalogId` and `diagnosticDeviceKey` are metadata only and must not override instance targeting

## Consequences

Positive:

- concrete adapter persistence contract for implementation/tests
- deterministic, conflict-resistant instance-scoped curation storage
- clear boundaries between target key, metadata, and runtime semantics

Tradeoffs:

- strict schema may require explicit migration for future additive fields
- adapter must maintain dedupe/overlap validation for collection arrays

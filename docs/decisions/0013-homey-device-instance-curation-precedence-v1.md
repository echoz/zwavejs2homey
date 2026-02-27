# ADR 0013: Homey Curation Is Device-Instance Overrides Over Compiler Baseline

- Status: Accepted
- Date: 2026-02-27

## Context

For Homey adapter behavior, we need to define how compiler-produced profiles and user curation interact over time.

Requirements:

- first pairing should use compiler baseline/recommended profile
- user can curate a specific Homey device
- local user intent should remain authoritative for that device
- when compiler rules improve, users should be informed and allowed to switch

## Decision

For v1:

- compiler output is the upstream baseline profile
- curation is stored per Homey device instance (primary key: `homeyDeviceId`)
- effective runtime profile is `baseline + instance override`
- when a newer/revised baseline is available for the same device identity:
  - keep instance override active by default
  - surface a recommendation/update prompt in the Homey UX
  - allow adopting the recommended baseline (full replace in v1)

Review note:

- this decision is expected to be revisited once Homey adapter implementation and SDK constraints are validated in practice

Not in v1:

- automatic replacement of user-curated instance overrides when baseline changes
- complex selective merge UX between local and recommended profiles

## Consequences

Positive:

- matches user expectation that device-level edits stay stable
- enables safe compiler/rule improvements without breaking local setups
- keeps ownership boundary clear: compiler recommends, adapter/user decides

Tradeoffs:

- adapter must track baseline revision availability per curated device
- requires UX for “recommended profile available”
- needs migration/compare logic as baseline artifacts evolve

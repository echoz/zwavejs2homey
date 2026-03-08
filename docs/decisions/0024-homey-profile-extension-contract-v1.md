# ADR 0024: Homey Profile Extension Contract v1

- Date: 2026-03-07
- Status: Accepted

## Context

System Homey capabilities are the primary runtime contract, but some curated profiles
need advanced behavior that does not fit cleanly into standard capability mapping.
Examples include lock user-code management and other profile-specific admin flows.

Without a shared extension contract, this logic would fragment into ad-hoc,
device-specific runtime code paths.

## Decision

Introduce a runtime-owned profile extension contract (`homey-profile-extension-contract/v1`)
and registry in the Homey app layer with these rules:

- extension matching is explicit and deterministic via profile predicates:
  - `profileId`
  - `driverTemplateId`
  - `homeyClass`
- contract validation is strict (ids, predicates, read sections, action schema,
  safety checks)
- registry exposes explainable match outcomes (`matched`, `missing-*`, `*-mismatch`)
  to support diagnostics and UX
- extension behavior is additive only; it does not replace or weaken base system
  capability semantics
- compiler remains unchanged for extension execution; extension logic stays adapter-owned

## Consequences

- advanced device behavior can be added as reusable verticals without introducing
  ad-hoc runtime policy
- runtime API and UI can discover extension capability deterministically
- first concrete extension vertical target remains Yale lock user-code management
- additional families (covers, thermostat schedules, siren/security modes) can
  follow the same registry/contract model

# ADR 0020: Homey Compiled Profile Source and Refresh Policy (v1)

- Status: Accepted
- Date: 2026-03-01

## Context

Node runtime mapping requires a compiled profile artifact source and a deterministic refresh strategy.

If source/refresh are undefined, runtime behavior can drift between devices or sessions.

## Decision

In v1:

- Homey adapter loads compiled profile artifact from a local app-managed source (packaged/static file path or equivalent local setting reference)
- artifact is loaded and validated at app startup and cached in memory
- node runtime resolution uses the shared compiler resolver API against that in-memory artifact

Refresh policy in v1:

- no automatic remote fetch/build in Homey runtime
- artifact refresh is explicit (app restart or explicit maintenance action)
- no background hot-reload loop in v1

Failure policy:

- invalid or missing artifact is treated as a degraded mode condition and surfaced in diagnostics
- node imports/runtime mapping requiring compiled profiles fail safe with explicit operator-visible errors

## Consequences

Positive:

- deterministic runtime profile behavior
- smaller operational surface for MVP
- easier reproducibility/support

Tradeoffs:

- profile updates are not instant; they require explicit refresh action
- future dynamic profile delivery will require an additional policy/migration decision

## Implementation Status (2026-03-01)

- app runtime now resolves compiled artifact path from settings key `compiled_profiles_file` with default fallback to bundled local artifact (`assets/compiled/compiled-homey-profiles.v1.json`)
- artifact is loaded/validated at startup into shared in-memory resolver index state
- runtime settings updates on `compiled_profiles_file` trigger explicit artifact reload
- load failure is surfaced as degraded runtime status and consumed by node-device fallback behavior

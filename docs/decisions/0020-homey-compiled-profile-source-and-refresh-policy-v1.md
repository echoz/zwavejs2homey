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

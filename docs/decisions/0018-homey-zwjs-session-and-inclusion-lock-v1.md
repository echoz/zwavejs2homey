# ADR 0018: Homey ZWJS Session Ownership and Inclusion Lock (v1)

- Status: Accepted
- Date: 2026-03-01

## Context

With the locked two-driver MVP topology (`bridge` + `node`), both drivers need access to ZWJS operations and state.

Without explicit ownership:

- duplicate client sessions can be created
- inclusion/exclusion calls can race
- UI flows can diverge on operation status

## Decision

In v1:

- use one shared app-level ZWJS session service (owned by `Homey.App`)
- drivers/devices consume that shared service, they do not create their own transport sessions
- inclusion/exclusion operations are guarded by a single adapter-level operation lock
- only one provisioning operation can be active at a time

Lock behavior:

- second attempt while lock is held returns deterministic "operation-in-progress" error
- lock is released on success, failure, cancel, or timeout
- lock state is observable for UI/status surfaces

## Consequences

Positive:

- deterministic control-plane behavior across both drivers
- avoids duplicate sockets/reconnect storms
- simpler debugging and status reporting

Tradeoffs:

- app-level session service is a hard dependency for both drivers
- lock handling and timeout/release paths need explicit testing

# Current Sprint

## Goal

Build a protocol-first `zwjs` WebSocket client foundation (no Homey-specific API in core), validated against a real Z-Wave JS UI instance in read-only mode.

## In Progress

- `zwjs` client foundation (transport/lifecycle/reconnect/normalizer scaffolding)

## Next Tasks

1. Lock protocol handshake to `zwave-js-server` docs (`version`, `initialize`, `start_listening`)
2. Implement generic `sendCommand` path (`messageId` + `command`)
3. Tighten real frame parsing (`result` / `event` / error frames)
4. Add fixture tests from `docs/external/zwave-js-server` docs and live read-only captures
5. Keep Homey app integration minimal (connect + log protocol events only)

## Risks / Unknowns

- Exact read-only command set to use for safe validation on production instance
- Schema/version differences across `zwave-js-server` versions
- Homey runtime packaging behavior with workspace dependencies

## Notes

Update this file as the active execution plan; move durable conclusions into `docs/` or `docs/decisions/`.

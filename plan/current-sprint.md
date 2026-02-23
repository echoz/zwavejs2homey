# Current Sprint

## Goal

Move from scaffolded structure to a real end-to-end vertical slice (Homey app lifecycle -> core bridge -> one mocked device flow).

## In Progress

- Workspace/core/Homey integration scaffolding

## Next Tasks

1. Normalize root workspace install flow (`npm install` at repo root)
2. Define core event model (`BridgeEvent`, `DeviceSnapshot`, `CommandRequest`)
3. Implement mocked bridge event stream in `packages/core`
4. Consume mocked events in Homey app and log mapped output
5. Decide first real device/capability target for MVP

## Risks / Unknowns

- Homey runtime packaging behavior with workspace dependencies
- Node version compatibility for Homey tooling vs local `mise` version
- Z-Wave JS transport choice and deployment topology

## Notes

Update this file as the active execution plan; move durable conclusions into `docs/` or `docs/decisions/`.

# Architecture

## Purpose

Bridge Z-Wave JS data and behavior into a Homey app with a clear separation between core bridge logic and Homey-specific integration.

## Repository Layout

- `packages/core/`: Shared bridge/domain logic (no Homey SDK dependencies)
- `co.lazylabs.zwavejs2homey/`: Homey app wrapper, manifest, drivers, capabilities, Homey lifecycle
- `docs/`: Durable project documentation
- `plan/`: Working plans and execution notes

## Boundaries

### Core (`packages/core`)

Owns:
- Z-Wave JS connection/session lifecycle
- Node/device state models
- Event translation into app-agnostic domain events
- Command APIs for device actions

Does not own:
- Homey SDK classes
- Homey capability mappings
- Homey pairing UI
- Homey app manifest/runtime config

### Homey App (`co.lazylabs.zwavejs2homey`)

Owns:
- App lifecycle (`onInit`, `onUninit`)
- Driver/device registration
- Pairing flows
- Capability mapping and updates
- Homey settings and user-facing diagnostics

## Integration Contract (Draft)

The Homey app imports a small surface from `@zwavejs2homey/core`.

Current placeholder:
- `createBridgeService()`
- `BridgeService.start()` / `stop()` / `getStatus()`

Future likely additions:
- Event emitter / subscriptions
- Device discovery snapshots
- Command execution API
- Health/status metrics

## Runtime Flow (Target)

1. Homey app starts
2. Homey app creates core bridge service
3. Core connects to Z-Wave JS endpoint
4. Core emits device/network events
5. Homey layer maps events to capabilities/devices
6. Homey commands are translated back into core commands

## Open Questions

- Will Z-Wave JS run in-process, as a child process, or remote TCP/WebSocket endpoint?
- What is the canonical device identity mapping between Z-Wave JS and Homey devices?
- How should capability support be declared (static tables vs dynamic feature detection)?

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

- Z-Wave JS Server protocol client (`zwjs` client)
- Z-Wave JS connection/session lifecycle
- Protocol request/response/event handling
- Version/schema adaptation and normalization
- Thin protocol-oriented command wrappers

Does not own:

- Homey SDK classes
- Homey capability mappings
- Homey pairing UI
- Homey app manifest/runtime config
- Homey-specific abstractions in the protocol client API

### Homey App (`co.lazylabs.zwavejs2homey`)

Owns:

- App lifecycle (`onInit`, `onUninit`)
- Driver/device registration
- Pairing flows
- Capability mapping and updates
- Homey settings and user-facing diagnostics

## Integration Contract (Draft)

The Homey app will import a protocol-first `zwjs` client surface from `@zwavejs2homey/core`.

Current direction:

- `createZwjsClient()`
- typed lifecycle/status/events
- protocol commands (`messageId` + `command`) and thin wrappers

Future likely additions:

- Higher-level bridge layer (still in core or separate package)
- Homey integration adapter (outside protocol client)
- Device discovery/mapping abstractions
- Command translation layer

## Capability Tracking

- `docs/zwjs-capability-matrix.md`: 3-way comparison of `zwave-js-server`, `zwave-js-ui`, and our `ZwjsClient`
- `docs/zwjs-nonprod-live-validation-checklist.md`: repeatable non-production validation procedure for zniffer and firmware workflows
- `plan/zwjs-parity-roadmap.md`: execution roadmap for closing prioritized parity gaps

## Homey Compiler (In Progress)

Current implemented foundation in `packages/compiler`:

- Homey-targeted rules compiler (layered rule semantics, matching, slot-level build state, compiled profile output)
- HA `zwave_js` discovery import pipeline:
  - source extractor subset from `discovery.py`
  - extracted artifact contract
  - translation to generated `ha-derived` rules
  - tooling (`ha-import:extract`, `ha-import:report`)
- Catalog tooling and artifacts:
  - `catalog-devices/v1` artifact contract
  - `catalog` CLI (`fetch`, `normalize`, `merge`, `diff`, `validate`, `summary`)
  - conflict precedence and strict conflict mode
  - catalog indexing by `catalogId` and product triple
- Compiler diagnostics enriched with catalog context:
  - `catalogLookup` in file-based compile results
  - `profile.catalogMatch` annotation
  - catalog-aware curation hints and stable diagnostic device keys

Reference plan:

- `plan/homey-translation-compiler-plan.md`

## Runtime Flow (Target)

1. Homey app starts
2. Homey app creates `zwjs` protocol client
3. Core protocol client connects to Z-Wave JS endpoint
4. Core protocol client emits protocol/canonical events
5. Homey layer maps events to capabilities/devices
6. Homey layer translates Homey actions into protocol commands

## Open Questions

- Will Z-Wave JS run in-process, as a child process, or remote TCP/WebSocket endpoint?
- What is the canonical device identity mapping between Z-Wave JS and Homey devices?
- How should capability support be declared (static tables vs dynamic feature detection)?

# ADR 0017: Homey MVP Driver Topology and Pairing Model

- Status: Accepted
- Date: 2026-03-01

## Context

The adapter is bridging an existing Z-Wave network managed by Z-Wave JS (`zwave-js-server` / Z-Wave JS UI). Homey is not the Z-Wave inclusion authority in this architecture.

We need a concrete v1 policy for:

- Homey driver topology (single driver vs split responsibilities)
- inclusion-trigger UX
- device onboarding flow from ZWJS into Homey
- expectations around automatic device creation after inclusion

## Decision

Use a two-driver Homey topology in v1:

1. `bridge` driver
   - one singleton-like device representing the ZWJS endpoint/control plane
   - owns connection visibility and operational actions such as inclusion controls
2. `node` driver
   - many device instances, one per imported Z-Wave node/data plane
   - owns compiled-profile resolution and runtime capability mapping execution

Pairing/onboarding model:

- Node onboarding is an import/link flow from ZWJS into Homey.
- Recommended primary UX: start inclusion and complete node add within the `node` pairing flow.
- If inclusion is initiated from `bridge`, the app does not auto-open `node` pairing or auto-create Homey node devices.
- User explicitly completes import through `node` pairing (or equivalent explicit add action).
- No cross-driver automatic pairing handoff is assumed in v1.

Bridge singleton policy:

- enforce singleton behavior via stable `device.data` identity + driver pairing filter
- if bridge already exists, do not offer another bridge device in pair list

## Consequences

Positive:

- clear control-plane/data-plane separation in Homey runtime
- predictable onboarding path for node devices
- no hidden auto-provision side effects after inclusion
- aligns with compiler/runtime split (resolver/mappings are node-device concerns)

Tradeoffs:

- bridge-initiated inclusion requires an explicit follow-up import step in v1
- app needs clear user messaging for "inclusion completed, now import node"

## Follow-up Implementation Notes

- Keep one shared app-level ZWJS session service used by both drivers.
- Node devices should consume the shared compiler artifact resolver API for profile selection.
- Device-level curation UI should live in node repair flow (`onRepair`) or equivalent explicit per-device editor flow.

# ADR 0017: Homey MVP Driver Topology and Pairing Model

- Status: Accepted (Amended)
- Date: 2026-03-01
- Amended: 2026-03-07

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
   - one device per ZWJS endpoint/control-plane instance
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
- MVP pairing keeps Homey system templates for selection/add (`list_devices`, `add_devices`) and uses focused custom views only where needed:
  - bridge flow: `bridge_config` (per-bridge connection setup, inline success/error feedback, then close)
  - node flow: `import_summary` (post-add import status/diagnostics)
- Deep custom pairing layouts beyond template steps remain out of scope for v1.

Bridge instance policy:

- allow multiple bridge devices (multi-instance)
- each bridge device stores its own endpoint settings (`zwjs_url`, optional bearer auth)
- runtime creates one bridge session per `bridgeId`
- bridge pairing proposes the next deterministic bridge id (`main`, then `bridge-2`, `bridge-3`, ...)

## Consequences

Positive:

- clear control-plane/data-plane separation in Homey runtime
- supports multiple ZWJS backends without app-level global reconfiguration
- predictable onboarding path for node devices
- no hidden auto-provision side effects after inclusion
- aligns with compiler/runtime split (resolver/mappings are node-device concerns)

Tradeoffs:

- bridge-initiated inclusion still requires an explicit follow-up import step in v1
- system template constraints still limit custom layout during device selection/add steps
- onboarding clarity relies on post-add custom guidance/summary views
- node import flow currently selects the best available bridge runtime automatically; explicit bridge selection UI is deferred

## Follow-up Implementation Notes

- Keep one shared app-level ZWJS session service with per-bridge sessions used by both drivers.
- Node devices should consume the shared compiler artifact resolver API for profile selection.
- Device-level curation UI should live in node Device Tools flow hosted via `onRepair` (or equivalent explicit per-device editor flow).

## Implementation Status (2026-03-07)

- `bridge` and `node` driver scaffolds are implemented in `co.lazylabs.zwavejs2homey/drivers`.
- `bridge` pairing now supports multi-instance candidates (`main`, `bridge-N`) instead of singleton gating.
- bridge device settings now configure per-bridge ZWJS connection details (`zwjs_url`, optional bearer auth).
- app runtime now exposes per-bridge session lifecycle APIs:
  - `configureBridgeConnection({ bridgeId, settings })`
  - `removeBridgeConnection({ bridgeId })`
  - `listBridgeSessions()`
- `node` pairing imports from live ZWJS node list, filters controller node (`nodeId = 1`), and dedupes by `bridgeId + nodeId`.
- `bridge` pairing flow now ends on `bridge_config` with inline save feedback and auto-close on success (no intermediate `next_steps` page).
- `node` pairing flow now includes post-add custom summary view (`import_summary`) with live import status.

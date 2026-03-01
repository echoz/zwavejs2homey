# ADR 0019: Homey Node Identity and Dedupe Contract (v1)

- Status: Accepted
- Date: 2026-03-01

## Context

Node devices are imported from ZWJS into Homey. We need a stable identity key for:

- dedupe during pairing/import
- curation lookup by Homey device instance
- reliable runtime routing to a ZWJS node

Product-triple and compiler resolver matching are useful for profile selection, but they are not a unique node identity.

## Decision

In v1, Homey node device identity is:

- `bridgeId + nodeId`

Required `device.data` fields for node devices:

- `kind: "zwjs-node"`
- `bridgeId: string`
- `nodeId: number`

Dedupe policy:

- pairing/import rejects creating a second Homey device with the same `bridgeId + nodeId`
- re-import of an existing node returns the existing device rather than creating a duplicate

Metadata policy:

- product triple (`manufacturerId`, `productType`, `productId`) is stored as metadata/context, not as the primary identity key
- compiler resolver precedence (`product-triple -> node-id -> device-key`) remains profile selection logic, not Homey device identity logic

## Consequences

Positive:

- deterministic dedupe and routing behavior
- identity remains stable even if profile matching behavior evolves
- clear separation between runtime identity and profile recommendation identity

Tradeoffs:

- node ID renumber/replacement scenarios may require explicit migration/re-pair flows in v1

# Current Sprint

## Goal

Build the parity planning baseline for `ZwjsClient`: a 3-way capability matrix (`zwave-js-server` protocol, `zwave-js-ui` backend/UI, and our client) plus a phased implementation roadmap.

## In Progress

- Capability comparison and parity roadmap documentation

## Next Tasks

1. Use `docs/zwjs-capability-matrix.md` to select the first P0 parity slice (`getNodeValue*` live validation + typing tightening)
2. Execute P0.2 read-only validation for `node.get_value`, `node.get_value_metadata`, `node.get_value_timestamp`
3. Implement P0.1 value/metadata typing tightening from observed payloads
4. Implement P0.3 node event typing expansion from observed traffic
5. Keep the matrix and `plan/zwjs-parity-roadmap.md` updated as slices land

## Risks / Unknowns

- Device-specific support for some protocol commands (e.g. notification event support queries)
- Schema/version differences across `zwave-js-server` versions
- Risk of conflating UI Socket.IO events with protocol events when planning parity

## Notes

- Durable comparison and parity tracking now live in:
  - `docs/zwjs-capability-matrix.md`
  - `plan/zwjs-parity-roadmap.md`
- Update this file as the active sprint focus only.

# Current Sprint

## Goal

Advance the Homey translation compiler from Phase 2 (HA import foundation) into Phase 3 catalog integration, with diagnostics-first compiler/catalog tooling that improves rule authoring and curation workflows.

## In Progress

- Phase 3 catalog tooling and compiler-side catalog diagnostics integration

## Recently Completed

1. Completed Phase 2 HA import foundation:
   - `discovery.py` subset extractor in `packages/compiler`
   - extracted and generated HA artifact contracts
   - translation pipeline + tooling (`ha-import:extract`, `ha-import:report`)
   - semantic propagation (`assumed_state`, `allow_multi`, `entity_registry_enabled_default`)
   - pinned-source drift guard with current full coverage on local HA checkout
2. Built Phase 3 catalog tooling baseline:
   - `catalog-devices/v1` artifact contract + loader
   - `catalog` CLI (`fetch`, `normalize`, `merge`, `diff`, `validate`, `summary`)
   - conflict precedence (`warn|error`) and diagnostics formats
   - catalog index lookups (`catalogId`, product triple)
3. Integrated catalog context into compiler diagnostics:
   - `catalogLookup` in file-based compile results
   - `profile.catalogMatch` annotation in compiled profiles
   - catalog-aware curation hints and stable `diagnosticDeviceKey`

## Next Tasks

1. Continue compiler/catalog integration as diagnostics and authoring aids first (no rule precedence changes)
2. Use catalog context to improve rule curation workflows and report ergonomics
3. Decide when to start a second real catalog source adapter (only with a concrete source format/API)
4. Keep `plan/homey-translation-compiler-plan.md` and `docs/architecture.md` aligned with slice progress

## Risks / Unknowns

- Catalog source conflicts will grow as new real sources are added (official catalog, `zwave-js` config exports, observed captures)
- Compiler performance may degrade as HA-derived + project rules + catalog-aware diagnostics scale up
- Risk of overloading compiler behavior with catalog heuristics before precedence policy is explicitly designed

## Notes

- Homey compiler architecture and phase progress:
  - `plan/homey-translation-compiler-plan.md`
- Current system architecture overview:
  - `docs/architecture.md`
- Diagnostic CLIs support:
  - `summary`, `markdown`, `json`, `json-pretty`, `json-compact`, `ndjson`

# Current Sprint

## Goal

Close out Phase 3 catalog integration (current scope) and lock the compiler/Homey-adapter boundary before starting adapter-side runtime curation work.

## In Progress

- Compiler/Homey adapter boundary cleanup after deciding runtime curation patch schema is adapter-owned

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
   - explicit file-based `unknownDeviceReport` diagnostics (known/unknown/no-catalog)
4. Closed Phase 3 scope decisions:
   - catalog/diagnostics foundation accepted for now
   - curation-seed generation explicitly deferred as unnecessary abstraction at this stage
   - added `compiler:inspect-live` to inspect compiled profiles directly from a live ZWJS instance
5. Clarified runtime curation ownership:
   - runtime curation patch schema/apply behavior belongs to the Homey adapter
   - compiler remains focused on compiled profiles + provenance/diagnostics

## Next Tasks

1. Finish compiler boundary cleanup (remove compiler-side curation patch prototype)
2. Keep `plan/homey-translation-compiler-plan.md`, `plan/roadmap.md`, and `docs/architecture.md` aligned with the boundary decision
3. Start Homey adapter planning/slices for runtime curation behavior (adapter-owned)
4. Continue compiler Phase 3 expansions only when directly useful (e.g., additional catalog sources)

## Risks / Unknowns

- Catalog source conflicts will grow as new real sources are added (official catalog, `zwave-js` config exports, observed captures)
- Compiler performance may degrade as HA-derived + project rules + catalog-aware diagnostics scale up
- Risk of overloading compiler behavior with catalog heuristics before precedence policy is explicitly designed
- Risk of boundary drift if runtime curation semantics are reintroduced into compiler package

## Notes

- Homey compiler architecture and phase progress:
  - `plan/homey-translation-compiler-plan.md`
- Current system architecture overview:
  - `docs/architecture.md`
- Diagnostic CLIs support:
  - `summary`, `markdown`, `json`, `json-pretty`, `json-compact`, `ndjson`

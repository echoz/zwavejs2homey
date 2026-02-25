# Roadmap

## Phase 1: Foundation (Completed)

- [x] Bootstrap Homey app project
- [x] Create shared core package
- [x] Wire Homey app to core placeholder service
- [x] Establish workspace install/build workflow from repo root
- [x] Add baseline lint/build scripts and local quality gate (`npm run check`)

## Phase 2: Protocol Core (`ZwjsClient`) (Planned Subset Complete)

- [x] Build protocol-first `zwave-js-server` client (no Homey abstractions)
- [x] Connection lifecycle, reconnect, request correlation, typed frames/events
- [x] Read wrapper subset + mutation policy/presets
- [x] Fixture/mocked/integration tests and read-only live validation baseline
- [ ] Non-production live validation for mutation-heavy domains (zniffer/firmware)

## Phase 3: Homey Mapping Compiler (In Progress)

- [x] Phase 1 compiler core: models, rules, matcher, build-state, compile pipeline
- [x] Phase 2 HA import foundation: extractor, translators, tooling, mixed compile tests
- [x] Phase 3 catalog tooling foundation: fetch/normalize/merge/diff/index + diagnostics
- [x] Catalog-aware compiler diagnostics (`catalogLookup`, `catalogMatch`, curation hints, diagnostic keys)
- [x] Catalog-focused compiler authoring diagnostics/ergonomics (inspection, explanation, focused views)
- [x] Defer curation-seed artifact generation (schema-first curation/rule authoring for now)
- [x] Compiler/Homey boundary decision: runtime curation patch schema/apply is adapter-owned (not compiler-owned)
- [x] Compiler build/export command foundation for compiled profiles artifact (`compiler:build`)
- [x] `compiler:build` can compile directly from live ZWJS nodes (not just fixture device facts)
- [x] Real rule pipeline directory skeleton in repo (`rules/ha-derived`, `rules/project/generic`, `rules/project/product`)
- [x] Generate HA-derived ruleset from HA import pipeline for supported discovery coverage
- [x] Initial project-generic ruleset (starter/provisional; may be reduced as adapter-owned inference policy is defined)
- [x] Live ZWJS validation path can apply compiled profiles artifact (not on-the-fly compile)
- [x] Live compiler build/inspect defaults skip controller-like nodes to focus device-profile validation
- [x] Rule-owned same-selector conflict resolution (`conflict.key/mode/priority`) with deterministic overlap suppression diagnostics
- [x] First project-product overrides from live validation (`rules/project/product/live-network-overrides.json`) for identified device triples
- [x] Product-layer capability de-noising action (`remove-capability`) for targeted suppression of noisy inferred capabilities
- [ ] Decide and document final ownership of generic fallback inference policy (currently leaning Homey adapter-owned)
- [ ] Add second real catalog source adapter when a concrete source format is available

## Phase 4: Homey Adapter MVP (Next Major Area)

- [ ] Start only after compiler runtime-validation readiness milestone is met
- [ ] Define first supported Homey device/capability vertical slice using compiled profiles
- [ ] Implement adapter execution of inbound/outbound mappings
- [ ] Device lifecycle/sync (discovery, create/update, mapping diagnostics)
- [ ] User curation patch application in Homey runtime

## Phase 5: Reliability + UX

- [ ] Non-production operational validation runs (zniffer/firmware) with captured fixtures
- [ ] Settings/diagnostics UI for compiler/profile inspection and curation
- [ ] Logging and support bundle workflow
- [ ] Performance tuning for compiler/rule volume and catalog scale

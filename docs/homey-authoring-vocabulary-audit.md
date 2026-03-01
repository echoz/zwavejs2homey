# Homey Authoring Vocabulary Audit

## Scope

This audit covers authoring-time vocab used by:

- TUI scaffold editor typed fields/selects
- TUI presenter draft validation
- Compiler rule validation contracts

Goal:

- identify hardcoded vocab and duplicated definitions
- classify source-of-truth ownership
- define cutover targets for data-driven vocabulary

## Audit Matrix

| Vocabulary                                                           | Current Usage                                                 | Current Source                            | Classification              | Decision                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `homeyClass` values (e.g. `socket`, `light`)                         | TUI metadata select and compiler rule validation              | `homey-authoring-vocabulary/v1` artifact  | `compiler-artifact-derived` | Keep artifact-driven; fail compile workflows on unknown IDs                                                |
| `capabilityId` values                                                | TUI capability select and compiler rule validation            | `homey-authoring-vocabulary/v1` artifact  | `compiler-artifact-derived` | Keep artifact-driven; fail compile workflows on unknown IDs                                                |
| `directionality` (`bidirectional`, `inbound-only`, `outbound-only`)  | TUI select + presenter validation + compiler model type union | hardcoded but aligned with core model     | `intentionally static`      | Keep static in compiler model; TUI should import from shared model/provider instead of redefining literals |
| inbound mapping kind (`value`, `event`)                              | TUI select + presenter validation + compiler validation       | hardcoded but aligned with compiler model | `intentionally static`      | Keep static in model; remove duplicate literals by importing shared constants/types                        |
| outbound mapping kind (`set_value`, `invoke_cc_api`, `zwjs_command`) | TUI select + presenter validation + compiler validation       | hardcoded but aligned with compiler model | `intentionally static`      | Keep static in model; remove duplicate literals by importing shared constants/types                        |

## Findings

1. `homeyClass` and `capabilityId` are the two vocab domains that should be data-driven.
2. SDK typings (`@types/homey`) do not expose enum-grade class/capability vocab for compile-time reuse; they are largely untyped (`string`/`any`) for these fields.
3. mapping kinds and directionality are protocol/model enums, not catalog vocab; these should stay static but centralized.
4. compiler validation supports strict membership checks and compile workflows should run with vocabulary enabled.

## Cutover Target

### Compiler-Managed Artifact

Planned artifact:

- `homey-authoring-vocabulary/v1`
- `homeyClasses[]`
- `capabilityIds[]`
- optional per-entry provenance (`sources[]`)

### Source Inputs (planned)

1. compiler-maintained seed file (curated baseline)
2. project custom capabilities from Homey compose (`co.lazylabs.zwavejs2homey/.homeycompose/capabilities`)
3. optional observed IDs from rules/HA-derived outputs (tagged provenance)

### Consumers

1. TUI scaffold editor options (`homeyClass`, `capabilityId`)
2. TUI/presenter draft validation
3. compiler rule validation (membership checks)

## Immediate Follow-On Work

1. Add shared constants for intentionally static enums (directionality + mapping kinds) to remove duplicated literals.
2. Implement compiler vocabulary artifact build/validate tooling.
3. Wire TUI and compiler validation to one vocabulary provider contract.

## Implemented Cutover (Current)

1. Added compiler artifact contract:
   - `homey-authoring-vocabulary/v1` (`packages/compiler/src/emit/homey-authoring-vocabulary-artifact.ts`)
   - strict assert/create/load helpers + lookup sets
2. Added build CLI:
   - `npm run compiler:homey-vocabulary`
   - source inputs:
     - Homey system lists from `homey-lib` (`assets/device/classes.json`, `assets/capability/capabilities.json`)
     - project custom capabilities from `.homeycompose/capabilities/*.json`
   - default output: `rules/homey-authoring-vocabulary.json`
3. Added compiler rule-validation support for vocabulary membership:
   - rejects unknown `device-identity.homeyClass`
   - rejects unknown `capability` / `remove-capability` IDs
   - available via `RuleValidationOptions.vocabulary`
4. Added TUI vocabulary provider and consumption:
   - loads `--vocabulary-file` (default `rules/homey-authoring-vocabulary.json`)
   - metadata `homeyClass` select is vocabulary-backed
   - capability ID field becomes vocabulary-backed select when capability vocab is available
   - draft validation blocks unknown homey class/capability IDs
5. Added compiler workflow enforcement in tooling:
   - `compiler:build`, `compiler:inspect`, and `compiler:inspect-live` (manifest/rules mode) load vocabulary by default
   - `compiler:validate-live`, `compiler:baseline`, and `compiler:simulate` pass vocabulary through build/inspect stages
   - default vocabulary path: `rules/homey-authoring-vocabulary.json` (override with `--vocabulary-file`)

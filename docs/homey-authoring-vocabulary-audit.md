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

| Vocabulary | Current Usage | Current Source | Classification | Decision |
| --- | --- | --- | --- | --- |
| `homeyClass` values (e.g. `socket`, `light`) | TUI metadata select in `packages/tui/src/app.ts` (`HOMEY_CLASS_OPTIONS`) | hardcoded list | `compiler-artifact-derived` | Move to compiler-produced vocabulary artifact and consume in TUI/provider + compiler validation |
| `capabilityId` values | TUI capability field currently freeform text; compiler validates only non-empty string | none (implicit) | `compiler-artifact-derived` | Introduce artifact-backed capability ID vocabulary; use typed select/search in TUI and compiler membership validation |
| `directionality` (`bidirectional`, `inbound-only`, `outbound-only`) | TUI select + presenter validation + compiler model type union | hardcoded but aligned with core model | `intentionally static` | Keep static in compiler model; TUI should import from shared model/provider instead of redefining literals |
| inbound mapping kind (`value`, `event`) | TUI select + presenter validation + compiler validation | hardcoded but aligned with compiler model | `intentionally static` | Keep static in model; remove duplicate literals by importing shared constants/types |
| outbound mapping kind (`set_value`, `invoke_cc_api`, `zwjs_command`) | TUI select + presenter validation + compiler validation | hardcoded but aligned with compiler model | `intentionally static` | Keep static in model; remove duplicate literals by importing shared constants/types |

## Findings

1. `homeyClass` and `capabilityId` are the two vocab domains that should be data-driven.
2. SDK typings (`@types/homey`) do not expose enum-grade class/capability vocab for compile-time reuse; they are largely untyped (`string`/`any`) for these fields.
3. mapping kinds and directionality are protocol/model enums, not catalog vocab; these should stay static but centralized.
4. current compiler validation does not enforce known `homeyClass` / `capabilityId` membership.

## Cutover Target

### Compiler-Managed Artifact

Planned artifact:

- `homey-vocabulary/v1`
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

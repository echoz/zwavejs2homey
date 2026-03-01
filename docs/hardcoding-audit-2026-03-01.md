# Hardcoding Audit (2026-03-01)

## Scope

Audit goal: verify capability/class mapping behavior is data/policy-driven, not hidden in scattered runtime branches.

Scanned areas:

- `packages/compiler`
- `packages/tui`
- `co.lazylabs.zwavejs2homey`

## Commands Used

```bash
rg -n "capabilityId\\s*===|capabilityId\\s*!==|switch\\s*\\(capabilityId\\)|homeyClass\\s*===|homeyClass\\s*!==|switch\\s*\\(homeyClass\\)|commandClass\\s*===|switch\\s*\\(commandClass\\)|windowcoverings_set|\\bonoff\\b|\\bdim\\b|\\blocked\\b" packages co.lazylabs.zwavejs2homey --glob '!**/test/**' --glob '!**/*.test.*'

rg -n "'onoff'|'dim'|'windowcoverings_set'|'locked'|'measure_|'alarm_|'enum_select'|'number_value'|'socket'|'light'|'sensor'|'lock'|'thermostat'|'button'|'fan'|'curtain'" packages co.lazylabs.zwavejs2homey --glob '!**/test/**' --glob '!**/*.test.*' --glob '!**/fixtures/**' --glob '!**/dist/**'
```

## Findings

### Guardrail Status

Status: **enforced**

- Added `npm run policy:guard` (`tools/hardcoding-policy-guard*.mjs`).
- Guard fails CI/local checks if protected capability/class literals are introduced outside approved policy modules.
- Root `npm run check` now includes this guard.

### 1) Homey runtime mapping/coercion

Status: **cleaned**

- No capability-ID contract whitelist remains in `co.lazylabs.zwavejs2homey/node-runtime.js`.
- Runtime mapping extraction is capability-agnostic.
- Coercion is transform-driven + typed fallback (via defined value metadata).

### 2) HA importer output/conflict mapping

Status: **centralized policy**

- Platform -> output mapping and conflict rules are centralized in:
  - `packages/compiler/src/importers/ha/platform-output-policy.ts`
- Extraction/translation paths consume shared resolvers (no inline mapping switch chains).

### 3) TUI value semantics

Status: **centralized policy**

- Capability inference/scoring/sectioning constants are centralized in:
  - `packages/tui/src/view/value-semantics-policy.ts`
- `value-semantics.ts` now consumes policy constants and contains only orchestration logic.

### 4) TUI vocabulary

Status: **strict (no fallback classes)**

- `packages/tui/src/service/homey-authoring-vocabulary.ts` now fails fast on missing/invalid/empty artifact.
- Error includes remediation command:
  - `npm run compiler:homey-vocabulary`

## Remaining Intentional Static Data

The following are intentional static tables (not accidental hardcoding):

- `packages/compiler/src/importers/ha/platform-output-policy.ts`
- `packages/tui/src/view/value-semantics-policy.ts`
- parser token maps in HA extractor (`extract-discovery-source-subset.ts`) that mirror upstream source tokens.

These are accepted as explicit policy/config surfaces and are expected to evolve with source updates.

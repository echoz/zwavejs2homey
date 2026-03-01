# ZWJS Parity Roadmap

## Goal

Drive `packages/core` `ZwjsClient` from a strong protocol foundation to a production-ready protocol client with explicit parity targets against:

- `zwave-js-server` protocol surface (truth)
- `zwave-js-ui` backend service capabilities (reference)
- our Homey bridge needs (consumer, separate layer)

This roadmap is implementation-focused and derived from `docs/zwjs-capability-matrix.md`.

## Non-Goals

- Recreating `zwave-js-ui` backend `ZwaveClient.ts` feature-for-feature
- Introducing Homey-specific abstractions into `ZwjsClient`
- Replacing generic `sendCommand()` for long-tail commands before there is demand

## Rules (Carry Forward)

- `ZwjsClient` remains protocol-oriented
- New mutating wrappers must go through `sendMutationCommand()`
- Mutations remain policy-gated and disabled by default
- Every completed slice adds tests and passes:
  - `npm run test -w @zwavejs2homey/core`
  - `npm run build -w co.lazylabs.zwavejs2homey`
- Live validation against production instance stays read-only unless explicitly approved

## Phase P0 — Bridge-Critical Parity (Next)

### Objective

Make value/state sync reliable enough for the first Homey device/capability vertical slice.

### Scope

- Improve typing fidelity for node value reads and metadata
- Expand node event typing based on observed protocol traffic
- Validate representative value flows on real nodes (read-only)

### P0 Exit Gate (Required)

Before starting P1 implementation slices, run a dedicated code review over **all changes completed during P0** (not just the most recent slice), with a review focus on:

- protocol correctness vs `zwave-js-server` docs/source
- behavioral regressions in normalizer/event emission ordering
- result typing compatibility/backward-compatibility risk
- mutation-policy leakage (even though P0 is mostly read/event work)
- test coverage gaps and fixture realism

Expected output:

- findings ordered by severity with file references
- explicit statement if no findings
- residual risks / test gaps called out

### Slices (Decision Complete)

#### P0.1 Value ID + Value Payload Typing Tightening

Implement:

- Introduce exported protocol-native-but-structured types for common value payload shapes
- Tighten `ZwjsValueId`/value result typing where safe (preserve protocol-native fallback)
- Add helper guards for common `valueId` payload shapes seen in `node.get_defined_value_ids`

Acceptance:

- `getNodeDefinedValueIds()` remains backward-compatible
- `getNodeValue()` and `getNodeValueMetadata()` result types improve from `protocol-native` to `partial` for common fields
- Fixture tests cover old and new shapes

Tests:

- fixture-backed normalizer/wrapper tests
- mocked transport wrapper tests

Progress (completed subset):

- Exported `ZwjsDefinedValueId` plus value-id guards/extractor helpers
- Added guard tests for array and object-wrapped `node.get_defined_value_ids` result shapes
- Tightened `ZwjsNodeValueMetadataResult` common-field typing to `partial`
- Added `node.get_value` envelope helper for observed result shapes (`{ value: ... }` and `{}`) plus fixture-backed tests
- `ZwjsNodeValueResult` improved to partial envelope typing, while remaining broad for command-class-specific payloads
- Added `hasZwjsNodeValue()` helper to distinguish empty envelopes from envelopes with explicit values in observed server responses
- Added observed command-class sample guards and typed extraction helpers for:
  - CC 37/38 `duration` object values
  - CC 98 lock-handle flags boolean-array values
  - CC 134 firmware versions string-array values
- Expanded runtime metadata typing/guards for observed fields (`minLength`, `maxLength`, `valueSize`, `format`, `allowManualEntry`, `isFromConfig`, `name`, `info`, `ccSpecific`, `valueChangeOptions`)
- Added observed fixtures + regression tests for rich metadata and command-class sample value payloads

#### P0.2 Real-Instance Read Validation for Value Flows (Read-Only)

Implement (validation only, no runtime behavior changes required unless bug found):

- Execute read-only validation of:
  - `node.get_value`
  - `node.get_value_metadata`
  - `node.get_value_timestamp`
    on 2-3 representative nodes/value IDs
- Record exact outcomes/caveats in matrix + foundation plan notes

Acceptance:

- At least one successful live read for each command OR documented reason not possible on available nodes
- Any protocol/typing mismatch captured as a follow-up slice

Tests:

- none required unless a bug is found and fixed

Progress (completed on 2026-02-23):

- Validated `node.get_value`, `node.get_value_metadata`, and `node.get_value_timestamp` against production instance on node `5`
- Successful value IDs included `currentValue`, `duration`, and `targetValue` (CC 37)
- Observed `node.get_value_timestamp` object result shape `{ timestamp: number }` and updated client result type + fixture test accordingly

#### P0.3 Node Event Typing Expansion from Observed Traffic

Implement:

- Capture/inspect additional real node events during `start_listening`
- Add specialized payload types/guards for the highest-frequency events affecting Homey mapping
- Preserve generic source events + `node.event.raw-normalized`

Candidate event targets (choose only observed/high-value first):

- `value added`
- `value removed`
- `wake up`
- `sleep`
- `interview completed` / `interview failed`

Acceptance:

- New specialized event types exported and normalized
- Fixture-backed tests added per new event type
- No regressions to generic event delivery/order

Tests:

- fixture normalizer tests
- existing integration/mocked tests remain green

Progress (completed subset):

- Added specialized node event typing + normalizer coverage for `value added` and `value removed`
- Payload shapes aligned to upstream `zwave-js-server/src/lib/forward.ts` forwarding behavior (`nodeId` + `args`)
- Added specialized progress event typing + fixture coverage for:
  - `controller` NVM backup progress
  - `node` test powerlevel progress
  - `node` check lifeline health progress
  - `node` check route health progress
- Added specialized node event typing + fixture coverage for `value notification`, `wake up`, and `sleep`
- Added specialized node event typing + fixture coverage for interview lifecycle events:
  - `interview started`
  - `interview completed`
  - `interview failed`
  - `interview stage completed`
- Added specialized controller inclusion/security event typing + fixture coverage for:
  - `grant security classes`
  - `validate dsk and enter pin`
  - `inclusion aborted`
- Remaining high-value candidates still pending (additional observed node events beyond the current P0/P1/P2 typed subset)

## Phase P1 — Read-Only Operational Completeness

### Objective

Provide broad typed read coverage for diagnostics and operational introspection.

### Scope

- Driver/controller/node read wrappers
- Log streaming wrapper pair
- Event typing for common controller and node progress/diagnostic events

### Current Status (updated 2026-03-01)

- P1 implementation slices are complete for the planned subset (`P1.1` / `P1.2` / `P1.3`)
- Active `driver.logging` observational validation is now completed:
  - wrapper pair is implemented and live-validated read-only
  - specialized `driver.logging` event typing is implemented and fixture-tested
  - dedicated capture tooling is available via `zwjs:inspect logs capture` (summary report + NDJSON payload export)
  - live capture on 2026-03-01 observed 10 `driver.logging` events with stable baseline payload keys (`formattedMessage`, `message`, `level`, `direction`, `context`, `label`, `timestamp`, `multiline`, `secondaryTagPadding`)
- Remaining P1 work is on-demand expansion only:
  - capture additional `driver.logging` payload variants if new fields appear in real traffic
  - expand lower-priority read wrappers/events only when adapter workflows require them

### Slices (Decision Complete)

#### P1.1 Log Streaming Protocol Wrappers

Implement:

- `startListeningLogs(filter?)`
- `stopListeningLogs()`
- Optional typed log filter payload (partial)

Acceptance:

- Wrappers use exact protocol commands
- Driver `logging` events validated end-to-end (fixture + live if safe)
- No impact on normal `start_listening`

Tests:

- fixture request/result tests
- mocked transport wrapper tests
- normalizer tests for driver logging payload variants

Progress (completed subset):

- Implemented `startListeningLogs(filter?)` and `stopListeningLogs()` typed wrappers
- Added fixture-backed mocked transport tests for no-filter and filtered start commands and stop command
- Driver `logging` event specialized typing/normalizer coverage already exists from earlier slice
- Live wrapper validation completed on 2026-02-23 (`start_listening_logs`/`stop_listening_logs` succeeded)
- Added dedicated live capture workflow (`zwjs:inspect logs capture`) with summary + payload artifact export
- Live driver logging capture completed on 2026-03-01 with active traffic:
  - captured 10 `driver.logging` events over a 120-second window
  - observed stable baseline payload keys and added observed multiline fixture coverage

#### P1.2 Controller/Node Read Wrapper Expansion Set A

Implement typed wrappers for high-value commands (read-only only):

- `node.get_firmware_update_capabilities`
- `node.get_firmware_update_capabilities_cached`
- `node.get_date_and_time`
- `node.is_firmware_update_in_progress`
- `node.get_firmware_update_progress`
- `node.is_health_check_in_progress`
- `node.has_device_config_changed`

Acceptance:

- All wrappers present and exported
- Result typing at least `protocol-native`; `partial` where obviously stable
- Fixture-backed wrapper tests for each

Tests:

- mocked transport wrapper suite (expand existing file or add grouped suite)
- fixtures for each command envelope/result example

Progress (completed subset):

- Added typed read-only wrappers (protocol-native/partial result typing) for all listed P1.2 commands:
  - `node.get_firmware_update_capabilities`
  - `node.get_firmware_update_capabilities_cached`
  - `node.get_date_and_time`
  - `node.is_firmware_update_in_progress`
  - `node.get_firmware_update_progress`
  - `node.is_health_check_in_progress`
  - `node.has_device_config_changed`
- Added fixture-backed mocked transport tests for command envelopes and representative result passthrough for each wrapper
- Read-only live validation completed on 2026-02-23 against node `5` for all wrappers in this set
- Follow-up typing tightening completed for observed nested result wrapper keys with fixture-backed tests:
  - firmware capability reads returned `{ capabilities: ... }`
  - date/time read returned `{ dateAndTime: ... }`
  - firmware/health progress checks returned `{ progress: ... }`
  - device config changed returned `{ changed: ... }`

#### P1.3 Controller/Node Progress Event Typing Set A

Implement specialized controller/node event typing for common progress events:

- `nvm backup progress`
- `test powerlevel progress`
- `check lifeline health progress`
- `check route health progress`

Acceptance:

- Specialized event guards + types exported
- Default normalizer emits specialized + generic events
- Fixture-backed tests for each event type

Tests:

- normalizer fixture tests

Progress (completed subset):

- Added specialized controller/node event typing + fixture-backed normalizer coverage for:
  - `controller` `nvm backup progress`
  - `node` `test powerlevel progress`
  - `node` `check lifeline health progress`
  - `node` `check route health progress`
- Default normalizer emits specialized events alongside generic source events for all four progress event types

## Phase P2 — Safe Mutation Expansion

### Objective

Add typed mutating wrappers while preserving a strict safety posture.

### Scope

- Typed mutating wrappers through `sendMutationCommand()` only
- Policy presets / classification docs
- More mutation guard tests

### Current Status (2026-02-23)

- P2 implementation slices are complete for the planned subset (`P2.1` / `P2.2` / `P2.3`)
- Remaining P2 work is parity expansion only (additional mutation wrappers/flows as needed), not foundation work

### Slices (Decision Complete)

#### P2.1 Mutation Classification and Presets (Docs + Types)

Implement:

- Add documented mutation policy presets (no behavior change required initially), e.g.:
  - `safe-ops` (low-risk diagnostics)
  - `node-maintenance`
  - `controller-maintenance`
  - `destructive` (opt-in only)
- Optionally expose helper builders for `MutationPolicy` presets if useful

Acceptance:

- Every new mutating wrapper assigned a risk class in docs/matrix
- Destructive commands explicitly marked and not included in permissive defaults

Tests:

- unit tests only if helper builders are added

Progress (completed subset):

- Added exported mutation policy preset helpers:
  - `getMutationPolicyPresetAllowlist(...)`
  - `createMutationPolicyPreset(...)`
- Added preset names for:
  - `safe-ops`
  - `node-maintenance`
  - `controller-maintenance`
  - `zniffer-maintenance`
  - `destructive` (empty allowlist by default; explicit opt-in commands required)
- Added unit tests for preset allowlists, cloning behavior, and helper policy construction
- Extended preset coverage with a `zniffer-maintenance` allowlist aligned to P3.2 lifecycle/frequency wrappers

#### P2.2 Low-Risk Mutating Wrappers (First Wave)

Implement typed wrappers for lower-risk commands:

- `node.ping`
- `node.refresh_info`
- `node.refresh_values`
- `node.poll_value`

Acceptance:

- All wrappers route through `sendMutationCommand()`
- Policy-blocked and allowlisted behaviors tested
- Fixture-backed request/result tests added

Tests:

- mutation policy tests
- mocked transport wrapper tests

Progress (completed subset):

- Added typed mutation-gated wrappers + fixture-backed tests for all listed P2.2 commands:
  - `node.ping`
  - `node.refresh_info`
  - `node.refresh_values`
  - `node.poll_value`
- Added default-policy blocking coverage for the P2.2 wrapper set
- Result typing is `partial` for common success fields (`success`, optional `value`)
- Added driver config-update maintenance wrappers with fixture-backed coverage:
  - `checkDriverConfigUpdates()` (`driver.check_for_config_updates`, read)
  - `installDriverConfigUpdate()` (`driver.install_config_update`, mutation-gated)
- Added `updateDriverLogConfig()` (`driver.update_log_config`, mutation-gated) with fixture-backed mutation-policy tests
- Added specialized `driver` event typing + normalizer coverage for `log config updated`

#### P2.3 Inclusion/Exclusion Workflow Foundation (Protocol Layer Only)

Implement typed wrappers + event typing for protocol workflow primitives:

- `controller.begin_inclusion`
- `controller.begin_exclusion`
- `controller.stop_inclusion`
- `controller.stop_exclusion`
- specialized controller events:
  - `grant security classes`
  - `validate dsk and enter pin`
  - `inclusion aborted`

Acceptance:

- Protocol wrappers and event types exist (no Homey UX abstraction yet)
- Mutation guards in place
- Fixture-backed event normalization tests added

Tests:

- mocked transport wrapper tests
- normalizer fixture tests for inclusion/security events

Progress (completed subset):

- Specialized controller inclusion/security event typing + fixture-backed normalizer coverage already implemented for:
  - `grant security classes`
  - `validate dsk and enter pin`
  - `inclusion aborted`
- Added mutation-gated protocol wrappers + fixture-backed mocked transport tests for:
  - `controller.begin_inclusion`
  - `controller.begin_exclusion`
  - `controller.stop_inclusion`
  - `controller.stop_exclusion`
- Added default-policy blocking coverage for the inclusion/exclusion wrapper set
- Tightened inclusion/exclusion wrapper arg/result typing to `partial` (common options + workflow start result fields)
- Added fixture-backed wrapper tests for begin inclusion/exclusion option-arg frame flattening and representative workflow start results

## Phase P3 — Advanced / Long-Tail Domains

### Objective

Cover advanced operational domains once P0/P1/P2 needs are stable.

### Scope

- Endpoint and virtual endpoint typed wrappers
- Zniffer command/event typing
- Firmware and advanced route maintenance workflows

### Current Status (updated 2026-03-01)

- P3 implementation slices are complete for the planned subset (`P3.1` / `P3.2` / `P3.3`)
- Remaining P3 work is operational validation and fixture expansion only.
- Current decision (March 1, 2026): defer these validations for now while focusing Homey adapter slices:
  - non-production live validation for zniffer workflows (`P3.2`)
  - non-production live validation for firmware workflows (`P3.3`)
- Resume with `docs/zwjs-nonprod-live-validation-checklist.md` when a safe non-production setup is available.

### Slices (Decision Complete)

#### P3.1 Endpoint / Virtual Endpoint Typed Read Surface

Implement typed wrappers for a minimal useful subset:

- endpoint support checks (`supports_cc`, `controls_cc`, `is_cc_secure`, `get_cc_version`)
- endpoint/virtual endpoint defined value IDs
- endpoint try-get-node helpers

Acceptance:

- Wrapper names map exactly to protocol commands internally
- Result typing `partial` or `protocol-native` with documented caveats
- Fixtures and mocked tests added

Progress (completed subset):

- Added endpoint read wrappers (`endpoint.*`) for:
  - `supports_cc`
  - `controls_cc`
  - `is_cc_secure`
  - `get_cc_version`
  - `try_get_node`
  - `get_node_unsafe`
- Added fixture-backed mocked transport tests for exact command envelopes and representative boolean/number/object results
- Added first virtual endpoint read wrappers (`broadcast_node.*` / `multicast_group.*`) for:
  - `get_endpoint_count`
  - `supports_cc`
  - `supports_cc_api`
  - `invoke_cc_api` (protocol-native result typing)
  - `get_cc_version`
  - `multicast_group.get_defined_value_ids`
- Added fixture-backed mocked transport tests for exact command envelopes and representative results for this virtual endpoint subset
- Added endpoint `invoke_cc_api` wrapper with protocol-native result typing and fixture-backed mocked transport coverage
- Remaining virtual endpoint scope for this slice: additional commands as needed (no broad `invoke_cc_api` typing beyond protocol-native result passthrough)

#### P3.2 Zniffer Protocol Layer

Implement:

- typed wrappers for zniffer lifecycle and capture retrieval
- specialized `zwjs.event.zniffer.*` payload typing for common frame/state events

Acceptance:

- No Homey-specific zniffer UI abstractions introduced
- Commands/events covered by fixtures and normalizer tests

Progress (completed read/event subset):

- Added typed read-only zniffer wrappers for:
  - `zniffer.captured_frames`
  - `zniffer.get_capture_as_zlf_buffer`
  - `zniffer.supported_frequencies`
  - `zniffer.current_frequency`
- Added fixture-backed mocked transport tests for exact zniffer command envelopes and representative result shapes
- Added specialized zniffer event typing + fixture-backed normalizer coverage for:
  - `ready`
  - `corrupted frame`
  - `frame`
  - `error`
    Progress (completed lifecycle/mutation subset):

- Added mutation-gated zniffer wrappers for:
  - `zniffer.init`
  - `zniffer.start`
  - `zniffer.stop`
  - `zniffer.destroy`
  - `zniffer.clear_captured_frames`
  - `zniffer.set_frequency`
- Added fixture-backed mutation-policy tests for default blocking and allowlisted exact command envelopes

Usage (recommended preset for zniffer workflows):

```ts
import { createZwjsClient, createMutationPolicyPreset } from '@zwavejs2homey/core';

const client = createZwjsClient({
  url: 'ws://127.0.0.1:3000',
  mutationPolicy: createMutationPolicyPreset('zniffer-maintenance'),
});
```

Implementation status:

- P3.2 command/event typing implementation is complete for the planned zniffer subset
- Remaining work is operational validation only:
  - live validation on a non-production zniffer-capable setup
  - capture observed result/event variants for fixture expansion

#### P3.3 Firmware / Maintenance Workflows

Implement protocol-layer wrappers and event typing for selected firmware flows after explicit need is confirmed.

Acceptance:

- Workflows documented with mutation risk and validation steps
- High-risk commands remain policy-gated

Progress (completed first subset):

- Added typed read wrappers for firmware workflow status/discovery checks:
  - `driver.is_otw_firmware_update_in_progress`
  - `controller.get_any_firmware_update_progress`
  - `controller.is_any_ota_firmware_update_in_progress`
  - `controller.get_available_firmware_updates`
  - `controller.is_firmware_update_in_progress`
- Added specialized firmware event typing + normalizer coverage for:
  - `driver` firmware update progress/finished
  - `controller` firmware update progress/finished
  - `node` firmware update progress/finished
- Added fixture-backed wrapper tests and normalizer tests for the above
- Remaining P3.3 scope:
  - safety classification and validation strategy for destructive/high-risk firmware operations

Progress (completed firmware mutation wrapper subset):

- Added mutation-gated firmware workflow wrappers for:
  - `driver.firmware_update_otw`
  - `controller.firmware_update_ota`
  - `controller.firmware_update_otw`
  - `node.begin_firmware_update`
  - `node.update_firmware`
  - `node.abort_firmware_update`
- Added fixture-backed mutation-policy tests for default blocking and allowlisted exact command envelopes/results
- Intentionally no default firmware mutation preset added in this slice (high-risk operations require explicit allowlist selection)
- Added fixture coverage for `driver.firmware_update_otw` schema variants:
  - raw file payload (`filename` + base64 `file`)
  - `updateInfo` payload (newer schema path)
- Added firmware mutation result fixture variant coverage to preserve protocol-native passthrough behavior
- Tightened firmware wrapper validation for common invalid request shapes:
  - reject ambiguous `driver.firmware_update_otw` payload mode (`raw file` + `updateInfo`)
  - reject empty `node.update_firmware` `updates` arrays before send
- Tightened firmware mutation test coverage by command family (driver/controller/node) instead of one shared grouped success assertion
- Aligned firmware wrapper error semantics to policy-first behavior for blocked mutations (policy errors now surface before wrapper payload validation)
- Added advanced controller diagnostics read wrappers (fixture-backed mocked transport coverage):
  - `controller.get_known_lifeline_routes`
  - `controller.get_rf_region`
  - `controller.get_powerlevel`
  - `controller.get_max_long_range_powerlevel`
  - `controller.get_long_range_channel`
- Read-only live validation completed on 2026-02-23 for the above controller diagnostics wrappers:
  - `get_known_lifeline_routes` -> observed `{ routes: {} }`
  - `get_rf_region` -> observed numeric region code (`9`)
  - `get_powerlevel` -> observed `{ powerlevel: 0, measured0dBm: 0 }`
  - `get_max_long_range_powerlevel` -> observed `{ limit: 0 }`
  - `get_long_range_channel` -> observed `{ channel: 255, supportsAutoChannelSelection: true }`

Safety guidance (documented posture for firmware operations):

- Firmware mutation wrappers are treated as high-risk operational commands
- They must remain disabled by default and require explicit allowlisting
- No `firmware-maintenance` preset is provided by default in core
- Recommended approach:
  - start from `createMutationPolicyPreset('destructive')` (empty allowlist)
  - add only the exact firmware commands required for the planned operation
  - validate on non-production hardware first

Usage (explicit high-risk allowlist, example):

```ts
import { createZwjsClient, createMutationPolicyPreset } from '@zwavejs2homey/core';

const client = createZwjsClient({
  url: 'ws://127.0.0.1:3000',
  mutationPolicy: createMutationPolicyPreset('destructive', {
    additionalAllowCommands: ['node.update_firmware', 'node.abort_firmware_update'],
  }),
});
```

## Acceptance Criteria (Roadmap-Level)

This roadmap is considered complete when:

- The command/event matrix in `docs/zwjs-capability-matrix.md` is updated as slices land
- Each new slice is tagged with test and live-validation status
- `ZwjsClient` remains protocol-first and backward-compatible for existing wrappers
- Mutating wrappers never bypass `sendMutationCommand()` and mutation policy checks
- UI/backend (`zwave-js-ui`) and protocol (`zwave-js-server`) layers remain clearly separated in docs and code review decisions
- P0 exit gate code review completed before P1 implementation work begins

## Validation and Monitoring Notes

### Live validation policy

- Default: read-only only on production instance
- Mutations: only on test environment or with explicit approval
- Always record validation date and exact node IDs/command caveats
- Use `docs/zwjs-nonprod-live-validation-checklist.md` for zniffer/firmware operational validation runs

### Regression signals to track

- Frame shape drift (`version`, `result`, `event`) after server upgrades
- Schema version incompatibilities (`schema_incompatible` errors)
- Device-specific protocol failures (expected) vs client transport/protocol failures (bugs)

## Immediate Next Tasks (Recommended Sequence)

1. Treat roadmap phases P0/P1/P2/P3 planned subsets as complete and keep the matrix current as future wrappers/events are added
2. Expand protocol parity only as needed by Homey adapter slices (demand-driven wrappers/events/fixtures)
3. Resume non-production live validation for zniffer/firmware only when a safe non-production setup is available, using `docs/zwjs-nonprod-live-validation-checklist.md`

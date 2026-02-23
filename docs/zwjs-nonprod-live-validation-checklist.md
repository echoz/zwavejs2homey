# ZWJS Non-Production Live Validation Checklist

## Purpose

Use this checklist to validate high-risk or hardware-dependent `ZwjsClient` protocol features
on a non-production Z-Wave JS server instance before production use.

This checklist currently focuses on:

- `P3.2` Zniffer protocol layer
- `P3.3` firmware workflows

## Scope / Safety Boundaries

- Target only a **non-production** Z-Wave JS server instance.
- Use dedicated test hardware where possible.
- Do not run firmware update commands on production controllers/nodes.
- Record exact versions and command outcomes for fixture follow-up.

## Preflight (Required)

- Confirm target endpoint URL and auth mode.
- Confirm `serverVersion`, `driverVersion`, `minSchemaVersion`, `maxSchemaVersion`.
- Confirm device inventory and test node IDs.
- Confirm rollback/recovery plan for firmware tests.
- Confirm test window and operator availability.

## Environment Capture (Record Before Tests)

- Date/time (UTC and local)
- Z-Wave JS server version
- Z-Wave JS driver version
- API schema range
- `ZwjsClient` commit SHA under test
- Node IDs used
- Controller model / firmware version (if firmware tests)
- Zniffer device path + region (if zniffer tests)

## Common Client Setup

- Use explicit mutation policy configuration.
- Start from `createMutationPolicyPreset('destructive')` for firmware flows.
- Use `createMutationPolicyPreset('zniffer-maintenance')` for zniffer flows.
- Subscribe to events and persist raw event samples for fixture follow-up.
- Log command envelopes (without secrets) and result payloads.

## Zniffer Validation (P3.2)

### Pre-checks

- Zniffer hardware connected and accessible to server host
- Correct device path known
- Region/frequency known
- No conflicting process using the zniffer device

### Read path validation

- `zniffer.supported_frequencies`
- `zniffer.current_frequency`
- `zniffer.captured_frames` (before start; may be empty)
- `zniffer.get_capture_as_zlf_buffer` (empty/minimal capture acceptable)

Record:

- result payload shapes (`frequencies`, `frequency`, `capturedFrames`, `capture`)
- any schema/version differences

### Mutation path validation (policy-gated)

- `zniffer.init`
- `zniffer.start`
- `zniffer.set_frequency`
- observe events:
  - `ready`
  - `frame`
  - `corrupted frame` (only if naturally observed)
  - `error` (only if naturally observed)
- `zniffer.stop`
- `zniffer.clear_captured_frames`
- `zniffer.destroy`

Checks:

- blocked-by-default behavior when policy disabled
- success with `zniffer-maintenance` preset
- no command bypasses mutation policy
- event normalization emits both generic `zwjs.event.zniffer` and specialized events

### Post-run artifacts

- representative raw result payloads
- representative raw event payloads
- note any fields not covered by current fixtures

## Firmware Validation (P3.3)

### Pre-checks (Required)

- Non-production controller and/or node only
- Verified backup/recovery path
- Correct firmware file / update source
- Compatibility confirmed for target device
- Maintenance window approved

### Read/status path validation

- `driver.is_otw_firmware_update_in_progress`
- `controller.get_any_firmware_update_progress`
- `controller.is_any_ota_firmware_update_in_progress`
- `controller.get_available_firmware_updates` (requires `nodeId`)
- `controller.is_firmware_update_in_progress`
- `node.get_firmware_update_capabilities`
- `node.get_firmware_update_capabilities_cached`
- `node.is_firmware_update_in_progress`
- `node.get_firmware_update_progress`

Record:

- observed wrapper shapes (`progress`, `updates`, `capabilities`)
- device-specific unsupported responses
- schema-specific differences

### Event validation

Observe and record if emitted:

- `driver`:
  - `firmware update progress`
  - `firmware update finished`
- `controller`:
  - `firmware update progress`
  - `firmware update finished`
- `node`:
  - `firmware update progress`
  - `firmware update finished`

Checks:

- generic source event emitted (`zwjs.event.driver/controller/node`)
- specialized firmware event emitted
- payload fields align with current `partial` typing assumptions

### Mutation safety validation (without destructive action)

Validate policy behavior first:

- firmware commands blocked by default mutation policy
- firmware commands blocked when not in explicit allowlist
- firmware commands allowed only when explicitly allowlisted

Validate wrapper input guards:

- `driverFirmwareUpdateOtw(...)` rejects ambiguous payload mode
- `updateNodeFirmware(...)` rejects empty `updates` array

### Mutation execution validation (only if approved)

Run only the minimum approved workflow:

- `driver.firmware_update_otw` (raw file and/or `updateInfo` path)
- `controller.firmware_update_ota` / `controller.firmware_update_otw`
- `node.begin_firmware_update` / `node.update_firmware` / `node.abort_firmware_update`

Record for each command:

- exact args mode used
- result payload shape
- observed progress/finished events
- completion state / error state
- any recovery actions required

## Failure Handling / Stop Conditions

Stop immediately if:

- unexpected controller/node state changes occur
- result payload shape indicates unsupported/unsafe operation
- repeated transport/protocol errors occur
- firmware operation reports a device compatibility issue
- zniffer init/start errors indicate hardware contention or device mismatch

## Post-Validation Follow-up

- Add/update fixtures for observed result/event variants
- Tighten typings if stable fields recur
- Update `docs/zwjs-capability-matrix.md` live validation status
- Update `plan/zwjs-parity-roadmap.md` with outcomes and caveats
- Document exact dates and node IDs used

## Validation Record Template

Copy this block per session:

```md
### Session Record

- Date:
- Target endpoint:
- Server version:
- Driver version:
- Schema range:
- Commit SHA:
- Nodes used:
- Zniffer device path (if used):
- Mutation policy preset/base:
- Commands validated:
- Events observed:
- Failures / caveats:
- Fixtures to add/update:
```

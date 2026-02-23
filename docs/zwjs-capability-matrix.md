# ZWJS Capability Matrix (3-Way)

## Purpose

This document compares three layers that are easy to conflate but solve different problems:

1. `zwave-js-server` protocol surface (WebSocket protocol truth)
2. `zwave-js-ui` backend service (`api/lib/ZwaveClient.ts`) and UI Socket.IO events
3. Our protocol-oriented `ZwjsClient` in `packages/core`

This is the parity planning baseline for expanding `@zwavejs2homey/core` without turning it into a `zwave-js-ui` app clone.

## Boundaries (Important)

- `zwave-js-server` docs define the protocol contract (`messageId`, `command`, `result`, `event`, schema versions).
- `zwave-js-ui` frontend uses `socket.io-client` and receives app-specific Socket.IO events. Those are **not** protocol events.
- `zwave-js-ui` backend `ZwaveClient.ts` is an application service/orchestrator (driver management, app logic, Socket.IO emission), not a reusable protocol client library.
- Our `ZwjsClient` is a reusable protocol client and intentionally excludes Homey- or UI-specific abstractions.

## Sources Used

- `docs/external/zwave-js-server/README.md`
- `docs/external/zwave-js-server/API_SCHEMA.md`
- `docs/external/zwave-js-ui/api/lib/ZwaveClient.ts`
- `docs/external/zwave-js-ui/api/lib/SocketEvents.ts`
- `packages/core/src/client/types.ts`
- `packages/core/src/client/zwjs-client.ts`
- `packages/core/src/protocol/*`
- `packages/core/test/*`
- Live read-only validation notes from production instance (`ws://192.168.1.15:3000`) on **February 23, 2026**

## Status Taxonomy

### Support Mode (`Our ZwjsClient`)

- `typed-wrapper`
- `generic-read`
- `generic-mutation`
- `none`

### Result Typing

- `strong` = explicit exported result type with meaningful fields
- `partial` = top-level type exists, nested payloads mostly `Record<string, unknown>`
- `protocol-native` = intentionally loose protocol pass-through
- `unknown`

### Test Coverage Tags

- `fixture`
- `normalizer`
- `mocked-transport`
- `ws-integration`
- `live-readonly`
- `none`

### Priority

- `P0` = first Homey bridge vertical slice
- `P1` = high-value read/ops completeness
- `P2` = mutation and operational workflows
- `P3` = advanced/long-tail/zniffer

## Current Snapshot (What We Already Have)

### Protocol foundation (implemented)

- WebSocket transport via `ws`
- Lifecycle + reconnect/backoff
- `version` frame parsing
- `result`/`event` frame parsing + typed result error metadata
- Handshake wrappers: `setApiSchema()`, `initialize()`, `startListening()`
- Generic command paths: `sendCommand()` and `sendMutationCommand()`
- Mutation safety policy (disabled by default, allowlist support)
- Version-adaptive normalizer architecture (default + fallback)

### Automated verification (implemented)

- Fixture-backed normalizer/frame tests
- Mocked-transport behavioral tests (command correlation, reconnect, wrappers, mutation policy)
- In-process `ws` integration harness test (real `WsTransport` + `ZwjsClient`)

### Live read-only validation (2026-02-23)

Validated against `ws://192.168.1.15:3000`:

- Handshake: `version` -> `set_api_schema(0)` -> `initialize` -> `start_listening`
- Read wrappers: `driver.get_config`, `driver.get_log_config`, `driver.is_statistics_enabled`, `controller.get_state`, `controller.get_node_neighbors`, `node.get_state`, `node.get_defined_value_ids`
- Value-read wrappers validated on node `5` for multiple value IDs (`currentValue`, `duration`, `targetValue`):
  - `node.get_value`
  - `node.get_value_metadata`
  - `node.get_value_timestamp`
- P1.2 diagnostic node wrappers validated read-only on node `5`:
  - `node.get_firmware_update_capabilities`
  - `node.get_firmware_update_capabilities_cached`
  - `node.get_date_and_time`
  - `node.is_firmware_update_in_progress`
  - `node.get_firmware_update_progress`
  - `node.is_health_check_in_progress`
  - `node.has_device_config_changed`
- Observed P1.2 result wrappers on this instance commonly use nested object keys:
  - `{ capabilities: ... }`, `{ dateAndTime: ... }`, `{ progress: ... }`, `{ changed: ... }`
- `node.get_supported_notification_events` failed on node `5` (device/feature-specific protocol failure, not client transport failure)
- `start_listening_logs` / `stop_listening_logs` wrappers succeeded, but no `driver.logging` events were emitted during two read-only validation windows (filtered and unfiltered)

## Command Matrix (Priority/Tracked Surface)

This first-pass matrix is decision-oriented: all currently implemented wrappers plus the highest-value parity targets across categories. Long-tail categories are summarized afterward.

### Server Commands

| Category | Command                | Schema Min | ZWJS Server Docs | ZWJS UI Backend                                                  | Our ZwjsClient Support                 | Result Typing     | Tests                                           | Live Validation | Priority | Gap Notes                                                                                    |
| -------- | ---------------------- | ---------: | ---------------- | ---------------------------------------------------------------- | -------------------------------------- | ----------------- | ----------------------------------------------- | --------------- | -------- | -------------------------------------------------------------------------------------------- |
| server   | `set_api_schema`       |          0 | yes              | backend uses schema negotiation internally (not a UI API method) | `typed-wrapper` (`setApiSchema`)       | `protocol-native` | `fixture`, `mocked-transport`, `ws-integration` | yes             | P0       | Wrapper implemented; useful for explicit schema negotiation                                  |
| server   | `initialize`           |          0 | yes              | backend initializes server/driver directly, not via WS client    | `typed-wrapper` (`initialize`)         | `protocol-native` | `mocked-transport`, `ws-integration`            | yes             | P0       | Kept protocol-native by design                                                               |
| server   | `start_listening`      |          0 | yes              | backend emits Socket.IO state/events instead                     | `typed-wrapper` (`startListening`)     | `protocol-native` | `fixture`, `mocked-transport`, `ws-integration` | yes             | P0       | Snapshot extraction feeds `getNodeList()`                                                    |
| server   | `start_listening_logs` |        31+ | yes              | UI/backend supports logging features                             | `typed-wrapper` (`startListeningLogs`) | `protocol-native` | `fixture`, `mocked-transport`, `live-readonly`  | yes (wrapper)   | P1       | Live wrapper validation passed; no `driver.logging` events observed during validation window |
| server   | `stop_listening_logs`  |        31+ | yes              | UI/backend supports logging features                             | `typed-wrapper` (`stopListeningLogs`)  | `protocol-native` | `fixture`, `mocked-transport`, `live-readonly`  | yes (wrapper)   | P1       | Pair implemented and live-validated; event-stream observation still pending active logs      |

### Driver Commands

| Category | Command                                                             | Schema Min | ZWJS Server Docs | ZWJS UI Backend (`allowedApis`/service)                 | Our ZwjsClient Support                                  | Result Typing     | Tests                                           | Live Validation | Priority | Gap Notes                                                                                                         |
| -------- | ------------------------------------------------------------------- | ---------: | ---------------- | ------------------------------------------------------- | ------------------------------------------------------- | ----------------- | ----------------------------------------------- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| driver   | `driver.get_config`                                                 |         4+ | yes              | backend has config/info handling (not same method name) | `typed-wrapper` (`getDriverConfig`)                     | `partial`         | `fixture`, `mocked-transport`, `ws-integration` | yes             | P0       | Good enough for bridge config visibility                                                                          |
| driver   | `driver.get_log_config`                                             |         4+ | yes              | logging config managed by backend                       | `typed-wrapper` (`getDriverLogConfig`)                  | `partial`         | `fixture`, `mocked-transport`, `live-readonly`  | yes             | P1       | Expand nested typing later if needed                                                                              |
| driver   | `driver.is_statistics_enabled`                                      |         4+ | yes              | backend has stats features                              | `typed-wrapper` (`isDriverStatisticsEnabled`)           | `strong`          | `fixture`, `mocked-transport`, `live-readonly`  | yes             | P1       | Done                                                                                                              |
| driver   | `driver.update_log_config`                                          |         4+ | yes              | `driverFunction` / config methods in backend            | `generic-mutation`                                      | `protocol-native` | none                                            | no              | P2       | Add typed mutating wrapper via `sendMutationCommand`                                                              |
| driver   | `driver.check_for_config_updates`                                   |         5+ | yes              | `checkForConfigUpdates`                                 | `generic-read`                                          | `protocol-native` | none                                            | no              | P2       | High operational value                                                                                            |
| driver   | `driver.install_config_update`                                      |         5+ | yes              | `installConfigUpdate`                                   | `generic-mutation`                                      | `protocol-native` | none                                            | no              | P2       | Mutating + operational safeguards                                                                                 |
| driver   | `driver.shutdown`                                                   |        36+ | yes              | `shutdownZwaveAPI`                                      | `generic-mutation`                                      | `protocol-native` | none                                            | no              | P2       | High-risk mutation; explicit preset/confirmation policy later                                                     |
| driver   | `driver.soft_reset` / `driver.try_soft_reset` / `driver.hard_reset` |        25+ | yes              | `softReset`, `hardReset`                                | `generic-mutation`                                      | `protocol-native` | none                                            | no              | P2       | High-risk; policy presets required                                                                                |
| driver   | `driver.firmware_update_otw`                                        |        41+ | yes              | `firmwareUpdateOTW`                                     | `typed-wrapper` (`driverFirmwareUpdateOtw`)             | `protocol-native` | `fixture`, `mocked-transport` (policy path)     | no              | P3       | High-risk firmware mutation wrapper is policy-gated; fixture coverage includes raw-file and `updateInfo` variants |
| driver   | `driver.is_otw_firmware_update_in_progress`                         |        41+ | yes              | `firmwareUpdateOTW` status checks                       | `typed-wrapper` (`isDriverOtwFirmwareUpdateInProgress`) | `strong`          | `fixture`, `mocked-transport`                   | no              | P3       | Added as P3.3 read/status subset                                                                                  |

### Controller Commands

| Category   | Command                                                             |                             Schema Min | ZWJS Server Docs                                  | ZWJS UI Backend                                                     | Our ZwjsClient Support                                                         | Result Typing     | Tests                                                            | Live Validation | Priority | Gap Notes                                                                       |
| ---------- | ------------------------------------------------------------------- | -------------------------------------: | ------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------- | --------------- | -------- | ------------------------------------------------------------------------------- |
| controller | `controller.get_state`                                              |                                    14+ | yes                                               | backend controller state methods                                    | `typed-wrapper` (`getControllerState`)                                         | `partial`         | `fixture`, `mocked-transport`, `ws-integration`, `live-readonly` | yes             | P0       | Core for bridge health and network status                                       |
| controller | `controller.get_node_neighbors`                                     | 5+ (via schema notes for node changes) | indirectly documented as controller method family | `getNodeNeighbors`, `discoverNodeNeighbors`, `refreshNeighbors`     | `typed-wrapper` (`getControllerNodeNeighbors`)                                 | `partial`         | `fixture`, `mocked-transport`, `live-readonly`                   | yes             | P1       | Result shape varies (`array` vs object wrapper)                                 |
| controller | `controller.begin_inclusion` / `begin_exclusion`                    |                                 varies | yes (family)                                      | `startInclusion`, `startExclusion`                                  | `typed-wrapper` (`beginInclusion`, `beginExclusion`)                           | `partial`         | `fixture`, `mocked-transport`                                    | no              | P2       | Mutation-gated wrappers implemented; live validation intentionally deferred     |
| controller | `controller.stop_inclusion` / `stop_exclusion`                      |                                 varies | yes (family)                                      | `stopInclusion`, `stopExclusion`                                    | `typed-wrapper` (`stopInclusion`, `stopExclusion`)                             | `partial`         | `fixture`, `mocked-transport`                                    | no              | P2       | Mutation-gated wrappers implemented; pair with inclusion event flow             |
| controller | `controller.backup_nvm_raw` / `restore_nvm`                         |                                    yes | yes                                               | `backupNVMRaw`, `restoreNVM`                                        | `generic-read` / `generic-mutation`                                            | `protocol-native` | none                                                             | no              | P3       | Heavy operational workflow, progress events already partially typed             |
| controller | `controller.get_any_firmware_update_progress`                       |                                 varies | source command enum/docs family                   | firmware workflow status handling                                   | `typed-wrapper` (`getControllerAnyFirmwareUpdateProgress`)                     | `strong`          | `fixture`, `mocked-transport`                                    | no              | P3       | Added as P3.3 firmware status subset                                            |
| controller | `controller.is_any_ota_firmware_update_in_progress`                 |                                 varies | source command enum/docs family                   | firmware workflow status handling                                   | `typed-wrapper` (`isControllerAnyOtaFirmwareUpdateInProgress`)                 | `strong`          | `fixture`, `mocked-transport`                                    | no              | P3       | Added as P3.3 firmware status subset                                            |
| controller | `controller.get_available_firmware_updates`                         |                                 varies | source command enum/docs family                   | firmware update discovery                                           | `typed-wrapper` (`getControllerAvailableFirmwareUpdates`)                      | `partial`         | `fixture`, `mocked-transport`                                    | no              | P3       | Added as P3.3 discovery subset                                                  |
| controller | `controller.is_firmware_update_in_progress`                         |                                 varies | source command enum/docs family                   | firmware workflow status handling                                   | `typed-wrapper` (`isControllerFirmwareUpdateInProgress`)                       | `strong`          | `fixture`, `mocked-transport`                                    | no              | P3       | Legacy/compat status command wrapped                                            |
| controller | `controller.firmware_update_ota` / `controller.firmware_update_otw` |                                 varies | source command enum/docs family                   | firmware workflow execution                                         | `typed-wrapper` (`controllerFirmwareUpdateOta`, `controllerFirmwareUpdateOtw`) | `protocol-native` | `fixture`, `mocked-transport` (policy path)                      | no              | P3       | High-risk firmware mutation wrappers are policy-gated; live validation deferred |
| controller | `controller.toggle_rf`                                              |                                    43+ | yes (`API_SCHEMA.md`)                             | backend RF control methods (`setRFRegion` etc. adjacent operations) | `generic-mutation`                                                             | `protocol-native` | none                                                             | no              | P3       | Add only with explicit operational use-case                                     |

### Node Commands (Read-heavy bridge targets)

| Category | Command                                                                              |   Schema Min | ZWJS Server Docs | ZWJS UI Backend                                                    | Our ZwjsClient Support                                                                       | Result Typing     | Tests                                          | Live Validation        | Priority | Gap Notes                                                                                                              |
| -------- | ------------------------------------------------------------------------------------ | -----------: | ---------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------- | ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| node     | `node.get_state`                                                                     |          14+ | yes              | `getNodes`/node state handling                                     | `typed-wrapper` (`getNodeState`)                                                             | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P0       | Key bridge discovery/state sync primitive                                                                              |
| node     | `node.get_defined_value_ids`                                                         |           0+ | yes              | backend value inventory logic                                      | `typed-wrapper` (`getNodeDefinedValueIds`)                                                   | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P0       | Includes exported value-id guards/extractor for array and object-wrapped results                                       |
| node     | `node.get_value_metadata`                                                            |           0+ | yes              | backend metadata handling                                          | `typed-wrapper` (`getNodeValueMetadata`)                                                     | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P0       | Common metadata fields typed; nested payload remains protocol-native                                                   |
| node     | `node.get_value`                                                                     |          14+ | yes              | backend value reads/writes                                         | `typed-wrapper` (`getNodeValue`)                                                             | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P0       | Live-validated object envelopes observed (`{ value: ... }`, `{}`); helpers exported for extraction and presence checks |
| node     | `node.get_value_timestamp`                                                           |          27+ | yes              | backend value tracking                                             | `typed-wrapper` (`getNodeValueTimestamp`)                                                    | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P1       | Observed object result shape (`{ timestamp: number }`) in addition to scalar fixture                                   |
| node     | `node.get_supported_notification_events`                                             |          41+ | yes              | backend notification UX methods                                    | `typed-wrapper` (`getNodeSupportedNotificationEvents`)                                       | `protocol-native` | `fixture`, `mocked-transport`                  | yes (failed on node 5) | P1       | Command path works; device support is node-specific                                                                    |
| node     | `node.set_value`                                                                     |           0+ | yes              | `writeValue` / `sendCommand` / `writeBroadcast` / `writeMulticast` | `generic-mutation` + `sendMutationCommand` guard                                             | `protocol-native` | `fixture`, `mocked-transport` (policy path)    | no                     | P2       | Add typed mutating wrapper + policy preset                                                                             |
| node     | `node.refresh_info`                                                                  |           0+ | yes              | `refreshInfo`                                                      | `typed-wrapper` (`refreshNodeInfo`)                                                          | `partial`         | `fixture`, `mocked-transport`                  | no                     | P2       | Mutation-gated wrapper implemented; live validation deferred                                                           |
| node     | `node.refresh_values`                                                                |           0+ | yes              | backend refresh-values flows                                       | `typed-wrapper` (`refreshNodeValues`)                                                        | `partial`         | `fixture`, `mocked-transport`                  | no                     | P2       | Mutation-gated wrapper implemented                                                                                     |
| node     | `node.ping`                                                                          |           5+ | yes              | `pingNode`                                                         | `typed-wrapper` (`pingNode`)                                                                 | `partial`         | `fixture`, `mocked-transport`                  | no                     | P2       | Low-risk mutation wrapper implemented; policy preset support added                                                     |
| node     | `node.poll_value`                                                                    |           5+ | yes              | backend polling/value refresh helpers                              | `typed-wrapper` (`pollNodeValue`)                                                            | `partial`         | `fixture`, `mocked-transport`                  | no                     | P2       | Mutation-gated wrapper implemented                                                                                     |
| node     | `node.get_firmware_update_capabilities`                                              |       varies | yes              | firmware capability checks                                         | `typed-wrapper` (`getNodeFirmwareUpdateCapabilities`)                                        | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P1       | Live-observed nested `{ capabilities }` wrapper typed                                                                  |
| node     | `node.get_firmware_update_capabilities_cached`                                       |       varies | yes              | firmware capability caching                                        | `typed-wrapper` (`getNodeFirmwareUpdateCapabilitiesCached`)                                  | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P1       | Live-observed nested `{ capabilities }` wrapper typed                                                                  |
| node     | `node.get_date_and_time`                                                             |       varies | yes              | date/time sync helpers                                             | `typed-wrapper` (`getNodeDateAndTime`)                                                       | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P1       | Live-observed nested `{ dateAndTime }` wrapper typed                                                                   |
| node     | `node.is_firmware_update_in_progress`                                                |       varies | yes              | firmware workflow status                                           | `typed-wrapper` (`isNodeFirmwareUpdateInProgress`)                                           | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P1       | Live instance returned `{ progress }` wrapper; type supports both `inProgress` and `progress`                          |
| node     | `node.get_firmware_update_progress`                                                  |       varies | yes              | firmware workflow progress                                         | `typed-wrapper` (`getNodeFirmwareUpdateProgress`)                                            | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P1       | Live-observed nested `{ progress }` wrapper typed                                                                      |
| node     | `node.is_health_check_in_progress`                                                   |       varies | yes              | health-check workflow state                                        | `typed-wrapper` (`isNodeHealthCheckInProgress`)                                              | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P1       | Live instance returned `{ progress }` wrapper; type supports both `inProgress` and `progress`                          |
| node     | `node.has_device_config_changed`                                                     |       varies | yes              | device config change checks                                        | `typed-wrapper` (`hasNodeDeviceConfigChanged`)                                               | `partial`         | `fixture`, `mocked-transport`, `live-readonly` | yes                    | P1       | Live-observed `{ changed }` wrapper typed                                                                              |
| node     | `node.check_lifeline_health` / `check_route_health`                                  |          13+ | yes              | `checkLifelineHealth`, `checkRouteHealth`                          | `generic-mutation`                                                                           | `protocol-native` | none                                           | no                     | P2       | Progress events partially covered generically                                                                          |
| node     | `node.begin_firmware_update` / `node.update_firmware` / `node.abort_firmware_update` |       varies | yes              | multiple backend methods                                           | `typed-wrapper` (`beginNodeFirmwareUpdate`, `updateNodeFirmware`, `abortNodeFirmwareUpdate`) | `protocol-native` | `fixture`, `mocked-transport` (policy path)    | no                     | P3       | High-risk firmware mutation wrappers are policy-gated; live validation deferred                                        |
| node     | config parameter raw get/set                                                         | 39+ / varies | yes              | backend config methods                                             | `generic-read` / `generic-mutation`                                                          | `protocol-native` | none                                           | no                     | P3       | Add once concrete Homey requirement exists                                                                             |

### Endpoint / Virtual Endpoint / Zniffer (Category Summary)

| Category            | ZWJS Server Docs                                                             | ZWJS UI Backend                                              | Our ZwjsClient                                                                                                                                                                                                                                                                                                             | Priority | Notes                                                       |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| endpoint.\*         | broad documented support (`invoke_cc_api`, capability checks, version, etc.) | backend supports many endpoint behaviors via service methods | typed read subset implemented (`supports_cc`, `supports_cc_api`, `controls_cc`, `is_cc_secure`, `get_cc_version`, `try_get_node`, `get_node_unsafe`, `invoke_cc_api`) plus generic paths                                                                                                                                   | P3       | `invoke_cc_api` intentionally protocol-native result typing |
| virtual endpoint.\* | documented support                                                           | backend supports some virtual endpoint operations            | typed read subset implemented for `broadcast_node.*` / `multicast_group.*` (endpoint count, `supports_cc`, `supports_cc_api`, `get_cc_version`, `invoke_cc_api`, multicast defined value IDs) plus generic paths                                                                                                           | P3       | Additional commands can be added incrementally              |
| zniffer.\*          | documented command family + events                                           | backend has `ZnifferManager` and Socket.IO zniffer events    | typed read subset implemented (`captured_frames`, `get_capture_as_zlf_buffer`, `supported_frequencies`, `current_frequency`); typed mutation subset implemented (`init`, `start`, `stop`, `destroy`, `clear_captured_frames`, `set_frequency`) via policy gating; specialized zniffer event typing added for common events | P3       | Live zniffer validation pending non-production setup        |

## Event Matrix (Protocol vs UI vs Our Client)

### Protocol Event Sources and Current Coverage

| Source     | Event Name                                              | ZWJS Server Docs                                | ZWJS UI Backend/UI                                              | Our Generic Typing                       | Our Specialized Typing                                                        | Tests                   | Live Observed                           | Priority | Gap Notes                                                                                  |
| ---------- | ------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- | --------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| driver     | `logging`                                               | yes                                             | UI has `DEBUG`/log-related Socket.IO outputs                    | `zwjs.event.driver` + raw-normalized     | `zwjs.event.driver.logging`                                                   | `fixture`, `normalizer` | no (not observed yet)                   | P1       | Wrapper pair live-validated, but no log events emitted during read-only validation windows |
| driver     | `driver ready`                                          | yes                                             | UI emits connection/info/socket state                           | `zwjs.event.driver` + raw-normalized     | none                                                                          | none                    | not recorded                            | P1       | Good candidate specialized event                                                           |
| driver     | `firmware update progress` / `firmware update finished` | forwarded in server source (`forward.ts`)       | backend/UI firmware workflow progress handling                  | `zwjs.event.driver` + raw-normalized     | `zwjs.event.driver.firmware-update-progress`, `.firmware-update-finished`     | `fixture`, `normalizer` | no                                      | P3       | Added as first P3.3 firmware event subset                                                  |
| driver     | `log config updated`                                    | yes                                             | backend updates UI state via socket events                      | `zwjs.event.driver` + raw-normalized     | none                                                                          | none                    | not recorded                            | P2       | Add when mutating log config wrapper lands                                                 |
| controller | `nvm convert progress`                                  | yes                                             | backend emits controller progress to UI                         | `zwjs.event.controller` + raw-normalized | `zwjs.event.controller.nvm-convert-progress`                                  | `fixture`, `normalizer` | no                                      | P2       | Done for typing; command workflow not yet wrapped                                          |
| controller | `firmware update progress` / `firmware update finished` | forwarded in server source (`forward.ts`)       | backend/UI firmware workflow progress handling                  | `zwjs.event.controller` + raw-normalized | `zwjs.event.controller.firmware-update-progress`, `.firmware-update-finished` | `fixture`, `normalizer` | no                                      | P3       | Added as first P3.3 firmware event subset                                                  |
| controller | `nvm restore progress`                                  | yes                                             | backend emits controller progress to UI                         | `zwjs.event.controller` + raw-normalized | `zwjs.event.controller.nvm-restore-progress`                                  | `fixture`, `normalizer` | no                                      | P2       | Done for typing; workflow pending                                                          |
| controller | `nvm backup progress`                                   | yes                                             | backend emits progress                                          | `zwjs.event.controller` + raw-normalized | `zwjs.event.controller.nvm-backup-progress`                                   | `fixture`, `normalizer` | no                                      | P2       | Specialized typing added; workflow wrappers still generic                                  |
| controller | `grant security classes`                                | yes                                             | UI has `GRANT_SECURITY_CLASSES`                                 | `zwjs.event.controller` + raw-normalized | `zwjs.event.controller.grant-security-classes`                                | `fixture`, `normalizer` | no                                      | P2       | Specialized typing added; inclusion wrappers still pending                                 |
| controller | `validate dsk and enter pin`                            | yes                                             | UI has `VALIDATE_DSK`                                           | `zwjs.event.controller` + raw-normalized | `zwjs.event.controller.validate-dsk-and-enter-pin`                            | `fixture`, `normalizer` | no                                      | P2       | Specialized typing added; inclusion wrappers still pending                                 |
| controller | `inclusion aborted`                                     | yes                                             | UI has `INCLUSION_ABORTED`                                      | `zwjs.event.controller` + raw-normalized | `zwjs.event.controller.inclusion-aborted`                                     | `fixture`, `normalizer` | no                                      | P2       | Specialized typing added; inclusion wrappers still pending                                 |
| node       | `value updated`                                         | yes (node events section)                       | UI emits `VALUE_UPDATED`, `NODE_EVENT`                          | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.value-updated`                                               | `fixture`, `normalizer` | generic controller/node events observed | P0       | Key for Homey capability sync                                                              |
| node       | `value added`                                           | forwarded in server source (`forward.ts`)       | UI emits `VALUE_UPDATED`/node state diffs depending on app flow | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.value-added`                                                 | `fixture`, `normalizer` | not recorded                            | P0       | Added from upstream source payload shape (`event`, `nodeId`, `args`)                       |
| node       | `value removed`                                         | forwarded in server source (`forward.ts`)       | UI emits `VALUE_REMOVED`/node state diffs depending on app flow | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.value-removed`                                               | `fixture`, `normalizer` | not recorded                            | P0       | Added from upstream source payload shape (`event`, `nodeId`, `args`)                       |
| node       | `value notification`                                    | forwarded in server source (`forward.ts`)       | UI emits `NODE_EVENT` / feature-specific updates                | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.value-notification`                                          | `fixture`, `normalizer` | not recorded                            | P0       | Added from upstream source payload shape (`event`, `nodeId`, `args`)                       |
| node       | `metadata updated`                                      | yes                                             | UI emits `METADATA_UPDATED`                                     | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.metadata-updated`                                            | `fixture`, `normalizer` | not recorded                            | P1       | Important for dynamic capability metadata                                                  |
| node       | `notification`                                          | yes                                             | UI emits `NODE_EVENT` and feature-specific UI updates           | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.notification`                                                | `fixture`, `normalizer` | not recorded                            | P1       | Important for alarms/notifications                                                         |
| node       | `wake up`                                               | forwarded in server source (`forward.ts`)       | UI updates node state/app status                                | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.wake-up`                                                     | `fixture`, `normalizer` | not recorded                            | P1       | Useful for battery/sleeping-device state sync                                              |
| node       | `sleep`                                                 | forwarded in server source (`forward.ts`)       | UI updates node state/app status                                | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.sleep`                                                       | `fixture`, `normalizer` | not recorded                            | P1       | Useful for battery/sleeping-device state sync                                              |
| node       | `interview started`                                     | forwarded in server source (`forward.ts`)       | UI/backend updates node lifecycle state                         | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.interview-started`                                           | `fixture`, `normalizer` | not recorded                            | P1       | Payload uses `{ nodeId, args }` forwarding shape                                           |
| node       | `interview completed`                                   | forwarded in server source (`forward.ts`)       | UI/backend updates node lifecycle state                         | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.interview-completed`                                         | `fixture`, `normalizer` | not recorded                            | P1       | Payload uses `{ nodeId, args }` forwarding shape                                           |
| node       | `interview failed`                                      | forwarded in server source (`forward.ts`)       | UI/backend updates node lifecycle/error state                   | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.interview-failed`                                            | `fixture`, `normalizer` | not recorded                            | P1       | Payload uses `{ nodeId, args }` forwarding shape                                           |
| node       | `interview stage completed`                             | forwarded in server source (`forward.ts`)       | UI/backend updates interview progress state                     | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.interview-stage-completed`                                   | `fixture`, `normalizer` | not recorded                            | P1       | Payload uses `{ nodeId, stageName }` forwarding shape                                      |
| node       | `test powerlevel progress`                              | yes                                             | UI emits progress/state updates via app events                  | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.test-powerlevel-progress`                                    | `fixture`, `normalizer` | no                                      | P2       | Specialized typing added; mutating command wrapper still pending                           |
| node       | `check lifeline health progress`                        | yes                                             | UI emits `HEALTH_CHECK_PROGRESS` and related app updates        | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.check-lifeline-health-progress`                              | `fixture`, `normalizer` | no                                      | P2       | Specialized typing added; workflow wrappers still generic                                  |
| node       | `check route health progress`                           | yes                                             | UI emits route health progress app updates                      | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.check-route-health-progress`                                 | `fixture`, `normalizer` | no                                      | P2       | Specialized typing added; workflow wrappers still generic                                  |
| node       | `firmware update progress` / `firmware update finished` | yes / forwarded in server source (`forward.ts`) | backend/UI firmware workflow progress handling                  | `zwjs.event.node` + raw-normalized       | `zwjs.event.node.firmware-update-progress`, `.firmware-update-finished`       | `fixture`, `normalizer` | no                                      | P3       | Added as first P3.3 firmware event subset                                                  |
| node       | `statistics updated` and other node events              | yes (broadly forwarded)                         | UI emits `STATISTICS`, `NODE_EVENT`, node updates               | `zwjs.event.node` + raw-normalized       | none                                                                          | none                    | controller/node generic observed        | P1       | Add targeted specializations as needed                                                     |
| zniffer    | `ready` / `corrupted frame` / `frame` / `error`         | yes                                             | UI has `ZNIFFER_FRAME`, `ZNIFFER_STATE`                         | `zwjs.event.zniffer` + raw-normalized    | `zwjs.event.zniffer.ready`, `.corrupted-frame`, `.frame`, `.error`            | `fixture`, `normalizer` | no                                      | P3       | Core zniffer event subset typed; command wrappers implemented; live validation pending     |

### `zwave-js-ui` Socket.IO Events (UI Layer, Not Protocol Events)

These are included to prevent architectural confusion and to show where UI/backend semantics exceed protocol typing.

| UI Socket Event (`SocketEvents.ts`)                             | Layer Meaning                   | Rough Relation to Protocol              | Our `ZwjsClient` Equivalent                                                                              | Notes                                                                            |
| --------------------------------------------------------------- | ------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `INIT`                                                          | full app state push to UI       | not a protocol frame; app-assembled     | none                                                                                                     | Closest protocol equivalent is `start_listening` snapshot + additional app state |
| `CONTROLLER_CMD`                                                | controller/app status updates   | derived from protocol + app state       | partial (`zwjs.event.controller`)                                                                        | UI payload is app-specific                                                       |
| `NODE_UPDATED` / `NODE_ADDED` / `NODE_REMOVED`                  | normalized UI node state events | derived from protocol + app model       | partial (`nodes.snapshot`, `zwjs.event.node`, raw events)                                                | Our client intentionally does not build UI node models                           |
| `VALUE_UPDATED` / `VALUE_REMOVED` / `METADATA_UPDATED`          | value model updates for UI      | often derived from node events          | partial via specialized node event typing                                                                | We preserve protocol-native events, not UI-state diffs                           |
| `API_RETURN`                                                    | UI request result channel       | app API layer, not protocol             | none                                                                                                     | Our client returns promises directly                                             |
| `GRANT_SECURITY_CLASSES` / `VALIDATE_DSK` / `INCLUSION_ABORTED` | inclusion UX callbacks          | controller protocol events mapped to UI | specialized controller inclusion/security events (protocol-native payloads)                              | Inclusion wrappers/flows still pending                                           |
| `ZNIFFER_FRAME` / `ZNIFFER_STATE`                               | UI zniffer streaming/state      | zniffer domain plus app state           | typed zniffer event subset (`ready`, `corrupted frame`, `frame`, `error`) + generic `zwjs.event.zniffer` | Command/event typing in place for P3.2 subset; live validation pending           |

## Major Gaps (Actionable)

### P0 Gaps (Bridge-Critical)

- Stronger typing for node value payloads used by Homey mapping (`node.get_value`) and deeper metadata typing beyond common fields
- Additional specialized node event typing needed for capability sync (remaining high-frequency/edge node events still to be observed and prioritized)
- Deeper typing for command-class-specific `node.get_value` payloads after more diverse observed value samples are cataloged (generic/empty envelope handling complete)

### P1 Gaps (Read-Only Ops Completeness)

- `start_listening_logs` / `stop_listening_logs` wrappers and live validation
- More driver/controller read wrappers (`driver.check_for_config_updates`, route/neighbor diagnostics, node health/status helpers)
- Specialized controller/node event typing for frequently used progress and diagnostics events

### P2 Gaps (Safe Mutation Expansion)

- Typed mutating wrappers routed through `sendMutationCommand()` with explicit allowlist presets
- Mutation preset coverage now includes a `zniffer-maintenance` preset for P3.2 lifecycle/frequency wrappers
- Inclusion/exclusion workflow wrappers + event typing + operational safeguards
- Lower-risk mutating wrappers first (`node.ping`, `node.refresh_info`) before destructive operations

### P3 Gaps (Advanced Domains)

- Endpoint/virtual endpoint typed wrappers
- Zniffer live validation on a non-production zniffer-capable setup (wrappers/event typing implemented for current P3.2 subset)
- Firmware and advanced maintenance workflows

## Parity Roadmap Summary

### Phase P0 (Bridge Vertical Slice)

Focus on the minimum protocol surface needed to map real node states/values into Homey devices:

- strengthen value/metadata typing
- validate representative read paths live
- expand node event typing from observed traffic

### Phase P1 (Read-Only Completeness)

Expand operational read coverage and diagnostics without mutation risk:

- driver/controller/node read wrappers
- log streaming wrappers
- more event payload types

### Phase P2 (Safe Mutations)

Add typed mutating wrappers with safety policy presets and explicit guardrails:

- allowlist presets by command family
- low-risk mutations first, high-risk commands explicitly documented/gated

### Phase P3 (Advanced/Long Tail)

Endpoint/virtual endpoint/zniffer and firmware-heavy flows.

Current zniffer status:

- Typed wrappers implemented for zniffer read + lifecycle/frequency commands
- Specialized zniffer event typing implemented for `ready`, `corrupted frame`, `frame`, `error`
- Recommended mutation policy preset for zniffer ops: `zniffer-maintenance`
- Remaining gap is live validation and fixture expansion from observed zniffer traffic

Firmware mutation safety posture:

- Firmware workflow mutations are implemented as typed wrappers, but intentionally remain high-risk and policy-gated.
- There is no default `firmware-maintenance` preset in core.
- Recommended operator posture:
  - use `createMutationPolicyPreset('destructive', { additionalAllowCommands: [...] })`
  - allowlist only the exact firmware commands required for the current maintenance step
  - test on non-production hardware before any production usage

## Notes on Naming and Mapping

- Protocol command names are kept exact (`node.get_value`), never renamed in the matrix.
- `zwave-js-ui` backend method names (`getNodeNeighbors`, `refreshInfo`, etc.) are listed as backend capabilities, not protocol names.
- Socket.IO UI event names (`VALUE_UPDATED`, `INIT`, etc.) are UI-layer semantics and must not be treated as `zwave-js-server` protocol events.

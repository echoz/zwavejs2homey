# ZWJS Protocol Client Plan

## 1) Goal and Scope

### Goal
Build a fully featured, protocol-oriented `zwjs` client in `packages/core` for `zwave-js-server` / Z-Wave JS UI (`zwavejs2mqtt`), with no Homey-specific abstractions in the client API.

### In Scope (Foundation Completed)
- WebSocket transport client (ZWJS UI)
- Optional auth
- Auto-reconnect with backoff
- Typed status + typed event subscription API
- Protocol handshake (`version`, `initialize`, `start_listening`)
- Generic typed command/request path (`messageId` + `command`)
- Thin read-only wrappers for selected protocol commands
- Version/schema adaptation via versioned normalizers
- Unit tests (normalizer + reconnect/state helpers)
- Read-only validation against a real production instance

### Out of Scope (still)
- Homey integration abstractions in the core client API
- Homey driver/capability mapping
- Pairing flows
- Broad device command translation
- MQTT/REST transports
- Persistent caching/storage

## 2) Public API and Types (Current + Target)

### Factory
- `createZwjsClient(config: ZwjsClientConfig): ZwjsClient`

### Client API
- `start(): Promise<void>`
- `stop(): Promise<void>`
- `getStatus(): ZwjsClientStatus`
- `onEvent(handler: (event: ZwjsClientEvent) => void): () => void`
- `initialize(...)` (typed protocol wrapper)
- `startListening(...)` (typed protocol wrapper)
- `sendCommand(...)` (generic typed protocol call)
- thin read-only wrappers (e.g. `getServerInfo()`, `getNodeList()`)

### Config (`ZwjsClientConfig`)
- `url: string`
- `auth?: { type: 'none' } | { type: 'bearer'; token: string }`
- `reconnect?: ReconnectPolicy`
- `timeouts?: TimeoutPolicy`
- `versionPolicy?: VersionPolicy`
- `logger?: ClientLogger`

### Status (`ZwjsClientStatus`)
- lifecycle state (`idle|connecting|connected|reconnecting|stopping|stopped|error`)
- `transportConnected`
- optional auth status
- server version
- adapter family
- reconnect attempt
- timestamps (`connectedAt`, `lastMessageAt`)
- `lastError`

### Event API
- Typed callback subscription
- `onEvent()` returns unsubscribe
- Ordered delivery
- Subscriber errors isolated

### Initial Event Categories
- `client.lifecycle`
- `client.reconnect.scheduled`
- `transport.connected`
- `transport.disconnected`
- `auth.succeeded`
- `auth.failed`
- `compat.warning`
- `protocol.error`
- `server.info`
- `nodes.snapshot`
- `node.event.raw-normalized`

### Initial Read Surface
- `getServerInfo()` (thin protocol wrapper, normalized response)
- `getNodeList()` (thin protocol wrapper, normalized response)
- `controller.get_state` / `driver.get_config` candidates next

### Target Expansion (next phases)
- More typed wrappers over `sendCommand(...)` for read-only commands first
- Typed protocol frame/result/error/event models (broader coverage)
- Event source-specific typing (`driver`, `controller`, `node`, `zniffer`)

## 3) Internal Architecture

### Core Modules
- `client/zwjs-client.ts`
- `client/state-machine.ts`
- `client/reconnect.ts`
- `client/request-tracker.ts`
- `client/subscribers.ts`
- `transport/ws-transport.ts`
- `protocol/detector.ts`
- `protocol/normalizers/registry.ts`
- `protocol/normalizers/<family>.ts`
- `protocol/normalizers/fallback.ts`
- `errors.ts`

### Separation of Concerns
- Client owns protocol lifecycle/reconnect/requests/subscribers/public API
- Transport wraps `ws` only (no protocol parsing)
- Detector selects normalizer adapter
- Normalizers convert raw frames to canonical types
- State machine enforces valid transitions

### Pedantic Rule
- Main client never directly parses protocol payloads

## 4) Lifecycle, Reconnect, Auth

### Lifecycle
- `start()` idempotent
- `stop()` idempotent
- `start()` during `stopping` waits, then starts
- `stop()` cancels reconnect, closes socket, rejects pending requests

### Reconnect (default)
- enabled
- exponential backoff + jitter
- resets after stable connection
- no reconnect after explicit `stop()`

### Default Reconnect Values
- initial: `500ms`
- max: `10s`
- multiplier: `2`
- jitter: `0.2`

### Auth (v1)
- optional (`none` or `bearer`)
- auth success emits `auth.succeeded`
- deterministic auth failure emits `auth.failed`
- deterministic auth failure is non-retryable in v1

### Error Posture
- structured errors only
- no silent failures

### Handshake (v1)
- Parse initial `version` frame on connect
- Send `initialize` (schema/version preferences)
- Send `start_listening`
- Only then treat event stream as active

## 5) Version Adaptation + Canonical Data

### Version Strategy
- Always use adapter registry
- Outcomes: `exact`, `family`, `fallback`
- `family` / `fallback` emit `compat.warning`

### Normalizer Contract
- input: raw frame/message
- output: canonical events/results or typed protocol error
- no uncaught throws across client boundary

### Canonical Results (v1)
- `ServerInfoResult`: normalized server/protocol metadata
- `NodeListResult`: canonical node summaries (safe subset only)

### Protocol Fidelity Rule
- Prefer `zwave-js-server` command/result/event names and shapes
- Do not introduce Homey-centric naming in the core protocol client

### Parsing Posture
- validate required fields
- tolerate unknown extra fields
- missing required fields => typed error
- ambiguous payloads => warning/error (no silent guessing)

## 6) Testing and Acceptance

### Tests (foundation done / next)
- mocked WebSocket unit tests for lifecycle/reconnect/request timeouts
- fixture-based normalizer tests for version/schema variations
- contract tests for public API (`onEvent`, ordering, unsubscribe, `getStatus`)
- [x] command/result/error frame fixtures from `zwave-js-server` docs/source
- next: handshake/integration sequence tests (`version` -> `initialize` -> `start_listening`)

### Fixture Coverage
- server info payloads
- node snapshot payloads
- node event payloads
- malformed/unknown payloads
- version mismatch cases (exact/family/fallback)

### Acceptance Criteria (Foundation)
- client connects via `ws`
- optional auth works
- reconnect/backoff works
- protocol handshake (`version` + `initialize` + `start_listening`) works
- generic command path works with `messageId` + `command`
- adapter registry + one tested family normalizer exists
- fallback normalizer exists
- `getServerInfo()` + `getNodeList()` return canonical typed data
- typed event subscription works
- tests cover lifecycle + normalization failure modes
- Homey app compiles against new API

### Foundation Status
- [x] Client connects via `ws`
- [x] Optional auth path exists
- [x] Reconnect/backoff implemented
- [x] Protocol handshake commands implemented (`initialize`, `start_listening`)
- [x] Generic command path implemented (`messageId` + `command`)
- [x] Adapter registry + default family normalizer + fallback normalizer
- [x] `getServerInfo()` + `getNodeList()` thin wrappers available
- [x] Typed event subscription API
- [x] Unit tests for normalizer + reconnect/state helpers
- [x] Homey app compiles against protocol-first API
- [x] Read-only validation against real instance (version/init/listening/nodes/controller state)

## 7) Implementation Sequence

### Completed (Foundation)
1. [x] Define public types/interfaces/errors (`zwjs` naming)
2. [x] Implement subscriber registry + state machine + reconnect helpers
3. [x] Implement `ws` transport wrapper
4. [x] Implement request tracker + timeouts
5. [x] Implement detector + adapter registry + fallback adapter
6. [x] Implement first version-family normalizer (version/result/event + node snapshot extraction)
7. [x] Implement `ZwjsClient` main class wiring all parts
8. [x] Replace placeholder core export with real `createZwjsClient()`
9. [x] Add initial unit tests (normalizer + reconnect/state)
10. [x] Keep Homey app integration minimal (logging only; no Homey-specific core abstractions)
11. [x] Update docs + sprint plan

### Next (Protocol Coverage Expansion)
1. [x] Add exact typed protocol result/error frame models (`type: result`, `success`, `error`)
2. [x] Add explicit handshake state machine (`version received`, `initialized`, `listening`)
3. [x] Add typed wrappers for read-only commands (`driver.get_config`, `controller.get_state`, selected `node.*`)
4. [x] Expand event typing by source (`driver`, `controller`, `node`, `zniffer`)
5. [x] Add fixture suite from `zwave-js-server` README/API schema examples
6. [x] Add mocked WS tests for command correlation, failures, and reconnect recovery
7. [x] Return typed protocol error payloads from failed command results (`errorCode`, Z-Wave error metadata, raw frame)
8. [x] Add typed read-only wrappers for `controller.get_node_neighbors`, `node.get_defined_value_ids`, and `node.get_value` with fixture-backed wrapper tests
9. [x] Add typed value wrappers for `node.get_value_metadata` and `node.get_value_timestamp` with fixture-backed wrapper tests
10. [x] Add specialized node event typing helpers (`value updated`, `metadata updated`, `notification`) and fixture-backed normalizer tests
11. [x] Add specialized driver/controller event typing helpers (`driver.logging`, controller NVM progress events) and fixture-backed normalizer tests
12. [x] Add in-process `ws` integration harness test covering real `WsTransport` + `ZwjsClient` handshake and command success/failure semantics
13. [x] Add typed read-only wrappers for `driver.get_log_config`, `driver.is_statistics_enabled`, and `node.get_supported_notification_events` with fixture-backed tests
7. [x] Validate expanded command/event coverage against real instance (read-only only)
8. [x] Add mutating-command layer (still protocol-oriented) with safety guards (separate phase)

### Read-only Validation Notes (2026-02-23, production instance `ws://192.168.1.15:3000`)
- Verified handshake path: `version` -> `set_api_schema(0)` -> `initialize({ schemaVersion: 0 })` -> `start_listening`
- Verified read-only wrappers succeed:
  - `driver.get_config`
  - `driver.get_log_config`
  - `driver.is_statistics_enabled`
  - `controller.get_state`
  - `controller.get_node_neighbors` (node `5`)
  - `node.get_state` (node `5`)
  - `node.get_defined_value_ids` (node `5`)
- `node.get_value` / `node.get_value_metadata` / `node.get_value_timestamp` were not executed in that run because no suitable `valueId` was derived from the sampled node payload path
- `node.get_supported_notification_events` returned a protocol failure for node `5` (command path works; node/feature support appears device-specific)
- Observed event stream included controller events and normalized generic events during listening

## Assumptions and Defaults
- WebSocket-first (not MQTT/REST) for v1
- Config passed by caller (Homey later, but client is caller-agnostic)
- Auto reconnect enabled by default
- Optional auth with bearer token support
- Generic typed protocol command path exists in v1
- Thin typed wrappers exist for selected read-only commands in v1
- Version-adaptive architecture with versioned normalizers
- `ws` package used for transport
- `file:../packages/core` dependency remains for now due npm `workspace:*` issue in this environment

## Current Direction (Confirmed)
- The core client is protocol-oriented (`zwave-js-server`), not Homey-oriented
- Homey integration remains a separate layer that consumes the protocol client

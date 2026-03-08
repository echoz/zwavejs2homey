# Homey Runtime API Contract (v1)

This document defines the current Homey app API contract used by settings/custom-view code.

## Envelope

All routes return:

```json
{
  "schemaVersion": "zwjs2homey-api/v1",
  "ok": true,
  "data": {},
  "error": null
}
```

Error responses keep the same shape:

```json
{
  "schemaVersion": "zwjs2homey-api/v1",
  "ok": false,
  "data": null,
  "error": {
    "code": "invalid-request",
    "message": "includeNoAction must be a boolean",
    "details": {
      "field": "includeNoAction",
      "expected": "boolean"
    }
  }
}
```

## Routes

- `GET /runtime/bridges`
  - query: none
  - returns read-only bridge inventory for app/settings surfaces:
    - bridge identity (`bridgeId`, Homey device id/name)
    - bridge configuration presence (`url`, auth type)
    - bridge runtime transport state (`transportConnected`, lifecycle/session details)
    - bridge diagnostics refresh telemetry (`diagnosticsRefresh.lastSuccessAt`, `lastFailureAt`, `lastFailureReason`, `lastReason`)
    - imported node count per bridge
- `GET /runtime/diagnostics`
  - query:
    - `homeyDeviceId` (optional string)
    - `bridgeId` (optional string)
  - response includes bridge-scoped diagnostics refresh telemetry:
    - `diagnosticsRefresh.lastSuccessAt`
    - `diagnosticsRefresh.lastFailureAt`
    - `diagnosticsRefresh.lastFailureReason`
    - `diagnosticsRefresh.lastReason`
- `GET /runtime/support-bundle`
  - query:
    - `homeyDeviceId` (optional string)
    - `bridgeId` (optional string)
    - `includeNoAction` (optional boolean-like string: `true|false|1|0|yes|no`)
  - used by:
    - settings UI "Export Support Bundle" action
- `GET /runtime/recommendations`
  - query:
    - `homeyDeviceId` (optional string)
    - `bridgeId` (optional string)
    - `includeNoAction` (optional boolean-like string: `true|false|1|0|yes|no`)
- `POST /runtime/recommendations/execute`
  - body:
    - `homeyDeviceId` (required non-empty string)
    - `action` (optional enum):
      - `auto`
      - `backfill-marker`
      - `adopt-recommended-baseline`
      - `none`
- `POST /runtime/recommendations/execute-batch`
  - body:
    - `homeyDeviceId` (optional string)
    - `bridgeId` (optional string)
    - `includeNoAction` (optional boolean-like string or boolean)
- `GET /runtime/extensions`
  - query:
    - `homeyDeviceId` (optional string)
    - `bridgeId` (optional string)
    - `includeUnmatched` (optional boolean-like string: `true|false|1|0|yes|no`)
  - returns:
    - registered profile-extension contracts (metadata only)
    - per-node match inventory (`matched` + explain reasons)
- `GET /runtime/extensions/read`
  - query:
    - `homeyDeviceId` (required non-empty string)
    - `extensionId` (required non-empty string)
  - returns:
    - extension contract details for the node context
    - match status/reason
    - read handler status (`implemented: false` until extension read handlers land)

Settings UI notes:

- Diagnostics/support-bundle scope can be narrowed by bridge (`Bridge Scope` selector).
- Configured bridge rows expose quick actions:
  - `Use Scope` to focus diagnostics/export on that bridge
  - `Help` to show per-bridge Device Settings/Repair navigation guidance

## Client Helper

Use `co.lazylabs.zwavejs2homey/runtime-api-client.js`:

- `createRuntimeApiClient(homeyApi)`
  - expects `homeyApi.api(method, uri, body?, callback)` facade
- returned methods:
  - `getRuntimeBridges()`
  - `getRuntimeDiagnostics(options?)`
  - `getRuntimeSupportBundle(options?)`
  - `getRecommendationActionQueue(options?)`
  - `executeRecommendationAction(options)`
  - `executeRecommendationActions(options?)`
  - `getProfileExtensions(options?)`
  - `getProfileExtensionRead(options)`

The helper unwraps success envelopes and throws `RuntimeApiClientError` for:

- envelope errors (`invalid-envelope`)
- route-declared errors (`invalid-request`, `invalid-action-selection`, ...)
- local argument validation errors (`invalid-argument`)

## Guard Rail

`co.lazylabs.zwavejs2homey/test/api-manifest-parity.test.ts` enforces API parity between:

- `.homeycompose/app.json`
- generated `app.json`
- exported route handlers in `co.lazylabs.zwavejs2homey/api.js`

## Smoke Command

Use the runtime smoke command to verify route reachability and envelope shape against a live Homey app:

```bash
npm run homey:runtime-api:smoke -- \
  --base-url http://HOMEY/api/app/co.lazylabs.zwavejs2homey \
  --bridge-id main \
  --token <homey-token> \
  --format table
```

Notes:

- It checks all runtime routes.
- It uses `--smoke-device-id` (default `__smoke_invalid__`) for execute-route calls to avoid side effects by default.

## Support Bundle Command

Use the support bundle command to capture a shareable snapshot of diagnostics + recommendation routes:

```bash
npm run homey:support-bundle -- \
  --base-url http://HOMEY/api/app/co.lazylabs.zwavejs2homey \
  --bridge-id main \
  --token <homey-token> \
  --format markdown \
  --output-file /tmp/zwjs2homey-support.md \
  --redact-share
```

Notes:

- This command is read-only.
- It calls:
  - `GET /runtime/support-bundle`
- `--bridge-id` scopes diagnostics/support-bundle snapshots to a specific bridge.
- `--redact-share` redacts sensitive text fields for safer external sharing.

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

- `GET /runtime/diagnostics`
  - query:
    - `homeyDeviceId` (optional string)
- `GET /runtime/support-bundle`
  - query:
    - `homeyDeviceId` (optional string)
    - `includeNoAction` (optional boolean-like string: `true|false|1|0|yes|no`)
  - used by:
    - settings UI "Export Support Bundle" action
- `GET /runtime/recommendations`
  - query:
    - `homeyDeviceId` (optional string)
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
    - `includeNoAction` (optional boolean-like string or boolean)

## Client Helper

Use `co.lazylabs.zwavejs2homey/runtime-api-client.js`:

- `createRuntimeApiClient(homeyApi)`
  - expects `homeyApi.api(method, uri, body?, callback)` facade
- returned methods:
  - `getRuntimeDiagnostics(options?)`
  - `getRuntimeSupportBundle(options?)`
  - `getRecommendationActionQueue(options?)`
  - `executeRecommendationAction(options)`
  - `executeRecommendationActions(options?)`

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
  --token <homey-token> \
  --format markdown \
  --output-file /tmp/zwjs2homey-support.md \
  --redact-share
```

Notes:

- This command is read-only.
- It calls:
  - `GET /runtime/support-bundle`
- `--redact-share` redacts sensitive text fields for safer external sharing.

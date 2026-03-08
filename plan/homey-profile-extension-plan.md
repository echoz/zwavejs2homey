# Homey Profile Extension Plan

## Goal

Add a reusable way for curated device profiles to expose advanced behavior that cannot be represented cleanly with system capabilities alone.

First concrete target: lock user-code management.

## Principles

- System capabilities remain the baseline contract.
- Extensions are additive and optional.
- Extensions are scoped by curated profile identity (`profileId` and/or `driverTemplateId`).
- Compiler remains focused on static profile/capability outputs; extension execution stays in adapter runtime.
- All extension actions are explicit, audited, and safety-constrained.

## Why This Exists

Some high-value domains need richer semantics than standard capability mapping:

- lock user-code slot management
- advanced cover calibration/programming
- thermostat schedule/program configuration
- advanced security/siren mode programming

Without an extension model, these become one-off app logic paths that drift over time.

## Extension Contract (Target Shape)

Read contract:

- extension id
- supported profile match predicates
- read-only data sections for custom panels
- diagnostics summary for unsupported/missing prerequisites

Action contract:

- explicit action id and argument schema
- dry-run/validate path where possible
- runtime safety gate (permission, capability, device state, writeability checks)
- deterministic result envelope (`ok`, `status`, `reason`, `details`)

## Progress

- Registry + schema slice is complete:
  - `co.lazylabs.zwavejs2homey/profile-extension.ts` now defines the
    `homey-profile-extension-contract/v1` contract.
  - registry validation enforces deterministic predicates, ids, and action
    schema shape.
  - matching now returns explainable reasons (`missing-*`, `*-mismatch`,
    `matched`) to support diagnostics and future UX messaging.
  - `co.lazylabs.zwavejs2homey/test/profile-extension.test.ts` covers route
    matching and validation failure semantics.
- Runtime API discovery/read slice is complete:
  - Homey runtime now exposes extension inventory/read methods:
    - `getProfileExtensionInventory(...)`
    - `getProfileExtensionRead(...)`
  - API routes are now available:
    - `GET /runtime/extensions`
    - `GET /runtime/extensions/read`
  - runtime API client now supports:
    - `getProfileExtensions(...)`
    - `getProfileExtensionRead(...)`
  - route/client/runtime tests now cover normalization and contract behavior.
- Runtime API action safety-gate slice is complete:
  - Homey runtime now exposes:
    - `executeProfileExtensionAction(...)`
  - API route is now available:
    - `POST /runtime/extensions/execute`
  - runtime API client now supports:
    - `executeProfileExtensionAction(...)`
  - action execution currently enforces strict preconditions:
    - extension + action registration
    - profile match
    - dry-run support checks
    - fail-closed safety checks (`requires-*`)
  - no write handlers are registered yet; action route returns deterministic
    `action-handler-not-implemented` after safety passes.
- Lock extension read slice is complete:
  - `getProfileExtensionRead(...)` now provides implemented read payloads for
    `lock-user-codes` when predicates match.
  - read payload includes:
    - user-code slot summary (`enabled` / `disabled` / `available` / `unknown`)
    - per-slot state rows with resolved state labels
    - lockout diagnostics (keypad-state probe + lockout-active heuristic)
    - warning codes when value probes fail
  - deterministic runtime reasons now include:
    - `bridge-client-unavailable`
    - `defined-value-ids-unavailable`
    - `user-code-slots-not-discovered`
    - `ok`
  - unsupported devices now return `supported: false` + `extension-not-matched`
    with `implemented: true` for this extension.
  - behavioral coverage expanded in:
    - `co.lazylabs.zwavejs2homey/test/app-runtime-refresh.test.ts`
- Lock extension action slice is complete:
  - registered lock action handlers in runtime:
    - `set-user-code`
    - `remove-user-code`
    - `set-user-code-state`
  - handlers now use shared lock slot resolution so read + write target selection
    is deterministic across runtime surfaces.
  - action execution now supports:
    - dry-run previews (`dry-run-preview` + planned writes)
    - live `node.set_value` writes when safety checks pass
  - deterministic action failure reasons include:
    - `slot-not-found`
    - `slot-code-write-target-missing`
    - `slot-status-write-target-missing`
    - `slot-state-write-value-unsupported`
    - `zwjs-write-failed`
  - behavioral coverage expanded in:
    - `co.lazylabs.zwavejs2homey/test/app-runtime-refresh.test.ts`
- UX slice is complete for the first extension vertical:
  - node Device Tools repair panel now consumes lock extension read payloads and
    renders lock user-code diagnostics.
  - panel now supports lock extension actions via existing timed repair handler:
    - set code
    - remove code
    - set state
  - extension actions are dispatched through the same Device Tools event channel
    with explicit `kind: extension` payloads.
  - dry-run preview mode is exposed in the panel for extension actions.
  - added driver/presenter behavioral coverage for extension snapshot/action
    wiring:
    - `co.lazylabs.zwavejs2homey/test/driver-harness.test.ts`
    - `co.lazylabs.zwavejs2homey/test/node-device-tools-presenter.test.ts`

## Slice Plan

1. Registry + schema slice

- add extension registry module in Homey app runtime
- define stable read/action contract types
- add unit tests for match routing and contract validation
  Status: completed

2. Runtime API slice

- expose extension discovery/read routes via app runtime API
- expose extension action execution route with strict validation
- add smoke tests and API contract coverage
  Status: completed

3. Lock extension read slice

- implement read-only Yale lock user-code snapshot panel payload
- include slot summary, enabled/disabled status, and lockout-related diagnostics
- no mutation yet
  Status: completed

4. Lock extension action slice

- implement safe user-code actions (set/update/remove/enable/disable)
- enforce explicit writeability + selector checks before writes
- surface clear failure reasons on unsupported lock variants
  Status: completed

5. UX slice

- wire node custom panel to extension read/action API
- keep system capability controls unchanged
- add contextual hints when extension is unavailable for that device
  Status: completed (lock-user-codes vertical)

6. Candidate inventory slice

- classify additional families needing extension paths
- document priority and prerequisites for each family

## Exit Criteria

- At least one production-useful extension vertical (lock user-code management) is shipped with tests.
- Extension paths are discoverable and deterministic through runtime API contracts.
- Adding a second extension family does not require ad-hoc architecture changes.

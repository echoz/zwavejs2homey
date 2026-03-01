# ADR 0022: Homey Device Class and Capability Mutation Policy (v1)

- Status: Accepted
- Date: 2026-03-01

## Context

Homey device class and capability set can be changed at runtime, but uncontrolled mutation risks:

- broken flows/automations
- unstable user experience after baseline/profile updates
- hard-to-debug device behavior drift

## Decision

In v1:

- node device class and initial capability set are established during import/first initialization from resolved profile
- automatic runtime class/capability mutation is disabled during normal telemetry/command handling
- class/capability structure changes are only applied through explicit user-driven curation/update workflows (for example repair/custom flow)

Update guidance:

- baseline recommendation changes do not auto-mutate device class/capabilities
- adapter prompts user to adopt a recommended update; apply only on explicit confirmation

## Consequences

Positive:

- stable runtime behavior for paired devices
- reduced risk of unexpected flow breakage
- clear operator control for structural profile changes

Tradeoffs:

- slower adoption of improved profiles without explicit user action
- additional UX work needed for explicit adopt/update flows

## Implementation Status (2026-03-01)

- node device initialization resolves/records classification metadata but does not call class or capability mutation APIs
- runtime mapping behavior remains non-structural in this slice (no auto-add/remove capability set changes)

# ADR 0001: Monorepo with Homey App Wrapper and Shared Core

- Status: Accepted
- Date: 2026-02-23

## Context

The project needs substantial non-Homey-specific logic (Z-Wave JS bridge behavior) while also shipping a Homey app with SDK-specific code.

## Decision

Use a monorepo-style layout:

- Shared core package in `packages/core`
- Homey app in `co.lazylabs.zwavejs2homey`
- Root workspace scripts for shared development tasks

## Consequences

Positive:

- Core logic can be tested and evolved independently of Homey SDK glue
- Clear boundaries reduce coupling
- Easier future reuse of core logic outside Homey

Tradeoffs:

- Workspace/package linking adds setup complexity
- Homey CLI scaffolding assumes nested app folder and may not be workspace-aware by default

# ADR 0021: Homey No-Profile-Match Runtime Policy (v1)

- Status: Accepted
- Date: 2026-03-01

## Context

Imported nodes may not match a compiled profile entry. We need deterministic behavior for:

- pairing/import continuation
- runtime safety
- curation workflow entry points

## Decision

When resolver returns no compiled profile match in v1:

- allow node import to proceed
- assign a minimal safe fallback runtime profile:
  - `homeyClass: "other"`
  - empty capability mappings by default
  - explicit uncurated diagnostics/reason (`no_compiled_profile_match`)
- surface a clear recommendation to run node curation workflow (repair/custom flow)

Hard-fail only when baseline artifact is globally unavailable/invalid (adapter startup degradation), not on per-node match miss.

## Consequences

Positive:

- unknown devices are still represented in Homey
- users can curate previously unsupported nodes without recompiling in-session
- aligns with static-compiler + adapter-curation boundary

Tradeoffs:

- imported no-match devices have limited utility until curated
- requires clear UX to avoid user confusion about initially empty capabilities

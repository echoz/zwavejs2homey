# ADR 0004: Generic Fallback Inference Is Adapter-Owned

- Status: Accepted
- Date: 2026-02-27

## Context

The compiler can infer generic fallback mappings, but broad fallback logic risks:

- overfitting to limited live networks
- rule complexity growth in compiler scope
- unclear ownership between compiler and Homey runtime behavior

## Decision

Set final ownership of generic fallback inference to the Homey adapter.

- Compiler remains static-first and focuses on portable curated outputs.
- Compiler generic rules stay minimal/provisional and must not become a runtime inference substitute.
- Unknown/partially mapped outcomes are acceptable compiler outputs and are resolved by adapter policy and user curation at runtime.

## Consequences

Positive:

- Stronger compiler scope discipline
- More predictable compiled artifacts
- Runtime inference can be tailored to Homey behavior without bloating compiler DSL/rules

Tradeoffs:

- Adapter implementation takes on more responsibility
- Requires clear adapter diagnostics so users can understand runtime fallback decisions

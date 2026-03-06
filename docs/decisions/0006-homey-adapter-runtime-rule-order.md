# ADR 0006: Homey Adapter Runtime Rule Order (v1)

- Status: Superseded by ADR 0023
- Date: 2026-02-27

## Context

We need a simple runtime model for adapter-owned behavior after compiler output is loaded, without introducing unnecessary manifest complexity.

## Decision

Adapter runtime rules use a fixed v1 pipeline with no separate adapter manifest:

1. compiled profile artifact (compiler output)
2. adapter generic inference rules (`fill`-oriented cleanup only)
3. adapter curation rules (final authority; can `replace`/`remove`)

Order is fixed: generic first, curation second.

## Consequences

Positive:

- Minimal runtime rule wiring in v1
- Clear and predictable override semantics (curation always wins)
- Avoids introducing another manifest system before needed

Tradeoffs:

- Less flexible than a fully declarative runtime rule graph
- If runtime layers grow, we may later need explicit runtime manifest/config

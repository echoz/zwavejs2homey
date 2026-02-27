# Rules Grammar

This document defines the compiler rule authoring grammar and vocabulary.

Scope:

- Applies to rule authoring inputs (`rules/**/*.json`)
- Does **not** change compiled profile output schema (`compiled-homey-profiles/v1`)

## Design Goals

- Static and deterministic (no runtime inference in the rule DSL)
- Layered precedence with explicit conflict behavior
- Authoring ergonomics with deterministic load-time expansion

## Decision Snapshot

Current design decisions:

- Compiler compile-time scope is manifest-owned (`rules/manifest.json`)
- Layer ownership for compiler rules is defined by manifest entries
- Rules outside the compiler manifest are runtime/Homey-adapter scope
- We are not introducing broad file-level rule defaults
  - use structured context instead (manifest layer + product target bundle)

## Canonical Rule Shape

Canonical internal rule model:

```json
{
  "ruleId": "string",
  "layer": "ha-derived | project-product | project-generic",
  "device": {},
  "value": {},
  "constraints": {},
  "actions": []
}
```

Canonical rule object:

- `ruleId`: stable unique identifier for provenance and diagnostics
- `layer`: precedence lane
- `device`: optional device matcher
- `value`: optional value matcher
- `constraints`: optional companion value requirements
- `actions`: one or more rule actions

Authoring inputs may be more compact, but must expand deterministically into this canonical model.

## Compile-Time Authoring File Formats

Manifest-scoped compile-time files use context-owned semantics:

- layer is defined by manifest entry
- rules in file are expanded into canonical internal rule objects

`project-product` authoring format (required):

- `product-rules/v1` single-target bundle
- one bundle/file per product triple
- optional bundle `name` for human-readable product description
- bundle target is inherited by all contained rules
- per-rule target override is not allowed

`ha-derived` and `project-generic` authoring:

- remains file-format specific to current tooling/generation path
- still expands to the same canonical internal rule objects

## Compiler Manifest Boundary

Compile-time rule files are selected by `rules/manifest.json`.

Manifest entries define:

- `filePath`
- `kind` (optional, e.g. generated HA-derived artifact)
- `layer` (compile precedence lane for that file)

Compiler behavior:

- only manifest-listed files are loaded for compile-time rule application
- layer precedence is controlled by manifest order + layer semantics
- canonical compiler workflows use manifest inputs (not ad-hoc per-file rule lists)
- per-rule `layer` fields are forbidden in manifest-scoped compile-time files (manifest is the only layer source)

Runtime/Homey-adapter behavior:

- non-manifest rules are considered adapter/runtime policy artifacts
- compiler does not assume or apply those runtime-only rules
- v1 adapter runtime order is generic inference first, then curation (curation wins)

## Matchers

### Device matcher

- `manufacturerId`
- `productType`
- `productId`
- `firmwareVersionRange.min` / `firmwareVersionRange.max`
- `deviceClassGeneric`
- `deviceClassSpecific`

### Value matcher

- `commandClass`
- `endpoint`
- `property`
- `propertyKey`
- `notPropertyKey`
- `metadataType`
- `readable`
- `writeable`

### Companion constraints

- `requiredValues[]`: all listed value matchers must exist
- `absentValues[]`: listed value matchers must be absent

## Actions

- `capability`
  - `capabilityId`
  - optional `inboundMapping`, `outboundMapping`, `flags`
  - optional `conflict`:
    - `key`: conflict group id
    - `mode`: `exclusive | allow-multi` (default `exclusive`)
    - `priority`: higher wins (default `50`)
- `device-identity`
  - `homeyClass`
  - `driverTemplateId`
- `ignore-value`
  - optional explicit `valueId`
- `remove-capability`
  - `capabilityId`

## Action Modes

- `fill` (default): set only when slot is empty
- `augment`: merge/update without hard replacement semantics
- `replace`: explicit replacement

Layer policy:

- `replace` is only allowed in `project-product`
- `ha-derived` and `project-generic` are non-destructive (`fill`/`augment`)

## Current Ergonomics

Matcher scalar shorthand is supported and normalized to canonical arrays at load time.

Examples:

- `"commandClass": 37` -> `"commandClass": [37]`
- `"property": "currentValue"` -> `"property": ["currentValue"]`
- `"manufacturerId": 29` -> `"manufacturerId": [29]`
- `"propertyKey": null` -> `"propertyKey": [null]`

Action shorthand is also supported with deterministic canonical expansion.

Examples:

- capability inbound mapping value-id shorthand:
  - `"inboundMapping": { "commandClass": 37, "property": "currentValue" }`
  - expands to:
    - `"inboundMapping": { "kind": "value", "selector": { "commandClass": 37, "property": "currentValue" } }`
- capability outbound mapping value-id shorthand:
  - `"outboundMapping": { "commandClass": 37, "property": "targetValue" }`
  - expands to:
    - `"outboundMapping": { "kind": "set_value", "target": { "commandClass": 37, "property": "targetValue" } }`
- capability inbound event shorthand:
  - `"inboundMapping": { "eventType": "notification.motion" }`
  - expands to:
    - `"inboundMapping": { "kind": "event", "selector": { "eventType": "notification.motion" } }`
- capability outbound command shorthand:
  - `"outboundMapping": { "command": "zwavejs/foo" }`
  - expands to:
    - `"outboundMapping": { "kind": "zwjs_command", "target": { "command": "zwavejs/foo" } }`
- device identity alias:
  - `"driverId": "product-29-66-2"` expands to `"driverTemplateId": "product-29-66-2"`

This expansion is deterministic and compile-time only.

## Layer Vocabulary and Authoring Context

Layer remains part of canonical rule semantics and diagnostics.

Authoring simplification direction:

- infer authoring layer from manifest file context
- keep canonical expanded form explicit (`layer`) for reports/tooling
- reject mixed/ambiguous layer usage in one compile-time file

## Recommended Product Rule Bundle Direction

For `project-product`, prefer one file per product target:

- top-level target product triple
- rules in that file inherit target context
- deterministic expansion to canonical per-rule `device` matcher
- no per-rule target override within the same bundle (v1)

This improves discoverability and keeps rule ownership obvious.

Decision status:

- this is now required for `project-product` authoring (`product-rules/v1`)

## Runtime Curation Bundle Direction (Adapter)

For adapter runtime curation (outside compiler manifest scope), prefer one file per target:

- known device target: product triple
- unknown device target: `diagnosticDeviceKey`
- curation entries in that file inherit target context
- no per-entry target override within the same bundle (v1)

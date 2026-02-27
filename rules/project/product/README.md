# Project Product Rules

Product-specific compiler rules live here.

These rules are layered after `ha-derived` and can use `fill`, `augment`, or explicit `replace` semantics.

Authoring format:

- `product-rules/v1` single-target bundles
- one file per product triple
- optional top-level `name` provides human-readable product label
- bundle `target` owns product matching context
- per-rule `layer`/`device` fields are not part of bundle authoring

Current files:

- `product-1120-2-136.json` (Shelly Wave Plug US)
- `product-622-17235-23089.json` (Springs Window Fashions CSZ1)
- `product-29-12801-1.json` (Leviton DZ6HD)
- `product-29-65-2.json` (Leviton ZW6HD)
- `product-29-13313-1.json` (Leviton DZ15S)
- `product-29-66-2.json` (Leviton ZW15S)
- `product-297-32770-1536.json` (Yale YRD226 family)

# Project Product Rules

Product-specific compiler rules live here.

These rules are layered after `ha-derived` and can use `fill`, `augment`, or explicit `replace` semantics.

Current state:

- `live-network-overrides.json`
  - `1120:2:136` (Shelly Wave Plug US): class/onoff normalization + meter power/energy mappings
  - `622:17235:23089` (Springs Window Fashions CSZ1): class/cover position normalization + battery capability preference

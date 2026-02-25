# Rules

This directory will hold the real compiler rule pipeline inputs.

Planned layout:

- `ha-derived/` (generated from Home Assistant extraction/translation)
- `project/generic/` (starter/provisional generic profile rules; adapter-owned fallback inference is under consideration)
- `project/product/` (our product-specific overrides)

Current state:

- Canonical layered manifest: `rules/manifest.json`
- HA-derived generated rules file checked in under `rules/ha-derived/`
- Initial project generic rules are checked in under `rules/project/generic/` as a baseline and may be trimmed once adapter-side fallback inference is finalized
- Product overrides directory is ready but currently empty
- Test fixtures under `packages/compiler/test/fixtures/` are still used for targeted compiler tests

# Rules

This directory will hold the real compiler rule pipeline inputs.

Planned layout:

- `ha-derived/` (generated from Home Assistant extraction/translation)
- `project/generic/` (our generic profile inference rules)
- `project/product/` (our product-specific overrides)

Current state:

- Canonical layered manifest: `rules/manifest.json`
- HA-derived generated rules file checked in under `rules/ha-derived/`
- Initial project generic rules checked in under `rules/project/generic/`
- Product overrides directory is ready but currently empty
- Test fixtures under `packages/compiler/test/fixtures/` are still used for targeted compiler tests

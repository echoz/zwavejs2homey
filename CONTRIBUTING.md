# Contributing

Thanks for helping improve `zwavejs2homey`.

This repo has two major contribution paths:

- code/tooling changes
- rule/profile curation changes

## Ground Rules

- Keep changes small and scoped.
- Add or update tests with every behavior change.
- Run full checks before opening a PR:
  - `npm run check`
- Keep docs and plans in sync when behavior changes:
  - `README.md`
  - `docs/architecture.md`
  - `docs/decisions/` (add/update ADRs for boundary/policy decisions)
  - `plan/current-sprint.md`
  - `plan/roadmap.md`

## Setup

From repo root:

```bash
npm install
npm run check
```

## Code Contributions

For code in `packages/*`, `tools/`, or Homey app runtime:

1. Implement the slice.
2. Add/adjust tests.
3. Run `npm run check`.
4. Update docs/plan entries if behavior changed.
5. Commit with a descriptive message.

## Rule and Profile Contributions

Rule changes should produce portable, reviewable evidence.

## Rule Contributor Quickstart (Recommended)

If you just want to contribute rules, use this loop:

1. Generate a curation backlog from live data:

```bash
npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --curation-backlog-json-file /tmp/curation-backlog.json
```

2. Pick the next target signature:

```bash
npm run compiler:backlog -- next --input-file /tmp/curation-backlog.json --candidate-policy curation --format summary
```

3. Generate a starter product bundle:

```bash
npm run compiler:backlog -- scaffold --input-file /tmp/curation-backlog.json --signature <manufacturer:productType:productId> --product-name "Vendor Model" --format json-pretty
```

4. Save scaffold output to:

- `rules/project/product/product-<manufacturer>-<productType>-<productId>.json`

5. Add the new file to `rules/manifest.json` with layer `project-product`.

6. Iterate quickly on one signature:

```bash
npm run compiler:loop -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --signature <manufacturer:productType:productId>
```

7. Final verify:

```bash
npm run check
```

### Minimal `product-rules/v1` Example

```json
{
  "schemaVersion": "product-rules/v1",
  "name": "Vendor Model",
  "target": {
    "manufacturerId": 29,
    "productType": 66,
    "productId": 2
  },
  "rules": [
    {
      "ruleId": "product-29-66-2-identity",
      "value": {
        "commandClass": 37,
        "property": "currentValue",
        "readable": true
      },
      "actions": [
        {
          "type": "device-identity",
          "mode": "replace",
          "homeyClass": "socket",
          "driverTemplateId": "product-29-66-2"
        }
      ]
    }
  ]
}
```

### 1) Start from Stable Device Identity

Use product signature:

- `manufacturerId:productType:productId`

This is the key for portable curated profile rules.

### 2) Collect Evidence (Read-Only)

Useful commands:

```bash
npm run zwjs:inspect -- nodes list --url ws://HOST:PORT --format table
npm run zwjs:inspect -- nodes show <nodeId> --url ws://HOST:PORT --format json --include-values full
npm run compiler:inspect-live -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json --format list
```

### 3) Edit Rules in the Correct Layer

- Product-specific curated overrides:
  - `rules/project/product/*.json` using `product-rules/v1` single-target bundle format
- Generic fallback rules (minimal, fill-only policy):
  - `rules/project/generic/*.json`
- HA-generated rules are generated artifacts:
  - `rules/ha-derived/home-assistant.zwave_js.generated.json`

Compiler boundary:

- Add compile-time rule files to `rules/manifest.json`.
- Only manifest-listed rule files are compiler inputs.
- Rules not listed in the compiler manifest are runtime/Homey-adapter scope.
- Prefer manifest-driven commands (`--manifest-file` or default manifest) for canonical compile/validate workflows.
- For manifest-scoped compile-time files, do not set per-rule `layer`; layer is owned by manifest entry.
- For product bundles, target is owned by bundle context; do not set per-rule target overrides.

Backlog mental model:

- `compiler:validate-live --curation-backlog-json-file ...` creates ranked curation work.
- `compiler:backlog summary` shows current queue.
- `compiler:backlog next` selects the next signature to work on.
- `compiler:backlog scaffold` generates a starting product bundle.
- `compiler:loop` runs one signature end-to-end while iterating.

### 4) Add Portable Regression Coverage

For curated rule additions/fixes:

- Add/update fixture-based tests in `packages/compiler/test/`.
- Assert expected compiled outcome (class/capabilities/mappings), not only “no error”.
- Prefer fixture-driven assertions over local baseline artifacts.

### 5) Validate End-to-End

Run:

```bash
npm run check
```

Optional maintainer/local checks:

```bash
npm run compiler:validate-live -- --url ws://HOST:PORT --all-nodes --manifest-file rules/manifest.json
```

## Baselines and Privacy

Live baseline artifacts are environment-specific operational data.

- Keep local baselines out of shared commits.
- Do not commit private hostnames/IPs, tokens, or sensitive node naming.
- Treat `plan/baselines/` and similar live outputs as local QA artifacts unless explicitly requested.

## PR Checklist

- [ ] Scope is focused and intentional
- [ ] Tests updated and passing
- [ ] `npm run check` passes
- [ ] Docs/plans updated for behavior changes
- [ ] Rule changes include portable fixture-backed coverage
- [ ] No accidental private live artifacts committed

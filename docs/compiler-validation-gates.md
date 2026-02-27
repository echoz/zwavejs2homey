# Compiler Validation Gates

This document explains how to configure `compiler:validate-live` quality gates so live validation is repeatable and catches meaningful regressions.

## Purpose

`compiler:validate-live` already produces:

- compiled artifact JSON
- human-readable markdown report
- optional machine summary JSON

Gates add pass/fail rules on top of that output. They are useful even before CI, because they make "good enough" explicit and easy to re-run locally.

## Quick Start

Run without gates first:

```bash
npm run compiler:validate-live -- \
  --url ws://HOST:PORT \
  --all-nodes \
  --manifest-file rules/manifest.json \
  --artifact-file /tmp/compiled-live.json \
  --report-file /tmp/compiled-live.validation.md \
  --summary-json-file /tmp/compiled-live.summary.json
```

Then inspect `/tmp/compiled-live.summary.json`:

- `counts.reviewNodes`
- `counts.genericNodes`
- `counts.emptyNodes`
- `counts.reasons` (reason histogram)

## Choosing Stable Thresholds

Use this process:

1. Run validation 5 to 10 times on a known-good network state.
2. Record min/max values for review/generic/empty counts.
3. Set thresholds slightly above the observed max (small buffer).
4. Re-test after major rule changes.

Pragmatic initial defaults:

- `--max-empty-nodes 0`
- `--max-generic-nodes <baseline + 1>`
- `--max-review-nodes <baseline + 2>`

After this is stable, add hard-stop reasons:

- `--fail-on-reason known-device-unmapped`

Only add `--fail-on-reason` entries that should always fail if they appear.

## Gate Command Example

```bash
npm run compiler:validate-live -- \
  --url ws://HOST:PORT \
  --all-nodes \
  --manifest-file rules/manifest.json \
  --artifact-file /tmp/compiled-live.json \
  --report-file /tmp/compiled-live.validation.md \
  --summary-json-file /tmp/compiled-live.summary.json \
  --max-review-nodes 5 \
  --max-generic-nodes 2 \
  --max-empty-nodes 0 \
  --fail-on-reason known-device-unmapped
```

When a gate is violated, command exits non-zero and prints each violation, but still writes artifact/report/summary files for triage.

## Gate Profile File

You can store gate/output settings in JSON and pass one flag:

```bash
npm run compiler:validate-live -- \
  --url ws://HOST:PORT \
  --all-nodes \
  --manifest-file rules/manifest.json \
  --gate-profile-file plan/validation-gates.example.json
```

Supported profile fields:

- `maxReviewNodes`
- `maxGenericNodes`
- `maxEmptyNodes`
- `maxReviewDelta`
- `maxGenericDelta`
- `maxEmptyDelta`
- `failOnReasons` (array of strings)
- `failOnReasonDeltas` (object map: reason -> max delta)
- `baselineSummaryJsonFile`
- `artifactFile`
- `reportFile`
- `summaryJsonFile`

Precedence is deterministic:

1. CLI flags win (`--max-review-nodes`, `--artifact-file`, etc.)
2. `--gate-profile-file` values are used when CLI flags are not set
3. Tool defaults are used when neither is provided

`artifactFile`/`reportFile`/`summaryJsonFile` may be absolute or relative. Relative paths are resolved from the profile file directory.

For diagnostics, add:

```bash
--print-effective-gates
```

This prints the final merged gate/output config (CLI > profile > defaults) before validation runs.

If you already have a compiled artifact, you can skip rebuild during gate tuning:

```bash
npm run compiler:validate-live -- \
  --url ws://HOST:PORT \
  --all-nodes \
  --compiled-file /tmp/compiled-live.json \
  --gate-profile-file plan/validation-gates.example.json \
  --print-effective-gates
```

For regression gating, compare against a baseline summary:

```bash
npm run compiler:validate-live -- \
  --url ws://HOST:PORT \
  --all-nodes \
  --baseline-summary-json-file /tmp/compiled-live.baseline.summary.json \
  --max-review-delta 1 \
  --max-generic-delta 0 \
  --max-empty-delta 0 \
  --fail-on-reason-delta known-device-unmapped:0
```

Delta gates fail only when current counts increase above baseline by more than the configured delta.

For fully offline gate tuning (no ZWJS connection), replay gates from an existing summary JSON:

```bash
npm run compiler:validate-live -- \
  --input-summary-json-file /tmp/compiled-live.summary.json \
  --gate-profile-file plan/validation-gates.example.json \
  --print-effective-gates
```

Optional:

- add `--summary-json-file /tmp/compiled-live.summary.recheck.json` to write a refreshed summary with updated gate results
- add `--baseline-summary-json-file /tmp/compiled-live.baseline.summary.json` and any `--max-*-delta` / `--fail-on-reason-delta` gates for offline regression checks

## Suggested Workflow

1. Keep one baseline summary JSON per network snapshot in `plan/` or `docs/`.
2. Update thresholds only when network composition or mapping policy changes.
3. Treat threshold changes as reviewed config changes, not routine edits.

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
- `artifactRetention` (`keep` or `delete-on-pass`)
- `redactShare` (boolean)
- `failOnReasons` (array of strings)
- `failOnReasonDeltas` (object map: reason -> max delta)
- `baselineSummaryJsonFile`
- `artifactFile`
- `reportFile`
- `summaryJsonFile`
- `curationBacklogJsonFile`
- `redactedReportFile`
- `redactedSummaryJsonFile`
- `redactedCurationBacklogJsonFile`

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

When baseline mode is enabled for live/compiled validation runs, markdown output also includes:

- `Baseline Delta` table (review/generic/empty baseline vs current vs delta)
- `Reason Deltas` table for configured reason-delta checks

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
- add `--save-baseline-summary-json-file /tmp/compiled-live.baseline.summary.json` to save the current run as a new baseline snapshot
- add `--artifact-retention delete-on-pass` to auto-delete generated compiled artifacts when validation passes
- add `--redact-share` to emit PR-safe markdown/summary artifacts with URL/path/node-identity redaction
- use `--redacted-report-file` / `--redacted-summary-json-file` / `--redacted-curation-backlog-json-file` to control where redacted outputs are written
- add `--curation-backlog-json-file /tmp/compiled-live.curation-backlog.json` to write a ranked per-signature curation queue for rule authoring

## Baseline Helper Command

For maintainers, `compiler:baseline` wraps baseline capture + immediate recheck:

```bash
npm run compiler:baseline -- \
  --url ws://HOST:PORT \
  --all-nodes \
  --manifest-file rules/manifest.json
```

Default behavior:

- writes timestamped outputs under `plan/baselines/`
- captures baseline summary snapshot
- runs recheck against that baseline with strict zero deltas (`max * delta = 0`)
- defaults artifact retention to `delete-on-pass` to avoid large compiled-file buildup
- supports `--redact-share` to emit baseline/recheck redacted markdown/summary outputs in one workflow
- supports `--emit-curation-backlog` to emit baseline/recheck curation backlog JSON artifacts in one workflow
- supports stage-specific redacted output overrides:
  - `--baseline-redacted-report-file`
  - `--baseline-redacted-summary-json-file`
  - `--baseline-redacted-curation-backlog-json-file`
  - `--recheck-redacted-report-file`
  - `--recheck-redacted-summary-json-file`
  - `--recheck-redacted-curation-backlog-json-file`
- supports stage-specific backlog output overrides:
  - `--baseline-curation-backlog-json-file`
  - `--recheck-curation-backlog-json-file`

## Suggested Workflow

1. Keep one baseline summary JSON per network snapshot in `plan/` or `docs/`.
2. Update thresholds only when network composition or mapping policy changes.
3. Treat threshold changes as reviewed config changes, not routine edits.
4. Use backlog consumers to prioritize curation work:
   - `npm run compiler:backlog -- summary --input-file /tmp/compiled-live.curation-backlog.json --format list`
   - `npm run compiler:backlog -- diff --from-file /tmp/baseline.curation-backlog.json --to-file /tmp/current.curation-backlog.json --only worsened --format markdown`
   - `npm run compiler:backlog -- scaffold --input-file /tmp/compiled-live.curation-backlog.json --signature <manufacturer:productType:productId> --format json-pretty`

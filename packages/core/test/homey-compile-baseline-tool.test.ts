const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/homey-compile-baseline-lib.mjs');
}

test('parseCliArgs validates baseline workflow inputs', async () => {
  const { parseCliArgs } = await loadLib();

  assert.equal(parseCliArgs(['--all-nodes']).ok, false);
  assert.equal(parseCliArgs(['--url', 'ws://x']).ok, false);
  assert.equal(parseCliArgs(['--url', 'ws://x', '--all-nodes', '--node', '5']).ok, false);
  assert.equal(
    parseCliArgs([
      '--url',
      'ws://x',
      '--all-nodes',
      '--manifest-file',
      'm.json',
      '--rules-file',
      'r.json',
    ]).ok,
    false,
  );
  assert.equal(
    parseCliArgs(['--url', 'ws://x', '--all-nodes', '--artifact-retention', 'bad']).ok,
    false,
  );
  assert.equal(
    parseCliArgs(['--url', 'ws://x', '--all-nodes', '--fail-on-reason-delta', 'broken']).ok,
    false,
  );
  assert.equal(parseCliArgs(['--url', 'ws://x', '--all-nodes', '--unknown-flag']).ok, false);
  assert.equal(
    parseCliArgs(['--url', 'ws://x', '--all-nodes', '--emit-curation-backlog']).ok,
    false,
  );

  const parsed = parseCliArgs(['--url', 'ws://x', '--all-nodes'], {
    nowDate: new Date('2026-02-27T00:00:00.000Z'),
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.stamp, '2026-02-27');
  assert.equal(parsed.command.artifactRetention, 'delete-on-pass');
  assert.equal(parsed.command.maxReviewDelta, 0);
  assert.equal(parsed.command.maxGenericDelta, 0);
  assert.equal(parsed.command.maxEmptyDelta, 0);
  assert.equal(parsed.command.redactShare, false);
  assert.equal(parsed.command.baselineRedactedReportFile, undefined);
  assert.equal(parsed.command.baselineRedactedSummaryJsonFile, undefined);
  assert.equal(parsed.command.recheckRedactedReportFile, undefined);
  assert.equal(parsed.command.recheckRedactedSummaryJsonFile, undefined);
  assert.equal(parsed.command.skipRecheck, false);
  assert.equal(parsed.command.outputDir.endsWith(path.join('plan', 'baselines')), true);

  const parsedExplicit = parseCliArgs([
    '--url',
    'ws://x',
    '--node',
    '9',
    '--output-dir',
    '/tmp/baselines',
    '--stamp',
    'run-a',
    '--artifact-retention',
    'keep',
    '--max-review-delta',
    '2',
    '--max-generic-delta',
    '1',
    '--max-empty-delta',
    '0',
    '--fail-on-reason-delta',
    'known-device-unmapped:0',
    '--skip-recheck',
  ]);
  assert.equal(parsedExplicit.ok, true);
  assert.equal(parsedExplicit.command.nodeId, 9);
  assert.equal(parsedExplicit.command.outputDir, '/tmp/baselines');
  assert.equal(parsedExplicit.command.stamp, 'run-a');
  assert.equal(parsedExplicit.command.artifactRetention, 'keep');
  assert.equal(parsedExplicit.command.maxReviewDelta, 2);
  assert.equal(parsedExplicit.command.maxGenericDelta, 1);
  assert.equal(parsedExplicit.command.maxEmptyDelta, 0);
  assert.deepEqual(parsedExplicit.command.failOnReasonDeltaSpecs, ['known-device-unmapped:0']);
  assert.equal(parsedExplicit.command.skipRecheck, true);

  const parsedRedaction = parseCliArgs([
    '--url',
    'ws://x',
    '--all-nodes',
    '--redact-share',
    '--baseline-redacted-report-file',
    '/tmp/base.redacted.md',
    '--baseline-redacted-summary-json-file',
    '/tmp/base.redacted.json',
    '--recheck-redacted-report-file',
    '/tmp/recheck.redacted.md',
    '--recheck-redacted-summary-json-file',
    '/tmp/recheck.redacted.json',
  ]);
  assert.equal(parsedRedaction.ok, true);
  assert.equal(parsedRedaction.command.redactShare, true);
  assert.equal(parsedRedaction.command.baselineRedactedReportFile, '/tmp/base.redacted.md');
  assert.equal(parsedRedaction.command.baselineRedactedSummaryJsonFile, '/tmp/base.redacted.json');
  assert.equal(parsedRedaction.command.recheckRedactedReportFile, '/tmp/recheck.redacted.md');
  assert.equal(
    parsedRedaction.command.recheckRedactedSummaryJsonFile,
    '/tmp/recheck.redacted.json',
  );

  assert.equal(
    parseCliArgs([
      '--url',
      'ws://x',
      '--all-nodes',
      '--baseline-redacted-report-file',
      '/tmp/base.redacted.md',
    ]).ok,
    false,
  );
  assert.equal(
    parseCliArgs([
      '--url',
      'ws://x',
      '--all-nodes',
      '--skip-recheck',
      '--recheck-redacted-report-file',
      '/tmp/recheck.redacted.md',
    ]).ok,
    false,
  );
});

test('runBaselineWorkflowCommand orchestrates baseline capture and recheck', async () => {
  const { runBaselineWorkflowCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-baseline-tool-'));
  const parseCalls = [];
  const runCalls = [];
  const logs = [];

  const result = await runBaselineWorkflowCommand(
    {
      url: 'ws://x',
      token: undefined,
      schemaVersion: 0,
      allNodes: true,
      nodeId: undefined,
      includeValues: 'summary',
      maxValues: 100,
      includeControllerNodes: false,
      manifestFile: '/tmp/manifest.json',
      rulesFiles: [],
      catalogFile: undefined,
      gateProfileFile: '/tmp/gates.json',
      outputDir: tmpDir,
      stamp: '2026-02-27',
      artifactRetention: 'delete-on-pass',
      redactShare: false,
      baselineRedactedReportFile: undefined,
      baselineRedactedSummaryJsonFile: undefined,
      recheckRedactedReportFile: undefined,
      recheckRedactedSummaryJsonFile: undefined,
      maxReviewDelta: 0,
      maxGenericDelta: 0,
      maxEmptyDelta: 0,
      failOnReasonDeltaSpecs: ['known-device-unmapped:0'],
      top: 5,
      skipRecheck: false,
      printEffectiveGates: false,
    },
    { log: (line) => logs.push(line) },
    {
      parseValidateLiveCliImpl: (argv) => {
        parseCalls.push(argv);
        const getValue = (flag) => {
          const index = argv.indexOf(flag);
          return index >= 0 ? argv[index + 1] : undefined;
        };
        return {
          ok: true,
          command: {
            artifactFile: getValue('--artifact-file'),
            reportFile: getValue('--report-file'),
            summaryJsonFile: getValue('--summary-json-file'),
            baselineSummaryJsonFile: getValue('--baseline-summary-json-file'),
          },
        };
      },
      runValidateLiveCommandImpl: async (command) => {
        runCalls.push(command);
        return { gateResult: { passed: true } };
      },
    },
  );

  assert.equal(parseCalls.length, 2);
  assert.equal(runCalls.length, 2);
  assert.equal(parseCalls[0].includes('--save-baseline-summary-json-file'), true);
  assert.equal(parseCalls[1].includes(path.join(tmpDir, '2026-02-27.baseline.summary.json')), true);
  assert.equal(parseCalls[1].includes('--max-review-delta'), true);
  assert.equal(parseCalls[1].includes('--gate-profile-file'), true);
  assert.equal(parseCalls[1].includes('--fail-on-reason-delta'), true);
  assert.equal(result.paths.baselineSnapshot.endsWith('2026-02-27.baseline.summary.json'), true);
  assert.equal(result.paths.recheckSummary.endsWith('2026-02-27.recheck.summary.json'), true);
  assert.equal(
    logs.some((line) => /Running baseline capture/.test(line)),
    true,
  );
  assert.equal(
    logs.some((line) => /Running baseline recheck/.test(line)),
    true,
  );
});

test('runBaselineWorkflowCommand passes redacted output args to validate-live stages', async () => {
  const { runBaselineWorkflowCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-baseline-redact-'));
  const parseCalls = [];

  await runBaselineWorkflowCommand(
    {
      url: 'ws://x',
      token: undefined,
      schemaVersion: 0,
      allNodes: true,
      nodeId: undefined,
      includeValues: 'summary',
      maxValues: 100,
      includeControllerNodes: false,
      manifestFile: '/tmp/manifest.json',
      rulesFiles: [],
      catalogFile: undefined,
      gateProfileFile: undefined,
      outputDir: tmpDir,
      stamp: '2026-02-27',
      artifactRetention: 'delete-on-pass',
      redactShare: true,
      baselineRedactedReportFile: undefined,
      baselineRedactedSummaryJsonFile: undefined,
      recheckRedactedReportFile: '/tmp/recheck-custom.redacted.md',
      recheckRedactedSummaryJsonFile: '/tmp/recheck-custom.redacted.json',
      maxReviewDelta: 0,
      maxGenericDelta: 0,
      maxEmptyDelta: 0,
      failOnReasonDeltaSpecs: [],
      top: 5,
      skipRecheck: false,
      printEffectiveGates: false,
    },
    { log: () => {} },
    {
      parseValidateLiveCliImpl: (argv) => {
        parseCalls.push(argv);
        return { ok: true, command: {} };
      },
      runValidateLiveCommandImpl: async () => ({ gateResult: { passed: true } }),
    },
  );

  assert.equal(parseCalls.length, 2);
  assert.equal(parseCalls[0].includes('--redact-share'), true);
  assert.equal(parseCalls[0].includes('--redacted-report-file'), true);
  assert.equal(parseCalls[0].includes('--redacted-summary-json-file'), true);
  assert.equal(
    parseCalls[0].includes(path.join(tmpDir, '2026-02-27.validation.redacted.md')),
    true,
  );
  assert.equal(parseCalls[0].includes(path.join(tmpDir, '2026-02-27.summary.redacted.json')), true);
  assert.equal(parseCalls[1].includes('--redact-share'), true);
  assert.equal(parseCalls[1].includes('/tmp/recheck-custom.redacted.md'), true);
  assert.equal(parseCalls[1].includes('/tmp/recheck-custom.redacted.json'), true);
});

test('runBaselineWorkflowCommand supports skip-recheck', async () => {
  const { runBaselineWorkflowCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-baseline-skip-'));
  let runCount = 0;

  await runBaselineWorkflowCommand(
    {
      url: 'ws://x',
      token: undefined,
      schemaVersion: 0,
      allNodes: true,
      nodeId: undefined,
      includeValues: 'summary',
      maxValues: 100,
      includeControllerNodes: false,
      manifestFile: undefined,
      rulesFiles: ['/tmp/rules.json'],
      catalogFile: undefined,
      gateProfileFile: undefined,
      outputDir: tmpDir,
      stamp: 's',
      artifactRetention: 'delete-on-pass',
      redactShare: false,
      baselineRedactedReportFile: undefined,
      baselineRedactedSummaryJsonFile: undefined,
      recheckRedactedReportFile: undefined,
      recheckRedactedSummaryJsonFile: undefined,
      maxReviewDelta: 0,
      maxGenericDelta: 0,
      maxEmptyDelta: 0,
      failOnReasonDeltaSpecs: [],
      top: 5,
      skipRecheck: true,
      printEffectiveGates: false,
    },
    { log: () => {} },
    {
      parseValidateLiveCliImpl: () => ({ ok: true, command: {} }),
      runValidateLiveCommandImpl: async () => {
        runCount += 1;
        return { gateResult: { passed: true } };
      },
    },
  );

  assert.equal(runCount, 1);
});

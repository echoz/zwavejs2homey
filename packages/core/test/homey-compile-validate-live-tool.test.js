const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/homey-compile-validate-live-lib.mjs');
}

const fixturesDir = path.join(__dirname, '../../compiler/test/fixtures');

test('parseCliArgs validates required live inputs and rules source modes', async () => {
  const { parseCliArgs } = await loadLib();

  assert.equal(parseCliArgs(['--all-nodes']).ok, false);
  assert.equal(parseCliArgs(['--url', 'ws://x']).ok, false);
  assert.equal(parseCliArgs(['--url', 'ws://x', '--all-nodes', '--node', '7']).ok, false);
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

  const parsedDefault = parseCliArgs(['--url', 'ws://x', '--all-nodes'], {
    defaultManifestFile: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
  });
  assert.equal(parsedDefault.ok, true);
  assert.equal(parsedDefault.command.ruleInputMode, 'default-manifest');
  assert.match(parsedDefault.command.manifestFile, /rule-manifest-with-ha-generated\.json$/);

  const parsedExplicit = parseCliArgs([
    '--url',
    'ws://x',
    '--node',
    '5',
    '--rules-file',
    'rules-a.json',
    '--rules-file',
    'rules-b.json',
    '--artifact-file',
    '/tmp/live-compiled.json',
    '--report-file',
    '/tmp/live-compiled.validation.md',
    '--top',
    '7',
  ]);
  assert.equal(parsedExplicit.ok, true);
  assert.equal(parsedExplicit.command.nodeId, 5);
  assert.equal(parsedExplicit.command.manifestFile, undefined);
  assert.equal(parsedExplicit.command.rulesFiles.length, 2);
  assert.equal(parsedExplicit.command.top, 7);
  assert.equal(parsedExplicit.command.printEffectiveGates, false);

  const parsedCompiledFile = parseCliArgs([
    '--url',
    'ws://x',
    '--all-nodes',
    '--compiled-file',
    '/tmp/compiled.json',
  ]);
  assert.equal(parsedCompiledFile.ok, true);
  assert.equal(parsedCompiledFile.command.ruleInputMode, 'compiled-file');
  assert.equal(parsedCompiledFile.command.manifestFile, undefined);
  assert.deepEqual(parsedCompiledFile.command.rulesFiles, []);
  assert.equal(parsedCompiledFile.command.compiledFile, '/tmp/compiled.json');
  assert.equal(parsedCompiledFile.command.artifactFile, '/tmp/compiled.json');

  const parsedSummaryInput = parseCliArgs([
    '--input-summary-json-file',
    '/tmp/compiled-live.summary.json',
    '--baseline-summary-json-file',
    '/tmp/compiled-live.baseline.summary.json',
    '--max-review-nodes',
    '3',
    '--max-review-delta',
    '1',
    '--fail-on-reason-delta',
    'known-device-unmapped:0',
  ]);
  assert.equal(parsedSummaryInput.ok, true);
  assert.equal(parsedSummaryInput.command.ruleInputMode, 'summary-input');
  assert.equal(parsedSummaryInput.command.inputSummaryJsonFile, '/tmp/compiled-live.summary.json');
  assert.equal(
    parsedSummaryInput.command.baselineSummaryJsonFile,
    '/tmp/compiled-live.baseline.summary.json',
  );
  assert.equal(parsedSummaryInput.command.url, undefined);
  assert.equal(parsedSummaryInput.command.artifactFile, undefined);
  assert.equal(parsedSummaryInput.command.reportFile, undefined);
  assert.equal(parsedSummaryInput.command.maxReviewNodes, 3);
  assert.equal(parsedSummaryInput.command.maxReviewDelta, 1);
  assert.deepEqual(parsedSummaryInput.command.failOnReasonDeltas, {
    'known-device-unmapped': 0,
  });

  assert.equal(
    parseCliArgs([
      '--input-summary-json-file',
      '/tmp/compiled-live.summary.json',
      '--fail-on-reason-delta',
      'broken',
    ]).ok,
    false,
  );

  assert.equal(
    parseCliArgs([
      '--input-summary-json-file',
      '/tmp/compiled-live.summary.json',
      '--url',
      'ws://x',
    ]).ok,
    false,
  );

  assert.equal(
    parseCliArgs([
      '--url',
      'ws://x',
      '--all-nodes',
      '--compiled-file',
      '/tmp/compiled.json',
      '--manifest-file',
      'rules/manifest.json',
    ]).ok,
    false,
  );
  assert.equal(
    parseCliArgs([
      '--url',
      'ws://x',
      '--all-nodes',
      '--compiled-file',
      '/tmp/compiled.json',
      '--artifact-file',
      '/tmp/other.json',
    ]).ok,
    false,
  );
  assert.equal(
    parseCliArgs(['--url', 'ws://x', '--all-nodes', '--max-review-nodes', '-1']).ok,
    false,
  );
  const parsedGates = parseCliArgs([
    '--url',
    'ws://x',
    '--all-nodes',
    '--summary-json-file',
    '/tmp/live.summary.json',
    '--max-review-nodes',
    '4',
    '--max-generic-nodes',
    '2',
    '--max-empty-nodes',
    '0',
    '--fail-on-reason',
    'known-device-generic-fallback',
    '--fail-on-reason',
    'no-meaningful-mapping',
  ]);
  assert.equal(parsedGates.ok, true);
  assert.equal(parsedGates.command.maxReviewNodes, 4);
  assert.equal(parsedGates.command.maxGenericNodes, 2);
  assert.equal(parsedGates.command.maxEmptyNodes, 0);
  assert.deepEqual(parsedGates.command.failOnReasons, [
    'known-device-generic-fallback',
    'no-meaningful-mapping',
  ]);
  assert.match(parsedGates.command.summaryJsonFile, /live\.summary\.json$/);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-validate-live-parse-'));
  const gateProfileDir = path.join(tmpDir, 'gates');
  fs.mkdirSync(path.join(gateProfileDir, 'output'), { recursive: true });
  const gateProfileFile = path.join(gateProfileDir, 'profile.json');
  fs.writeFileSync(
    gateProfileFile,
    JSON.stringify(
      {
        maxReviewNodes: 6,
        maxGenericNodes: 3,
        maxEmptyNodes: 1,
        maxReviewDelta: 2,
        maxGenericDelta: 1,
        maxEmptyDelta: 0,
        failOnReasons: ['known-device-unmapped'],
        failOnReasonDeltas: {
          'known-device-unmapped': 0,
        },
        baselineSummaryJsonFile: './output/baseline.summary.json',
        artifactFile: './output/artifact.json',
        reportFile: './output/report.md',
        summaryJsonFile: './output/summary.json',
      },
      null,
      2,
    ),
    'utf8',
  );

  const parsedFromGateProfile = parseCliArgs(
    ['--url', 'ws://x', '--all-nodes', '--gate-profile-file', gateProfileFile],
    {
      defaultManifestFile: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
    },
  );
  assert.equal(parsedFromGateProfile.ok, true);
  assert.equal(parsedFromGateProfile.command.gateProfileFile, gateProfileFile);
  assert.equal(parsedFromGateProfile.command.maxReviewNodes, 6);
  assert.equal(parsedFromGateProfile.command.maxGenericNodes, 3);
  assert.equal(parsedFromGateProfile.command.maxEmptyNodes, 1);
  assert.equal(parsedFromGateProfile.command.maxReviewDelta, 2);
  assert.equal(parsedFromGateProfile.command.maxGenericDelta, 1);
  assert.equal(parsedFromGateProfile.command.maxEmptyDelta, 0);
  assert.deepEqual(parsedFromGateProfile.command.failOnReasons, ['known-device-unmapped']);
  assert.deepEqual(parsedFromGateProfile.command.failOnReasonDeltas, {
    'known-device-unmapped': 0,
  });
  assert.equal(
    parsedFromGateProfile.command.baselineSummaryJsonFile,
    path.join(gateProfileDir, 'output', 'baseline.summary.json'),
  );
  assert.equal(
    parsedFromGateProfile.command.artifactFile,
    path.join(gateProfileDir, 'output', 'artifact.json'),
  );
  assert.equal(
    parsedFromGateProfile.command.reportFile,
    path.join(gateProfileDir, 'output', 'report.md'),
  );
  assert.equal(
    parsedFromGateProfile.command.summaryJsonFile,
    path.join(gateProfileDir, 'output', 'summary.json'),
  );

  const parsedGateProfileCliOverride = parseCliArgs(
    [
      '--url',
      'ws://x',
      '--all-nodes',
      '--gate-profile-file',
      gateProfileFile,
      '--artifact-file',
      '/tmp/override-artifact.json',
      '--max-review-nodes',
      '2',
      '--max-review-delta',
      '0',
      '--fail-on-reason',
      'known-device-generic-fallback',
      '--fail-on-reason-delta',
      'known-device-generic-fallback:0',
      '--print-effective-gates',
    ],
    {
      defaultManifestFile: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
    },
  );
  assert.equal(parsedGateProfileCliOverride.ok, true);
  assert.equal(parsedGateProfileCliOverride.command.maxReviewNodes, 2);
  assert.equal(parsedGateProfileCliOverride.command.maxGenericNodes, 3);
  assert.equal(parsedGateProfileCliOverride.command.maxEmptyNodes, 1);
  assert.equal(parsedGateProfileCliOverride.command.maxReviewDelta, 0);
  assert.equal(parsedGateProfileCliOverride.command.maxGenericDelta, 1);
  assert.equal(parsedGateProfileCliOverride.command.maxEmptyDelta, 0);
  assert.deepEqual(parsedGateProfileCliOverride.command.failOnReasons, [
    'known-device-generic-fallback',
  ]);
  assert.deepEqual(parsedGateProfileCliOverride.command.failOnReasonDeltas, {
    'known-device-generic-fallback': 0,
  });
  assert.equal(parsedGateProfileCliOverride.command.printEffectiveGates, true);
  assert.equal(parsedGateProfileCliOverride.command.artifactFile, '/tmp/override-artifact.json');
  assert.equal(
    parsedGateProfileCliOverride.command.reportFile,
    path.join(gateProfileDir, 'output', 'report.md'),
  );

  const badGateProfileFile = path.join(gateProfileDir, 'bad-profile.json');
  fs.writeFileSync(badGateProfileFile, JSON.stringify({ unsupported: true }), 'utf8');
  const badGateProfile = parseCliArgs(
    ['--url', 'ws://x', '--all-nodes', '--gate-profile-file', badGateProfileFile],
    {
      defaultManifestFile: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
    },
  );
  assert.equal(badGateProfile.ok, false);
  assert.match(badGateProfile.error, /unsupported field "unsupported"/);
});

test('runValidateLiveCommand writes artifact and markdown summary from live inspection output', async () => {
  const { runValidateLiveCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-validate-live-'));
  const artifactFile = path.join(tmpDir, 'compiled-live.json');
  const reportFile = path.join(tmpDir, 'compiled-live.validation.md');
  const logs = [];
  let inspectCommand = null;

  const result = await runValidateLiveCommand(
    {
      url: 'ws://x',
      token: undefined,
      schemaVersion: 0,
      allNodes: true,
      nodeId: undefined,
      includeValues: 'summary',
      maxValues: 100,
      includeControllerNodes: false,
      manifestFile: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
      rulesFiles: [],
      ruleInputMode: 'manifest-file',
      catalogFile: undefined,
      artifactFile,
      reportFile,
      summaryJsonFile: undefined,
      maxReviewNodes: undefined,
      maxGenericNodes: undefined,
      maxEmptyNodes: undefined,
      failOnReasons: [],
      top: 3,
    },
    { log: (line) => logs.push(line) },
    {
      nowDate: new Date('2026-02-26T00:00:00.000Z'),
      buildCompiledProfilesArtifactImpl: async () => ({
        schemaVersion: 'compiled-homey-profiles/v1',
        generatedAt: '2026-02-26T00:00:00.000Z',
        source: { buildProfile: 'manifest-file', ruleSources: [] },
        entries: [],
      }),
      runLiveInspectCommandImpl: async (command, io) => {
        inspectCommand = command;
        io.log(
          JSON.stringify({
            results: [
              {
                node: { nodeId: 5, name: 'Kitchen Plug' },
                compiled: {
                  profile: {
                    classification: {
                      homeyClass: 'socket',
                      confidence: 'curated',
                      uncurated: false,
                    },
                  },
                  report: {
                    profileOutcome: 'curated',
                    curationCandidates: { likelyNeedsReview: false, reasons: [] },
                    byRule: [
                      { layer: 'project-product', ruleId: 'rule-a', unmatched: 1, applied: 3 },
                    ],
                    bySuppressedSlot: [],
                  },
                },
              },
              {
                node: { nodeId: 7, name: 'Garage Sensor' },
                compiled: {
                  profile: {
                    classification: {
                      homeyClass: 'sensor',
                      confidence: 'generic',
                      uncurated: true,
                    },
                  },
                  report: {
                    profileOutcome: 'generic',
                    curationCandidates: {
                      likelyNeedsReview: true,
                      reasons: ['known-device-generic-fallback', 'suppressed-fill-actions:3'],
                    },
                    byRule: [
                      { layer: 'project-product', ruleId: 'rule-b', unmatched: 5, applied: 0 },
                    ],
                    bySuppressedSlot: [
                      {
                        layer: 'project-product',
                        ruleId: 'rule-b',
                        slot: 'inboundMapping',
                        count: 3,
                      },
                    ],
                  },
                },
              },
            ],
          }),
        );
      },
    },
  );

  assert.equal(fs.existsSync(artifactFile), true);
  assert.equal(fs.existsSync(reportFile), true);
  assert.equal(inspectCommand.compiledFile, artifactFile);
  assert.equal(inspectCommand.format, 'json-compact');

  const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf8'));
  assert.equal(artifact.schemaVersion, 'compiled-homey-profiles/v1');

  const markdown = fs.readFileSync(reportFile, 'utf8');
  assert.match(markdown, /# Live Compiler Validation/);
  assert.match(markdown, /Nodes validated: 2/);
  assert.match(markdown, /known-device-generic-fallback/);
  assert.match(markdown, /project-product:rule-b/);
  assert.match(markdown, /project-product:rule-b:inboundMapping/);

  assert.equal(result.summary.totalNodes, 2);
  assert.equal(result.summary.reviewNodes, 1);
  assert.equal(logs.length, 5);
  assert.match(logs[0], /Compiled artifact:/);
  assert.match(logs[1], /Validation report:/);
});

test('runValidateLiveCommand can validate using an existing compiled file', async () => {
  const { runValidateLiveCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-validate-live-compiled-'));
  const compiledFile = path.join(tmpDir, 'compiled-live.json');
  const reportFile = path.join(tmpDir, 'compiled-live.validation.md');
  const logs = [];
  let buildCalled = false;
  let inspectCommand = null;

  fs.writeFileSync(
    compiledFile,
    JSON.stringify(
      {
        schemaVersion: 'compiled-homey-profiles/v1',
        generatedAt: '2026-02-26T00:00:00.000Z',
        source: { buildProfile: 'manifest-file', ruleSources: [] },
        entries: [],
      },
      null,
      2,
    ),
    'utf8',
  );

  const result = await runValidateLiveCommand(
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
      rulesFiles: [],
      ruleInputMode: 'compiled-file',
      compiledFile,
      catalogFile: undefined,
      artifactFile: compiledFile,
      reportFile,
      summaryJsonFile: undefined,
      gateProfileFile: undefined,
      maxReviewNodes: undefined,
      maxGenericNodes: undefined,
      maxEmptyNodes: undefined,
      failOnReasons: [],
      printEffectiveGates: false,
      top: 3,
    },
    { log: (line) => logs.push(line) },
    {
      nowDate: new Date('2026-02-26T00:00:00.000Z'),
      buildCompiledProfilesArtifactImpl: async () => {
        buildCalled = true;
        throw new Error('build should not be called');
      },
      runLiveInspectCommandImpl: async (command, io) => {
        inspectCommand = command;
        io.log(JSON.stringify({ results: [] }));
      },
    },
  );

  assert.equal(buildCalled, false);
  assert.equal(inspectCommand.compiledFile, compiledFile);
  assert.equal(result.artifact.schemaVersion, 'compiled-homey-profiles/v1');
  assert.equal(fs.existsSync(reportFile), true);
  assert.match(logs[0], /Using compiled artifact:/);
});

test('runValidateLiveCommand can evaluate gates from an existing summary JSON file', async () => {
  const { runValidateLiveCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-validate-live-summary-'));
  const inputSummaryJsonFile = path.join(tmpDir, 'compiled-live.summary.json');
  const baselineSummaryJsonFile = path.join(tmpDir, 'compiled-live.baseline.summary.json');
  const outputSummaryJsonFile = path.join(tmpDir, 'compiled-live.summary.recheck.json');
  const logs = [];
  let buildCalled = false;
  let inspectCalled = false;

  fs.writeFileSync(
    inputSummaryJsonFile,
    JSON.stringify(
      {
        generatedAt: '2026-02-26T00:00:00.000Z',
        source: { url: 'ws://x', scope: 'all-nodes' },
        counts: {
          totalNodes: 4,
          reviewNodes: 2,
          genericNodes: 1,
          emptyNodes: 0,
          outcomes: { curated: 3, generic: 1, empty: 0 },
          reasons: { 'known-device-generic-fallback': 1 },
        },
        gates: {
          configured: { maxReviewNodes: 99, failOnReasons: [] },
          passed: true,
          violations: [],
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  fs.writeFileSync(
    baselineSummaryJsonFile,
    JSON.stringify(
      {
        counts: {
          totalNodes: 4,
          reviewNodes: 1,
          genericNodes: 1,
          emptyNodes: 0,
          outcomes: { curated: 3, generic: 1, empty: 0 },
          reasons: { 'known-device-generic-fallback': 0 },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const result = await runValidateLiveCommand(
    {
      ruleInputMode: 'summary-input',
      inputSummaryJsonFile,
      baselineSummaryJsonFile,
      summaryJsonFile: outputSummaryJsonFile,
      gateProfileFile: '/tmp/gates.json',
      maxReviewNodes: 2,
      maxGenericNodes: 1,
      maxEmptyNodes: 0,
      maxReviewDelta: 1,
      maxGenericDelta: 0,
      maxEmptyDelta: 0,
      failOnReasons: ['known-device-unmapped'],
      failOnReasonDeltas: { 'known-device-generic-fallback': 1 },
      printEffectiveGates: false,
      top: 5,
    },
    { log: (line) => logs.push(line) },
    {
      nowDate: new Date('2026-02-26T00:00:00.000Z'),
      buildCompiledProfilesArtifactImpl: async () => {
        buildCalled = true;
        throw new Error('build should not be called');
      },
      runLiveInspectCommandImpl: async () => {
        inspectCalled = true;
      },
    },
  );

  assert.equal(buildCalled, false);
  assert.equal(inspectCalled, false);
  assert.equal(result.summary.totalNodes, 4);
  assert.equal(result.gateResult.passed, true);
  assert.equal(result.gateResult.deltas.reviewNodes, 1);
  assert.equal(result.gateResult.deltas.genericNodes, 0);
  assert.equal(result.gateResult.deltas.emptyNodes, 0);
  assert.equal(result.gateResult.deltas.reasonDeltas['known-device-generic-fallback'], 1);
  assert.equal(fs.existsSync(outputSummaryJsonFile), true);

  const outputSummary = JSON.parse(fs.readFileSync(outputSummaryJsonFile, 'utf8'));
  assert.equal(outputSummary.source.inputSummaryJsonFile, inputSummaryJsonFile);
  assert.equal(outputSummary.source.baselineSummaryJsonFile, baselineSummaryJsonFile);
  assert.equal(outputSummary.gates.configured.maxReviewNodes, 2);
  assert.equal(outputSummary.gates.configured.maxReviewDelta, 1);
  assert.equal(outputSummary.gates.configured.maxGenericDelta, 0);
  assert.equal(outputSummary.gates.configured.maxEmptyDelta, 0);
  assert.equal(outputSummary.gates.deltas.reviewNodes, 1);
  assert.equal(outputSummary.gates.deltas.reasonDeltas['known-device-generic-fallback'], 1);
  assert.equal(outputSummary.gates.passed, true);

  assert.match(logs[0], /Input summary JSON:/);
  assert.match(logs[1], /Baseline summary JSON:/);
  assert.match(logs[2], /Delta: review=1, generic=0, empty=0/);
  assert.match(logs[3], /Validation summary JSON:/);
  assert.equal(logs.length, 7);
});

test('runValidateLiveCommand prints effective gates when requested', async () => {
  const { runValidateLiveCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-validate-live-effective-'));
  const artifactFile = path.join(tmpDir, 'compiled-live.json');
  const reportFile = path.join(tmpDir, 'compiled-live.validation.md');
  const logs = [];

  await runValidateLiveCommand(
    {
      url: 'ws://x',
      token: undefined,
      schemaVersion: 0,
      allNodes: true,
      nodeId: undefined,
      includeValues: 'summary',
      maxValues: 100,
      includeControllerNodes: false,
      manifestFile: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
      rulesFiles: [],
      ruleInputMode: 'manifest-file',
      catalogFile: undefined,
      artifactFile,
      reportFile,
      summaryJsonFile: undefined,
      gateProfileFile: '/tmp/gates.json',
      maxReviewNodes: 5,
      maxGenericNodes: 2,
      maxEmptyNodes: 0,
      failOnReasons: ['known-device-unmapped'],
      printEffectiveGates: true,
      top: 3,
    },
    { log: (line) => logs.push(line) },
    {
      nowDate: new Date('2026-02-26T00:00:00.000Z'),
      buildCompiledProfilesArtifactImpl: async () => ({
        schemaVersion: 'compiled-homey-profiles/v1',
        generatedAt: '2026-02-26T00:00:00.000Z',
        source: { buildProfile: 'manifest-file', ruleSources: [] },
        entries: [],
      }),
      runLiveInspectCommandImpl: async (_command, io) => {
        io.log(JSON.stringify({ results: [] }));
      },
    },
  );

  assert.match(logs[0], /Effective gates:/);
  const effectiveJson = JSON.parse(logs[0].split('Effective gates:\n', 2)[1]);
  assert.equal(effectiveJson.gateProfileFile, '/tmp/gates.json');
  assert.equal(effectiveJson.thresholds.maxReviewNodes, 5);
  assert.equal(effectiveJson.thresholds.maxGenericNodes, 2);
  assert.equal(effectiveJson.thresholds.maxEmptyNodes, 0);
  assert.deepEqual(effectiveJson.failOnReasons, ['known-device-unmapped']);
  assert.equal(effectiveJson.outputs.artifactFile, artifactFile);
  assert.equal(effectiveJson.outputs.reportFile, reportFile);
  assert.equal(effectiveJson.outputs.summaryJsonFile, null);
  assert.equal(logs.length, 6);
});

test('runValidateLiveCommand writes machine summary and fails when gates are exceeded', async () => {
  const { runValidateLiveCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-validate-live-gates-'));
  const artifactFile = path.join(tmpDir, 'compiled-live.json');
  const reportFile = path.join(tmpDir, 'compiled-live.validation.md');
  const summaryJsonFile = path.join(tmpDir, 'compiled-live.summary.json');
  const baselineSummaryJsonFile = path.join(tmpDir, 'compiled-live.baseline.summary.json');
  const logs = [];

  fs.writeFileSync(
    baselineSummaryJsonFile,
    JSON.stringify(
      {
        counts: {
          totalNodes: 1,
          reviewNodes: 0,
          genericNodes: 0,
          emptyNodes: 0,
          outcomes: { curated: 1, generic: 0, empty: 0 },
          reasons: { 'known-device-generic-fallback': 0 },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  await assert.rejects(
    () =>
      runValidateLiveCommand(
        {
          url: 'ws://x',
          token: undefined,
          schemaVersion: 0,
          allNodes: true,
          nodeId: undefined,
          includeValues: 'summary',
          maxValues: 100,
          includeControllerNodes: false,
          manifestFile: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
          rulesFiles: [],
          ruleInputMode: 'manifest-file',
          catalogFile: undefined,
          artifactFile,
          reportFile,
          summaryJsonFile,
          baselineSummaryJsonFile,
          gateProfileFile: '/tmp/gate-profile.json',
          maxReviewNodes: 0,
          maxGenericNodes: 0,
          maxEmptyNodes: 0,
          maxReviewDelta: 0,
          maxGenericDelta: 0,
          maxEmptyDelta: 0,
          failOnReasons: ['known-device-generic-fallback'],
          failOnReasonDeltas: { 'known-device-generic-fallback': 0 },
          top: 3,
        },
        { log: (line) => logs.push(line) },
        {
          nowDate: new Date('2026-02-26T00:00:00.000Z'),
          buildCompiledProfilesArtifactImpl: async () => ({
            schemaVersion: 'compiled-homey-profiles/v1',
            generatedAt: '2026-02-26T00:00:00.000Z',
            source: { buildProfile: 'manifest-file', ruleSources: [] },
            entries: [],
          }),
          runLiveInspectCommandImpl: async (_command, io) => {
            io.log(
              JSON.stringify({
                results: [
                  {
                    node: { nodeId: 7, name: 'Garage Sensor' },
                    compiled: {
                      profile: {
                        classification: {
                          homeyClass: 'sensor',
                          confidence: 'generic',
                          uncurated: true,
                        },
                      },
                      report: {
                        profileOutcome: 'generic',
                        curationCandidates: {
                          likelyNeedsReview: true,
                          reasons: ['known-device-generic-fallback'],
                        },
                        byRule: [],
                        bySuppressedSlot: [],
                      },
                    },
                  },
                ],
              }),
            );
          },
        },
      ),
    /Validation gates failed:/,
  );

  assert.equal(fs.existsSync(artifactFile), true);
  assert.equal(fs.existsSync(reportFile), true);
  assert.equal(fs.existsSync(summaryJsonFile), true);
  const summaryJson = JSON.parse(fs.readFileSync(summaryJsonFile, 'utf8'));
  assert.equal(summaryJson.gates.passed, false);
  assert.equal(summaryJson.source.gateProfileFile, '/tmp/gate-profile.json');
  assert.equal(summaryJson.gates.configured.gateProfileFile, '/tmp/gate-profile.json');
  assert.equal(summaryJson.gates.configured.baselineSummaryJsonFile, baselineSummaryJsonFile);
  assert.equal(summaryJson.gates.configured.maxReviewDelta, 0);
  assert.equal(summaryJson.gates.configured.maxGenericDelta, 0);
  assert.equal(summaryJson.gates.configured.maxEmptyDelta, 0);
  assert.equal(summaryJson.gates.deltas.reviewNodes, 1);
  assert.equal(summaryJson.gates.deltas.genericNodes, 1);
  assert.equal(summaryJson.gates.deltas.reasonDeltas['known-device-generic-fallback'], 1);
  assert.equal(summaryJson.counts.reviewNodes, 1);
  assert.equal(summaryJson.counts.genericNodes, 1);
  assert.equal(summaryJson.counts.reasons['known-device-generic-fallback'], 1);
  assert.equal(Array.isArray(summaryJson.gates.violations), true);
  assert.equal(summaryJson.gates.violations.length >= 1, true);
  assert.equal(
    logs.some((line) => /Validation summary JSON:/.test(line)),
    true,
  );
});

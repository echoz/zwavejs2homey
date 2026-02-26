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

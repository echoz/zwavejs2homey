const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/homey-compile-bench-lib.mjs');
}

const fixturesDir = path.join(__dirname, '../../compiler/test/fixtures');

test('parseCliArgs validates benchmark flags and required inputs', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs(['--rules-file', 'x.json']).ok, false);
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--iterations', '0']).ok,
    false,
  );
  const parsed = parseCliArgs([
    '--device-file',
    'd.json',
    '--rules-file',
    'r.json',
    '--iterations',
    '5',
    '--warmup',
    '1',
  ]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.iterations, 5);
  assert.equal(parsed.command.warmup, 1);
});

test('runCompileBenchmark returns timing stats and profile summary', async () => {
  const { runCompileBenchmark, formatBenchmarkSummary } = await loadLib();
  const result = runCompileBenchmark({
    deviceFile: path.join(fixturesDir, 'device-switch-meter.json'),
    manifest: undefined,
    rulesFiles: [path.join(fixturesDir, 'rules-switch-meter.json')],
    iterations: 3,
    warmup: 1,
    homeyClass: 'socket',
    driverTemplateId: undefined,
  });
  assert.equal(result.benchmark.iterations, 3);
  assert.equal(result.benchmark.samples, 3);
  assert.equal(typeof result.benchmark.setupMs, 'number');
  assert.equal(typeof result.benchmark.avgMs, 'number');
  assert.equal(result.profileSummary.profileId, 'fixture-switch-meter-1');
  assert.equal(result.profileSummary.outcome, 'curated');
  const summary = formatBenchmarkSummary(result);
  assert.match(summary, /Iterations: 3/);
  assert.match(summary, /Setup: /);
  assert.match(summary, /Timing: avg=/);
  assert.match(summary, /Profile: fixture-switch-meter-1 outcome=curated/);
});

test('runCompileBenchmark resolves manifest entries relative to manifest path', async () => {
  const { runCompileBenchmark } = await loadLib();
  const result = runCompileBenchmark({
    deviceFile: path.join(fixturesDir, 'device-switch-meter.json'),
    manifest: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
    rulesFiles: [],
    iterations: 2,
    warmup: 0,
    homeyClass: undefined,
    driverTemplateId: undefined,
  });

  assert.equal(result.benchmark.iterations, 2);
  assert.equal(result.profileSummary.profileId, 'fixture-switch-meter-1');
  assert.equal(result.profileSummary.outcome, 'curated');
});

test('runCompileBenchmark uses summary report mode for compile iterations', async () => {
  const { runCompileBenchmark } = await loadLib();
  const calls = [];
  const result = runCompileBenchmark(
    {
      deviceFile: path.join(fixturesDir, 'device-switch-meter.json'),
      manifest: undefined,
      rulesFiles: [path.join(fixturesDir, 'rules-switch-meter.json')],
      iterations: 2,
      warmup: 1,
      homeyClass: 'socket',
      driverTemplateId: 'generic-socket',
    },
    {
      compileProfilePlanFromLoadedRuleSetManifestImpl: (device, loaded, options) => {
        calls.push({ device, loaded, options });
        return {
          profile: {
            profileId: 'fixture-switch-meter-1',
            capabilities: [],
          },
          report: {
            profileOutcome: 'curated',
            curationCandidates: { likelyNeedsReview: false, reasons: [] },
          },
        };
      },
      loadJsonRuleSetManifestImpl: () => ({ entries: [] }),
    },
  );

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].options, {
    homeyClass: 'socket',
    driverTemplateId: 'generic-socket',
    reportMode: 'summary',
  });
  assert.equal(result.benchmark.iterations, 2);
});

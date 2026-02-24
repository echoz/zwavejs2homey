const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/homey-compile-inspect-lib.mjs');
}

const fixturesDir = path.join(__dirname, '../../compiler/test/fixtures');

test('parseCliArgs validates required device and rule inputs', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs(['--rules-file', 'r.json']).ok, false);
  assert.equal(parseCliArgs(['--device-file', 'd.json']).ok, false);
  const parsed = parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json']);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.command.rulesFiles, ['r.json']);
});

test('compileFromFiles compiles fixture device/rules and returns profile', async () => {
  const { compileFromFiles, formatCompileSummary } = await loadLib();
  const result = compileFromFiles({
    deviceFile: path.join(fixturesDir, 'device-switch-meter.json'),
    manifest: undefined,
    rulesFiles: [path.join(fixturesDir, 'rules-switch-meter.json')],
    format: 'summary',
    homeyClass: 'socket',
    driverTemplateId: 'generic-socket',
  });
  assert.equal(result.profile.profileId, 'fixture-switch-meter-1');
  assert.equal(result.profile.classification.homeyClass, 'socket');
  const summary = formatCompileSummary(result);
  assert.match(summary, /Capabilities: .*onoff/);
  assert.match(summary, /Report: outcome=/);
});

test('formatCompileSummary includes classification provenance and suppressed slot summary when present', async () => {
  const { formatCompileSummary } = await loadLib();
  const summary = formatCompileSummary({
    profile: {
      profileId: 'p1',
      classification: { homeyClass: 'light', confidence: 'curated', uncurated: false },
      capabilities: [],
      ignoredValues: [],
    },
    classificationProvenance: { layer: 'project-product', ruleId: 'product-device-class' },
    report: {
      profileOutcome: 'curated',
      summary: { appliedActions: 2, unmatchedActions: 1, suppressedFillActions: 1 },
      bySuppressedSlot: [
        {
          layer: 'project-generic',
          ruleId: 'generic-device-class-fill',
          slot: 'deviceIdentity.homeyClass',
          count: 1,
        },
      ],
      curationCandidates: { likelyNeedsReview: true, reasons: ['suppressed-fill-actions:1'] },
    },
  });
  assert.match(summary, /Class provenance: project-product:product-device-class/);
  assert.match(
    summary,
    /Suppressed slots: project-generic:generic-device-class-fill:deviceIdentity.homeyClass=1/,
  );
});

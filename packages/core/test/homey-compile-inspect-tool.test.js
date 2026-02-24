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
  assert.equal(parsed.command.catalogFile, undefined);
  const withCatalog = parseCliArgs([
    '--device-file',
    'd.json',
    '--rules-file',
    'r.json',
    '--catalog-file',
    'c.json',
  ]);
  assert.equal(withCatalog.ok, true);
  assert.equal(withCatalog.command.catalogFile, 'c.json');
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--format', 'json-pretty'])
      .ok,
    true,
  );
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--format', 'yaml']).ok,
    false,
  );
});

test('compileFromFiles compiles fixture device/rules and returns profile', async () => {
  const { compileFromFiles, formatCompileSummary } = await loadLib();
  const result = compileFromFiles({
    deviceFile: path.join(fixturesDir, 'device-switch-meter.json'),
    manifest: undefined,
    rulesFiles: [path.join(fixturesDir, 'rules-switch-meter.json')],
    format: 'summary',
    catalogFile: path.join(fixturesDir, 'catalog-devices-v1.json'),
    homeyClass: 'socket',
    driverTemplateId: 'generic-socket',
  });
  assert.equal(result.profile.profileId, 'fixture-switch-meter-1');
  assert.equal(result.profile.classification.homeyClass, 'socket');
  const summary = formatCompileSummary(result);
  assert.match(summary, /Capabilities: .*onoff/);
  assert.match(summary, /Report: outcome=/);
  assert.match(summary, /Catalog: matched/);
});

test('compileFromFiles supports manifest entries with ha-derived-generated kind', async () => {
  const { compileFromFiles, formatCompileSummary } = await loadLib();
  const result = compileFromFiles({
    deviceFile: path.join(fixturesDir, 'device-switch-meter.json'),
    manifest: path.join(fixturesDir, 'rule-manifest-with-ha-generated.json'),
    rulesFiles: [],
    format: 'summary',
    catalogFile: undefined,
    homeyClass: undefined,
    driverTemplateId: undefined,
  });
  assert.equal(result.profile.profileId, 'fixture-switch-meter-1');
  assert.equal(result.profile.classification.homeyClass, 'socket');
  const summary = formatCompileSummary(result);
  assert.match(summary, /Class provenance: ha-derived:ha-switch-binary-current/);
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
    catalogLookup: {
      matched: true,
      by: 'product-triple',
      catalogId: 'zwjs:0184-4447-3034',
      label: 'Aeotec Smart Switch 7',
    },
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
  assert.match(summary, /Catalog: matched \(product-triple\) zwjs:0184-4447-3034/);
  assert.match(
    summary,
    /Suppressed slots: project-generic:generic-device-class-fill:deviceIdentity.homeyClass=1/,
  );
});

test('formatCompileOutput supports markdown/json/ndjson variants', async () => {
  const { formatCompileOutput } = await loadLib();
  const fixture = {
    profile: {
      profileId: 'p1',
      classification: { homeyClass: 'light', confidence: 'curated', uncurated: false },
      capabilities: [{ capabilityId: 'onoff' }],
      ignoredValues: [],
    },
    ruleSources: [{ filePath: 'r.json', ruleCount: 1, ruleIds: ['r1'] }],
    catalogLookup: { matched: false, by: 'none' },
    report: {
      profileOutcome: 'curated',
      summary: { appliedActions: 1, unmatchedActions: 0, suppressedFillActions: 0 },
      byRule: [{ ruleId: 'r1', layer: 'ha-derived', applied: 1, unmatched: 0, actionTypes: {} }],
      bySuppressedSlot: [],
      curationCandidates: { likelyNeedsReview: false, reasons: [] },
    },
  };
  assert.match(formatCompileOutput(fixture, 'markdown'), /## Compiled Profile/);
  assert.doesNotThrow(() => JSON.parse(formatCompileOutput(fixture, 'json-pretty')));
  assert.doesNotThrow(() => JSON.parse(formatCompileOutput(fixture, 'json-compact')));
  const ndjson = formatCompileOutput(fixture, 'ndjson');
  assert.match(ndjson, /\"type\":\"profile\"/);
  assert.match(ndjson, /\"type\":\"ruleSource\"/);
  assert.match(ndjson, /\"type\":\"catalogLookup\"/);
});

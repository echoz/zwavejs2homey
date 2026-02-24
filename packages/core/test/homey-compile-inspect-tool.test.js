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
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--focus', 'unmatched']).ok,
    true,
  );
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--top', '5']).ok,
    true,
  );
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--format', 'yaml']).ok,
    false,
  );
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--focus', 'weird']).ok,
    false,
  );
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--top', '0']).ok,
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
  assert.equal(result.__focus, 'all');
  assert.equal(result.__top, 3);
  const summary = formatCompileSummary(result);
  assert.match(summary, /Capabilities: .*onoff/);
  assert.match(summary, /Report: outcome=/);
  assert.match(summary, /Catalog: matched/);
  assert.match(summary, /Profile catalog match: product-triple/);
  assert.match(summary, /Diagnostic device key: catalog:observed:29-13313-1/);
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
      catalogMatch: {
        by: 'product-triple',
        catalogId: 'zwjs:0184-4447-3034',
        label: 'Aeotec Smart Switch 7',
      },
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
      diagnosticDeviceKey: 'catalog:zwjs:0184-4447-3034',
      bySuppressedSlot: [
        {
          layer: 'project-generic',
          ruleId: 'generic-device-class-fill',
          slot: 'deviceIdentity.homeyClass',
          count: 1,
        },
      ],
      catalogContext: {
        knownCatalogDevice: true,
        matchRef: 'catalog:zwjs:0184-4447-3034',
      },
      curationCandidates: { likelyNeedsReview: true, reasons: ['suppressed-fill-actions:1'] },
    },
  });
  assert.match(summary, /Class provenance: project-product:product-device-class/);
  assert.match(summary, /Catalog: matched \(product-triple\) zwjs:0184-4447-3034/);
  assert.match(summary, /Profile catalog match: product-triple zwjs:0184-4447-3034/);
  assert.match(summary, /Report catalog context: known=true \(catalog:zwjs:0184-4447-3034\)/);
  assert.match(summary, /Diagnostic device key: catalog:zwjs:0184-4447-3034/);
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
      catalogMatch: { by: 'product-triple', catalogId: 'cid-1' },
    },
    ruleSources: [{ filePath: 'r.json', ruleCount: 1, ruleIds: ['r1'] }],
    catalogLookup: { matched: false, by: 'none' },
    report: {
      profileOutcome: 'curated',
      summary: { appliedActions: 1, unmatchedActions: 0, suppressedFillActions: 0 },
      diagnosticDeviceKey: 'product-triple:1-2-3',
      catalogContext: { knownCatalogDevice: false },
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
  assert.match(ndjson, /\"catalogContext\"/);
  assert.match(ndjson, /\"diagnosticDeviceKey\":\"product-triple:1-2-3\"/);
});

test('formatCompileSummary/markdown include top unmatched rule diagnostics', async () => {
  const { formatCompileSummary, formatCompileOutput } = await loadLib();
  const fixture = {
    profile: {
      profileId: 'p2',
      classification: { homeyClass: 'other', confidence: 'generic', uncurated: true },
      capabilities: [],
      ignoredValues: [],
    },
    ruleSources: [],
    report: {
      profileOutcome: 'empty',
      summary: { appliedActions: 0, unmatchedActions: 9, suppressedFillActions: 0 },
      diagnosticDeviceKey: 'product-triple:9-9-9',
      byRule: [
        { ruleId: 'rA', layer: 'ha-derived', applied: 0, unmatched: 5, actionTypes: {} },
        { ruleId: 'rB', layer: 'project-generic', applied: 0, unmatched: 3, actionTypes: {} },
        { ruleId: 'rC', layer: 'project-product', applied: 0, unmatched: 1, actionTypes: {} },
      ],
      bySuppressedSlot: [],
      curationCandidates: { likelyNeedsReview: true, reasons: ['no-applied-actions'] },
    },
  };
  const summary = formatCompileSummary(fixture);
  assert.match(
    summary,
    /Top unmatched rules: ha-derived:rA=5, project-generic:rB=3, project-product:rC=1/,
  );
  const markdown = formatCompileOutput(fixture, 'markdown');
  assert.match(markdown, /Top unmatched rules:/);
  const ndjson = formatCompileOutput(fixture, 'ndjson');
  assert.match(ndjson, /\"type\":\"topUnmatchedRule\"/);
});

test('formatCompileSummary respects --top limit for unmatched diagnostics', async () => {
  const { formatCompileSummary } = await loadLib();
  const fixture = {
    profile: {
      profileId: 'p4',
      classification: { homeyClass: 'other', confidence: 'generic', uncurated: true },
      capabilities: [],
      ignoredValues: [],
    },
    ruleSources: [],
    report: {
      profileOutcome: 'empty',
      summary: { appliedActions: 0, unmatchedActions: 6, suppressedFillActions: 0 },
      diagnosticDeviceKey: 'product-triple:1-2-3',
      byRule: [
        { ruleId: 'r1', layer: 'ha-derived', applied: 0, unmatched: 3, actionTypes: {} },
        { ruleId: 'r2', layer: 'project-generic', applied: 0, unmatched: 2, actionTypes: {} },
        { ruleId: 'r3', layer: 'project-product', applied: 0, unmatched: 1, actionTypes: {} },
      ],
      bySuppressedSlot: [],
      curationCandidates: { likelyNeedsReview: false, reasons: [] },
    },
    __focus: 'unmatched',
    __top: 2,
  };
  const summary = formatCompileSummary(fixture);
  assert.match(summary, /Top unmatched rules: ha-derived:r1=3, project-generic:r2=2/);
  assert.doesNotMatch(summary, /project-product:r3=1/);
});

test('formatCompileSummary supports focus filters for unmatched/suppressed/curation', async () => {
  const { formatCompileSummary } = await loadLib();
  const base = {
    profile: {
      profileId: 'p3',
      classification: { homeyClass: 'other', confidence: 'generic', uncurated: true },
      capabilities: [],
      ignoredValues: [],
    },
    ruleSources: [],
    report: {
      profileOutcome: 'empty',
      summary: { appliedActions: 0, unmatchedActions: 4, suppressedFillActions: 2 },
      diagnosticDeviceKey: 'catalog:abc',
      byRule: [{ ruleId: 'r1', layer: 'ha-derived', applied: 0, unmatched: 4, actionTypes: {} }],
      bySuppressedSlot: [
        { slot: 'capability:onoff', layer: 'project-generic', ruleId: 'r2', count: 2 },
      ],
      catalogContext: { knownCatalogDevice: true, matchRef: 'catalog:abc' },
      curationCandidates: { likelyNeedsReview: true, reasons: ['known-device-generic-fallback'] },
    },
  };

  const unmatched = formatCompileSummary({ ...base, __focus: 'unmatched' });
  assert.match(unmatched, /Top unmatched rules:/);
  assert.doesNotMatch(unmatched, /Curation review:/);
  assert.doesNotMatch(unmatched, /Suppressed slots:/);

  const suppressed = formatCompileSummary({ ...base, __focus: 'suppressed' });
  assert.match(suppressed, /Suppressed slots:/);
  assert.doesNotMatch(suppressed, /Top unmatched rules:/);

  const curation = formatCompileSummary({ ...base, __focus: 'curation' });
  assert.match(curation, /Curation review:/);
  assert.match(curation, /Report catalog context:/);
  assert.doesNotMatch(curation, /Top unmatched rules:/);
});

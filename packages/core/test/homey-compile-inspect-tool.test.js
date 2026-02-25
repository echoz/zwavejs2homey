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
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--show', 'rule']).ok,
    true,
  );
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--explain', 'onoff']).ok,
    true,
  );
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--explain-all']).ok,
    true,
  );
  assert.equal(
    parseCliArgs([
      '--device-file',
      'd.json',
      '--rules-file',
      'r.json',
      '--explain',
      'onoff',
      '--explain-only',
      '--format',
      'json',
    ]).ok,
    true,
  );
  assert.equal(
    parseCliArgs([
      '--device-file',
      'd.json',
      '--rules-file',
      'r.json',
      '--explain',
      'onoff',
      '--explain-only',
      '--format',
      'summary',
    ]).ok,
    false,
  );
  assert.equal(
    parseCliArgs([
      '--device-file',
      'd.json',
      '--rules-file',
      'r.json',
      '--explain',
      'onoff',
      '--explain-all',
    ]).ok,
    false,
  );
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--explain-only']).ok,
    false,
  );
  assert.equal(
    parseCliArgs([
      '--device-file',
      'd.json',
      '--rules-file',
      'r.json',
      '--explain-all',
      '--explain-only',
      '--format',
      'ndjson',
    ]).ok,
    false,
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
  assert.equal(
    parseCliArgs(['--device-file', 'd.json', '--rules-file', 'r.json', '--show', 'detail']).ok,
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
      unknownDeviceReport: {
        kind: 'known-catalog',
        diagnosticDeviceKey: 'catalog:zwjs:0184-4447-3034',
        profileOutcome: 'curated',
        matchRef: 'catalog:zwjs:0184-4447-3034',
        reasons: ['suppressed-fill-actions:1'],
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
      unknownDeviceReport: {
        kind: 'unknown-catalog',
        diagnosticDeviceKey: 'product-triple:1-2-3',
        profileOutcome: 'curated',
        reasons: [],
      },
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
  assert.match(ndjson, /\"type\":\"unknownDeviceReport\"/);
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
      unknownDeviceReport: {
        kind: 'known-catalog',
        diagnosticDeviceKey: 'catalog:abc',
        profileOutcome: 'empty',
        matchRef: 'catalog:abc',
        reasons: ['known-device-generic-fallback'],
      },
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
  assert.match(curation, /Unknown-device report:/);
  assert.doesNotMatch(curation, /Top unmatched rules:/);
});

test('formatCompileSummary/markdown support --show detail sections', async () => {
  const { formatCompileSummary, formatCompileOutput } = await loadLib();
  const fixture = {
    profile: {
      profileId: 'p5',
      classification: { homeyClass: 'other', confidence: 'generic', uncurated: true },
      capabilities: [],
      ignoredValues: [],
    },
    ruleSources: [],
    report: {
      profileOutcome: 'empty',
      summary: { appliedActions: 1, unmatchedActions: 5, suppressedFillActions: 2 },
      diagnosticDeviceKey: 'catalog:x',
      byRule: [
        { ruleId: 'r1', layer: 'ha-derived', applied: 1, unmatched: 4, actionTypes: {} },
        { ruleId: 'r2', layer: 'project-generic', applied: 0, unmatched: 1, actionTypes: {} },
      ],
      bySuppressedSlot: [
        { slot: 'capability:onoff', layer: 'project-generic', ruleId: 'r2', count: 2 },
      ],
      overlapPolicy: {
        suppressedCapabilities: [
          {
            capabilityId: 'dim',
            winnerCapabilityId: 'windowcoverings_set',
            selectorKey: 'value:38:0:currentValue:',
            conflictKey: 'cover.position_control',
            reason: 'conflict-exclusive:cover.position_control',
          },
        ],
      },
      curationCandidates: {
        likelyNeedsReview: true,
        reasons: ['known-device-generic-fallback', 'suppressed-fill-actions:2'],
      },
    },
    __show: 'all',
    __top: 2,
  };
  const summary = formatCompileSummary(fixture);
  assert.match(summary, /Rule detail:/);
  assert.match(summary, /Suppressed detail:/);
  assert.match(summary, /Conflict suppression detail:/);
  assert.match(summary, /Curation reasons detail:/);
  const markdown = formatCompileOutput(fixture, 'markdown');
  assert.match(markdown, /- Rule detail:/);
  assert.match(markdown, /- Suppressed detail:/);
  assert.match(markdown, /- Conflict suppression detail:/);
  assert.match(markdown, /- Curation reasons detail:/);
});

test('formatCompileSummary/markdown support --explain capability output', async () => {
  const { formatCompileSummary, formatCompileOutput } = await loadLib();
  const fixture = {
    profile: {
      profileId: 'p6',
      classification: { homeyClass: 'socket', confidence: 'curated', uncurated: false },
      capabilities: [
        {
          capabilityId: 'onoff',
          directionality: 'bidirectional',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
            watchers: [{ eventType: 'zwjs.event.node.value-updated' }],
          },
          outboundMapping: {
            kind: 'set_value',
            target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
          },
          flags: { assumedState: true },
          provenance: {
            layer: 'ha-derived',
            ruleId: 'ha-switch-binary-current',
            action: 'fill',
            reason: 'mock reason',
          },
        },
      ],
      ignoredValues: [],
    },
    ruleSources: [],
    report: {
      profileOutcome: 'curated',
      summary: { appliedActions: 1, unmatchedActions: 0, suppressedFillActions: 0 },
      diagnosticDeviceKey: 'catalog:demo',
      byRule: [],
      bySuppressedSlot: [],
      overlapPolicy: {
        suppressedCapabilities: [
          {
            capabilityId: 'dim',
            winnerCapabilityId: 'onoff',
            selectorKey: 'value:37:0:currentValue:',
            conflictKey: 'switch.control',
            reason: 'conflict-exclusive:switch.control',
          },
        ],
      },
      curationCandidates: { likelyNeedsReview: false, reasons: [] },
    },
    __explainCapabilityId: 'onoff',
  };
  const summary = formatCompileSummary(fixture);
  assert.match(summary, /Explain: onoff/);
  assert.match(summary, /Directionality: bidirectional/);
  assert.match(summary, /Inbound: value -> cc=37@ep0:currentValue/);
  assert.match(summary, /Outbound: set_value -> cc=37@ep0:targetValue/);
  assert.match(summary, /Watchers: event:zwjs\.event\.node\.value-updated/);
  assert.match(summary, /Provenance: ha-derived:ha-switch-binary-current \(fill\)/);
  assert.match(summary, /Conflict wins: 1/);
  assert.match(summary, /Conflict detail: key=switch\.control/);

  const markdown = formatCompileOutput(fixture, 'markdown');
  assert.match(markdown, /### Explain: `onoff`/);
  assert.match(markdown, /- Directionality: `bidirectional`/);
  assert.match(markdown, /- Outbound: `set_value` -> `cc=37@ep0:targetValue`/);
  assert.match(markdown, /- Conflict wins: 1/);
  const ndjson = formatCompileOutput(fixture, 'ndjson');
  assert.match(ndjson, /\"type\":\"capabilityExplain\"/);
  assert.match(ndjson, /\"type\":\"conflictSuppression\"/);
  assert.match(ndjson, /\"requestedCapabilityId\":\"onoff\"/);
  assert.match(ndjson, /\"selector\":\"cc=37@ep0:currentValue\"/);
  assert.match(ndjson, /\"conflictWins\":\[/);
});

test('formatCompileSummary/markdown/ndjson support --explain-all', async () => {
  const { formatCompileSummary, formatCompileOutput } = await loadLib();
  const fixture = {
    profile: {
      profileId: 'p7',
      classification: { homeyClass: 'socket', confidence: 'curated', uncurated: false },
      capabilities: [
        {
          capabilityId: 'onoff',
          directionality: 'bidirectional',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
          },
          outboundMapping: {
            kind: 'set_value',
            target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
          },
          provenance: { layer: 'ha-derived', ruleId: 'r-onoff', action: 'fill' },
        },
        {
          capabilityId: 'measure_power',
          directionality: 'inbound-only',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 50, endpoint: 0, property: 'value', propertyKey: 0 },
          },
          provenance: { layer: 'project-generic', ruleId: 'r-power', action: 'fill' },
        },
      ],
      ignoredValues: [],
    },
    ruleSources: [],
    report: {
      profileOutcome: 'curated',
      summary: { appliedActions: 2, unmatchedActions: 0, suppressedFillActions: 0 },
      diagnosticDeviceKey: 'catalog:demo2',
      byRule: [],
      bySuppressedSlot: [],
      curationCandidates: { likelyNeedsReview: false, reasons: [] },
    },
    __explainAll: true,
  };
  const summary = formatCompileSummary(fixture);
  assert.match(summary, /Explain: onoff/);
  assert.match(summary, /Explain: measure_power/);
  const markdown = formatCompileOutput(fixture, 'markdown');
  assert.match(markdown, /### Explain: `onoff`/);
  assert.match(markdown, /### Explain: `measure_power`/);
  const ndjson = formatCompileOutput(fixture, 'ndjson');
  assert.match(ndjson, /\"type\":\"capabilityExplain\"/);
  assert.match(ndjson, /\"explainAll\":true/);
  assert.ok(ndjson.includes('\"capabilities\":['));
});

test('formatCompileOutput supports --explain-only json payloads', async () => {
  const { formatCompileOutput } = await loadLib();
  const fixture = {
    profile: {
      profileId: 'p8',
      classification: { homeyClass: 'socket', confidence: 'curated', uncurated: false },
      capabilities: [
        {
          capabilityId: 'onoff',
          directionality: 'bidirectional',
          inboundMapping: {
            kind: 'value',
            selector: { commandClass: 37, endpoint: 0, property: 'currentValue' },
          },
          outboundMapping: {
            kind: 'set_value',
            target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
          },
          provenance: { layer: 'ha-derived', ruleId: 'r-onoff', action: 'fill' },
        },
      ],
      ignoredValues: [],
    },
    ruleSources: [],
    report: {
      profileOutcome: 'curated',
      summary: { appliedActions: 1, unmatchedActions: 0, suppressedFillActions: 0 },
      diagnosticDeviceKey: 'catalog:demo3',
      byRule: [],
      bySuppressedSlot: [],
      curationCandidates: { likelyNeedsReview: false, reasons: [] },
    },
    __explainCapabilityId: 'onoff',
    __explainOnly: true,
  };

  const pretty = JSON.parse(formatCompileOutput(fixture, 'json-pretty'));
  assert.deepEqual(Object.keys(pretty), ['capabilityExplain']);
  assert.equal(pretty.capabilityExplain.found, true);
  assert.equal(pretty.capabilityExplain.capabilityId, 'onoff');

  const compact = JSON.parse(
    formatCompileOutput({ ...fixture, __explainAll: true }, 'json-compact'),
  );
  assert.equal(compact.capabilityExplain.explainAll, true);
  assert.equal(Array.isArray(compact.capabilityExplain.capabilities), true);
});

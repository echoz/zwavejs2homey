const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');
const device = require('./fixtures/device-switch-meter.json');

const fixturesDir = path.join(__dirname, 'fixtures');

test('compileProfilePlanFromRuleFiles returns rule source metadata and grouped report stats', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const result = compiler.compileProfilePlanFromRuleFiles(device, [rulesFile], {
    homeyClass: 'socket',
  });

  assert.equal(result.profile.profileId, 'fixture-switch-meter-1');
  assert.deepEqual(result.ruleSources, [
    {
      filePath: rulesFile,
      ruleCount: 3,
      ruleIds: ['ha-onoff', 'product-onoff-write', 'generic-meter-power'],
    },
  ]);

  const byRule = Object.fromEntries(
    result.report.byRule.map((entry) => [`${entry.layer}:${entry.ruleId}`, entry]),
  );
  assert.deepEqual(byRule['ha-derived:ha-onoff'], {
    ruleId: 'ha-onoff',
    layer: 'ha-derived',
    applied: 1,
    unmatched: 2,
    actionTypes: { capability: 3 },
  });
  assert.deepEqual(byRule['project-product:product-onoff-write'], {
    ruleId: 'product-onoff-write',
    layer: 'project-product',
    applied: 1,
    unmatched: 2,
    actionTypes: { capability: 3 },
  });
  assert.deepEqual(byRule['project-generic:generic-meter-power'], {
    ruleId: 'generic-meter-power',
    layer: 'project-generic',
    applied: 2,
    unmatched: 4,
    actionTypes: { capability: 3, 'ignore-value': 3 },
  });
  assert.deepEqual(result.report.bySuppressedSlot, []);
  assert.deepEqual(result.report.curationCandidates, {
    likelyNeedsReview: false,
    reasons: [],
  });
});

test('compileProfilePlanFromRuleSetManifest supports manifest entries and grouped reporting', () => {
  const rulesFile = path.join(fixturesDir, 'rules-switch-meter.json');
  const result = compiler.compileProfilePlanFromRuleSetManifest(device, [{ filePath: rulesFile }], {
    homeyClass: 'socket',
  });

  assert.equal(result.profile.classification.homeyClass, 'socket');
  assert.equal(result.ruleSources.length, 1);
  assert.equal(result.report.byRule.length >= 3, true);
});

test('compileProfilePlanFromRuleSetManifest groups suppressed fills and flags curation review', () => {
  const baseRules = path.join(fixturesDir, 'rules-switch-meter.json');
  const extraGeneric = path.join(fixturesDir, 'rules-switch-meter-generic-onoff-fill.json');
  const result = compiler.compileProfilePlanFromRuleSetManifest(device, [
    { filePath: baseRules },
    { filePath: extraGeneric, layer: 'project-generic' },
  ]);

  assert.ok(
    result.report.bySuppressedSlot.some(
      (row) =>
        row.ruleId === 'generic-onoff-fill' &&
        row.layer === 'project-generic' &&
        row.slot === 'inboundMapping' &&
        row.count >= 1,
    ),
  );
  assert.equal(result.report.curationCandidates.likelyNeedsReview, true);
  assert.ok(
    result.report.curationCandidates.reasons.some((reason) =>
      reason.startsWith('suppressed-fill-actions:'),
    ),
  );
});

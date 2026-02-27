const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/homey-compile-backlog-lib.mjs');
}

function makeBacklogEntry(overrides = {}) {
  return {
    rank: 1,
    signature: '29:66:2',
    manufacturerId: 29,
    productType: 66,
    productId: 2,
    nodeCount: 2,
    reviewNodeCount: 1,
    genericNodeCount: 1,
    emptyNodeCount: 0,
    outcomeCounts: { curated: 1, generic: 1 },
    actionableReasonCounts: { 'known-device-generic-fallback': 1 },
    pressure: {
      suppressedFillActionsTotal: 2,
      unmatchedActionsTotal: 4,
      appliedActionsTotal: 2,
      unmatchedRatio: 0.6667,
      highUnmatchedRatioSignalCount: 1,
    },
    sampleNodes: [
      {
        nodeId: 9,
        name: 'Hall Light',
        outcome: 'generic',
        homeyClass: 'light',
        confidence: 'generic',
        actionableReasons: ['known-device-generic-fallback'],
      },
    ],
    ...overrides,
  };
}

function writeBacklogFile(filePath, entries) {
  const totalNodes = entries.reduce((sum, entry) => sum + Number(entry.nodeCount || 0), 0);
  const reviewNodes = entries.reduce((sum, entry) => sum + Number(entry.reviewNodeCount || 0), 0);
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        schemaVersion: 'curation-backlog/v1',
        generatedAt: '2026-02-27T00:00:00.000Z',
        source: { url: 'ws://x', scope: 'all-nodes' },
        counts: {
          totalNodes,
          reviewNodes,
          signatures: entries.length,
        },
        entries,
      },
      null,
      2,
    ),
    'utf8',
  );
}

test('backlog parseCliArgs validates subcommands, formats, and required flags', async () => {
  const { parseCliArgs } = await loadLib();

  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(['unknown']).ok, false);
  assert.equal(parseCliArgs(['summary']).ok, false);
  assert.equal(
    parseCliArgs(['summary', '--input-file', 'x.json', '--format', 'list', '--top', '10']).ok,
    true,
  );
  assert.equal(
    parseCliArgs(['diff', '--from-file', 'a.json', '--to-file', 'b.json', '--only', 'worsened']).ok,
    true,
  );
  assert.equal(
    parseCliArgs([
      'scaffold',
      '--input-file',
      'x.json',
      '--signature',
      '29:66:2',
      '--format',
      'json-pretty',
    ]).ok,
    true,
  );
  assert.equal(
    parseCliArgs(['diff', '--from-file', 'a.json', '--to-file', 'b.json', '--only', 'bad']).ok,
    false,
  );
  assert.equal(
    parseCliArgs([
      'scaffold',
      '--input-file',
      'x.json',
      '--signature',
      '29:66:2',
      '--format',
      'ndjson',
    ]).ok,
    false,
  );
  assert.equal(
    parseCliArgs(['next', '--input-file', 'x.json', '--pick', '2', '--format', 'markdown']).ok,
    true,
  );
  assert.equal(
    parseCliArgs([
      'next',
      '--from-file',
      'a.json',
      '--to-file',
      'b.json',
      '--only',
      'worsened',
      '--candidate-policy',
      'pressure',
      '--fallback',
      'summary',
    ]).ok,
    true,
  );
  assert.equal(
    parseCliArgs(['next', '--input-file', 'x.json', '--from-file', 'a.json', '--to-file', 'b.json'])
      .ok,
    false,
  );
  assert.equal(
    parseCliArgs(['next', '--from-file', 'a.json', '--to-file', 'b.json', '--fallback', 'bad']).ok,
    false,
  );
  assert.equal(
    parseCliArgs([
      'next',
      '--from-file',
      'a.json',
      '--to-file',
      'b.json',
      '--candidate-policy',
      'bad',
    ]).ok,
    false,
  );
});

test('backlog summary command renders list/markdown/json/ndjson outputs', async () => {
  const { runBacklogCommand, formatBacklogOutput } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-backlog-summary-'));
  const inputFile = path.join(tmpDir, 'backlog.json');
  writeBacklogFile(inputFile, [
    makeBacklogEntry({ rank: 2, signature: '29:66:2' }),
    makeBacklogEntry({
      rank: 1,
      signature: '29:12801:1',
      manufacturerId: 29,
      productType: 12801,
      productId: 1,
      reviewNodeCount: 2,
      genericNodeCount: 2,
      actionableReasonCounts: { 'known-device-unmapped': 2 },
      sampleNodes: [{ nodeId: 12, name: 'Kitchen Dimmer', homeyClass: 'light' }],
    }),
  ]);

  const result = runBacklogCommand({
    subcommand: 'summary',
    inputFile,
    top: 1,
    format: 'list',
  });

  assert.equal(result.kind, 'summary');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].signature, '29:12801:1');
  assert.match(formatBacklogOutput(result, 'list'), /Signature/);
  assert.match(formatBacklogOutput(result, 'summary'), /Backlog file:/);
  assert.match(formatBacklogOutput(result, 'markdown'), /# Curation Backlog/);
  assert.doesNotThrow(() => JSON.parse(formatBacklogOutput(result, 'json')));
  assert.doesNotThrow(() => JSON.parse(formatBacklogOutput(result, 'json-compact')));
  assert.match(formatBacklogOutput(result, 'ndjson'), /"type":"backlogEntry"/);
});

test('backlog diff command reports worsened and improved signatures', async () => {
  const { runBacklogCommand, formatBacklogOutput } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-backlog-diff-'));
  const fromFile = path.join(tmpDir, 'from.json');
  const toFile = path.join(tmpDir, 'to.json');

  writeBacklogFile(fromFile, [
    makeBacklogEntry({
      rank: 1,
      signature: '29:66:2',
      reviewNodeCount: 2,
      genericNodeCount: 2,
      emptyNodeCount: 0,
      nodeCount: 2,
    }),
    makeBacklogEntry({
      rank: 2,
      signature: '99:1:1',
      manufacturerId: 99,
      productType: 1,
      productId: 1,
      reviewNodeCount: 1,
      genericNodeCount: 1,
      nodeCount: 1,
    }),
  ]);

  writeBacklogFile(toFile, [
    makeBacklogEntry({
      rank: 1,
      signature: '29:66:2',
      reviewNodeCount: 1,
      genericNodeCount: 1,
      emptyNodeCount: 0,
      nodeCount: 2,
    }),
    makeBacklogEntry({
      rank: 2,
      signature: '77:2:9',
      manufacturerId: 77,
      productType: 2,
      productId: 9,
      reviewNodeCount: 3,
      genericNodeCount: 2,
      emptyNodeCount: 1,
      nodeCount: 3,
      actionableReasonCounts: { 'known-device-unmapped': 3 },
    }),
  ]);

  const result = runBacklogCommand({
    subcommand: 'diff',
    fromFile,
    toFile,
    only: 'all',
    top: 10,
    format: 'summary',
  });

  assert.equal(result.kind, 'diff');
  assert.equal(result.entries.length, 3);
  assert.equal(result.totals.directionCounts.worsened, 1);
  assert.equal(result.totals.directionCounts.improved, 2);
  assert.equal(result.entries[0].signature, '77:2:9');
  assert.match(formatBacklogOutput(result, 'summary'), /Diff entries: 3/);
  assert.match(formatBacklogOutput(result, 'markdown'), /# Curation Backlog Diff/);
  assert.match(formatBacklogOutput(result, 'ndjson'), /"type":"backlogDiff"/);
});

test('backlog scaffold command generates a project-product rule template for a signature', async () => {
  const { runBacklogCommand, formatBacklogOutput } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-backlog-scaffold-'));
  const inputFile = path.join(tmpDir, 'backlog.json');
  writeBacklogFile(inputFile, [makeBacklogEntry({ signature: '29:66:2' })]);

  const result = runBacklogCommand(
    {
      subcommand: 'scaffold',
      inputFile,
      signature: '29:66:2',
      ruleIdPrefix: 'product',
      productName: 'Leviton ZW15S',
      driverTemplateId: 'product-leviton-switch',
      homeyClass: 'socket',
      format: 'summary',
    },
    { nowDate: new Date('2026-02-27T12:00:00.000Z') },
  );

  assert.equal(result.kind, 'scaffold');
  assert.equal(result.templateBundle.schemaVersion, 'product-rules/v1');
  assert.equal(result.templateBundle.name, 'Leviton ZW15S');
  assert.equal(result.templateBundle.target.manufacturerId, 29);
  assert.equal(result.templateBundle.target.productType, 66);
  assert.equal(result.templateBundle.target.productId, 2);
  assert.equal(result.templateBundle.rules.length, 1);
  assert.equal(
    result.templateBundle.rules[0].actions[0].driverTemplateId,
    'product-leviton-switch',
  );
  assert.equal(result.fileHint, 'rules/project/product/product-29-66-2.json');
  assert.match(formatBacklogOutput(result, 'summary'), /File hint:/);
  assert.match(formatBacklogOutput(result, 'markdown'), /# Product Rule Scaffold/);
  assert.doesNotThrow(() => JSON.parse(formatBacklogOutput(result, 'json')));

  assert.throws(
    () =>
      runBacklogCommand({
        subcommand: 'scaffold',
        inputFile,
        signature: '77:2:9',
        ruleIdPrefix: 'product',
        format: 'summary',
      }),
    /not found/i,
  );
});

test('backlog next summary mode selects actionable signature and prints command hints', async () => {
  const { runBacklogCommand, formatBacklogOutput } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-backlog-next-summary-'));
  const inputFile = path.join(tmpDir, 'backlog.json');
  writeBacklogFile(inputFile, [
    makeBacklogEntry({
      rank: 1,
      signature: '1:1:1',
      reviewNodeCount: 0,
      genericNodeCount: 0,
      emptyNodeCount: 0,
      actionableReasonCounts: {},
      pressure: {
        suppressedFillActionsTotal: 0,
        unmatchedActionsTotal: 0,
        appliedActionsTotal: 4,
        unmatchedRatio: 0,
        highUnmatchedRatioSignalCount: 0,
      },
    }),
    makeBacklogEntry({
      rank: 2,
      signature: '29:66:2',
      reviewNodeCount: 2,
      genericNodeCount: 2,
      actionableReasonCounts: { 'known-device-unmapped': 2 },
    }),
  ]);

  const result = runBacklogCommand({
    subcommand: 'next',
    mode: 'summary',
    inputFile,
    pick: 1,
    format: 'summary',
  });

  assert.equal(result.kind, 'next');
  assert.equal(result.selectionMode, 'summary');
  assert.equal(result.candidatePolicy, 'curation');
  assert.equal(result.selected.signature, '29:66:2');
  assert.equal(result.candidateCount, 1);
  assert.match(result.commands.scaffold, /compiler:backlog -- scaffold/);
  assert.match(result.commands.inspectLive, /compiler:inspect-live -- --url/);
  assert.match(result.commands.validateLive, /compiler:validate-live -- --url/);
  assert.match(result.commands.loop, /compiler:loop -- --url/);
  assert.match(formatBacklogOutput(result, 'summary'), /Selected: 29:66:2/);
  assert.match(formatBacklogOutput(result, 'list'), /Field/);
  assert.match(formatBacklogOutput(result, 'markdown'), /# Next Curation Target/);
});

test('backlog next diff mode prefers diff candidates and falls back to summary when diff is empty', async () => {
  const { runBacklogCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-backlog-next-diff-'));
  const fromFile = path.join(tmpDir, 'from.json');
  const toFile = path.join(tmpDir, 'to.json');
  const toNoDiffFile = path.join(tmpDir, 'to-no-diff.json');

  writeBacklogFile(fromFile, [
    makeBacklogEntry({
      rank: 1,
      signature: '29:66:2',
      reviewNodeCount: 1,
      genericNodeCount: 1,
      nodeCount: 2,
    }),
  ]);
  writeBacklogFile(toFile, [
    makeBacklogEntry({
      rank: 1,
      signature: '29:66:2',
      reviewNodeCount: 3,
      genericNodeCount: 2,
      nodeCount: 2,
      actionableReasonCounts: { 'known-device-unmapped': 3 },
    }),
  ]);
  writeBacklogFile(toNoDiffFile, [
    makeBacklogEntry({
      rank: 1,
      signature: '29:66:2',
      reviewNodeCount: 1,
      genericNodeCount: 1,
      nodeCount: 2,
      actionableReasonCounts: { 'known-device-unmapped': 1 },
    }),
  ]);

  const diffResult = runBacklogCommand({
    subcommand: 'next',
    mode: 'diff',
    fromFile,
    toFile,
    only: 'worsened',
    candidatePolicy: 'curation',
    fallback: 'summary',
    pick: 1,
    format: 'summary',
  });
  assert.equal(diffResult.selectionMode, 'diff');
  assert.equal(diffResult.fallbackUsed, false);
  assert.equal(diffResult.diff.status, 'changed');
  assert.equal(diffResult.selected.signature, '29:66:2');

  const fallbackResult = runBacklogCommand({
    subcommand: 'next',
    mode: 'diff',
    fromFile,
    toFile: toNoDiffFile,
    only: 'worsened',
    candidatePolicy: 'curation',
    fallback: 'summary',
    pick: 1,
    format: 'summary',
  });
  assert.equal(fallbackResult.selectionMode, 'fallback-summary');
  assert.equal(fallbackResult.fallbackUsed, true);
  assert.equal(fallbackResult.selected.signature, '29:66:2');

  assert.throws(
    () =>
      runBacklogCommand({
        subcommand: 'next',
        mode: 'diff',
        fromFile,
        toFile: toNoDiffFile,
        only: 'worsened',
        candidatePolicy: 'curation',
        fallback: 'none',
        pick: 1,
        format: 'summary',
      }),
    /No diff .*candidates found/i,
  );
});

test('backlog next candidate policy defaults to curation and can opt into pressure-only signatures', async () => {
  const { runBacklogCommand } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-backlog-next-policy-'));
  const inputFile = path.join(tmpDir, 'backlog.json');
  writeBacklogFile(inputFile, [
    makeBacklogEntry({
      rank: 1,
      signature: '29:66:2',
      reviewNodeCount: 0,
      genericNodeCount: 0,
      emptyNodeCount: 0,
      actionableReasonCounts: {},
      pressure: {
        suppressedFillActionsTotal: 3,
        unmatchedActionsTotal: 8,
        appliedActionsTotal: 2,
        unmatchedRatio: 0.8,
        highUnmatchedRatioSignalCount: 1,
      },
    }),
  ]);

  assert.throws(
    () =>
      runBacklogCommand({
        subcommand: 'next',
        mode: 'summary',
        inputFile,
        candidatePolicy: 'curation',
        pick: 1,
        format: 'summary',
      }),
    /No curation signatures found/i,
  );

  const pressureResult = runBacklogCommand({
    subcommand: 'next',
    mode: 'summary',
    inputFile,
    candidatePolicy: 'pressure',
    pick: 1,
    format: 'summary',
  });
  assert.equal(pressureResult.selected.signature, '29:66:2');
  assert.equal(pressureResult.candidatePolicy, 'pressure');
});

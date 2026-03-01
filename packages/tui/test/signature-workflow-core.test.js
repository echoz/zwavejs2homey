const test = require('node:test');
const assert = require('node:assert/strict');

const { SignatureWorkflowCore } = require('../dist/presenter/signature-workflow-core');

function createCore(overrides = {}) {
  const calls = {
    inspect: null,
    validate: null,
    simulate: null,
    scaffold: null,
    info: [],
    error: [],
  };
  const curation = {
    async inspectSignature(session, signature, options) {
      calls.inspect = { session, signature, options };
      return {
        signature,
        totalNodes: 1,
        outcomeCounts: { curated: 1 },
        nodes: [],
      };
    },
    async validateSignature(session, signature, options) {
      calls.validate = { session, signature, options };
      return {
        signature,
        totalNodes: 1,
        reviewNodes: 0,
        outcomes: { curated: 1 },
      };
    },
    async simulateSignature(session, signature, options) {
      calls.simulate = { session, signature, options };
      return {
        signature,
        dryRun: false,
        inspectSkipped: false,
        inspectFormat: 'list',
        inspectCommandLine: 'inspect',
        validateCommandLine: 'validate',
        gatePassed: true,
        totalNodes: 1,
        reviewNodes: 0,
        outcomes: { curated: 1 },
        reportFile: '/tmp/report.json',
        summaryJsonFile: '/tmp/summary.json',
      };
    },
    scaffoldFromSignature(signature, options) {
      calls.scaffold = { signature, options };
      return {
        signature,
        fileHint: 'rules/project/product/example.json',
        generatedAt: new Date().toISOString(),
        bundle: { schemaVersion: 'product-rules/v1', rules: [] },
      };
    },
    ...overrides.curation,
  };

  const core = new SignatureWorkflowCore({
    curation,
    resolveSession: overrides.resolveSession ?? (() => ({ url: 'ws://127.0.0.1:3000' })),
    resolveDefaultManifestFile:
      overrides.resolveDefaultManifestFile ?? (() => 'rules/manifest.json'),
    logInfo(message) {
      calls.info.push(message);
    },
    logError(message) {
      calls.error.push(message);
    },
  });
  return { core, calls };
}

test('SignatureWorkflowCore validates manual signature format', () => {
  const { core } = createCore();
  const state = {};

  assert.throws(() => core.selectSignature(state, 'abc:def:ghi'), /Signature must be/);
  const selected = core.selectSignature(state, '29:66:2');
  assert.equal(selected, '29:66:2');
  assert.equal(state.selectedSignature, '29:66:2');
});

test('SignatureWorkflowCore applies default manifest file for live operations', async () => {
  const { core, calls } = createCore();
  const state = {};
  core.selectSignature(state, '29:66:2');

  await core.inspectSelectedSignature(state, { includeControllerNodes: true });
  await core.validateSelectedSignature(state, { nodeId: 7 });
  await core.simulateSelectedSignature(state, { dryRun: true });

  assert.equal(calls.inspect.options.manifestFile, 'rules/manifest.json');
  assert.equal(calls.validate.options.manifestFile, 'rules/manifest.json');
  assert.equal(calls.simulate.options.manifestFile, 'rules/manifest.json');
});

test('SignatureWorkflowCore respects explicit manifest file override', async () => {
  const { core, calls } = createCore();
  const state = {};
  core.selectSignature(state, '29:66:2');

  await core.inspectSelectedSignature(state, { manifestFile: 'rules/custom.json' });
  assert.equal(calls.inspect.options.manifestFile, 'rules/custom.json');
});

test('SignatureWorkflowCore scaffold infers homey class from inspect summary', () => {
  const { core, calls } = createCore();
  const state = {
    selectedSignature: '29:66:2',
    inspectSummary: {
      signature: '29:66:2',
      totalNodes: 3,
      outcomeCounts: { generic: 3 },
      nodes: [
        { nodeId: 1, homeyClass: 'light' },
        { nodeId: 2, homeyClass: 'other' },
        { nodeId: 3, homeyClass: 'light' },
      ],
    },
  };

  const draft = core.createScaffoldFromSignature(state, {});
  assert.equal(draft.signature, '29:66:2');
  assert.equal(calls.scaffold.options.homeyClass, 'light');
  assert.equal(state.scaffoldDraft.signature, '29:66:2');
});

test('SignatureWorkflowCore scaffold requires selected signature', () => {
  const { core } = createCore();
  const state = {};
  assert.throws(() => core.createScaffoldFromSignature(state, {}), /No signature selected/);
});

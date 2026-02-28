const test = require('node:test');
const assert = require('node:assert/strict');

const { parseShellCommand } = require('../dist/view/command-parser');

test('parseShellCommand parses signature/inspect/validate commands', () => {
  assert.deepEqual(parseShellCommand('signature 29:66:2'), {
    ok: true,
    command: {
      type: 'signature',
      signature: '29:66:2',
      fromNodeId: undefined,
      fromRuleIndex: undefined,
    },
  });
  assert.deepEqual(parseShellCommand('signature --from-node 5'), {
    ok: true,
    command: {
      type: 'signature',
      signature: undefined,
      fromNodeId: 5,
      fromRuleIndex: undefined,
    },
  });
  assert.deepEqual(parseShellCommand('signature --from-rule 2'), {
    ok: true,
    command: {
      type: 'signature',
      signature: undefined,
      fromNodeId: undefined,
      fromRuleIndex: 2,
    },
  });
  assert.deepEqual(parseShellCommand('inspect --manifest rules/manifest.json'), {
    ok: true,
    command: { type: 'inspect', manifestFile: 'rules/manifest.json' },
  });
  assert.deepEqual(parseShellCommand('validate'), {
    ok: true,
    command: { type: 'validate', manifestFile: undefined },
  });
  assert.deepEqual(parseShellCommand('simulate --dry-run --skip-inspect --inspect-format list'), {
    ok: true,
    command: {
      type: 'simulate',
      manifestFile: undefined,
      dryRun: true,
      skipInspect: true,
      inspectFormat: 'list',
    },
  });
});

test('parseShellCommand parses scaffold/log commands', () => {
  assert.deepEqual(parseShellCommand('scaffold preview --product-name Plug'), {
    ok: true,
    command: { type: 'scaffold-preview', productName: 'Plug', homeyClass: undefined },
  });
  assert.deepEqual(parseShellCommand('scaffold preview --homey-class light'), {
    ok: true,
    command: { type: 'scaffold-preview', productName: undefined, homeyClass: 'light' },
  });
  assert.deepEqual(parseShellCommand('scaffold write out.json --force'), {
    ok: true,
    command: { type: 'scaffold-write', filePath: 'out.json', force: true },
  });
  assert.deepEqual(
    parseShellCommand('manifest add product-29-66-2.json --manifest rules/manifest.json --force'),
    {
      ok: true,
      command: {
        type: 'manifest-add',
        filePath: 'product-29-66-2.json',
        manifestFile: 'rules/manifest.json',
        force: true,
      },
    },
  );
  assert.deepEqual(parseShellCommand('status'), {
    ok: true,
    command: { type: 'status' },
  });
  assert.deepEqual(parseShellCommand('log --limit 15'), {
    ok: true,
    command: { type: 'log', limit: 15 },
  });
});

test('parseShellCommand rejects malformed input', () => {
  assert.deepEqual(parseShellCommand('signature invalid'), {
    ok: false,
    error: 'signature must be <manufacturerId:productType:productId>',
  });
  assert.deepEqual(parseShellCommand('unknown cmd'), {
    ok: false,
    error: 'Unknown command: unknown',
  });
  assert.deepEqual(parseShellCommand('signature --from-node 5 --from-rule 2'), {
    ok: false,
    error: 'signature accepts only one source: --from-node or --from-rule',
  });
});

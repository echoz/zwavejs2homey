const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/hardcoding-policy-guard-lib.mjs');
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

test('parseCliArgs rejects unsupported flags for hardcoding guard tool', async () => {
  const { parseCliArgs } = await loadLib();
  const parsed = parseCliArgs(['--unknown-flag']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Unsupported flag/);
});

test('runPolicyHardcodingGuard allows protected literals only inside approved files', async () => {
  const { runPolicyHardcodingGuard } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-hardcoding-guard-pass-'));
  writeFile(
    path.join(tmpDir, 'packages/compiler/src/importers/ha/platform-output-policy.ts'),
    "const HOMEY_CLASS = 'light';\n",
  );
  writeFile(path.join(tmpDir, 'packages/core/src/safe.ts'), "const ok = 'hello';\n");

  const result = runPolicyHardcodingGuard({
    workspaceRoot: tmpDir,
    includeRoots: ['packages'],
  });

  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
});

test('runPolicyHardcodingGuard reports protected literals outside approved policy files', async () => {
  const { runPolicyHardcodingGuard } = await loadLib();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-hardcoding-guard-fail-'));
  writeFile(path.join(tmpDir, 'packages/core/src/not-allowed.ts'), "const id = 'onoff';\n");

  const result = runPolicyHardcodingGuard({
    workspaceRoot: tmpDir,
    includeRoots: ['packages'],
  });

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'packages/core/src/not-allowed.ts');
  assert.equal(result.violations[0].literals.includes('onoff'), true);
});

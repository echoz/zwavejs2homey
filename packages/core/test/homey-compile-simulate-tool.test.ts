const test = require('node:test');
const assert = require('node:assert/strict');

async function loadLib() {
  return import('../../../tools/homey-compile-simulate-lib.mjs');
}

test('compiler simulate parseCliArgs validates signature source and simulate options', async () => {
  const { parseCliArgs } = await loadLib();

  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(['--unknown-flag']).ok, false);
  assert.equal(parseCliArgs(['--signature', '29:66:2', '--backlog-file', 'x.json']).ok, false);
  assert.equal(parseCliArgs(['--signature', '29:66:2', '--pick', '2']).ok, false);
  assert.equal(parseCliArgs(['--from-backlog-file', 'a.json']).ok, false);
  assert.equal(parseCliArgs(['--signature', 'bad-signature']).ok, false);
  const parsedSignature = parseCliArgs([
    '--signature',
    '29:66:2',
    '--format',
    'markdown',
    '--inspect-format',
    'json',
    '--dry-run',
    '--url',
    'ws://x',
    '--all-nodes',
  ]);
  assert.equal(parsedSignature.ok, true);
  assert.equal(parsedSignature.command.dryRun, true);
  assert.equal(parsedSignature.command.forwardedArgv.includes('--dry-run'), false);
});

test('runSimulationCommand runs inspect + validate with explicit signature and default manifest fallback', async () => {
  const { parseCliArgs, runSimulationCommand, formatSimulationOutput } = await loadLib();
  const parsed = parseCliArgs(['--url', 'ws://x', '--all-nodes', '--signature', '29:66:2']);
  assert.equal(parsed.ok, true);

  const inspectParseCalls = [];
  const validateParseCalls = [];
  let inspectRunCount = 0;
  let validateRunCount = 0;

  const result = await runSimulationCommand(
    parsed.command,
    { log: () => {} },
    {
      parseInspectLiveCliImpl: (argv) => {
        inspectParseCalls.push(argv);
        return { ok: true, command: { format: 'list' } };
      },
      runLiveInspectCommandImpl: async () => {
        inspectRunCount += 1;
      },
      parseValidateLiveCliImpl: (argv) => {
        validateParseCalls.push(argv);
        return {
          ok: true,
          command: {
            reportFile: '/tmp/compiled-live.validation.md',
            summaryJsonFile: '/tmp/compiled-live.summary.json',
          },
        };
      },
      runValidateLiveCommandImpl: async () => {
        validateRunCount += 1;
        return {
          gateResult: { passed: true },
          summary: {
            totalNodes: 4,
            reviewNodes: 1,
            outcomes: { curated: 3, generic: 1 },
          },
        };
      },
    },
  );

  assert.equal(inspectParseCalls.length, 1);
  assert.equal(validateParseCalls.length, 1);
  assert.equal(inspectRunCount, 1);
  assert.equal(validateRunCount, 1);
  assert.equal(inspectParseCalls[0].includes('--signature'), true);
  assert.equal(inspectParseCalls[0].includes('29:66:2'), true);
  assert.equal(inspectParseCalls[0].includes('--manifest-file'), true);
  assert.equal(inspectParseCalls[0].includes('rules/manifest.json'), true);
  assert.equal(validateParseCalls[0].includes('--signature'), true);
  assert.equal(validateParseCalls[0].includes('29:66:2'), true);
  assert.equal(validateParseCalls[0].includes('--manifest-file'), true);

  assert.equal(result.signature, '29:66:2');
  assert.equal(result.inspect.skipped, false);
  assert.equal(result.validate.gatePassed, true);
  assert.equal(result.validate.reviewNodes, 1);
  assert.match(formatSimulationOutput(result, 'summary'), /Signature: 29:66:2/);
  assert.match(formatSimulationOutput(result, 'markdown'), /# Compiler Simulation/);
  assert.doesNotThrow(() => JSON.parse(formatSimulationOutput(result, 'json')));
});

test('runSimulationCommand supports --skip-inspect with explicit signature', async () => {
  const { parseCliArgs, runSimulationCommand } = await loadLib();
  const parsed = parseCliArgs([
    '--url',
    'ws://x',
    '--all-nodes',
    '--signature',
    '77:2:9',
    '--skip-inspect',
  ]);
  assert.equal(parsed.ok, true);

  let inspectRunCount = 0;
  const validateParseCalls = [];

  const result = await runSimulationCommand(
    parsed.command,
    { log: () => {} },
    {
      parseInspectLiveCliImpl: () => {
        throw new Error('inspect parse should not be called when --skip-inspect is set');
      },
      runLiveInspectCommandImpl: async () => {
        inspectRunCount += 1;
      },
      parseValidateLiveCliImpl: (argv) => {
        validateParseCalls.push(argv);
        return { ok: true, command: {} };
      },
      runValidateLiveCommandImpl: async () => ({
        gateResult: { passed: true },
        summary: { totalNodes: 1, reviewNodes: 0, outcomes: { curated: 1 } },
      }),
    },
  );

  assert.equal(validateParseCalls.length, 1);
  assert.equal(validateParseCalls[0].includes('77:2:9'), true);
  assert.equal(result.signature, '77:2:9');
  assert.equal(result.inspect.skipped, true);
  assert.equal(inspectRunCount, 0);
});

test('runSimulationCommand dry-run resolves and validates commands without executing inspect/validate', async () => {
  const { parseCliArgs, runSimulationCommand } = await loadLib();
  const parsed = parseCliArgs([
    '--url',
    'ws://x',
    '--all-nodes',
    '--signature',
    '29:66:2',
    '--dry-run',
  ]);
  assert.equal(parsed.ok, true);

  let inspectRunCount = 0;
  let validateRunCount = 0;
  let inspectParseCount = 0;
  let validateParseCount = 0;
  const logs = [];

  const result = await runSimulationCommand(
    parsed.command,
    { log: (line) => logs.push(line) },
    {
      parseInspectLiveCliImpl: () => {
        inspectParseCount += 1;
        return { ok: true, command: {} };
      },
      runLiveInspectCommandImpl: async () => {
        inspectRunCount += 1;
      },
      parseValidateLiveCliImpl: () => {
        validateParseCount += 1;
        return { ok: true, command: { reportFile: '/tmp/r.md' } };
      },
      runValidateLiveCommandImpl: async () => {
        validateRunCount += 1;
        return {};
      },
    },
  );

  assert.equal(inspectParseCount, 1);
  assert.equal(validateParseCount, 1);
  assert.equal(inspectRunCount, 0);
  assert.equal(validateRunCount, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.validate.gatePassed, null);
  assert.match(result.validate.commandLine, /compiler:validate-live/);
  assert.equal(
    logs.some((line) => /Dry run/.test(line)),
    true,
  );
});

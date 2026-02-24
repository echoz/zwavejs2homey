import fs from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const { compileProfilePlanFromRuleSetManifest } = require('../packages/compiler/dist');

function parseFlagMap(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [key, inline] = token.split('=', 2);
    if (inline !== undefined) {
      flags.set(key, inline);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, 'true');
    }
  }
  return flags;
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-compile-bench --device-file <device.json> --rules-file <rules.json> [--rules-file <rules2.json> ...]',
    '  homey-compile-bench --device-file <device.json> --manifest <manifest.json>',
    '                    [--iterations 200] [--warmup 20] [--homey-class <class>] [--driver-template <id>]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const flags = parseFlagMap(argv);
  const deviceFile = flags.get('--device-file');
  const manifest = flags.get('--manifest');
  const rulesFiles = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rules-file' && argv[i + 1]) rulesFiles.push(argv[i + 1]);
    if (argv[i].startsWith('--rules-file=')) rulesFiles.push(argv[i].split('=', 2)[1]);
  }
  if (!deviceFile) return { ok: false, error: '--device-file is required' };
  if (!manifest && rulesFiles.length === 0) {
    return { ok: false, error: 'Provide --manifest or at least one --rules-file' };
  }
  if (manifest && rulesFiles.length > 0) {
    return { ok: false, error: 'Use either --manifest or --rules-file, not both' };
  }
  const iterations = Number(flags.get('--iterations') ?? '200');
  const warmup = Number(flags.get('--warmup') ?? '20');
  if (!Number.isInteger(iterations) || iterations < 1) {
    return { ok: false, error: `Invalid --iterations: ${flags.get('--iterations')}` };
  }
  if (!Number.isInteger(warmup) || warmup < 0) {
    return { ok: false, error: `Invalid --warmup: ${flags.get('--warmup')}` };
  }
  return {
    ok: true,
    command: {
      deviceFile,
      manifest,
      rulesFiles,
      iterations,
      warmup,
      homeyClass: flags.get('--homey-class'),
      driverTemplateId: flags.get('--driver-template'),
    },
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveManifestEntries(command) {
  if (command.manifest) {
    const manifest = readJson(command.manifest);
    if (!Array.isArray(manifest)) throw new Error('Manifest JSON must be an array');
    return manifest;
  }
  return command.rulesFiles.map((filePath) => ({ filePath }));
}

function basicStats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const totalMs = samples.reduce((sum, x) => sum + x, 0);
  const avgMs = totalMs / samples.length;
  const p50Ms = sorted[Math.floor(sorted.length * 0.5)];
  const p95Ms = sorted[Math.floor(sorted.length * 0.95)];
  return {
    samples: samples.length,
    totalMs,
    avgMs,
    minMs: sorted[0],
    p50Ms,
    p95Ms,
    maxMs: sorted[sorted.length - 1],
  };
}

export function runCompileBenchmark(command) {
  const device = readJson(command.deviceFile);
  const manifestEntries = resolveManifestEntries(command);
  const options = {
    homeyClass: command.homeyClass,
    driverTemplateId: command.driverTemplateId,
  };

  for (let i = 0; i < command.warmup; i += 1) {
    compileProfilePlanFromRuleSetManifest(device, manifestEntries, options);
  }

  const samples = [];
  let lastResult;
  for (let i = 0; i < command.iterations; i += 1) {
    const start = performance.now();
    lastResult = compileProfilePlanFromRuleSetManifest(device, manifestEntries, options);
    samples.push(performance.now() - start);
  }

  return {
    benchmark: {
      iterations: command.iterations,
      warmup: command.warmup,
      ...basicStats(samples),
    },
    profileSummary: {
      profileId: lastResult?.profile.profileId,
      outcome: lastResult?.report.profileOutcome,
      capabilityCount: lastResult?.profile.capabilities.length ?? 0,
      curationReview: lastResult?.report.curationCandidates.likelyNeedsReview ?? false,
    },
  };
}

function fmt(ms) {
  return `${ms.toFixed(3)}ms`;
}

export function formatBenchmarkSummary(result) {
  return [
    `Iterations: ${result.benchmark.iterations} (warmup ${result.benchmark.warmup})`,
    `Timing: avg=${fmt(result.benchmark.avgMs)} p50=${fmt(result.benchmark.p50Ms)} p95=${fmt(result.benchmark.p95Ms)} min=${fmt(result.benchmark.minMs)} max=${fmt(result.benchmark.maxMs)}`,
    `Profile: ${result.profileSummary.profileId} outcome=${result.profileSummary.outcome} capabilities=${result.profileSummary.capabilityCount} curationReview=${result.profileSummary.curationReview}`,
  ].join('\n');
}

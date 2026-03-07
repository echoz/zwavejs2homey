import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ARTIFACT_FILE = path.resolve(
  'co.lazylabs.zwavejs2homey',
  'assets',
  'compiled',
  'compiled-homey-profiles.v1.json',
);
const DEFAULT_TOP = 10;

type AuditFormat = 'summary' | 'markdown' | 'json' | 'json-pretty' | 'json-compact';

export interface HomeyCapabilityCoverageAuditCommand {
  artifactFile: string;
  supportBundleFile?: string;
  top: number;
  format: AuditFormat;
  outputFile?: string;
}

export interface HomeyCapabilityCoverageAuditResult {
  schemaVersion: 'zwjs2homey-capability-coverage-audit/v1';
  generatedAt: string;
  source: {
    artifactFile: string;
    supportBundleFile: string | null;
  };
  summary: {
    mode: 'artifact-frequency-only' | 'runtime-diagnostics-weighted';
    artifactProfiles: number;
    artifactCapabilities: number;
    runtimeNodes: number;
    runtimeNodesWithKnownProfile: number;
    runtimeNodesWithSkipSignals: number;
    runtimeNodesMissingProfileInArtifact: number;
  };
  ranking: Array<{
    capabilityId: string;
    score: number;
    artifactProfiles: number;
    runtimeNodes: number;
    runtimeSkipSignals: number;
    mode: 'artifact-frequency-only' | 'runtime-diagnostics-weighted';
  }>;
}

interface ProfileCapabilityCoverage {
  profileCapsById: Map<string, string[]>;
  capabilityFrequency: Map<string, number>;
  profileCount: number;
}

interface RuntimePressureEntry {
  capabilityId: string;
  runtimeNodes: number;
  runtimeSkipSignals: number;
}

interface RuntimePressureSummary {
  pressureByCapability: Map<string, RuntimePressureEntry>;
  nodeCount: number;
  nodesWithKnownProfile: number;
  nodesWithSkipSignals: number;
  nodesWithMissingProfile: number;
}

interface RuntimeSupportNodeLike {
  profile?: {
    profileId?: unknown;
  };
  mapping?: {
    inboundSkipped?: unknown;
    outboundSkipped?: unknown;
  };
}

interface RuntimeSupportBundleLike {
  schemaVersion?: unknown;
  diagnostics?: {
    nodes?: RuntimeSupportNodeLike[];
  };
}

interface WrappedRuntimeSupportBundleLike {
  schemaVersion?: unknown;
  routes?: {
    supportBundle?: {
      data?: RuntimeSupportBundleLike;
    };
  };
}

export function getUsageText(): string {
  return [
    'Usage:',
    '  node tools/homey-capability-coverage-audit.mjs [options]',
    '',
    'Options:',
    `  --artifact-file <path>        Compiled artifact file (default: ${DEFAULT_ARTIFACT_FILE})`,
    '  --support-bundle-file <path>  Optional runtime support-bundle JSON file',
    `  --top <n>                     Number of ranked capability rows (default: ${DEFAULT_TOP})`,
    '  --format <summary|markdown|json|json-pretty|json-compact>',
    '                                Output format (default: summary)',
    '  --output-file <path>          Write output to file (otherwise prints to stdout)',
    '  --help                        Show this help',
    '',
    'Notes:',
    '  - Supports direct runtime support-bundle payloads (`homey-runtime-support-bundle/v1`).',
    '  - Also supports wrapper output from `homey:support-bundle` (`zwjs2homey-support-bundle/v1`).',
  ].join('\n');
}

function trimOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInt(value: unknown, flag: string): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseFlagMap(argv: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [flag, inlineValue] = token.split('=', 2);
    if (inlineValue !== undefined) {
      map.set(flag, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      map.set(flag, next);
      index += 1;
      continue;
    }
    map.set(flag, 'true');
  }
  return map;
}

function normalizeFormat(value: unknown): AuditFormat {
  const normalized = trimOrUndefined(value) ?? 'summary';
  if (
    normalized !== 'summary' &&
    normalized !== 'markdown' &&
    normalized !== 'json' &&
    normalized !== 'json-pretty' &&
    normalized !== 'json-compact'
  ) {
    throw new Error(
      '--format must be one of: summary, markdown, json, json-pretty, json-compact',
    );
  }
  return normalized;
}

function resolvePath(value: unknown, fallbackAbsolute: string): string {
  const normalized = trimOrUndefined(value);
  if (!normalized) return fallbackAbsolute;
  return path.resolve(normalized);
}

export function parseCliArgs(argv: string[]):
  | { ok: true; command: HomeyCapabilityCoverageAuditCommand }
  | { ok: false; error: string } {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { ok: false, error: getUsageText() };
  }

  try {
    const knownFlags = new Set([
      '--artifact-file',
      '--support-bundle-file',
      '--top',
      '--format',
      '--output-file',
    ]);

    for (const token of argv) {
      if (!token.startsWith('--')) continue;
      const [flag] = token.split('=', 1);
      if (!knownFlags.has(flag)) {
        throw new Error(`Unknown argument: ${flag}`);
      }
    }

    const flags = parseFlagMap(argv);
    const top = parsePositiveInt(flags.get('--top') ?? DEFAULT_TOP, '--top');
    const format = normalizeFormat(flags.get('--format'));
    const artifactFile = resolvePath(flags.get('--artifact-file'), DEFAULT_ARTIFACT_FILE);
    const supportBundleValue = trimOrUndefined(flags.get('--support-bundle-file'));
    const supportBundleFile = supportBundleValue ? path.resolve(supportBundleValue) : undefined;
    const outputFileValue = trimOrUndefined(flags.get('--output-file'));
    const outputFile = outputFileValue ? path.resolve(outputFileValue) : undefined;

    return {
      ok: true,
      command: {
        artifactFile,
        supportBundleFile,
        top,
        format,
        outputFile,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readArtifactProfileCapabilities(artifact: unknown): ProfileCapabilityCoverage {
  const profileCapsById = new Map<string, string[]>();
  const capabilityFrequency = new Map<string, number>();

  const entries = Array.isArray((artifact as { entries?: unknown[] } | undefined)?.entries)
    ? ((artifact as { entries: unknown[] }).entries ?? [])
    : [];

  for (const entry of entries) {
    const device = (entry as { device?: Record<string, unknown> })?.device;
    const manufacturerId = Number(device?.manufacturerId);
    const productType = Number(device?.productType);
    const productId = Number(device?.productId);
    if (
      !Number.isInteger(manufacturerId) ||
      !Number.isInteger(productType) ||
      !Number.isInteger(productId)
    ) {
      continue;
    }

    const profileId = `product-triple:${manufacturerId}:${productType}:${productId}`;
    const capabilities = new Set<string>();
    const capabilityRows = Array.isArray(
      (
        entry as {
          compiled?: { profile?: { capabilities?: Array<{ capabilityId?: unknown }> } };
        }
      )?.compiled?.profile?.capabilities,
    )
      ? (
          entry as {
            compiled: { profile: { capabilities: Array<{ capabilityId?: unknown }> } };
          }
        ).compiled.profile.capabilities
      : [];

    for (const row of capabilityRows) {
      const capabilityId = trimOrUndefined(row?.capabilityId);
      if (!capabilityId) continue;
      capabilities.add(capabilityId);
    }

    const orderedCapabilities = [...capabilities].sort((left, right) =>
      left.localeCompare(right),
    );
    profileCapsById.set(profileId, orderedCapabilities);
    for (const capabilityId of capabilities) {
      capabilityFrequency.set(capabilityId, (capabilityFrequency.get(capabilityId) ?? 0) + 1);
    }
  }

  return {
    profileCapsById,
    capabilityFrequency,
    profileCount: profileCapsById.size,
  };
}

function extractRuntimeSupportBundleDocument(input: unknown): RuntimeSupportBundleLike {
  const direct = input as RuntimeSupportBundleLike;
  if (direct?.schemaVersion === 'homey-runtime-support-bundle/v1') {
    return direct;
  }

  const wrapped = input as WrappedRuntimeSupportBundleLike;
  if (
    wrapped?.schemaVersion === 'zwjs2homey-support-bundle/v1' &&
    wrapped?.routes?.supportBundle?.data?.schemaVersion === 'homey-runtime-support-bundle/v1'
  ) {
    return wrapped.routes.supportBundle.data as RuntimeSupportBundleLike;
  }

  throw new Error(
    'support bundle file must be homey-runtime-support-bundle/v1 or zwjs2homey-support-bundle/v1 wrapper output',
  );
}

function toNumberOrZero(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

function collectRuntimePressure(
  runtimeBundle: RuntimeSupportBundleLike,
  profileCapsById: Map<string, string[]>,
): RuntimePressureSummary {
  const nodes = Array.isArray(runtimeBundle?.diagnostics?.nodes)
    ? (runtimeBundle.diagnostics?.nodes ?? [])
    : [];
  const pressureByCapability = new Map<string, RuntimePressureEntry>();
  let nodesWithKnownProfile = 0;
  let nodesWithSkipSignals = 0;
  let nodesWithMissingProfile = 0;

  for (const node of nodes) {
    const profileId = trimOrUndefined(node?.profile?.profileId);
    if (!profileId) continue;
    const capabilities = profileCapsById.get(profileId);
    if (!capabilities || capabilities.length === 0) {
      nodesWithMissingProfile += 1;
      continue;
    }

    nodesWithKnownProfile += 1;
    const inboundSkipped = toNumberOrZero(node?.mapping?.inboundSkipped);
    const outboundSkipped = toNumberOrZero(node?.mapping?.outboundSkipped);
    const skipSignals = Math.max(0, inboundSkipped + outboundSkipped);
    if (skipSignals > 0) {
      nodesWithSkipSignals += 1;
    }

    for (const capabilityId of capabilities) {
      if (!pressureByCapability.has(capabilityId)) {
        pressureByCapability.set(capabilityId, {
          capabilityId,
          runtimeNodes: 0,
          runtimeSkipSignals: 0,
        });
      }
      const row = pressureByCapability.get(capabilityId);
      if (!row) continue;
      row.runtimeNodes += 1;
      row.runtimeSkipSignals += skipSignals;
    }
  }

  return {
    pressureByCapability,
    nodeCount: nodes.length,
    nodesWithKnownProfile,
    nodesWithSkipSignals,
    nodesWithMissingProfile,
  };
}

function toRankingRows(options: {
  capabilityFrequency: Map<string, number>;
  runtimePressureByCapability: Map<string, RuntimePressureEntry>;
  top: number;
  mode: 'artifact-frequency-only' | 'runtime-diagnostics-weighted';
}): HomeyCapabilityCoverageAuditResult['ranking'] {
  const allCapabilityIds = new Set<string>([
    ...options.capabilityFrequency.keys(),
    ...options.runtimePressureByCapability.keys(),
  ]);

  const rows = [...allCapabilityIds].map((capabilityId) => {
    const artifactProfiles = options.capabilityFrequency.get(capabilityId) ?? 0;
    const runtimePressure = options.runtimePressureByCapability.get(capabilityId) ?? {
      capabilityId,
      runtimeNodes: 0,
      runtimeSkipSignals: 0,
    };
    const runtimeNodes = runtimePressure.runtimeNodes ?? 0;
    const runtimeSkipSignals = runtimePressure.runtimeSkipSignals ?? 0;
    const score =
      options.mode === 'artifact-frequency-only'
        ? artifactProfiles
        : runtimeSkipSignals * 100 + runtimeNodes * 10 + artifactProfiles;

    return {
      capabilityId,
      score,
      artifactProfiles,
      runtimeNodes,
      runtimeSkipSignals,
      mode: options.mode,
    };
  });

  rows.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    if (left.runtimeSkipSignals !== right.runtimeSkipSignals) {
      return right.runtimeSkipSignals - left.runtimeSkipSignals;
    }
    if (left.runtimeNodes !== right.runtimeNodes) return right.runtimeNodes - left.runtimeNodes;
    if (left.artifactProfiles !== right.artifactProfiles) {
      return right.artifactProfiles - left.artifactProfiles;
    }
    return left.capabilityId.localeCompare(right.capabilityId);
  });

  return rows.slice(0, options.top);
}

function formatSummary(result: HomeyCapabilityCoverageAuditResult): string {
  const lines = [
    'Homey Capability Coverage Audit',
    `Artifact profiles: ${result.summary.artifactProfiles}`,
    `Artifact capabilities: ${result.summary.artifactCapabilities}`,
    `Runtime nodes: ${result.summary.runtimeNodes}`,
    `Runtime nodes with known profile: ${result.summary.runtimeNodesWithKnownProfile}`,
    `Runtime nodes with skip signals: ${result.summary.runtimeNodesWithSkipSignals}`,
    `Runtime nodes missing profile in artifact: ${result.summary.runtimeNodesMissingProfileInArtifact}`,
    `Ranking mode: ${result.summary.mode}`,
    '',
    `Top ${result.ranking.length} capabilities by expansion pressure:`,
  ];
  if (result.ranking.length === 0) {
    lines.push('- (none)');
    return lines.join('\n');
  }

  for (const row of result.ranking) {
    lines.push(
      `- ${row.capabilityId}: score=${row.score} artifactProfiles=${row.artifactProfiles} runtimeNodes=${row.runtimeNodes} runtimeSkipSignals=${row.runtimeSkipSignals}`,
    );
  }
  return lines.join('\n');
}

function formatMarkdown(result: HomeyCapabilityCoverageAuditResult): string {
  const lines = [
    '# Homey Capability Coverage Audit',
    '',
    `- Artifact profiles: ${result.summary.artifactProfiles}`,
    `- Artifact capabilities: ${result.summary.artifactCapabilities}`,
    `- Runtime nodes: ${result.summary.runtimeNodes}`,
    `- Runtime nodes with known profile: ${result.summary.runtimeNodesWithKnownProfile}`,
    `- Runtime nodes with skip signals: ${result.summary.runtimeNodesWithSkipSignals}`,
    `- Runtime nodes missing profile in artifact: ${result.summary.runtimeNodesMissingProfileInArtifact}`,
    `- Ranking mode: ${result.summary.mode}`,
    '',
    `## Top ${result.ranking.length} capabilities by expansion pressure`,
    '',
  ];
  if (result.ranking.length === 0) {
    lines.push('- (none)');
    return lines.join('\n');
  }

  lines.push('| Capability | Score | Artifact Profiles | Runtime Nodes | Runtime Skip Signals |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const row of result.ranking) {
    lines.push(
      `| \`${row.capabilityId}\` | ${row.score} | ${row.artifactProfiles} | ${row.runtimeNodes} | ${row.runtimeSkipSignals} |`,
    );
  }
  return lines.join('\n');
}

function formatResult(result: HomeyCapabilityCoverageAuditResult, format: AuditFormat): string {
  if (format === 'summary') return formatSummary(result);
  if (format === 'markdown') return formatMarkdown(result);
  if (format === 'json') return JSON.stringify(result);
  if (format === 'json-pretty') return JSON.stringify(result, null, 2);
  if (format === 'json-compact') return JSON.stringify(result);
  return formatSummary(result);
}

function parseJson(contents: string, filePath: string): unknown {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function runHomeyCapabilityCoverageAudit(
  command: HomeyCapabilityCoverageAuditCommand,
  io: {
    log?: (line: string) => void;
  } = {},
  deps: {
    readFileImpl?: (path: string, encoding: BufferEncoding) => Promise<string>;
    writeFileImpl?: (
      path: string,
      contents: string,
      encoding: BufferEncoding,
    ) => Promise<void>;
    nowIso?: () => string;
  } = {},
): Promise<HomeyCapabilityCoverageAuditResult> {
  const readFileImpl = deps.readFileImpl ?? fs.readFile;
  const writeFileImpl = deps.writeFileImpl ?? fs.writeFile;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const log = io.log ?? ((line: string) => console.log(line));

  const artifactRaw = await readFileImpl(command.artifactFile, 'utf8');
  const artifact = parseJson(artifactRaw, command.artifactFile);
  const artifactCoverage = readArtifactProfileCapabilities(artifact);

  let runtimeBundle: RuntimeSupportBundleLike | undefined;
  if (command.supportBundleFile) {
    const supportBundleRaw = await readFileImpl(command.supportBundleFile, 'utf8');
    const supportBundleDocument = parseJson(supportBundleRaw, command.supportBundleFile);
    runtimeBundle = extractRuntimeSupportBundleDocument(supportBundleDocument);
  }

  const runtimePressure = runtimeBundle
    ? collectRuntimePressure(runtimeBundle, artifactCoverage.profileCapsById)
    : {
        pressureByCapability: new Map<string, RuntimePressureEntry>(),
        nodeCount: 0,
        nodesWithKnownProfile: 0,
        nodesWithSkipSignals: 0,
        nodesWithMissingProfile: 0,
      };

  const mode = runtimeBundle ? 'runtime-diagnostics-weighted' : 'artifact-frequency-only';
  const ranking = toRankingRows({
    capabilityFrequency: artifactCoverage.capabilityFrequency,
    runtimePressureByCapability: runtimePressure.pressureByCapability,
    top: command.top,
    mode,
  });

  const result: HomeyCapabilityCoverageAuditResult = {
    schemaVersion: 'zwjs2homey-capability-coverage-audit/v1',
    generatedAt: nowIso(),
    source: {
      artifactFile: command.artifactFile,
      supportBundleFile: command.supportBundleFile ?? null,
    },
    summary: {
      mode,
      artifactProfiles: artifactCoverage.profileCount,
      artifactCapabilities: artifactCoverage.capabilityFrequency.size,
      runtimeNodes: runtimePressure.nodeCount,
      runtimeNodesWithKnownProfile: runtimePressure.nodesWithKnownProfile,
      runtimeNodesWithSkipSignals: runtimePressure.nodesWithSkipSignals,
      runtimeNodesMissingProfileInArtifact: runtimePressure.nodesWithMissingProfile,
    },
    ranking,
  };

  const rendered = formatResult(result, command.format);
  if (command.outputFile) {
    await writeFileImpl(command.outputFile, rendered, 'utf8');
    log(`Wrote capability coverage audit: ${command.outputFile}`);
  } else {
    log(rendered);
  }

  return result;
}

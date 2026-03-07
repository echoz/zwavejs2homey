import fs from 'node:fs/promises';
import path from 'node:path';

type OutputFormat = 'summary' | 'markdown' | 'json' | 'json-pretty' | 'json-compact';

const DEFAULT_TOP = 10;

export interface CompileExpansionCandidatesCommand {
  inspectLiveFile: string;
  top: number;
  includeStable: boolean;
  format: OutputFormat;
  outputFile?: string;
}

interface InspectLiveNodeResultLike {
  node?: {
    nodeId?: unknown;
    name?: unknown;
  };
  deviceFacts?: {
    manufacturerId?: unknown;
    productType?: unknown;
    productId?: unknown;
  };
  compiled?: {
    profile?: {
      profileId?: unknown;
      classification?: {
        homeyClass?: unknown;
        confidence?: unknown;
      };
    };
    report?: {
      profileOutcome?: unknown;
      summary?: {
        unmatchedActions?: unknown;
      };
      curationCandidates?: {
        likelyNeedsReview?: unknown;
        reasons?: unknown;
      };
    };
  };
}

interface TripleAggregate {
  productTriple: string;
  manufacturerId: number;
  productType: number;
  productId: number;
  nodeCount: number;
  curatedNodes: number;
  haDerivedNodes: number;
  genericNodes: number;
  unknownNodes: number;
  reviewNodes: number;
  unmatchedActions: number;
  score: number;
  profileIds: Set<string>;
  sampleNodeIds: number[];
  sampleNames: string[];
  reasonCounts: Map<string, number>;
}

export interface CompileExpansionCandidatesResult {
  schemaVersion: 'zwjs2homey-compile-expansion-candidates/v1';
  generatedAt: string;
  source: {
    inspectLiveFile: string;
    includeStable: boolean;
  };
  summary: {
    totalNodes: number;
    candidateNodes: number;
    uniqueProductTriples: number;
    triplesNeedingReview: number;
  };
  ranking: Array<{
    productTriple: string;
    nodeCount: number;
    reviewNodes: number;
    genericNodes: number;
    unmatchedActions: number;
    score: number;
    suggestion:
      | 'author-product-rule'
      | 'tighten-existing-product-rule'
      | 'review-generic-classification'
      | 'stable';
    reasons: string[];
    sampleNodeIds: number[];
    sampleNames: string[];
    profileIds: string[];
  }>;
}

function trimOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toSafeInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toPositiveInt(value: unknown, flag: string): number {
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

function parseBooleanFlag(value: unknown, flag: string): boolean {
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error(`${flag} must be true|false|1|0|yes|no`);
}

function normalizeFormat(value: unknown): OutputFormat {
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

export function getUsageText(): string {
  return [
    'Usage:',
    '  node tools/homey-compile-expansion-candidates.mjs --inspect-live-file <file> [options]',
    '',
    'Required:',
    '  --inspect-live-file <path>  Output JSON file from `compiler:inspect-live --format json(-pretty)`',
    '',
    'Options:',
    `  --top <n>                   Number of ranked product triples (default: ${DEFAULT_TOP})`,
    '  --include-stable <bool>     Include stable triples in output (default: false)',
    '  --format <summary|markdown|json|json-pretty|json-compact>',
    '                              Output format (default: summary)',
    '  --output-file <path>        Write output to file (otherwise prints to stdout)',
    '  --help                      Show this help',
  ].join('\n');
}

export function parseCliArgs(argv: string[]):
  | { ok: true; command: CompileExpansionCandidatesCommand }
  | { ok: false; error: string } {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { ok: false, error: getUsageText() };
  }

  try {
    const knownFlags = new Set([
      '--inspect-live-file',
      '--top',
      '--include-stable',
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
    const inspectLiveFileValue = trimOrUndefined(flags.get('--inspect-live-file'));
    if (!inspectLiveFileValue) {
      throw new Error('--inspect-live-file is required');
    }
    const top = toPositiveInt(flags.get('--top') ?? DEFAULT_TOP, '--top');
    const includeStable = flags.has('--include-stable')
      ? parseBooleanFlag(flags.get('--include-stable'), '--include-stable')
      : false;

    return {
      ok: true,
      command: {
        inspectLiveFile: path.resolve(inspectLiveFileValue),
        top,
        includeStable,
        format: normalizeFormat(flags.get('--format')),
        outputFile: trimOrUndefined(flags.get('--output-file'))
          ? path.resolve(flags.get('--output-file') as string)
          : undefined,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function toProfileOutcomeBucket(outcome: string | undefined): 'curated' | 'ha' | 'generic' | 'unknown' {
  if (!outcome) return 'unknown';
  const normalized = outcome.trim().toLowerCase();
  if (normalized === 'curated') return 'curated';
  if (normalized === 'ha-derived') return 'ha';
  if (normalized === 'generic') return 'generic';
  return 'unknown';
}

function topReasonList(reasonCounts: Map<string, number>, max: number): string[] {
  return [...reasonCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, max)
    .map(([reason, count]) => `${reason}:${count}`);
}

function toSuggestion(row: TripleAggregate):
  | 'author-product-rule'
  | 'tighten-existing-product-rule'
  | 'review-generic-classification'
  | 'stable' {
  if (row.reviewNodes === 0 && row.genericNodes === 0) {
    return 'stable';
  }
  if (row.genericNodes === row.nodeCount && row.profileIds.size === 0) {
    return 'author-product-rule';
  }
  if (row.reviewNodes > 0) {
    return 'tighten-existing-product-rule';
  }
  if (row.genericNodes > 0) {
    return 'review-generic-classification';
  }
  return 'stable';
}

function shouldIncludeRow(row: TripleAggregate, includeStable: boolean): boolean {
  if (includeStable) return true;
  return row.reviewNodes > 0 || row.genericNodes > 0 || row.unknownNodes > 0;
}

function buildRanking(
  nodes: InspectLiveNodeResultLike[],
  includeStable: boolean,
  top: number,
): CompileExpansionCandidatesResult['ranking'] {
  const byTriple = new Map<string, TripleAggregate>();

  for (const node of nodes) {
    const manufacturerId = toSafeInteger(node.deviceFacts?.manufacturerId);
    const productType = toSafeInteger(node.deviceFacts?.productType);
    const productId = toSafeInteger(node.deviceFacts?.productId);
    if (
      manufacturerId === undefined ||
      productType === undefined ||
      productId === undefined
    ) {
      continue;
    }

    const productTriple = `${manufacturerId}:${productType}:${productId}`;
    if (!byTriple.has(productTriple)) {
      byTriple.set(productTriple, {
        productTriple,
        manufacturerId,
        productType,
        productId,
        nodeCount: 0,
        curatedNodes: 0,
        haDerivedNodes: 0,
        genericNodes: 0,
        unknownNodes: 0,
        reviewNodes: 0,
        unmatchedActions: 0,
        score: 0,
        profileIds: new Set<string>(),
        sampleNodeIds: [],
        sampleNames: [],
        reasonCounts: new Map<string, number>(),
      });
    }

    const bucket = byTriple.get(productTriple);
    if (!bucket) continue;

    bucket.nodeCount += 1;
    const profileOutcome = trimOrUndefined(node.compiled?.report?.profileOutcome);
    const outcomeBucket = toProfileOutcomeBucket(profileOutcome);
    if (outcomeBucket === 'curated') bucket.curatedNodes += 1;
    else if (outcomeBucket === 'ha') bucket.haDerivedNodes += 1;
    else if (outcomeBucket === 'generic') bucket.genericNodes += 1;
    else bucket.unknownNodes += 1;

    const unmatchedActions = Math.max(0, toSafeInteger(node.compiled?.report?.summary?.unmatchedActions) ?? 0);
    bucket.unmatchedActions += unmatchedActions;

    const likelyNeedsReview = node.compiled?.report?.curationCandidates?.likelyNeedsReview === true;
    if (likelyNeedsReview) {
      bucket.reviewNodes += 1;
    }

    const reasonsRaw = node.compiled?.report?.curationCandidates?.reasons;
    const reasons = Array.isArray(reasonsRaw) ? reasonsRaw : [];
    for (const reason of reasons) {
      const normalizedReason = trimOrUndefined(reason);
      if (!normalizedReason) continue;
      bucket.reasonCounts.set(normalizedReason, (bucket.reasonCounts.get(normalizedReason) ?? 0) + 1);
    }

    const profileId = trimOrUndefined(node.compiled?.profile?.profileId);
    if (profileId) {
      bucket.profileIds.add(profileId);
    }

    const nodeId = toSafeInteger(node.node?.nodeId);
    if (nodeId !== undefined && bucket.sampleNodeIds.length < 6) {
      bucket.sampleNodeIds.push(nodeId);
    }

    const nodeName = trimOrUndefined(node.node?.name);
    if (nodeName && bucket.sampleNames.length < 4 && !bucket.sampleNames.includes(nodeName)) {
      bucket.sampleNames.push(nodeName);
    }

    const genericScore = outcomeBucket === 'generic' ? 200 : 0;
    const unknownScore = outcomeBucket === 'unknown' ? 100 : 0;
    const reviewScore = likelyNeedsReview ? 1000 : 0;
    const unmatchedScore = Math.min(unmatchedActions, 100);
    bucket.score += reviewScore + genericScore + unknownScore + unmatchedScore + 10;
  }

  const rows = [...byTriple.values()]
    .filter((row) => shouldIncludeRow(row, includeStable))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.reviewNodes !== right.reviewNodes) return right.reviewNodes - left.reviewNodes;
      if (left.genericNodes !== right.genericNodes) return right.genericNodes - left.genericNodes;
      if (left.nodeCount !== right.nodeCount) return right.nodeCount - left.nodeCount;
      return left.productTriple.localeCompare(right.productTriple);
    })
    .slice(0, top)
    .map((row) => ({
      productTriple: row.productTriple,
      nodeCount: row.nodeCount,
      reviewNodes: row.reviewNodes,
      genericNodes: row.genericNodes,
      unmatchedActions: row.unmatchedActions,
      score: row.score,
      suggestion: toSuggestion(row),
      reasons: topReasonList(row.reasonCounts, 5),
      sampleNodeIds: row.sampleNodeIds,
      sampleNames: row.sampleNames,
      profileIds: [...row.profileIds].sort((a, b) => a.localeCompare(b)),
    }));

  return rows;
}

function formatSummary(result: CompileExpansionCandidatesResult): string {
  const lines = [
    'Compile Expansion Candidates',
    `Total nodes scanned: ${result.summary.totalNodes}`,
    `Candidate nodes with product triples: ${result.summary.candidateNodes}`,
    `Unique product triples: ${result.summary.uniqueProductTriples}`,
    `Triples needing review: ${result.summary.triplesNeedingReview}`,
    '',
    `Top ${result.ranking.length} triples:`,
  ];

  if (result.ranking.length === 0) {
    lines.push('- (none)');
  } else {
    for (const row of result.ranking) {
      lines.push(
        `- ${row.productTriple}: score=${row.score} nodes=${row.nodeCount} review=${row.reviewNodes} generic=${row.genericNodes} unmatched=${row.unmatchedActions} suggestion=${row.suggestion}`,
      );
      if (row.reasons.length > 0) {
        lines.push(`  reasons: ${row.reasons.join(', ')}`);
      }
      if (row.sampleNodeIds.length > 0) {
        lines.push(`  sampleNodeIds: ${row.sampleNodeIds.join(', ')}`);
      }
    }
  }
  return lines.join('\n');
}

function formatMarkdown(result: CompileExpansionCandidatesResult): string {
  const lines = [
    '# Compile Expansion Candidates',
    '',
    `- Total nodes scanned: ${result.summary.totalNodes}`,
    `- Candidate nodes with product triples: ${result.summary.candidateNodes}`,
    `- Unique product triples: ${result.summary.uniqueProductTriples}`,
    `- Triples needing review: ${result.summary.triplesNeedingReview}`,
    '',
    `## Top ${result.ranking.length} triples`,
    '',
  ];

  if (result.ranking.length === 0) {
    lines.push('- (none)');
    return lines.join('\n');
  }

  lines.push('| Product Triple | Score | Nodes | Review | Generic | Unmatched | Suggestion |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const row of result.ranking) {
    lines.push(
      `| \`${row.productTriple}\` | ${row.score} | ${row.nodeCount} | ${row.reviewNodes} | ${row.genericNodes} | ${row.unmatchedActions} | \`${row.suggestion}\` |`,
    );
  }
  return lines.join('\n');
}

function formatResult(result: CompileExpansionCandidatesResult, format: OutputFormat): string {
  if (format === 'summary') return formatSummary(result);
  if (format === 'markdown') return formatMarkdown(result);
  if (format === 'json') return JSON.stringify(result);
  if (format === 'json-pretty') return JSON.stringify(result, null, 2);
  if (format === 'json-compact') return JSON.stringify(result);
  return formatSummary(result);
}

function parseInspectLiveFile(contents: string, filePath: string): InspectLiveNodeResultLike[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new Error(
      `Failed to parse inspect-live JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const results = (parsed as { results?: unknown[] } | undefined)?.results;
  if (!Array.isArray(results)) {
    throw new Error(`Invalid inspect-live JSON: ${filePath} (expected root { results: [] })`);
  }
  return results as InspectLiveNodeResultLike[];
}

export async function runCompileExpansionCandidates(
  command: CompileExpansionCandidatesCommand,
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
): Promise<CompileExpansionCandidatesResult> {
  const readFileImpl = deps.readFileImpl ?? fs.readFile;
  const writeFileImpl = deps.writeFileImpl ?? fs.writeFile;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const log = io.log ?? ((line: string) => console.log(line));

  const raw = await readFileImpl(command.inspectLiveFile, 'utf8');
  const results = parseInspectLiveFile(raw, command.inspectLiveFile);

  const candidateRows = results.filter((row) => {
    return (
      toSafeInteger(row?.deviceFacts?.manufacturerId) !== undefined &&
      toSafeInteger(row?.deviceFacts?.productType) !== undefined &&
      toSafeInteger(row?.deviceFacts?.productId) !== undefined
    );
  });

  const ranking = buildRanking(candidateRows, command.includeStable, command.top);
  const triplesNeedingReview = buildRanking(candidateRows, false, Number.MAX_SAFE_INTEGER).length;
  const uniqueProductTriples = new Set(
    candidateRows.map((row) => {
      const manufacturerId = toSafeInteger(row?.deviceFacts?.manufacturerId);
      const productType = toSafeInteger(row?.deviceFacts?.productType);
      const productId = toSafeInteger(row?.deviceFacts?.productId);
      return `${manufacturerId}:${productType}:${productId}`;
    }),
  ).size;

  const output: CompileExpansionCandidatesResult = {
    schemaVersion: 'zwjs2homey-compile-expansion-candidates/v1',
    generatedAt: nowIso(),
    source: {
      inspectLiveFile: command.inspectLiveFile,
      includeStable: command.includeStable,
    },
    summary: {
      totalNodes: results.length,
      candidateNodes: candidateRows.length,
      uniqueProductTriples,
      triplesNeedingReview,
    },
    ranking,
  };

  const rendered = formatResult(output, command.format);
  if (command.outputFile) {
    await writeFileImpl(command.outputFile, rendered, 'utf8');
    log(`Wrote compile expansion candidates: ${command.outputFile}`);
  } else {
    log(rendered);
  }

  return output;
}

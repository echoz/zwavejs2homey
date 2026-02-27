import path from 'node:path';

import { runBacklogCommand } from '../../../../tools/homey-compile-backlog-lib.mjs';
import {
  parseCliArgs as parseInspectLiveCliArgs,
  runLiveInspectCommand,
} from '../../../../tools/homey-compile-inspect-live-lib.mjs';
import {
  parseCliArgs as parseValidateLiveCliArgs,
  runValidateLiveCommand,
} from '../../../../tools/homey-compile-validate-live-lib.mjs';
import { normalizeCompilerDeviceFactsFromZwjsDetail } from '../../../../tools/zwjs-to-compiler-facts-lib.mjs';

import type {
  BacklogSummary,
  NodeDetail,
  ScaffoldDraft,
  SessionConfig,
  SignatureInspectSummary,
  ValidationSummary,
} from '../model/types';

function coerceReviewReason(reasons: unknown): string | null {
  if (!Array.isArray(reasons) || reasons.length === 0) return null;
  for (const reason of reasons) {
    if (
      typeof reason === 'string' &&
      !reason.startsWith('suppressed-fill-actions:') &&
      !reason.startsWith('high-unmatched-ratio:')
    ) {
      return reason;
    }
  }
  return typeof reasons[0] === 'string' ? reasons[0] : null;
}

function parseInspectJson(lines: string[]): unknown {
  const content = lines.join('\n').trim();
  if (!content) {
    throw new Error('Inspect command produced no output');
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse inspect output: ${message}`);
  }
}

function countOutcomes(results: unknown[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of results) {
    const rowObj = row as Record<string, any>;
    const outcome =
      rowObj &&
      typeof rowObj === 'object' &&
      rowObj.compiled &&
      typeof rowObj.compiled === 'object' &&
      rowObj.compiled.report &&
      typeof rowObj.compiled.report === 'object' &&
      typeof rowObj.compiled.report.profileOutcome === 'string'
        ? rowObj.compiled.report.profileOutcome
        : 'unknown';
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function resolveDefaultManifestFile(manifestFile?: string): string {
  if (manifestFile) return manifestFile;
  return path.resolve(process.cwd(), 'rules/manifest.json');
}

export interface CompilerCurationService {
  deriveSignatureFromNodeDetail(detail: NodeDetail): string | null;
  inspectSignature(
    session: SessionConfig,
    signature: string,
    options?: { manifestFile?: string; includeControllerNodes?: boolean },
  ): Promise<SignatureInspectSummary>;
  validateSignature(
    session: SessionConfig,
    signature: string,
    options?: { manifestFile?: string; includeControllerNodes?: boolean },
  ): Promise<ValidationSummary>;
  loadBacklogSummary(backlogFile: string, options?: { top?: number }): BacklogSummary;
  scaffoldFromBacklog(
    backlogFile: string,
    signature: string,
    options?: { productName?: string; ruleIdPrefix?: string },
  ): ScaffoldDraft;
}

export class CompilerCurationServiceImpl implements CompilerCurationService {
  deriveSignatureFromNodeDetail(detail: NodeDetail): string | null {
    const facts = normalizeCompilerDeviceFactsFromZwjsDetail(detail);
    if (
      facts.manufacturerId === undefined ||
      facts.productType === undefined ||
      facts.productId === undefined
    ) {
      return null;
    }
    return `${facts.manufacturerId}:${facts.productType}:${facts.productId}`;
  }

  async inspectSignature(
    session: SessionConfig,
    signature: string,
    options: { manifestFile?: string; includeControllerNodes?: boolean } = {},
  ): Promise<SignatureInspectSummary> {
    const manifestFile = resolveDefaultManifestFile(options.manifestFile);
    const parsed = parseInspectLiveCliArgs([
      '--url',
      session.url,
      '--all-nodes',
      '--manifest-file',
      manifestFile,
      '--format',
      'json-compact',
      '--include-values',
      session.includeValues,
      '--max-values',
      String(session.maxValues),
      '--signature',
      signature,
      ...(session.token ? ['--token', session.token] : []),
      '--schema-version',
      String(session.schemaVersion),
      ...(options.includeControllerNodes ? ['--include-controller-nodes'] : []),
    ]);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    const logs: string[] = [];
    await runLiveInspectCommand(parsed.command, { log: (line: string) => logs.push(line) });
    const parsedJson = parseInspectJson(logs);
    const results =
      parsedJson &&
      typeof parsedJson === 'object' &&
      Array.isArray((parsedJson as { results?: unknown[] }).results)
        ? (parsedJson as { results: unknown[] }).results
        : null;
    if (!results) {
      throw new Error('Inspect output did not include results array');
    }

    return {
      signature,
      totalNodes: results.length,
      outcomeCounts: countOutcomes(results),
      nodes: results.map((row) => {
        const rowObj = row as Record<string, any>;
        return {
          nodeId: Number(rowObj?.node?.nodeId ?? -1),
          name: typeof rowObj?.node?.name === 'string' ? rowObj.node.name : null,
          homeyClass:
            typeof rowObj?.compiled?.profile?.classification?.homeyClass === 'string'
              ? rowObj.compiled.profile.classification.homeyClass
              : null,
          outcome:
            typeof rowObj?.compiled?.report?.profileOutcome === 'string'
              ? rowObj.compiled.report.profileOutcome
              : null,
          confidence:
            typeof rowObj?.compiled?.profile?.classification?.confidence === 'string'
              ? rowObj.compiled.profile.classification.confidence
              : null,
          reviewReason: coerceReviewReason(rowObj?.compiled?.report?.curationCandidates?.reasons),
        };
      }),
    };
  }

  async validateSignature(
    session: SessionConfig,
    signature: string,
    options: { manifestFile?: string; includeControllerNodes?: boolean } = {},
  ): Promise<ValidationSummary> {
    const manifestFile = resolveDefaultManifestFile(options.manifestFile);
    const parsed = parseValidateLiveCliArgs([
      '--url',
      session.url,
      '--all-nodes',
      '--manifest-file',
      manifestFile,
      '--signature',
      signature,
      '--include-values',
      session.includeValues,
      '--max-values',
      String(session.maxValues),
      '--schema-version',
      String(session.schemaVersion),
      ...(session.token ? ['--token', session.token] : []),
      ...(options.includeControllerNodes ? ['--include-controller-nodes'] : []),
    ]);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    const result = await runValidateLiveCommand(parsed.command, { log: () => {} });
    const summary = result.summary;
    return {
      signature,
      totalNodes: Number(summary?.totalNodes ?? 0),
      reviewNodes: Number(summary?.reviewNodes ?? 0),
      outcomes:
        summary?.outcomes && typeof summary.outcomes === 'object' ? { ...summary.outcomes } : {},
      reportFile:
        typeof parsed.command.reportFile === 'string' ? parsed.command.reportFile : undefined,
      artifactFile:
        typeof parsed.command.artifactFile === 'string' ? parsed.command.artifactFile : undefined,
    };
  }

  loadBacklogSummary(backlogFile: string, options: { top?: number } = {}): BacklogSummary {
    const result = runBacklogCommand({
      subcommand: 'summary',
      inputFile: backlogFile,
      top: options.top ?? 10,
      format: 'json-compact',
    });

    if (result.kind !== 'summary') {
      throw new Error(`Unexpected backlog result kind: ${String(result.kind)}`);
    }

    return {
      filePath: result.filePath,
      totalSignatures: Number(result.totals?.signatures ?? 0),
      totalNodes: Number(result.totals?.totalNodes ?? 0),
      reviewNodes: Number(result.totals?.reviewNodes ?? 0),
      entries: Array.isArray(result.entries)
        ? result.entries.map((entry: any) => ({
            rank: Number(entry.rank),
            signature: String(entry.signature),
            nodeCount: Number(entry.nodeCount ?? 0),
            reviewNodeCount: Number(entry.reviewNodeCount ?? 0),
            genericNodeCount: Number(entry.genericNodeCount ?? 0),
            emptyNodeCount: Number(entry.emptyNodeCount ?? 0),
            topReason:
              typeof entry.actionableReasonCounts === 'object' && entry.actionableReasonCounts
                ? Object.entries(entry.actionableReasonCounts).sort(
                    (a, b) => Number(b[1]) - Number(a[1]),
                  )[0]?.[0]
                : undefined,
          }))
        : [],
    };
  }

  scaffoldFromBacklog(
    backlogFile: string,
    signature: string,
    options: { productName?: string; ruleIdPrefix?: string } = {},
  ): ScaffoldDraft {
    const result = runBacklogCommand({
      subcommand: 'scaffold',
      inputFile: backlogFile,
      signature,
      ruleIdPrefix: options.ruleIdPrefix ?? 'product',
      productName: options.productName,
      format: 'json-compact',
    });

    if (result.kind !== 'scaffold') {
      throw new Error(`Unexpected scaffold result kind: ${String(result.kind)}`);
    }

    return {
      signature: result.signature,
      fileHint: result.fileHint,
      bundle: result.templateBundle,
      generatedAt: result.generatedAt,
    };
  }
}

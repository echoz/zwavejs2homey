import path from 'node:path';

import {
  parseCliArgs as parseInspectLiveCliArgs,
  runLiveInspectCommand,
} from '../../../../tools/homey-compile-inspect-live-lib.mjs';
import {
  parseCliArgs as parseValidateLiveCliArgs,
  runValidateLiveCommand,
} from '../../../../tools/homey-compile-validate-live-lib.mjs';
import {
  parseCliArgs as parseSimulateCliArgs,
  runSimulationCommand,
} from '../../../../tools/homey-compile-simulate-lib.mjs';
import { normalizeCompilerDeviceFactsFromZwjsDetail } from '../../../../tools/zwjs-to-compiler-facts-lib.mjs';

import type {
  ConnectedSessionConfig,
  NodeDetail,
  ScaffoldDraft,
  SimulationSummary,
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

function parseSignatureTriple(signature: string): {
  manufacturerId: number;
  productType: number;
  productId: number;
} {
  const match = /^(\d+):(\d+):(\d+)$/.exec(signature);
  if (!match) {
    throw new Error('Signature must be <manufacturerId:productType:productId> in decimal format');
  }
  return {
    manufacturerId: Number(match[1]),
    productType: Number(match[2]),
    productId: Number(match[3]),
  };
}

export interface CompilerCurationService {
  deriveSignatureFromNodeDetail(detail: NodeDetail): string | null;
  inspectSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options?: { manifestFile?: string; includeControllerNodes?: boolean; nodeId?: number },
  ): Promise<SignatureInspectSummary>;
  validateSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options?: { manifestFile?: string; includeControllerNodes?: boolean; nodeId?: number },
  ): Promise<ValidationSummary>;
  simulateSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options?: {
      manifestFile?: string;
      includeControllerNodes?: boolean;
      nodeId?: number;
      skipInspect?: boolean;
      dryRun?: boolean;
      inspectFormat?: string;
    },
  ): Promise<SimulationSummary>;
  scaffoldFromSignature(
    signature: string,
    options?: { productName?: string; ruleIdPrefix?: string; homeyClass?: string },
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
    session: ConnectedSessionConfig,
    signature: string,
    options: { manifestFile?: string; includeControllerNodes?: boolean; nodeId?: number } = {},
  ): Promise<SignatureInspectSummary> {
    const manifestFile = resolveDefaultManifestFile(options.manifestFile ?? session.manifestFile);
    const scopeArgs =
      Number.isInteger(options.nodeId) && (options.nodeId as number) > 0
        ? ['--node', String(options.nodeId)]
        : ['--all-nodes'];
    const parsed = parseInspectLiveCliArgs([
      '--url',
      session.url,
      ...scopeArgs,
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
    session: ConnectedSessionConfig,
    signature: string,
    options: { manifestFile?: string; includeControllerNodes?: boolean; nodeId?: number } = {},
  ): Promise<ValidationSummary> {
    const manifestFile = resolveDefaultManifestFile(options.manifestFile ?? session.manifestFile);
    const scopeArgs =
      Number.isInteger(options.nodeId) && (options.nodeId as number) > 0
        ? ['--node', String(options.nodeId)]
        : ['--all-nodes'];
    const parsed = parseValidateLiveCliArgs([
      '--url',
      session.url,
      ...scopeArgs,
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

  async simulateSignature(
    session: ConnectedSessionConfig,
    signature: string,
    options: {
      manifestFile?: string;
      includeControllerNodes?: boolean;
      nodeId?: number;
      skipInspect?: boolean;
      dryRun?: boolean;
      inspectFormat?: string;
    } = {},
  ): Promise<SimulationSummary> {
    const manifestFile = resolveDefaultManifestFile(options.manifestFile ?? session.manifestFile);
    const scopeArgs =
      Number.isInteger(options.nodeId) && (options.nodeId as number) > 0
        ? ['--node', String(options.nodeId)]
        : ['--all-nodes'];
    const parsed = parseSimulateCliArgs([
      '--url',
      session.url,
      ...scopeArgs,
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
      ...(options.skipInspect ? ['--skip-inspect'] : []),
      ...(options.dryRun ? ['--dry-run'] : []),
      ...(options.inspectFormat ? ['--inspect-format', options.inspectFormat] : []),
    ]);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    const result = await runSimulationCommand(parsed.command, { log: () => {} });
    return {
      signature,
      dryRun: result.dryRun === true,
      inspectSkipped: result.inspect?.skipped === true,
      inspectFormat: String(result.inspect?.format ?? 'list'),
      inspectCommandLine:
        typeof result.inspect?.commandLine === 'string' ? result.inspect.commandLine : null,
      validateCommandLine: String(result.validate?.commandLine ?? ''),
      gatePassed:
        typeof result.validate?.gatePassed === 'boolean' ? result.validate.gatePassed : null,
      totalNodes: Number(result.validate?.totalNodes ?? 0),
      reviewNodes: Number(result.validate?.reviewNodes ?? 0),
      outcomes:
        result.validate?.outcomes && typeof result.validate.outcomes === 'object'
          ? { ...result.validate.outcomes }
          : {},
      reportFile:
        typeof result.validate?.reportFile === 'string' ? result.validate.reportFile : null,
      summaryJsonFile:
        typeof result.validate?.summaryJsonFile === 'string'
          ? result.validate.summaryJsonFile
          : null,
    };
  }

  scaffoldFromSignature(
    signature: string,
    options: { productName?: string; ruleIdPrefix?: string; homeyClass?: string } = {},
  ): ScaffoldDraft {
    const triple = parseSignatureTriple(signature);
    const safeSignature = signature.replace(/:/g, '-');
    const ruleIdPrefix = options.ruleIdPrefix ?? 'product';
    const homeyClass = options.homeyClass?.trim() || 'other';
    const driverTemplateId = `${ruleIdPrefix}-${safeSignature}`.toLowerCase();
    const ruleId = `${ruleIdPrefix}-${safeSignature}-identity`.toLowerCase();

    return {
      signature,
      fileHint: `rules/project/product/product-${safeSignature}.json`,
      bundle: {
        schemaVersion: 'product-rules/v1',
        ...(options.productName ? { name: options.productName } : {}),
        target: {
          manufacturerId: triple.manufacturerId,
          productType: triple.productType,
          productId: triple.productId,
        },
        rules: [
          {
            ruleId,
            value: {
              readable: true,
            },
            actions: [
              {
                type: 'device-identity',
                mode: 'replace',
                homeyClass,
                driverTemplateId,
              },
            ],
          },
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

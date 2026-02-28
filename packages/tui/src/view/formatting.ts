import type {
  NodeDetail,
  NodeSummary,
  RuleDetail,
  RuleSummary,
  ScaffoldDraft,
  SimulationSummary,
  SignatureInspectSummary,
  StatusSnapshot,
  ValidationSummary,
} from '../model/types';

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, idx) =>
    Math.max(header.length, ...rows.map((row) => row[idx]?.length ?? 0)),
  );

  const renderRow = (cols: string[]) =>
    cols
      .map((col, idx) => col.padEnd(widths[idx], ' '))
      .join('  ')
      .trimEnd();

  return [
    renderRow(headers),
    renderRow(widths.map((w) => '-'.repeat(w))),
    ...rows.map(renderRow),
  ].join('\n');
}

export function renderShellHelp(): string {
  return [
    'Commands:',
    '  list                  Show cached node list',
    '  refresh               Refetch node list',
    '  show <nodeId>         Show node detail',
    '  signature [triple] [--from-node <id>]  Set/derive selected signature',
    '  inspect [--manifest <file>]            Inspect selected signature',
    '  validate [--manifest <file>]           Validate selected signature',
    '  simulate [--manifest <file>] [--dry-run] [--skip-inspect] [--inspect-format <fmt>]  Run signature simulation',
    '  scaffold preview [--product-name "..."] [--homey-class <class>] Preview scaffold draft from selected signature',
    '  scaffold write [filePath] [--force]     Write scaffold draft file',
    '  manifest add [filePath] [--manifest <file>] [--force]  Add product rule to manifest',
    '  status                                  Show current workspace snapshot',
    '  log [--limit N]                         Show run log',
    '  help                  Show this help',
    '  quit                  Exit',
  ].join('\n');
}

export function renderRulesShellHelp(): string {
  return [
    'Commands:',
    '  list                  Show manifest rule list',
    '  refresh               Reload manifest rule list',
    '  show <index>          Show rule detail',
    '  signature [triple] [--from-rule <index>]  Set/derive selected signature',
    '  inspect [--manifest <file>]            Inspect selected signature',
    '  validate [--manifest <file>]           Validate selected signature',
    '  simulate [--manifest <file>] [--dry-run] [--skip-inspect] [--inspect-format <fmt>]  Run signature simulation',
    '  scaffold preview [--product-name "..."] [--homey-class <class>] Preview scaffold draft from selected signature',
    '  scaffold write [filePath] [--force]     Write scaffold draft file',
    '  manifest add [filePath] [--manifest <file>] [--force]  Add product rule to manifest',
    '  status                                  Show current workspace snapshot',
    '  log [--limit N]                         Show run log',
    '  help                  Show this help',
    '  quit                  Exit',
  ].join('\n');
}

export function renderNodeList(nodes: NodeSummary[]): string {
  if (!nodes.length) {
    return 'No nodes returned.';
  }

  const rows = nodes.map((node) => [
    String(node.nodeId),
    formatCell(node.name),
    formatCell(node.ready),
    formatCell(node.status),
    formatCell(node.manufacturer),
    formatCell(node.product),
  ]);

  return `${renderTable(['Node', 'Name', 'Ready', 'Status', 'Manufacturer', 'Product'], rows)}\n\nNodes: ${
    nodes.length
  }`;
}

export function renderRuleList(rules: RuleSummary[]): string {
  if (!rules.length) {
    return 'No rules returned.';
  }

  const rows = rules.map((rule) => [
    String(rule.index),
    rule.filePath,
    rule.layer,
    rule.signature ?? '',
    String(rule.ruleCount),
    rule.exists ? 'yes' : 'no',
    rule.loadError ?? '',
  ]);

  return `${renderTable(
    ['#', 'File', 'Layer', 'Signature', 'Rules', 'Exists', 'Load'],
    rows,
  )}\n\nRules: ${rules.length}`;
}

export function renderNodeDetail(detail: NodeDetail): string {
  const lines: string[] = [];
  const manufacturer =
    detail.state?.manufacturer ??
    (detail.state?.deviceConfig && typeof detail.state.deviceConfig === 'object'
      ? (detail.state.deviceConfig as Record<string, unknown>).manufacturer
      : undefined) ??
    detail.state?.manufacturerId ??
    '';
  const product =
    detail.state?.product ??
    (detail.state?.deviceConfig && typeof detail.state.deviceConfig === 'object'
      ? (detail.state.deviceConfig as Record<string, unknown>).label
      : undefined) ??
    '';
  lines.push(`Node ${detail.nodeId}`);
  lines.push(`Name: ${String(detail.state?.name ?? '')}`);
  lines.push(`Ready: ${String(detail.state?.ready ?? '')}`);
  lines.push(`Status: ${String(detail.state?.status ?? '')}`);
  lines.push(`Manufacturer: ${String(manufacturer)}`);
  lines.push(`Product: ${String(product)}`);
  lines.push(`Neighbors: ${JSON.stringify(detail.neighbors)}`);
  lines.push(`Supported notifications: ${JSON.stringify(detail.notificationEvents)}`);
  lines.push(`Values (${detail.values?.length ?? 0}):`);

  for (const value of detail.values ?? []) {
    if (value._error !== undefined) {
      lines.push(`- error: ${JSON.stringify(value._error)}`);
      continue;
    }
    const valueId = value.valueId;
    if (!valueId) {
      lines.push('- value: <missing valueId>');
      continue;
    }
    const preview =
      value.value !== undefined
        ? value.value
        : value.metadata && typeof value.metadata === 'object' && 'type' in value.metadata
          ? { type: (value.metadata as Record<string, unknown>).type }
          : undefined;
    lines.push(
      `- CC ${valueId.commandClass} ep ${valueId.endpoint ?? 0} prop ${String(valueId.property)}${
        valueId.propertyKey != null ? ` key ${String(valueId.propertyKey)}` : ''
      }: ${JSON.stringify(preview)}`,
    );
  }

  return lines.join('\n');
}

export function renderRuleDetail(detail: RuleDetail): string {
  return [
    `Rule #${detail.index}`,
    `Manifest: ${detail.manifestFile}`,
    `File: ${detail.filePath}`,
    `Absolute: ${detail.absoluteFilePath}`,
    `Layer: ${detail.layer}`,
    `Name: ${detail.name ?? ''}`,
    `Signature: ${detail.signature ?? ''}`,
    `Rules: ${detail.ruleCount}`,
    detail.loadError ? `Load error: ${detail.loadError}` : null,
    '',
    detail.content ? JSON.stringify(detail.content, null, 2) : '(no content loaded)',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function renderSignatureSelected(signature: string): string {
  return `Selected signature: ${signature}`;
}

export function renderInspectSummary(summary: SignatureInspectSummary): string {
  const lines = [
    `Signature: ${summary.signature}`,
    `Nodes: ${summary.totalNodes}`,
    `Outcomes: ${Object.entries(summary.outcomeCounts)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}`,
  ];

  if (!summary.nodes.length) {
    lines.push('No matching nodes found.');
    return lines.join('\n');
  }

  const rows = summary.nodes.map((node) => [
    String(node.nodeId),
    node.name ?? '',
    node.homeyClass ?? '',
    node.outcome ?? '',
    node.confidence ?? '',
    node.reviewReason ?? '',
  ]);
  lines.push('');
  lines.push(renderTable(['Node', 'Name', 'Class', 'Outcome', 'Conf', 'Review'], rows));
  return lines.join('\n');
}

export function renderValidationSummary(summary: ValidationSummary): string {
  return [
    `Validation signature: ${summary.signature}`,
    `Nodes: ${summary.totalNodes}`,
    `Needs review: ${summary.reviewNodes}`,
    `Outcomes: ${Object.entries(summary.outcomes)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}`,
    summary.reportFile ? `Report: ${summary.reportFile}` : null,
    summary.artifactFile ? `Artifact: ${summary.artifactFile}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function renderScaffoldDraft(draft: ScaffoldDraft): string {
  return [
    `Scaffold signature: ${draft.signature}`,
    `File hint: ${draft.fileHint}`,
    `Generated: ${draft.generatedAt}`,
    '',
    JSON.stringify(draft.bundle, null, 2),
  ].join('\n');
}

export function renderSimulationSummary(summary: SimulationSummary): string {
  return [
    `Simulation signature: ${summary.signature}`,
    `Dry run: ${summary.dryRun ? 'yes' : 'no'}`,
    `Inspect: ${summary.inspectSkipped ? 'skipped' : `ran (${summary.inspectFormat})`}`,
    `Validate gate passed: ${summary.gatePassed === null ? 'n/a' : summary.gatePassed ? 'yes' : 'no'}`,
    `Nodes validated: ${summary.totalNodes}`,
    `Needs review: ${summary.reviewNodes}`,
    `Outcomes: ${
      Object.entries(summary.outcomes)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ') || 'none'
    }`,
    '',
    summary.inspectCommandLine ? `Inspect command: ${summary.inspectCommandLine}` : null,
    `Validate command: ${summary.validateCommandLine}`,
    summary.reportFile ? `Validation report: ${summary.reportFile}` : null,
    summary.summaryJsonFile ? `Validation summary JSON: ${summary.summaryJsonFile}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function renderRunLog(
  lines: Array<{ timestamp: string; level: string; message: string }>,
): string {
  if (!lines.length) return 'Run log is empty.';
  return lines
    .map((entry) => `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`)
    .join('\n');
}

export function renderManifestResult(result: {
  manifestFile: string;
  entryFilePath: string;
  updated: boolean;
}): string {
  return [
    `Manifest: ${result.manifestFile}`,
    `Entry: ${result.entryFilePath}`,
    `Updated: ${result.updated ? 'yes' : 'no (already present)'}`,
  ].join('\n');
}

export function renderStatusSnapshot(status: StatusSnapshot): string {
  return [
    `Mode: ${status.mode ?? '-'}`,
    `Connection: ${status.connectionState}`,
    `Selected node: ${status.selectedNodeId ?? '-'}`,
    `Selected rule: ${status.selectedRuleIndex ?? '-'}`,
    `Selected signature: ${status.selectedSignature ?? '-'}`,
    `Cached nodes: ${status.cachedNodeCount}`,
    `Scaffold draft: ${status.scaffoldFileHint ?? '-'}`,
  ].join('\n');
}

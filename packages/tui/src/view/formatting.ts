import type { NodeDetail, NodeSummary } from '../model/types';

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

import {
  createZwjsClient,
  extractZwjsDefinedValueIds,
  extractZwjsNodeValue,
} from '@zwavejs2homey/core';

function parseFlagMap(argv) {
  const flags = new Map();
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const [key, inlineValue] = token.split('=', 2);
    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
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
  return { flags, positionals };
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { ok: false, error: getUsageText() };
  }
  const { flags, positionals } = parseFlagMap(argv);
  const [group, action, nodeIdRaw] = positionals;

  if (group !== 'nodes' || !action) {
    return {
      ok: false,
      error:
        'Usage: zwjs-inspect nodes <list|show> [nodeId] --url ws://host:port [--format table|json] [--schema-version 0] [--token ...]',
    };
  }

  if (!['list', 'show'].includes(action)) {
    return {
      ok: false,
      error: `Unsupported action: ${action}`,
    };
  }

  if (action === 'show' && !nodeIdRaw) {
    return {
      ok: false,
      error: 'nodes show requires a nodeId',
    };
  }

  const url = flags.get('--url');
  if (!url) {
    return {
      ok: false,
      error: '--url is required',
    };
  }

  const format = flags.get('--format') ?? 'table';
  if (!['table', 'json'].includes(format)) {
    return {
      ok: false,
      error: `Unsupported format: ${format}`,
    };
  }

  const schemaVersionRaw = flags.get('--schema-version') ?? '0';
  const schemaVersion = Number(schemaVersionRaw);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    return {
      ok: false,
      error: `Invalid --schema-version: ${schemaVersionRaw}`,
    };
  }

  const maxValuesRaw = flags.get('--max-values') ?? '200';
  const maxValues = Number(maxValuesRaw);
  if (!Number.isInteger(maxValues) || maxValues < 1) {
    return {
      ok: false,
      error: `Invalid --max-values: ${maxValuesRaw}`,
    };
  }

  const includeValues = flags.get('--include-values') ?? 'full';
  if (!['none', 'summary', 'full'].includes(includeValues)) {
    return {
      ok: false,
      error: `Unsupported --include-values: ${includeValues}`,
    };
  }

  return {
    ok: true,
    command: {
      group,
      action,
      nodeId: action === 'show' ? Number(nodeIdRaw) : undefined,
      url,
      token: flags.get('--token'),
      format,
      schemaVersion,
      maxValues,
      includeValues,
    },
  };
}

export function getUsageText() {
  return [
    'Usage:',
    '  zwjs-inspect nodes list --url ws://host:port [--format table|json] [--schema-version 0]',
    '  zwjs-inspect nodes show <nodeId> --url ws://host:port [--format table|json]',
    '                 [--include-values none|summary|full] [--max-values N] [--schema-version 0]',
    '',
    'Flags:',
    '  --url             Z-Wave JS server websocket URL (required)',
    '  --token           Bearer token (optional)',
    '  --format          table (default) or json',
    '  --schema-version  API schema version for initialize() (default: 0)',
    '  --include-values  none | summary | full (default: full; show only)',
    '  --max-values      Limit values fetched for show (default: 200)',
  ].join('\n');
}

function summarizeNode(node) {
  return {
    nodeId: node.nodeId,
    name: node.name ?? null,
    location: node.location ?? null,
    ready: node.ready ?? null,
    status: node.status ?? null,
    manufacturer: node.manufacturer ?? null,
    product: node.product ?? null,
    interviewStage: node.interviewStage ?? null,
    isFailed: node.isFailed ?? null,
  };
}

function unwrapNodeStateResult(result) {
  if (!result || typeof result !== 'object') return result;
  return result.state && typeof result.state === 'object' ? result.state : result;
}

function unwrapNeighborsResult(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.neighbors)) return result.neighbors;
  return result;
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function formatNodeListTable(nodes) {
  const rows = nodes.map((node) => [
    String(node.nodeId),
    formatCell(node.name),
    formatCell(node.ready),
    formatCell(node.status),
    formatCell(node.manufacturer),
    formatCell(node.product),
  ]);

  const headers = ['Node', 'Name', 'Ready', 'Status', 'Manufacturer', 'Product'];
  const widths = headers.map((header, idx) =>
    Math.max(header.length, ...rows.map((row) => row[idx]?.length ?? 0)),
  );

  const renderRow = (cols) =>
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

export function formatNodeDetailTable(detail) {
  const lines = [];
  const manufacturer =
    detail.state?.manufacturer ??
    detail.state?.deviceConfig?.manufacturer ??
    detail.state?.manufacturerId ??
    '';
  const product =
    detail.state?.product ??
    detail.state?.deviceConfig?.label ??
    (detail.state?.productType != null && detail.state?.productId != null
      ? `${detail.state.productType}/${detail.state.productId}`
      : '');
  lines.push(`Node ${detail.nodeId}`);
  lines.push(`Name: ${detail.state?.name ?? ''}`);
  lines.push(`Ready: ${detail.state?.ready ?? ''}`);
  lines.push(`Status: ${detail.state?.status ?? ''}`);
  lines.push(`Manufacturer: ${manufacturer}`);
  lines.push(`Product: ${product}`);
  if (detail.neighbors) {
    lines.push(`Neighbors: ${JSON.stringify(detail.neighbors)}`);
  }
  if (detail.notificationEvents) {
    lines.push(`Supported notifications: ${JSON.stringify(detail.notificationEvents)}`);
  }
  if (detail.values) {
    lines.push(`Values (${detail.values.length}):`);
    for (const value of detail.values) {
      const preview =
        value.value !== undefined
          ? value.value
          : value.metadata?.type
            ? { type: value.metadata.type }
            : undefined;
      lines.push(
        `- CC ${value.valueId.commandClass} ep ${value.valueId.endpoint ?? 0} prop ${String(
          value.valueId.property,
        )}${value.valueId.propertyKey != null ? ` key ${String(value.valueId.propertyKey)}` : ''}: ${JSON.stringify(preview)}`,
      );
    }
  }
  return lines.join('\n');
}

export async function connectAndInitialize(config) {
  const client = createZwjsClient({
    url: config.url,
    auth: config.token ? { type: 'bearer', token: config.token } : { type: 'none' },
  });
  await client.start();
  const initResult = await client.initialize({ schemaVersion: config.schemaVersion });
  if (!initResult.success) {
    await client.stop();
    throw new Error(`initialize failed: ${JSON.stringify(initResult.error)}`);
  }
  const listenResult = await client.startListening();
  if (!listenResult.success) {
    await client.stop();
    throw new Error(`start_listening failed: ${JSON.stringify(listenResult.error)}`);
  }
  return client;
}

export async function fetchNodesList(client) {
  const result = await client.getNodeList();
  const nodeList = Array.isArray(result?.nodes)
    ? result
    : result && result.success
      ? result.result
      : null;
  if (!nodeList) {
    const error =
      result && Object.prototype.hasOwnProperty.call(result, 'error') ? result.error : result;
    throw new Error(`getNodeList failed: ${JSON.stringify(error)}`);
  }
  return [...nodeList.nodes].map(summarizeNode).sort((a, b) => a.nodeId - b.nodeId);
}

function stableValueIdKey(valueId) {
  return [
    valueId.commandClass,
    valueId.endpoint ?? 0,
    String(valueId.property),
    valueId.propertyKey == null ? '' : String(valueId.propertyKey),
  ].join(':');
}

export async function fetchNodeDetails(client, nodeId, options = {}) {
  const includeValues = options.includeValues ?? 'full';
  const maxValues = options.maxValues ?? 200;

  const [stateRes, neighborsRes, notifRes, definedRes] = await Promise.all([
    client.getNodeState(nodeId),
    client.getControllerNodeNeighbors(nodeId),
    client.getNodeSupportedNotificationEvents(nodeId),
    includeValues === 'none' ? Promise.resolve(null) : client.getNodeDefinedValueIds(nodeId),
  ]);

  if (!stateRes.success) {
    throw new Error(`node.get_state failed: ${JSON.stringify(stateRes.error)}`);
  }

  const detail = {
    nodeId,
    state: unwrapNodeStateResult(stateRes.result),
    neighbors: neighborsRes.success
      ? unwrapNeighborsResult(neighborsRes.result)
      : { _error: neighborsRes.error },
    notificationEvents: notifRes.success ? notifRes.result : { _error: notifRes.error },
    values: undefined,
  };

  if (includeValues === 'none') {
    return detail;
  }

  if (!definedRes?.success) {
    detail.values = [{ _error: definedRes?.error ?? 'node.get_defined_value_ids skipped' }];
    return detail;
  }

  const valueIds = extractZwjsDefinedValueIds(definedRes.result).slice(0, maxValues);
  detail.values = [];
  for (const valueId of [...valueIds].sort((a, b) =>
    stableValueIdKey(a).localeCompare(stableValueIdKey(b)),
  )) {
    const [metadataRes, valueRes, tsRes] =
      includeValues === 'summary'
        ? await Promise.all([
            client.getNodeValueMetadata(nodeId, valueId),
            Promise.resolve(null),
            Promise.resolve(null),
          ])
        : await Promise.all([
            client.getNodeValueMetadata(nodeId, valueId),
            client.getNodeValue(nodeId, valueId),
            client.getNodeValueTimestamp(nodeId, valueId),
          ]);

    detail.values.push({
      valueId,
      metadata: metadataRes && metadataRes.success ? metadataRes.result : undefined,
      metadataError: metadataRes && !metadataRes.success ? metadataRes.error : undefined,
      value: valueRes && valueRes.success ? extractZwjsNodeValue(valueRes.result) : undefined,
      valueEnvelope: valueRes && valueRes.success ? valueRes.result : undefined,
      valueError: valueRes && !valueRes.success ? valueRes.error : undefined,
      timestamp: tsRes && tsRes.success ? tsRes.result : undefined,
      timestampError: tsRes && !tsRes.success ? tsRes.error : undefined,
    });
  }

  return detail;
}

export async function runInspectCommand(command, io = console) {
  const client = await connectAndInitialize(command);
  try {
    if (command.action === 'list') {
      const nodes = await fetchNodesList(client);
      if (command.format === 'json') {
        io.log(JSON.stringify({ nodes }, null, 2));
      } else {
        io.log(formatNodeListTable(nodes));
      }
      return;
    }

    const detail = await fetchNodeDetails(client, command.nodeId, {
      includeValues: command.includeValues,
      maxValues: command.maxValues,
    });
    if (command.format === 'json') {
      io.log(JSON.stringify(detail, null, 2));
    } else {
      io.log(formatNodeDetailTable(detail));
    }
  } finally {
    await client.stop();
  }
}

import fs from 'node:fs/promises';

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
  const url = flags.get('--url');
  if (!url) {
    return {
      ok: false,
      error: '--url is required',
    };
  }

  const format = flags.get('--format');

  const schemaVersionRaw = flags.get('--schema-version') ?? '0';
  const schemaVersion = Number(schemaVersionRaw);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    return {
      ok: false,
      error: `Invalid --schema-version: ${schemaVersionRaw}`,
    };
  }

  if (group === 'nodes') {
    const nodesFormat = format ?? 'table';
    if (!['table', 'json'].includes(nodesFormat)) {
      return {
        ok: false,
        error: `Unsupported format: ${nodesFormat}`,
      };
    }

    if (!action) {
      return {
        ok: false,
        error: 'Usage: zwjs-inspect nodes <list|show> [nodeId] --url ws://host:port',
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
        format: nodesFormat,
        schemaVersion,
        maxValues,
        includeValues,
      },
    };
  }

  if (group === 'logs') {
    if (action !== 'capture') {
      return {
        ok: false,
        error: `Unsupported action: ${action ?? '<missing>'}`,
      };
    }

    const logsFormat = format ?? 'summary';
    if (!['summary', 'json'].includes(logsFormat)) {
      return {
        ok: false,
        error: `Unsupported format: ${logsFormat}`,
      };
    }

    const durationSecondsRaw = flags.get('--duration-seconds') ?? '30';
    const durationSeconds = Number(durationSecondsRaw);
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1) {
      return {
        ok: false,
        error: `Invalid --duration-seconds: ${durationSecondsRaw}`,
      };
    }

    const maxEventsRaw = flags.get('--max-events') ?? '200';
    const maxEvents = Number(maxEventsRaw);
    if (!Number.isInteger(maxEvents) || maxEvents < 1) {
      return {
        ok: false,
        error: `Invalid --max-events: ${maxEventsRaw}`,
      };
    }

    const sampleSizeRaw = flags.get('--sample-size') ?? '10';
    const sampleSize = Number(sampleSizeRaw);
    if (!Number.isInteger(sampleSize) || sampleSize < 1) {
      return {
        ok: false,
        error: `Invalid --sample-size: ${sampleSizeRaw}`,
      };
    }

    const noStartListeningLogs = flags.has('--no-start-listening-logs');
    const startListeningRaw = flags.get('--start-listening-logs');
    const startListeningLogs =
      noStartListeningLogs || startListeningRaw === 'false' || startListeningRaw === '0'
        ? false
        : true;

    const filter = {};
    const filterSource = flags.get('--filter-source');
    const filterLabel = flags.get('--filter-label');
    const filterPrimaryTags = flags.get('--filter-primary-tags');
    const filterSecondaryTags = flags.get('--filter-secondary-tags');
    const filterDirection = flags.get('--filter-direction');

    if (filterSource) filter.source = filterSource;
    if (filterLabel) filter.label = filterLabel;
    if (filterPrimaryTags) filter.primaryTags = filterPrimaryTags;
    if (filterSecondaryTags) filter.secondaryTags = filterSecondaryTags;
    if (filterDirection) filter.direction = filterDirection;

    return {
      ok: true,
      command: {
        group,
        action,
        url,
        token: flags.get('--token'),
        format: logsFormat,
        schemaVersion,
        durationSeconds,
        maxEvents,
        sampleSize,
        startListeningLogs,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        outputFile: flags.get('--output-file'),
        eventsFile: flags.get('--events-file'),
      },
    };
  }

  return {
    ok: false,
    error: 'Usage: zwjs-inspect <nodes|logs> ... (run with --help for full command list and flags)',
  };
}

export function getUsageText() {
  return [
    'Usage:',
    '  zwjs-inspect nodes list --url ws://host:port [--format table|json] [--schema-version 0]',
    '  zwjs-inspect nodes show <nodeId> --url ws://host:port [--format table|json]',
    '                 [--include-values none|summary|full] [--max-values N] [--schema-version 0]',
    '  zwjs-inspect logs capture --url ws://host:port [--format summary|json]',
    '                 [--duration-seconds N] [--max-events N] [--sample-size N]',
    '                 [--start-listening-logs true|false] [--no-start-listening-logs]',
    '                 [--filter-source ...] [--filter-label ...]',
    '                 [--filter-primary-tags ...] [--filter-secondary-tags ...] [--filter-direction ...]',
    '                 [--output-file report.json] [--events-file events.ndjson]',
    '',
    'Flags:',
    '  --url             Z-Wave JS server websocket URL (required)',
    '  --token           Bearer token (optional)',
    '  --format          nodes: table|json (default: table), logs: summary|json (default: summary)',
    '  --schema-version  API schema version for initialize() (default: 0)',
    '  --include-values  none | summary | full (default: full; show only)',
    '  --max-values      Limit values fetched for show (default: 200)',
    '  --duration-seconds  Log capture duration (default: 30; logs capture only)',
    '  --max-events      Max driver.logging events to capture before stopping (default: 200)',
    '  --sample-size     Number of sample payloads included in summary output (default: 10)',
    '  --start-listening-logs Start/stop server log streaming around capture (default: true)',
    '  --no-start-listening-logs Shortcut to disable start/stop server log streaming',
    '  --filter-*        Optional start_listening_logs filter fields',
    '  --output-file     Optional JSON report output path (logs capture only)',
    '  --events-file     Optional NDJSON payload capture output path (logs capture only)',
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

function getPayloadShapeKeys(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return Object.keys(payload).sort((a, b) => a.localeCompare(b));
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function summarizeDriverLoggingCapture(events, options = {}) {
  const sampleSize = options.sampleSize ?? 10;
  const payloadShapes = new Map();
  const samples = [];

  let formattedMessageString = 0;
  let formattedMessageMissing = 0;
  let messageString = 0;
  let messageStringArray = 0;
  let messageMissing = 0;
  let messageOtherType = 0;

  for (const entry of events) {
    const payload = entry?.event;
    const shapeKey = getPayloadShapeKeys(payload).join('|');
    payloadShapes.set(shapeKey, (payloadShapes.get(shapeKey) ?? 0) + 1);

    const formatted = payload?.formattedMessage;
    if (typeof formatted === 'string') {
      formattedMessageString += 1;
    } else {
      formattedMessageMissing += 1;
    }

    if (typeof payload?.message === 'string') {
      messageString += 1;
    } else if (isStringArray(payload?.message)) {
      messageStringArray += 1;
    } else if (payload && Object.prototype.hasOwnProperty.call(payload, 'message')) {
      messageOtherType += 1;
    } else {
      messageMissing += 1;
    }

    if (samples.length < sampleSize) {
      samples.push(payload);
    }
  }

  const payloadShapeSummary = [...payloadShapes.entries()]
    .map(([shape, count]) => ({
      keys: shape ? shape.split('|') : [],
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: events.length,
    typedValidation: {
      formattedMessageString,
      formattedMessageMissing,
      messageString,
      messageStringArray,
      messageMissing,
      messageOtherType,
    },
    payloadShapes: payloadShapeSummary,
    samples,
  };
}

export async function captureDriverLoggingEvents(client, options = {}, deps = {}) {
  const now = deps.now ?? (() => new Date());
  const durationSeconds = options.durationSeconds ?? 30;
  const maxEvents = options.maxEvents ?? 200;
  const sampleSize = options.sampleSize ?? 10;

  const startedAt = now();
  const loggingEvents = [];
  let totalClientEvents = 0;
  let totalDriverEvents = 0;
  let done = false;

  let resolveDone;
  const donePromise = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const stopCapture = () => {
    if (done) return;
    done = true;
    resolveDone();
  };

  const unsubscribe = client.onEvent((event) => {
    totalClientEvents += 1;
    if (event.type === 'zwjs.event.driver') {
      totalDriverEvents += 1;
    }
    if (event.type === 'zwjs.event.driver.logging') {
      loggingEvents.push({ ts: event.ts, event: event.event });
      if (loggingEvents.length >= maxEvents) {
        stopCapture();
      }
    }
  });

  let startListeningLogsResult;
  let stopListeningLogsResult;
  const startListeningLogs = options.startListeningLogs ?? true;
  const captureFilter = options.filter;
  let timeoutHandle;

  try {
    if (startListeningLogs) {
      startListeningLogsResult = await client.startListeningLogs(captureFilter);
    }

    const timeoutPromise = new Promise((resolve) => {
      timeoutHandle = setTimeout(resolve, durationSeconds * 1000);
    });

    await Promise.race([donePromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    stopCapture();
    unsubscribe();
    if (startListeningLogs) {
      stopListeningLogsResult = await client.stopListeningLogs();
    }
  }

  const endedAt = now();
  const elapsedMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
  const summary = summarizeDriverLoggingCapture(loggingEvents, { sampleSize });

  return {
    capture: {
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      requestedDurationSeconds: durationSeconds,
      elapsedMs,
      maxEvents,
      startListeningLogs,
      filter: captureFilter ?? null,
    },
    eventCounts: {
      totalClientEvents,
      totalDriverEvents,
      driverLoggingEvents: summary.total,
      cappedByMaxEvents: summary.total >= maxEvents,
    },
    startListeningLogsResult,
    stopListeningLogsResult,
    capturedEvents: loggingEvents,
    ...summary,
  };
}

function formatCaptureSummary(report) {
  const lines = [];
  lines.push('Driver Logging Capture');
  lines.push(`- Started: ${report.capture.startedAt}`);
  lines.push(`- Ended: ${report.capture.endedAt}`);
  lines.push(`- Elapsed (ms): ${report.capture.elapsedMs}`);
  lines.push(`- Requested duration (s): ${report.capture.requestedDurationSeconds}`);
  lines.push(`- Max events: ${report.capture.maxEvents}`);
  lines.push(`- Start/stop listening logs: ${report.capture.startListeningLogs}`);
  if (report.capture.filter) {
    lines.push(`- Filter: ${JSON.stringify(report.capture.filter)}`);
  }
  lines.push(`- Total client events: ${report.eventCounts.totalClientEvents}`);
  lines.push(`- Total driver events: ${report.eventCounts.totalDriverEvents}`);
  lines.push(`- driver.logging events: ${report.eventCounts.driverLoggingEvents}`);
  lines.push(`- Capped by max events: ${report.eventCounts.cappedByMaxEvents}`);
  lines.push('- Typed validation:');
  lines.push(`  - formattedMessage string: ${report.typedValidation.formattedMessageString}`);
  lines.push(
    `  - formattedMessage missing/non-string: ${report.typedValidation.formattedMessageMissing}`,
  );
  lines.push(`  - message string: ${report.typedValidation.messageString}`);
  lines.push(`  - message string[]: ${report.typedValidation.messageStringArray}`);
  lines.push(`  - message missing: ${report.typedValidation.messageMissing}`);
  lines.push(`  - message other type: ${report.typedValidation.messageOtherType}`);
  lines.push('- Payload shapes:');
  if (report.payloadShapes.length === 0) {
    lines.push('  - (none captured)');
  } else {
    for (const shape of report.payloadShapes) {
      lines.push(`  - count=${shape.count} keys=${shape.keys.join(', ')}`);
    }
  }
  return lines.join('\n');
}

async function writeNdjson(filePath, entries) {
  const lines = entries.map((entry) => JSON.stringify(entry));
  const content = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  await fs.writeFile(filePath, content, 'utf8');
}

export async function runInspectCommand(command, io = console) {
  const client = await connectAndInitialize(command);
  try {
    if (command.group === 'logs' && command.action === 'capture') {
      const report = await captureDriverLoggingEvents(client, command);
      if (command.outputFile) {
        await fs.writeFile(command.outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      }
      if (command.eventsFile) {
        await writeNdjson(command.eventsFile, report.capturedEvents);
      }
      if (command.format === 'json') {
        io.log(JSON.stringify(report, null, 2));
      } else {
        io.log(formatCaptureSummary(report));
      }
      return;
    }

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

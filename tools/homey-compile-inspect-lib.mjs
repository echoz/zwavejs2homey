import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  formatJsonCompact,
  formatJsonPretty,
  formatNdjson,
  isSupportedDiagnosticFormat,
} from './output-format-lib.mjs';

const require = createRequire(import.meta.url);
const { compileProfilePlanFromRuleSetManifest } = require('../packages/compiler/dist');

function parseFlagMap(argv) {
  const flags = new Map();
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
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
  return { flags, positionals };
}

export function getUsageText() {
  return [
    'Usage:',
    '  homey-compile-inspect --device-file <device.json> --rules-file <rules.json> [--rules-file <rules2.json> ...]',
    '  homey-compile-inspect --device-file <device.json> --manifest <manifest.json>',
    '                     [--catalog-file <catalog.json>]',
    '                     [--focus all|unmatched|suppressed|curation]',
    '                     [--top <n>]',
    '                     [--show rule|suppressed|curation|all]',
    '                     [--explain <capabilityId>]',
    '                     [--format summary|markdown|json|json-pretty|json-compact|ndjson] [--homey-class <class>] [--driver-template <id>]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const { flags } = parseFlagMap(argv);
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
  const format = flags.get('--format') ?? 'summary';
  if (!isSupportedDiagnosticFormat(format))
    return { ok: false, error: `Unsupported format: ${format}` };
  const focus = flags.get('--focus') ?? 'all';
  if (!['all', 'unmatched', 'suppressed', 'curation'].includes(focus)) {
    return { ok: false, error: `Unsupported focus: ${focus}` };
  }
  const topRaw = flags.get('--top');
  const top = topRaw === undefined ? 3 : Number.parseInt(topRaw, 10);
  if (!Number.isInteger(top) || top <= 0) {
    return { ok: false, error: `--top must be a positive integer (received: ${String(topRaw)})` };
  }
  const show = flags.get('--show') ?? 'none';
  if (!['none', 'rule', 'suppressed', 'curation', 'all'].includes(show)) {
    return { ok: false, error: `Unsupported show: ${show}` };
  }
  return {
    ok: true,
    command: {
      deviceFile,
      manifest,
      rulesFiles,
      format,
      focus,
      top,
      show,
      explainCapabilityId: flags.get('--explain'),
      catalogFile: flags.get('--catalog-file'),
      homeyClass: flags.get('--homey-class'),
      driverTemplateId: flags.get('--driver-template'),
    },
  };
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function coerceManifestEntries(raw, manifestPath) {
  if (!Array.isArray(raw)) throw new Error('Manifest JSON must be an array');
  const manifestDir = path.dirname(manifestPath);
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Manifest entry ${index} must be an object`);
    }
    if (typeof entry.filePath !== 'string' || entry.filePath.length === 0) {
      throw new Error(`Manifest entry ${index} requires a non-empty filePath`);
    }
    if (
      entry.kind !== undefined &&
      entry.kind !== 'rules-json' &&
      entry.kind !== 'ha-derived-generated'
    ) {
      throw new Error(`Manifest entry ${index} has unsupported kind "${String(entry.kind)}"`);
    }
    return {
      ...entry,
      filePath: path.isAbsolute(entry.filePath)
        ? entry.filePath
        : path.resolve(manifestDir, entry.filePath),
    };
  });
}

export function compileFromFiles(command) {
  const device = readJson(command.deviceFile);
  const manifestEntries = command.manifest
    ? coerceManifestEntries(readJson(command.manifest), command.manifest)
    : command.rulesFiles.map((filePath) => ({ filePath }));

  const compiled = compileProfilePlanFromRuleSetManifest(device, manifestEntries, {
    catalogArtifact: command.catalogFile ? readJson(command.catalogFile) : undefined,
    homeyClass: command.homeyClass,
    driverTemplateId: command.driverTemplateId,
  });
  return {
    ...compiled,
    __focus: command.focus ?? 'all',
    __top: command.top ?? 3,
    __show: command.show ?? 'none',
    __explainCapabilityId: command.explainCapabilityId,
  };
}

function formatSelector(selector) {
  if (!selector) return '(none)';
  if (typeof selector === 'object' && 'eventType' in selector) {
    return `event:${selector.eventType}`;
  }
  const endpoint = typeof selector.endpoint === 'number' ? selector.endpoint : 0;
  const propertyKey = selector.propertyKey !== undefined ? `/${String(selector.propertyKey)}` : '';
  return `cc=${selector.commandClass}@ep${endpoint}:${String(selector.property)}${propertyKey}`;
}

function buildCapabilityExplanationLines(result, markdown = false) {
  const capabilityId = result.__explainCapabilityId;
  if (!capabilityId) return [];
  const capability = result.profile.capabilities.find((row) => row.capabilityId === capabilityId);
  if (!capability) {
    return markdown
      ? [`- Explain: capability \`${capabilityId}\` not found`]
      : [`Explain: capability "${capabilityId}" not found`];
  }

  const wrap = (value) => (markdown ? `\`${value}\`` : value);
  const lines = markdown
    ? [`### Explain: \`${capability.capabilityId}\``]
    : [`Explain: ${capability.capabilityId}`];
  const pushLine = (label, value) => {
    lines.push(markdown ? `- ${label}: ${value}` : `  ${label}: ${value}`);
  };

  pushLine('Directionality', wrap(capability.directionality));
  pushLine(
    'Inbound',
    capability.inboundMapping
      ? `${wrap(capability.inboundMapping.kind)} -> ${wrap(formatSelector(capability.inboundMapping.selector))}`
      : '(none)',
  );
  if (capability.inboundMapping?.watchers?.length) {
    pushLine(
      'Watchers',
      capability.inboundMapping.watchers.map((w) => wrap(formatSelector(w))).join(', '),
    );
  }
  if (!capability.outboundMapping) {
    pushLine('Outbound', '(none)');
  } else {
    const target =
      typeof capability.outboundMapping.target === 'object' &&
      capability.outboundMapping.target !== null &&
      'command' in capability.outboundMapping.target
        ? `command:${capability.outboundMapping.target.command}`
        : formatSelector(capability.outboundMapping.target);
    pushLine('Outbound', `${wrap(capability.outboundMapping.kind)} -> ${wrap(target)}`);
  }
  if (capability.flags && Object.keys(capability.flags).length > 0) {
    pushLine('Flags', wrap(JSON.stringify(capability.flags)));
  }
  pushLine(
    'Provenance',
    `${wrap(`${capability.provenance.layer}:${capability.provenance.ruleId}`)} (${wrap(capability.provenance.action)})`,
  );
  if (capability.provenance.reason) {
    pushLine('Reason', markdown ? capability.provenance.reason : capability.provenance.reason);
  }
  return lines;
}

export function formatCompileSummary(result) {
  const topLimit = Number.isInteger(result.__top) && result.__top > 0 ? result.__top : 3;
  const focus = result.__focus ?? 'all';
  const show = result.__show ?? 'none';
  const topUnmatchedRules = [...(result.report.byRule ?? [])]
    .filter((row) => (row.unmatched ?? 0) > 0)
    .sort(
      (a, b) =>
        b.unmatched - a.unmatched ||
        a.layer.localeCompare(b.layer) ||
        a.ruleId.localeCompare(b.ruleId),
    )
    .slice(0, topLimit);
  const lines = [];
  lines.push(`Profile: ${result.profile.profileId}`);
  lines.push(
    `Class: ${result.profile.classification.homeyClass} (${result.profile.classification.confidence}, uncurated=${result.profile.classification.uncurated})`,
  );
  if (result.classificationProvenance) {
    lines.push(
      `Class provenance: ${result.classificationProvenance.layer}:${result.classificationProvenance.ruleId}`,
    );
  }
  if (result.catalogLookup) {
    if (result.catalogLookup.matched) {
      lines.push(
        `Catalog: matched (${result.catalogLookup.by}) ${result.catalogLookup.catalogId}${result.catalogLookup.label ? ` — ${result.catalogLookup.label}` : ''}`,
      );
    } else {
      lines.push('Catalog: no match');
    }
  }
  if (result.profile.catalogMatch) {
    lines.push(
      `Profile catalog match: ${result.profile.catalogMatch.by} ${result.profile.catalogMatch.catalogId}${result.profile.catalogMatch.label ? ` — ${result.profile.catalogMatch.label}` : ''}`,
    );
  }
  lines.push(
    `Capabilities: ${result.profile.capabilities.map((c) => c.capabilityId).join(', ') || '(none)'}`,
  );
  if (focus === 'all') {
    lines.push(`Ignored values: ${result.profile.ignoredValues?.length ?? 0}`);
    lines.push(
      `Report: outcome=${result.report.profileOutcome} applied=${result.report.summary.appliedActions} unmatched=${result.report.summary.unmatchedActions} suppressedFill=${result.report.summary.suppressedFillActions}`,
    );
    lines.push(`Diagnostic device key: ${result.report.diagnosticDeviceKey}`);
  }
  if ((focus === 'all' || focus === 'suppressed') && result.report.bySuppressedSlot.length > 0) {
    const top = result.report.bySuppressedSlot
      .slice(0, topLimit)
      .map((row) => `${row.layer}:${row.ruleId}:${row.slot}=${row.count}`)
      .join(', ');
    lines.push(`Suppressed slots: ${top}`);
  }
  if ((show === 'suppressed' || show === 'all') && result.report.bySuppressedSlot.length > 0) {
    lines.push('Suppressed detail:');
    for (const row of result.report.bySuppressedSlot.slice(0, topLimit)) {
      lines.push(`  - ${row.layer}:${row.ruleId} ${row.slot} x${row.count}`);
    }
  }
  if ((focus === 'all' || focus === 'unmatched') && topUnmatchedRules.length > 0) {
    lines.push(
      `Top unmatched rules: ${topUnmatchedRules
        .map((row) => `${row.layer}:${row.ruleId}=${row.unmatched}`)
        .join(', ')}`,
    );
  }
  if (show === 'rule' || show === 'all') {
    const topRules = [...(result.report.byRule ?? [])]
      .sort(
        (a, b) =>
          (b.applied ?? 0) - (a.applied ?? 0) ||
          (b.unmatched ?? 0) - (a.unmatched ?? 0) ||
          a.layer.localeCompare(b.layer) ||
          a.ruleId.localeCompare(b.ruleId),
      )
      .slice(0, topLimit);
    if (topRules.length > 0) {
      lines.push('Rule detail:');
      for (const row of topRules) {
        lines.push(
          `  - ${row.layer}:${row.ruleId} applied=${row.applied} unmatched=${row.unmatched}`,
        );
      }
    }
  }
  if ((focus === 'all' || focus === 'curation') && result.report.catalogContext) {
    lines.push(
      `Report catalog context: known=${result.report.catalogContext.knownCatalogDevice}${
        result.report.catalogContext.matchRef ? ` (${result.report.catalogContext.matchRef})` : ''
      }`,
    );
  }
  if (focus === 'all' || focus === 'curation') {
    if (result.report.curationCandidates.likelyNeedsReview) {
      lines.push(`Curation review: yes (${result.report.curationCandidates.reasons.join(', ')})`);
    } else {
      lines.push('Curation review: no');
    }
  }
  if (
    (show === 'curation' || show === 'all') &&
    result.report.curationCandidates.reasons.length > 0
  ) {
    lines.push('Curation reasons detail:');
    for (const reason of result.report.curationCandidates.reasons.slice(0, topLimit)) {
      lines.push(`  - ${reason}`);
    }
  }
  lines.push(...buildCapabilityExplanationLines(result, false));
  return lines.join('\n');
}

export function formatCompileMarkdown(result) {
  const topLimit = Number.isInteger(result.__top) && result.__top > 0 ? result.__top : 3;
  const focus = result.__focus ?? 'all';
  const show = result.__show ?? 'none';
  const topUnmatchedRules = [...(result.report.byRule ?? [])]
    .filter((row) => (row.unmatched ?? 0) > 0)
    .sort(
      (a, b) =>
        b.unmatched - a.unmatched ||
        a.layer.localeCompare(b.layer) ||
        a.ruleId.localeCompare(b.ruleId),
    )
    .slice(0, topLimit);
  const lines = [];
  lines.push(`## Compiled Profile: \`${result.profile.profileId}\``);
  lines.push(
    `- Class: \`${result.profile.classification.homeyClass}\` (${result.profile.classification.confidence}, uncurated=${result.profile.classification.uncurated})`,
  );
  if (result.classificationProvenance) {
    lines.push(
      `- Class provenance: \`${result.classificationProvenance.layer}:${result.classificationProvenance.ruleId}\``,
    );
  }
  if (result.catalogLookup) {
    if (result.catalogLookup.matched) {
      lines.push(
        `- Catalog: matched (\`${result.catalogLookup.by}\`) \`${result.catalogLookup.catalogId}\`${result.catalogLookup.label ? ` — ${result.catalogLookup.label}` : ''}`,
      );
    } else {
      lines.push(`- Catalog: no match`);
    }
  }
  if (result.profile.catalogMatch) {
    lines.push(
      `- Profile catalog match: \`${result.profile.catalogMatch.by}\` \`${result.profile.catalogMatch.catalogId}\`${result.profile.catalogMatch.label ? ` — ${result.profile.catalogMatch.label}` : ''}`,
    );
  }
  lines.push(
    `- Capabilities: ${
      result.profile.capabilities.map((c) => `\`${c.capabilityId}\``).join(', ') || '(none)'
    }`,
  );
  if (focus === 'all') {
    lines.push(`- Ignored values: ${result.profile.ignoredValues?.length ?? 0}`);
    lines.push(
      `- Report: outcome=\`${result.report.profileOutcome}\`, applied=${result.report.summary.appliedActions}, unmatched=${result.report.summary.unmatchedActions}, suppressedFill=${result.report.summary.suppressedFillActions}`,
    );
    lines.push(`- Diagnostic device key: \`${result.report.diagnosticDeviceKey}\``);
  }
  if (focus === 'all' || focus === 'curation') {
    if (result.report.curationCandidates.likelyNeedsReview) {
      lines.push(`- Curation review: yes (${result.report.curationCandidates.reasons.join(', ')})`);
    } else {
      lines.push(`- Curation review: no`);
    }
  }
  if ((focus === 'all' || focus === 'curation') && result.report.catalogContext) {
    lines.push(
      `- Report catalog context: known=${result.report.catalogContext.knownCatalogDevice}${
        result.report.catalogContext.matchRef
          ? ` (\`${result.report.catalogContext.matchRef}\`)`
          : ''
      }`,
    );
  }
  if (focus === 'all' || focus === 'unmatched') {
    lines.push(`- Diagnostic device key: \`${result.report.diagnosticDeviceKey}\``);
  }
  if ((focus === 'all' || focus === 'unmatched') && topUnmatchedRules.length > 0) {
    lines.push(
      `- Top unmatched rules: ${topUnmatchedRules
        .map((row) => `\`${row.layer}:${row.ruleId}=${row.unmatched}\``)
        .join(', ')}`,
    );
  }
  if ((show === 'suppressed' || show === 'all') && result.report.bySuppressedSlot.length > 0) {
    lines.push(`- Suppressed detail:`);
    for (const row of result.report.bySuppressedSlot.slice(0, topLimit)) {
      lines.push(`  - \`${row.layer}:${row.ruleId}\` \`${row.slot}\` x${row.count}`);
    }
  }
  if (show === 'rule' || show === 'all') {
    const topRules = [...(result.report.byRule ?? [])]
      .sort(
        (a, b) =>
          (b.applied ?? 0) - (a.applied ?? 0) ||
          (b.unmatched ?? 0) - (a.unmatched ?? 0) ||
          a.layer.localeCompare(b.layer) ||
          a.ruleId.localeCompare(b.ruleId),
      )
      .slice(0, topLimit);
    if (topRules.length > 0) {
      lines.push(`- Rule detail:`);
      for (const row of topRules) {
        lines.push(
          `  - \`${row.layer}:${row.ruleId}\` applied=${row.applied}, unmatched=${row.unmatched}`,
        );
      }
    }
  }
  if (
    (show === 'curation' || show === 'all') &&
    result.report.curationCandidates.reasons.length > 0
  ) {
    lines.push(`- Curation reasons detail:`);
    for (const reason of result.report.curationCandidates.reasons.slice(0, topLimit)) {
      lines.push(`  - \`${reason}\``);
    }
  }
  lines.push(...buildCapabilityExplanationLines(result, true));
  return lines.join('\n');
}

export function formatCompileNdjson(result) {
  const topLimit = Number.isInteger(result.__top) && result.__top > 0 ? result.__top : 3;
  const records = [
    { type: 'profile', profile: result.profile },
    ...(result.classificationProvenance
      ? [
          {
            type: 'classificationProvenance',
            classificationProvenance: result.classificationProvenance,
          },
        ]
      : []),
    ...(result.catalogLookup
      ? [{ type: 'catalogLookup', catalogLookup: result.catalogLookup }]
      : []),
    ...result.ruleSources.map((ruleSource) => ({ type: 'ruleSource', ruleSource })),
    {
      type: 'reportSummary',
      summary: result.report.summary,
      profileOutcome: result.report.profileOutcome,
      catalogContext: result.report.catalogContext,
      diagnosticDeviceKey: result.report.diagnosticDeviceKey,
    },
    ...result.report.byRule.map((row) => ({ type: 'byRule', row })),
    ...result.report.bySuppressedSlot.map((row) => ({ type: 'bySuppressedSlot', row })),
    ...result.report.curationCandidates.reasons.map((reason) => ({
      type: 'curationReason',
      reason,
    })),
    ...[...(result.report.byRule ?? [])]
      .filter((row) => (row.unmatched ?? 0) > 0)
      .sort(
        (a, b) =>
          b.unmatched - a.unmatched ||
          a.layer.localeCompare(b.layer) ||
          a.ruleId.localeCompare(b.ruleId),
      )
      .slice(0, topLimit)
      .map((row) => ({ type: 'topUnmatchedRule', row })),
  ];
  return formatNdjson(records);
}

export function formatCompileOutput(result, format) {
  const output = result;
  switch (format) {
    case 'summary':
      return formatCompileSummary(output);
    case 'markdown':
      return formatCompileMarkdown(output);
    case 'json':
    case 'json-pretty':
      return formatJsonPretty(result);
    case 'json-compact':
      return formatJsonCompact(result);
    case 'ndjson':
      return formatCompileNdjson(result);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

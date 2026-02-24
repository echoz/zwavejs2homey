import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadHaExtractedDiscoveryArtifact } = require('../packages/compiler/dist');

function parseHexInt(value) {
  return Number.parseInt(value, 16);
}

function findLineNumber(source, index) {
  if (index < 0) return 1;
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function extractBlock(text, startPattern, endPattern) {
  const startIndex = text.search(startPattern);
  if (startIndex === -1) return null;
  const rest = text.slice(startIndex);
  const endMatch = rest.match(endPattern);
  const endIndex = endMatch ? startIndex + endMatch.index : text.length;
  return {
    startIndex,
    text: text.slice(startIndex, endIndex),
  };
}

function parseDiscoveryPyProbe(discoveryPyPath) {
  const source = fs.readFileSync(discoveryPyPath, 'utf8');

  const honeywellBlock = extractBlock(
    source,
    /# Honeywell 39358 In-Wall Fan Control using switch multilevel CC/,
    /\n\s*# GE\/Jasco - In-Wall Smart Fan Control/,
  );
  const thermostatBlock = extractBlock(
    source,
    /# thermostats supporting setpoint only \(and thus not mode\)/,
    /\n\s*# binary sensors/,
  );

  if (!honeywellBlock || !thermostatBlock) {
    throw new Error(
      `HA source extraction parser (probe) could not find expected discovery schema blocks in: ${discoveryPyPath}`,
    );
  }

  const honeywellMatch = honeywellBlock.text.match(
    /manufacturer_id=\{0x([0-9A-Fa-f]+)\}[\s\S]*?product_id=\{0x([0-9A-Fa-f]+)\}[\s\S]*?product_type=\{0x([0-9A-Fa-f]+)\}[\s\S]*?required_values=\[SWITCH_MULTILEVEL_TARGET_VALUE_SCHEMA\]/,
  );
  if (!honeywellMatch) {
    throw new Error(
      `HA source extraction parser (probe) failed to parse Honeywell fan schema in: ${discoveryPyPath}`,
    );
  }

  const thermostatMatch = thermostatBlock.text.match(
    /primary_value=ZWaveValueDiscoverySchema\([\s\S]*?command_class=\{CommandClass\.THERMOSTAT_SETPOINT\}[\s\S]*?property=\{THERMOSTAT_SETPOINT_PROPERTY\}[\s\S]*?absent_values=\[[\s\S]*?command_class=\{CommandClass\.THERMOSTAT_MODE\}[\s\S]*?property=\{THERMOSTAT_MODE_PROPERTY\}/,
  );
  if (!thermostatMatch) {
    throw new Error(
      `HA source extraction parser (probe) failed to parse thermostat setpoint schema in: ${discoveryPyPath}`,
    );
  }

  const sourceRef = path.relative(process.cwd(), discoveryPyPath) || discoveryPyPath;
  const honeywellLine = findLineNumber(source, honeywellBlock.startIndex);
  const thermostatLine = findLineNumber(source, thermostatBlock.startIndex);

  return {
    schemaVersion: 'ha-extracted-discovery/v1',
    source: {
      generatedAt: new Date().toISOString(),
      sourceRef,
    },
    entries: [
      {
        id: 'ha_probe_honeywell_fan_39358',
        sourceRef: `${sourceRef}:${honeywellLine}`,
        deviceMatch: {
          manufacturerId: parseHexInt(honeywellMatch[1]),
          productId: parseHexInt(honeywellMatch[2]),
          productType: parseHexInt(honeywellMatch[3]),
        },
        valueMatch: {
          commandClass: 38,
          endpoint: 0,
          property: 'currentValue',
          metadata: { type: 'number' },
        },
        companions: {
          requiredValues: [{ commandClass: 38, endpoint: 0, property: 'targetValue' }],
        },
        output: {
          homeyClass: 'fan',
          driverTemplateId: 'ha-probe-fan',
          capabilityId: 'dim',
        },
      },
      {
        id: 'ha_probe_thermostat_setpoint_without_mode',
        sourceRef: `${sourceRef}:${thermostatLine}`,
        valueMatch: {
          commandClass: 67,
          endpoint: 0,
          property: 'setpoint',
          metadata: { type: 'number' },
        },
        companions: {
          absentValues: [{ commandClass: 64, endpoint: 0, property: 'mode' }],
        },
        output: {
          homeyClass: 'thermostat',
          driverTemplateId: 'ha-probe-thermostat',
          capabilityId: 'target_temperature',
        },
      },
    ],
  };
}

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
    '  ha-import-extract --input-file <ha-extracted.json> [--format summary|json]',
    '  ha-import-extract --source-home-assistant <checkout-path> [--format summary|json]',
    '                 [--output-extracted <validated-extracted.json>] [--timing]',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };
  const flags = parseFlagMap(argv);
  const inputFile = flags.get('--input-file');
  const sourceHomeAssistant = flags.get('--source-home-assistant');
  if (!inputFile && !sourceHomeAssistant) {
    return { ok: false, error: 'Provide --input-file or --source-home-assistant' };
  }
  if (inputFile && sourceHomeAssistant) {
    return { ok: false, error: 'Use either --input-file or --source-home-assistant, not both' };
  }
  const format = flags.get('--format') ?? 'summary';
  if (!['summary', 'json'].includes(format)) {
    return { ok: false, error: `Unsupported format: ${format}` };
  }
  const outputExtracted = flags.get('--output-extracted');
  if (outputExtracted === 'true') {
    return { ok: false, error: '--output-extracted requires a file path' };
  }
  return {
    ok: true,
    command: {
      inputFile,
      sourceHomeAssistant,
      format,
      outputExtracted,
      timing: flags.get('--timing') === 'true',
    },
  };
}

function runSourceExtract(command) {
  const sourceRoot = path.isAbsolute(command.sourceHomeAssistant)
    ? command.sourceHomeAssistant
    : path.resolve(process.cwd(), command.sourceHomeAssistant);
  const discoveryPy = path.join(
    sourceRoot,
    'homeassistant',
    'components',
    'zwave_js',
    'discovery.py',
  );
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Home Assistant source path not found: ${sourceRoot}`);
  }
  if (!fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`Home Assistant source path must be a directory: ${sourceRoot}`);
  }
  if (!fs.existsSync(discoveryPy)) {
    throw new Error(`Home Assistant discovery source not found: ${discoveryPy}`);
  }
  const artifact = parseDiscoveryPyProbe(discoveryPy);
  if (command.outputExtracted) {
    const outPath = path.isAbsolute(command.outputExtracted)
      ? command.outputExtracted
      : path.resolve(process.cwd(), command.outputExtracted);
    fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  }
  return artifact;
}

export function runHaImportExtract(command) {
  const started = command.timing ? performance.now() : 0;
  if (command.sourceHomeAssistant) {
    const artifact = runSourceExtract(command);
    const result = {
      artifact,
      summary: {
        entries: artifact.entries.length,
        sourceRefCount: artifact.entries.length
          ? new Set(artifact.entries.map((entry) => entry.sourceRef)).size
          : 0,
      },
    };
    if (command.timing) {
      return {
        ...result,
        meta: {
          elapsedMs: Math.max(0, performance.now() - started),
        },
      };
    }
    return result;
  }
  const artifact = loadHaExtractedDiscoveryArtifact(command.inputFile);

  if (command.outputExtracted) {
    const outPath = path.isAbsolute(command.outputExtracted)
      ? command.outputExtracted
      : path.resolve(process.cwd(), command.outputExtracted);
    fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  }

  const result = {
    artifact,
    summary: {
      entries: artifact.entries.length,
      sourceRefCount: artifact.entries.length
        ? new Set(artifact.entries.map((entry) => entry.sourceRef)).size
        : 0,
    },
  };

  if (command.timing) {
    return {
      ...result,
      meta: {
        elapsedMs: Math.max(0, performance.now() - started),
      },
    };
  }

  return result;
}

export function formatHaExtractSummary(result) {
  const lines = [];
  lines.push(`Extracted artifact: ${result.artifact.schemaVersion}`);
  lines.push(`Entries: ${result.summary.entries}`);
  lines.push(`Source refs: ${result.summary.sourceRefCount}`);
  if (result.meta && typeof result.meta.elapsedMs === 'number') {
    lines.push(`Timing: ${result.meta.elapsedMs.toFixed(3)}ms`);
  }
  return lines.join('\n');
}

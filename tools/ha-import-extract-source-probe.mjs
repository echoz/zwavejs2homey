import fs from 'node:fs';
import path from 'node:path';

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

export function extractHaDiscoveryProbeArtifact(discoveryPyPath, cwd = process.cwd()) {
  const source = fs.readFileSync(discoveryPyPath, 'utf8');

  const honeywellBlock = extractBlock(
    source,
    /# Honeywell 39358 In-Wall Fan Control using switch multilevel CC/,
    /\n\s*# GE\/Jasco - In-Wall Smart Fan Control/,
  );
  const geJascoBlock = extractBlock(
    source,
    /# GE\/Jasco - In-Wall Smart Fan Control - 12730 \/ ZW4002/,
    /\n\s*# GE\/Jasco - In-Wall Smart Fan Controls/,
  );
  const thermostatBlock = extractBlock(
    source,
    /# thermostats supporting setpoint only \(and thus not mode\)/,
    /\n\s*# binary sensors/,
  );

  if (!honeywellBlock || !geJascoBlock || !thermostatBlock) {
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

  const geJascoMatch = geJascoBlock.text.match(
    /manufacturer_id=\{0x([0-9A-Fa-f]+)\}[\s\S]*?product_id=\{0x([0-9A-Fa-f]+)\}[\s\S]*?product_type=\{0x([0-9A-Fa-f]+)\}/,
  );
  if (!geJascoMatch) {
    throw new Error(
      `HA source extraction parser (probe) failed to parse GE/Jasco fan schema in: ${discoveryPyPath}`,
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

  const sourceRef = path.relative(cwd, discoveryPyPath) || discoveryPyPath;
  const honeywellLine = findLineNumber(source, honeywellBlock.startIndex);
  const geJascoLine = findLineNumber(source, geJascoBlock.startIndex);
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
        id: 'ha_probe_ge_jasco_fan_12730',
        sourceRef: `${sourceRef}:${geJascoLine}`,
        deviceMatch: {
          manufacturerId: parseHexInt(geJascoMatch[1]),
          productId: parseHexInt(geJascoMatch[2]),
          productType: parseHexInt(geJascoMatch[3]),
        },
        valueMatch: {
          commandClass: 38,
          endpoint: 0,
          property: 'currentValue',
          metadata: { type: 'number' },
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

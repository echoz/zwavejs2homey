const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadLib() {
  return import('../../../tools/ha-import-extract-lib.mjs');
}

async function loadReportLib() {
  return import('../../../tools/ha-import-report-lib.mjs');
}

const fixturesDir = path.join(__dirname, '../../compiler/test/fixtures');

test('parseCliArgs validates ha-import-extract args', async () => {
  const { parseCliArgs } = await loadLib();
  assert.equal(parseCliArgs([]).ok, false);
  assert.equal(parseCliArgs(['--input-file', 'x.json', '--format', 'yaml']).ok, false);
  assert.equal(parseCliArgs(['--input-file', 'x.json', '--output-extracted']).ok, false);
  assert.equal(
    parseCliArgs(['--input-file', 'x.json', '--source-home-assistant', '/tmp/ha']).ok,
    false,
  );
  const sourceParsed = parseCliArgs(['--source-home-assistant', '/tmp/ha', '--timing']);
  assert.equal(sourceParsed.ok, true);
  assert.equal(sourceParsed.command.sourceHomeAssistant, '/tmp/ha');
  const parsed = parseCliArgs(['--input-file', 'x.json', '--timing']);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.timing, true);
});

test('runHaImportExtract validates and can write extracted artifact', async () => {
  const { runHaImportExtract, formatHaExtractSummary } = await loadLib();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-import-extract-'));
  const outputExtracted = path.join(tempDir, 'ha-extracted.json');

  const result = runHaImportExtract({
    inputFile: path.join(fixturesDir, 'ha-extracted-discovery-input-v1.json'),
    format: 'summary',
    outputExtracted,
    timing: true,
  });

  assert.equal(result.artifact.schemaVersion, 'ha-extracted-discovery/v1');
  assert.equal(result.summary.entries >= 1, true);
  assert.equal(fs.existsSync(outputExtracted), true);
  assert.equal(typeof result.meta.elapsedMs, 'number');

  const written = JSON.parse(fs.readFileSync(outputExtracted, 'utf8'));
  assert.equal(written.schemaVersion, 'ha-extracted-discovery/v1');

  const summary = formatHaExtractSummary(result);
  assert.match(summary, /Extracted artifact: ha-extracted-discovery\/v1/);
  assert.match(summary, /Entries: /);
  assert.match(summary, /Timing: /);
});

test('runHaImportExtract extracts probe entries from source-home-assistant discovery.py', async () => {
  const { runHaImportExtract, formatHaExtractSummary } = await loadLib();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-source-stub-'));
  const discoveryDir = path.join(tempDir, 'homeassistant/components/zwave_js');
  fs.mkdirSync(discoveryDir, { recursive: true });
  fs.writeFileSync(
    path.join(discoveryDir, 'discovery.py'),
    `
# Honeywell 39358 In-Wall Fan Control using switch multilevel CC
ZWaveDiscoverySchema(
    platform=Platform.FAN,
    manufacturer_id={0x0039},
    product_id={0x3131},
    product_type={0x4944},
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
    required_values=[SWITCH_MULTILEVEL_TARGET_VALUE_SCHEMA],
),
# GE/Jasco - In-Wall Smart Fan Control - 12730 / ZW4002
ZWaveDiscoverySchema(
    platform=Platform.FAN,
    manufacturer_id={0x0063},
    product_id={0x3034},
    product_type={0x4944},
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
# GE/Jasco - In-Wall Smart Fan Controls

# thermostats supporting setpoint only (and thus not mode)
ZWaveDiscoverySchema(
    platform=Platform.CLIMATE,
    primary_value=ZWaveValueDiscoverySchema(
        command_class={CommandClass.THERMOSTAT_SETPOINT},
        property={THERMOSTAT_SETPOINT_PROPERTY},
        type={ValueType.NUMBER},
    ),
    absent_values=[
        ZWaveValueDiscoverySchema(
            command_class={CommandClass.THERMOSTAT_MODE},
            property={THERMOSTAT_MODE_PROPERTY},
            type={ValueType.NUMBER},
        ),
    ],
),
# binary sensors
`,
    'utf8',
  );

  const result = runHaImportExtract({
    sourceHomeAssistant: tempDir,
    inputFile: undefined,
    format: 'summary',
    outputExtracted: undefined,
    timing: true,
  });
  assert.equal(result.artifact.schemaVersion, 'ha-extracted-discovery/v1');
  assert.equal(result.artifact.entries.length, 3);
  assert.equal(result.artifact.entries[0].valueMatch.commandClass, 38);
  assert.equal(result.artifact.entries[1].deviceMatch.manufacturerId, 99);
  assert.equal(result.artifact.entries[2].companions.absentValues[0].commandClass, 64);
  assert.equal(result.sourceReport.translated, 3);
  assert.equal(result.sourceReport.skipped, 0);
  assert.equal(typeof result.meta.elapsedMs, 'number');
  const summary = formatHaExtractSummary(result);
  assert.match(summary, /Source parse: scanned=3 translated=3 skipped=0/);
});

test('source extract output feeds ha-import report end-to-end', async () => {
  const { runHaImportExtract } = await loadLib();
  const { runHaImportReport } = await loadReportLib();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-source-e2e-'));
  const discoveryDir = path.join(tempDir, 'homeassistant/components/zwave_js');
  fs.mkdirSync(discoveryDir, { recursive: true });
  fs.writeFileSync(
    path.join(discoveryDir, 'discovery.py'),
    `
# Honeywell 39358 In-Wall Fan Control using switch multilevel CC
ZWaveDiscoverySchema(
    platform=Platform.FAN,
    manufacturer_id={0x0039},
    product_id={0x3131},
    product_type={0x4944},
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
    required_values=[SWITCH_MULTILEVEL_TARGET_VALUE_SCHEMA],
),
# GE/Jasco - In-Wall Smart Fan Control - 12730 / ZW4002
ZWaveDiscoverySchema(
    platform=Platform.FAN,
    manufacturer_id={0x0063},
    product_id={0x3034},
    product_type={0x4944},
    primary_value=SWITCH_MULTILEVEL_CURRENT_VALUE_SCHEMA,
),
# GE/Jasco - In-Wall Smart Fan Controls

# thermostats supporting setpoint only (and thus not mode)
ZWaveDiscoverySchema(
    platform=Platform.CLIMATE,
    primary_value=ZWaveValueDiscoverySchema(
        command_class={CommandClass.THERMOSTAT_SETPOINT},
        property={THERMOSTAT_SETPOINT_PROPERTY},
        type={ValueType.NUMBER},
    ),
    absent_values=[
        ZWaveValueDiscoverySchema(
            command_class={CommandClass.THERMOSTAT_MODE},
            property={THERMOSTAT_MODE_PROPERTY},
            type={ValueType.NUMBER},
        ),
    ],
),
# binary sensors
`,
    'utf8',
  );
  const extractedPath = path.join(tempDir, 'ha-extracted.json');

  const extractResult = runHaImportExtract({
    sourceHomeAssistant: tempDir,
    inputFile: undefined,
    format: 'summary',
    outputExtracted: extractedPath,
    timing: false,
  });
  assert.equal(extractResult.artifact.entries.length, 3);
  assert.equal(fs.existsSync(extractedPath), true);

  const reportResult = runHaImportReport({
    inputFile: extractedPath,
    format: 'summary',
    outputGenerated: undefined,
    timing: false,
  });
  assert.equal(reportResult.artifact.schemaVersion, 'ha-derived-rules/v1');
  assert.equal(reportResult.report.translated, 3);
  assert.equal(reportResult.report.unsupported.length, 0);
});

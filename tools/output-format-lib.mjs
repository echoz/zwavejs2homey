export const DIAGNOSTIC_FORMATS = [
  'summary',
  'markdown',
  'json',
  'json-pretty',
  'json-compact',
  'ndjson',
];

export function isSupportedDiagnosticFormat(value) {
  return DIAGNOSTIC_FORMATS.includes(value);
}

export function formatJsonPretty(value) {
  return JSON.stringify(value, null, 2);
}

export function formatJsonCompact(value) {
  return JSON.stringify(value);
}

export function formatNdjson(records) {
  return records.map((record) => JSON.stringify(record)).join('\n');
}

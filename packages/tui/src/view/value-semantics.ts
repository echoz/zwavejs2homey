import type { NodeValueDetail } from '../model/types';

export type ValueDirection = 'read' | 'write' | 'read-write' | 'unknown';
export type ValueConfidence = 'high' | 'medium' | 'low';
export type ValueSemanticSource = 'metadata' | 'heuristic';
export type ValuePresentationGroup = 'interactive' | 'static';
export type ValueSemanticSection =
  | 'controls'
  | 'sensors'
  | 'events'
  | 'config'
  | 'diagnostic'
  | 'other';

export interface ValueSemanticAnnotation {
  capabilityId: string | null;
  direction: ValueDirection;
  confidence: ValueConfidence;
  source: ValueSemanticSource;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).toLowerCase();
  return '';
}

function asCommandClassNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed)) return parsed;
  }
  return undefined;
}

function directionFromMetadata(metadata: Record<string, unknown> | null): ValueDirection {
  if (!metadata) return 'unknown';
  const readable = metadata.readable === true;
  const writeable = metadata.writeable === true;
  if (readable && writeable) return 'read-write';
  if (readable) return 'read';
  if (writeable) return 'write';
  return 'unknown';
}

function hasAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function inferSensorCapability(text: string, unit: string): string | null {
  if (hasAny(text, ['temperature', 'temp']) || ['c', 'f'].includes(unit)) {
    return 'measure_temperature';
  }
  if (hasAny(text, ['humidity', 'relative humidity']) || unit === '%') return 'measure_humidity';
  if (hasAny(text, ['luminance', 'illuminance', 'lux']) || unit === 'lux') {
    return 'measure_luminance';
  }
  if (hasAny(text, ['power']) || ['w', 'kw'].includes(unit)) return 'measure_power';
  if (hasAny(text, ['energy']) || ['kwh', 'wh'].includes(unit)) return 'meter_power';
  if (hasAny(text, ['voltage']) || unit === 'v') return 'measure_voltage';
  if (hasAny(text, ['current']) || ['a', 'ma'].includes(unit)) return 'measure_current';
  if (hasAny(text, ['pressure']) || ['pa', 'hpa', 'kpa', 'bar', 'mbar'].includes(unit)) {
    return 'measure_pressure';
  }
  return null;
}

function toCommandClass(entry: NodeValueDetail): number | undefined {
  return asCommandClassNumber(entry.valueId?.commandClass);
}

function mergedPropertyText(entry: NodeValueDetail): string {
  const metadata = asRecord(entry.metadata);
  return `${asText(entry.valueId?.property)} ${asText(entry.valueId?.propertyKey)} ${asText(metadata?.label)} ${asText(metadata?.description)}`.trim();
}

export function annotateNodeValue(entry: NodeValueDetail): ValueSemanticAnnotation {
  if (entry._error !== undefined || !entry.valueId) {
    return {
      capabilityId: null,
      direction: 'unknown',
      confidence: 'low',
      source: 'heuristic',
    };
  }

  const metadata = asRecord(entry.metadata);
  const direction = directionFromMetadata(metadata);
  const commandClass = asCommandClassNumber(entry.valueId.commandClass);
  const labelText = asText(metadata?.label);
  const propertyText =
    `${asText(entry.valueId.property)} ${asText(entry.valueId.propertyKey)}`.trim();
  const mergedText = `${labelText} ${propertyText}`.trim();
  const unit = asText(metadata?.unit);
  const states = asRecord(metadata?.states);
  const hasStates = states ? Object.keys(states).length > 0 : false;

  let capabilityId: string | null = null;
  let confidence: ValueConfidence = 'low';
  let source: ValueSemanticSource = 'heuristic';

  if (commandClass === 37) {
    capabilityId = 'onoff';
    confidence = 'high';
  } else if (commandClass === 38) {
    if (
      hasAny(mergedText, ['switch', 'binary']) ||
      (hasStates && hasAny(JSON.stringify(states).toLowerCase(), ['off', 'on']))
    ) {
      capabilityId = 'onoff';
      confidence = 'high';
      source = hasStates || labelText.length > 0 ? 'metadata' : 'heuristic';
    } else {
      capabilityId = 'dim';
      confidence = hasAny(mergedText, ['level', 'dimmer', 'targetvalue', 'currentvalue'])
        ? 'high'
        : 'medium';
      source = hasAny(mergedText, ['level', 'dimmer']) ? 'metadata' : 'heuristic';
    }
  } else if (commandClass === 48) {
    if (hasAny(mergedText, ['motion', 'pir'])) capabilityId = 'alarm_motion';
    else if (hasAny(mergedText, ['contact', 'door', 'window'])) capabilityId = 'alarm_contact';
    else if (hasAny(mergedText, ['smoke', 'fire'])) capabilityId = 'alarm_smoke';
    else if (hasAny(mergedText, ['water', 'leak', 'flood'])) capabilityId = 'alarm_water';
    else if (hasAny(mergedText, ['tamper'])) capabilityId = 'alarm_tamper';
    else capabilityId = 'alarm_generic';
    confidence = hasAny(mergedText, ['motion', 'contact', 'door', 'window']) ? 'high' : 'medium';
    source = mergedText.length > 0 ? 'metadata' : 'heuristic';
  } else if (commandClass === 49 || commandClass === 50) {
    capabilityId = inferSensorCapability(mergedText, unit) ?? 'measure_generic';
    confidence = capabilityId === 'measure_generic' ? 'medium' : 'high';
    source = mergedText.length > 0 || unit.length > 0 ? 'metadata' : 'heuristic';
  } else if (commandClass === 91) {
    capabilityId = 'button_action';
    confidence = 'high';
  } else if (commandClass === 98) {
    capabilityId = 'locked';
    confidence = 'high';
  } else if (commandClass === 113) {
    capabilityId = 'alarm_generic';
    confidence = 'medium';
  } else if (commandClass === 121) {
    capabilityId = 'windowcoverings_set';
    confidence = 'high';
  } else if (commandClass === 128) {
    capabilityId = 'measure_battery';
    confidence = 'high';
  } else if (hasStates) {
    capabilityId = 'enum_select';
    confidence = 'medium';
    source = 'metadata';
  } else if (direction === 'write' || direction === 'read-write') {
    capabilityId = 'number_value';
    confidence = 'low';
  }

  return { capabilityId, direction, confidence, source };
}

function formatDirectionShort(direction: ValueDirection): string {
  if (direction === 'read-write') return 'rw';
  if (direction === 'read') return 'r';
  if (direction === 'write') return 'w';
  return '-';
}

function formatSourceShort(source: ValueSemanticSource): string {
  return source === 'metadata' ? 'meta' : 'heur';
}

export function formatValueSemanticTag(annotation: ValueSemanticAnnotation): string {
  const pieces = [
    annotation.capabilityId ? `cap:${annotation.capabilityId}` : 'cap:-',
    `dir:${formatDirectionShort(annotation.direction)}`,
    `conf:${annotation.confidence}`,
    `src:${formatSourceShort(annotation.source)}`,
  ];
  return `{${pieces.join(' ')}}`;
}

export function semanticCapabilityScore(capabilityId: string | null): number {
  if (!capabilityId) return 0;
  switch (capabilityId) {
    case 'onoff':
      return 24;
    case 'dim':
      return 22;
    case 'windowcoverings_set':
      return 20;
    case 'locked':
      return 18;
    case 'measure_temperature':
    case 'measure_humidity':
    case 'measure_luminance':
    case 'measure_power':
    case 'meter_power':
    case 'measure_battery':
      return 16;
    case 'alarm_motion':
    case 'alarm_contact':
    case 'alarm_smoke':
    case 'alarm_water':
    case 'alarm_tamper':
    case 'alarm_generic':
      return 14;
    case 'button_action':
      return 12;
    case 'enum_select':
      return 8;
    case 'measure_generic':
    case 'number_value':
      return 4;
    default:
      return 0;
  }
}

export function classifyNodeValueSection(entry: NodeValueDetail): ValueSemanticSection {
  if (entry._error !== undefined || !entry.valueId) {
    return 'diagnostic';
  }

  const metadata = asRecord(entry.metadata);
  const states = asRecord(metadata?.states);
  const text = mergedPropertyText(entry);
  const unit = asText(metadata?.unit);
  const commandClass = toCommandClass(entry);
  const semantic = annotateNodeValue(entry);
  const hasStates = states ? Object.keys(states).length > 0 : false;
  const diagnosticHints = [
    'interview',
    'firmware',
    'version',
    'status',
    'health',
    'protocol',
    'serial',
    'sdk',
    'statistics',
    'route',
    'rssi',
  ];
  const configHints = [
    'configuration',
    'config',
    'parameter',
    'setpoint',
    'threshold',
    'offset',
    'calibration',
    'protection',
  ];

  if (commandClass === 112 || hasAny(text, configHints)) return 'config';
  if (commandClass === 114 || commandClass === 115 || hasAny(text, diagnosticHints)) {
    return 'diagnostic';
  }

  const capability = semantic.capabilityId;
  if (
    capability === 'measure_temperature' ||
    capability === 'measure_humidity' ||
    capability === 'measure_luminance' ||
    capability === 'measure_power' ||
    capability === 'meter_power' ||
    capability === 'measure_voltage' ||
    capability === 'measure_current' ||
    capability === 'measure_pressure' ||
    capability === 'measure_battery' ||
    capability === 'measure_generic'
  ) {
    return 'sensors';
  }
  if (
    capability === 'alarm_motion' ||
    capability === 'alarm_contact' ||
    capability === 'alarm_smoke' ||
    capability === 'alarm_water' ||
    capability === 'alarm_tamper' ||
    capability === 'alarm_generic' ||
    capability === 'button_action'
  ) {
    return 'events';
  }
  if (
    capability === 'onoff' ||
    capability === 'dim' ||
    capability === 'windowcoverings_set' ||
    capability === 'locked' ||
    capability === 'enum_select' ||
    capability === 'number_value'
  ) {
    return 'controls';
  }

  if (commandClass === 49 || commandClass === 50 || commandClass === 128 || unit.length > 0) {
    return 'sensors';
  }
  if (commandClass === 48 || commandClass === 91 || commandClass === 113) return 'events';
  if (commandClass === 37 || commandClass === 38 || commandClass === 98 || commandClass === 121) {
    return 'controls';
  }
  if (semantic.direction === 'write' || semantic.direction === 'read-write' || hasStates) {
    return 'controls';
  }

  return 'other';
}

export function classifyNodeValueGroup(entry: NodeValueDetail): ValuePresentationGroup {
  const section = classifyNodeValueSection(entry);
  if (section === 'config' || section === 'diagnostic') return 'static';
  return 'interactive';
}

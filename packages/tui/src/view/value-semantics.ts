import type { NodeValueDetail } from '../model/types';
import {
  CAPABILITY_RELEVANCE_SCORES,
  COMMAND_CLASS_RELEVANCE_SCORES,
  CONFIG_HINT_TOKENS,
  CONFIG_SECTION_COMMAND_CLASSES,
  CONTROL_SECTION_CAPABILITIES,
  CONTROL_SECTION_COMMAND_CLASSES,
  DIAGNOSTIC_HINT_TOKENS,
  DIAGNOSTIC_SECTION_COMMAND_CLASSES,
  DIRECT_COMMAND_CLASS_SEMANTICS,
  EVENT_SECTION_CAPABILITIES,
  EVENT_SECTION_COMMAND_CLASSES,
  NOTIFICATION_CAPABILITY_HINTS,
  SENSOR_CAPABILITY_HINTS,
  SENSOR_SECTION_CAPABILITIES,
  SENSOR_SECTION_COMMAND_CLASSES,
  SEMANTIC_CAPABILITY_IDS,
  SWITCH_MULTILEVEL_BINARY_HINT_TOKENS,
  SWITCH_MULTILEVEL_BINARY_STATES_HINT_TOKENS,
  SWITCH_MULTILEVEL_DIM_CONFIDENCE_TOKENS,
  SWITCH_MULTILEVEL_DIM_METADATA_TOKENS,
} from './value-semantics-policy';

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
  for (const hint of SENSOR_CAPABILITY_HINTS) {
    const tokenMatch = hint.tokens ? hasAny(text, hint.tokens) : false;
    const unitMatch = hint.units ? hint.units.includes(unit) : false;
    if (tokenMatch || unitMatch) {
      return hint.capabilityId;
    }
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
    capabilityId = SEMANTIC_CAPABILITY_IDS.onoff;
    confidence = 'high';
  } else if (commandClass === 38) {
    if (
      hasAny(mergedText, SWITCH_MULTILEVEL_BINARY_HINT_TOKENS) ||
      (hasStates &&
        hasAny(JSON.stringify(states).toLowerCase(), SWITCH_MULTILEVEL_BINARY_STATES_HINT_TOKENS))
    ) {
      capabilityId = SEMANTIC_CAPABILITY_IDS.onoff;
      confidence = 'high';
      source = hasStates || labelText.length > 0 ? 'metadata' : 'heuristic';
    } else {
      capabilityId = SEMANTIC_CAPABILITY_IDS.dim;
      confidence = hasAny(mergedText, SWITCH_MULTILEVEL_DIM_CONFIDENCE_TOKENS) ? 'high' : 'medium';
      source = hasAny(mergedText, SWITCH_MULTILEVEL_DIM_METADATA_TOKENS) ? 'metadata' : 'heuristic';
    }
  } else if (commandClass === 48) {
    const notificationHint = NOTIFICATION_CAPABILITY_HINTS.find((hint) =>
      hasAny(mergedText, hint.tokens),
    );
    capabilityId = notificationHint?.capabilityId ?? SEMANTIC_CAPABILITY_IDS.alarmGeneric;
    confidence = notificationHint?.confidence ?? 'medium';
    source = mergedText.length > 0 ? 'metadata' : 'heuristic';
  } else if (commandClass === 49 || commandClass === 50) {
    capabilityId =
      inferSensorCapability(mergedText, unit) ?? SEMANTIC_CAPABILITY_IDS.measureGeneric;
    confidence = capabilityId === SEMANTIC_CAPABILITY_IDS.measureGeneric ? 'medium' : 'high';
    source = mergedText.length > 0 || unit.length > 0 ? 'metadata' : 'heuristic';
  } else if (commandClass && DIRECT_COMMAND_CLASS_SEMANTICS[commandClass]) {
    const semantic = DIRECT_COMMAND_CLASS_SEMANTICS[commandClass];
    capabilityId = semantic.capabilityId;
    confidence = semantic.confidence;
  } else if (hasStates) {
    capabilityId = SEMANTIC_CAPABILITY_IDS.enumSelect;
    confidence = 'medium';
    source = 'metadata';
  } else if (direction === 'write' || direction === 'read-write') {
    capabilityId = SEMANTIC_CAPABILITY_IDS.numberValue;
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
  return CAPABILITY_RELEVANCE_SCORES[capabilityId] ?? 0;
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
  if (
    (commandClass !== undefined && CONFIG_SECTION_COMMAND_CLASSES.has(commandClass)) ||
    hasAny(text, CONFIG_HINT_TOKENS)
  ) {
    return 'config';
  }
  if (
    (commandClass !== undefined && DIAGNOSTIC_SECTION_COMMAND_CLASSES.has(commandClass)) ||
    hasAny(text, DIAGNOSTIC_HINT_TOKENS)
  ) {
    return 'diagnostic';
  }

  const capability = semantic.capabilityId;
  if (capability && SENSOR_SECTION_CAPABILITIES.has(capability)) {
    return 'sensors';
  }
  if (capability && EVENT_SECTION_CAPABILITIES.has(capability)) {
    return 'events';
  }
  if (capability && CONTROL_SECTION_CAPABILITIES.has(capability)) {
    return 'controls';
  }

  if (
    (commandClass !== undefined && SENSOR_SECTION_COMMAND_CLASSES.has(commandClass)) ||
    unit.length > 0
  ) {
    return 'sensors';
  }
  if (commandClass !== undefined && EVENT_SECTION_COMMAND_CLASSES.has(commandClass))
    return 'events';
  if (commandClass !== undefined && CONTROL_SECTION_COMMAND_CLASSES.has(commandClass)) {
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

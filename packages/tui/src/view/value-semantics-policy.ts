export type SemanticConfidence = 'high' | 'medium' | 'low';

export interface TokenCapabilityHint {
  capabilityId: string;
  tokens: string[];
  confidence: SemanticConfidence;
}

export interface SensorCapabilityHint {
  capabilityId: string;
  tokens?: string[];
  units?: string[];
}

export interface DirectCommandClassSemantic {
  capabilityId: string;
  confidence: SemanticConfidence;
}

export const SEMANTIC_CAPABILITY_IDS = {
  onoff: 'onoff',
  dim: 'dim',
  enumSelect: 'enum_select',
  numberValue: 'number_value',
  alarmGeneric: 'alarm_generic',
  measureGeneric: 'measure_generic',
} as const;

export const SWITCH_MULTILEVEL_BINARY_HINT_TOKENS = ['switch', 'binary'];
export const SWITCH_MULTILEVEL_BINARY_STATES_HINT_TOKENS = ['off', 'on'];
export const SWITCH_MULTILEVEL_DIM_CONFIDENCE_TOKENS = [
  'level',
  'dimmer',
  'targetvalue',
  'currentvalue',
];
export const SWITCH_MULTILEVEL_DIM_METADATA_TOKENS = ['level', 'dimmer'];

export const SENSOR_CAPABILITY_HINTS: SensorCapabilityHint[] = [
  {
    capabilityId: 'measure_temperature',
    tokens: ['temperature', 'temp'],
    units: ['c', 'f'],
  },
  {
    capabilityId: 'measure_humidity',
    tokens: ['humidity', 'relative humidity'],
    units: ['%'],
  },
  {
    capabilityId: 'measure_luminance',
    tokens: ['luminance', 'illuminance', 'lux'],
    units: ['lux'],
  },
  {
    capabilityId: 'measure_power',
    tokens: ['power'],
    units: ['w', 'kw'],
  },
  {
    capabilityId: 'meter_power',
    tokens: ['energy'],
    units: ['kwh', 'wh'],
  },
  {
    capabilityId: 'measure_voltage',
    tokens: ['voltage'],
    units: ['v'],
  },
  {
    capabilityId: 'measure_current',
    tokens: ['current'],
    units: ['a', 'ma'],
  },
  {
    capabilityId: 'measure_pressure',
    tokens: ['pressure'],
    units: ['pa', 'hpa', 'kpa', 'bar', 'mbar'],
  },
];

export const NOTIFICATION_CAPABILITY_HINTS: TokenCapabilityHint[] = [
  { capabilityId: 'alarm_motion', tokens: ['motion', 'pir'], confidence: 'high' },
  {
    capabilityId: 'alarm_contact',
    tokens: ['contact', 'door', 'window'],
    confidence: 'high',
  },
  { capabilityId: 'alarm_smoke', tokens: ['smoke', 'fire'], confidence: 'medium' },
  { capabilityId: 'alarm_water', tokens: ['water', 'leak', 'flood'], confidence: 'medium' },
  { capabilityId: 'alarm_tamper', tokens: ['tamper'], confidence: 'medium' },
];

export const DIRECT_COMMAND_CLASS_SEMANTICS: Record<number, DirectCommandClassSemantic> = {
  91: { capabilityId: 'button_action', confidence: 'high' },
  98: { capabilityId: 'locked', confidence: 'high' },
  113: { capabilityId: SEMANTIC_CAPABILITY_IDS.alarmGeneric, confidence: 'medium' },
  121: { capabilityId: 'windowcoverings_set', confidence: 'high' },
  128: { capabilityId: 'measure_battery', confidence: 'high' },
};

export const CAPABILITY_RELEVANCE_SCORES: Record<string, number> = {
  onoff: 24,
  dim: 22,
  windowcoverings_set: 20,
  locked: 18,
  measure_temperature: 16,
  measure_humidity: 16,
  measure_luminance: 16,
  measure_power: 16,
  meter_power: 16,
  measure_battery: 16,
  alarm_motion: 14,
  alarm_contact: 14,
  alarm_smoke: 14,
  alarm_water: 14,
  alarm_tamper: 14,
  alarm_generic: 14,
  button_action: 12,
  enum_select: 8,
  measure_generic: 4,
  number_value: 4,
};

export const SENSOR_SECTION_CAPABILITIES = new Set([
  'measure_temperature',
  'measure_humidity',
  'measure_luminance',
  'measure_power',
  'meter_power',
  'measure_voltage',
  'measure_current',
  'measure_pressure',
  'measure_battery',
  'measure_generic',
]);

export const EVENT_SECTION_CAPABILITIES = new Set([
  'alarm_motion',
  'alarm_contact',
  'alarm_smoke',
  'alarm_water',
  'alarm_tamper',
  'alarm_generic',
  'button_action',
]);

export const CONTROL_SECTION_CAPABILITIES = new Set([
  'onoff',
  'dim',
  'windowcoverings_set',
  'locked',
  'enum_select',
  'number_value',
]);

export const SENSOR_SECTION_COMMAND_CLASSES = new Set([49, 50, 128]);
export const EVENT_SECTION_COMMAND_CLASSES = new Set([48, 91, 113]);
export const CONTROL_SECTION_COMMAND_CLASSES = new Set([37, 38, 98, 121]);
export const CONFIG_SECTION_COMMAND_CLASSES = new Set([112]);
export const DIAGNOSTIC_SECTION_COMMAND_CLASSES = new Set([114, 115]);

export const DIAGNOSTIC_HINT_TOKENS = [
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

export const CONFIG_HINT_TOKENS = [
  'configuration',
  'config',
  'parameter',
  'setpoint',
  'threshold',
  'offset',
  'calibration',
  'protection',
];

export const COMMAND_CLASS_RELEVANCE_SCORES: Record<number, number> = {
  37: 30,
  38: 30,
  48: 24,
  49: 24,
  50: 24,
  113: 16,
  91: 14,
  128: 12,
  114: -8,
  115: -8,
  112: -4,
};

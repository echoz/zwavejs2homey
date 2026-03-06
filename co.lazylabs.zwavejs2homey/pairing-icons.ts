export const PAIR_ICON_PATHS = Object.freeze({
  other: '/pair-icons/other.svg',
  bridge: '/pair-icons/bridge.svg',
  light: '/pair-icons/light.svg',
  socket: '/pair-icons/socket.svg',
  sensor: '/pair-icons/sensor.svg',
  lock: '/pair-icons/lock.svg',
  blinds: '/pair-icons/blinds.svg',
  thermostat: '/pair-icons/thermostat.svg',
  fan: '/pair-icons/fan.svg',
  camera: '/pair-icons/camera.svg',
  button: '/pair-icons/button.svg',
  doorbell: '/pair-icons/doorbell.svg',
  siren: '/pair-icons/siren.svg',
  appliance: '/pair-icons/appliance.svg',
  media: '/pair-icons/media.svg',
  vehicle: '/pair-icons/vehicle.svg',
  water: '/pair-icons/water.svg',
} as const);

type PairIconKey = keyof typeof PAIR_ICON_PATHS;

type PairIconClassGroups = Record<PairIconKey, readonly string[]>;

export const PAIR_ICON_CLASS_GROUPS = Object.freeze({
  bridge: ['bridge'],
  light: ['light'],
  socket: ['boiler', 'evcharger', 'fireplace', 'relay', 'socket', 'solarpanel'],
  sensor: ['sensor', 'service'],
  lock: ['garagedoor', 'lock'],
  blinds: ['blinds', 'curtain', 'shutterblinds', 'sunshade', 'windowcoverings'],
  thermostat: [
    'airconditioning',
    'airpurifier',
    'airtreatment',
    'dehumidifier',
    'heater',
    'heatpump',
    'humidifier',
    'radiator',
    'thermostat',
    'waterheater',
  ],
  fan: ['fan', 'hood', 'ventilation'],
  camera: ['camera'],
  button: ['button', 'remote'],
  doorbell: ['doorbell'],
  siren: ['alarm', 'homealarm', 'siren', 'smokealarm'],
  appliance: [
    'airfryer',
    'battery',
    'coffeemachine',
    'cooktop',
    'diffuser',
    'dishwasher',
    'dryer',
    'freezer',
    'fridge',
    'fridge_and_freezer',
    'fryer',
    'grill',
    'kettle',
    'microwave',
    'multicooker',
    'oven',
    'oven_and_microwave',
    'petfeeder',
    'washer',
    'washer_and_dryer',
  ],
  media: ['amplifier', 'gameconsole', 'mediaplayer', 'networkrouter', 'settopbox', 'speaker', 'tv'],
  vehicle: ['bicycle', 'car', 'lawnmower', 'mop', 'scooter', 'vacuumcleaner', 'vehicle'],
  water: ['faucet', 'pump', 'sprinkler', 'waterpurifier', 'watervalve'],
  other: ['other'],
} as const satisfies PairIconClassGroups);

function buildPairIconByHomeyClass(
  groups: PairIconClassGroups,
): Readonly<Record<string, (typeof PAIR_ICON_PATHS)[PairIconKey]>> {
  const byClass: Record<string, (typeof PAIR_ICON_PATHS)[PairIconKey]> = {};
  for (const [iconKey, classes] of Object.entries(groups) as [PairIconKey, readonly string[]][]) {
    const iconPath = PAIR_ICON_PATHS[iconKey] ?? PAIR_ICON_PATHS.other;
    for (const homeyClass of classes) {
      byClass[homeyClass] = iconPath;
    }
  }
  return byClass;
}

export const PAIR_ICON_BY_HOMEY_CLASS = Object.freeze(
  buildPairIconByHomeyClass(PAIR_ICON_CLASS_GROUPS),
);

export const SUPPORTED_HOMEY_PAIR_ICON_CLASSES = Object.freeze(
  Object.keys(PAIR_ICON_BY_HOMEY_CLASS).sort(),
);

export function normalizeHomeyClassForPairIcon(value: unknown): string {
  if (typeof value !== 'string') return 'other';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'other';
  if (Object.prototype.hasOwnProperty.call(PAIR_ICON_BY_HOMEY_CLASS, normalized)) {
    return normalized;
  }
  return 'other';
}

export function resolvePairIconForHomeyClass(value: unknown): string {
  const normalizedClass = normalizeHomeyClassForPairIcon(value);
  return PAIR_ICON_BY_HOMEY_CLASS[normalizedClass] ?? PAIR_ICON_PATHS.other;
}

export function resolveDriverPairIconForHomeyClass(value: unknown, driverId: string): string {
  const normalizedDriverId =
    typeof driverId === 'string' && driverId.trim().length > 0 ? driverId.trim() : 'node';
  const iconPath = resolvePairIconForHomeyClass(value);
  return `/drivers/${normalizedDriverId}/assets${iconPath}`;
}

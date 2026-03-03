'use strict';

const PAIR_ICON_PATHS = Object.freeze({
  other: '/assets/pair-icons/other.svg',
  bridge: '/assets/pair-icons/bridge.svg',
  light: '/assets/pair-icons/light.svg',
  socket: '/assets/pair-icons/socket.svg',
  sensor: '/assets/pair-icons/sensor.svg',
  lock: '/assets/pair-icons/lock.svg',
  blinds: '/assets/pair-icons/blinds.svg',
  thermostat: '/assets/pair-icons/thermostat.svg',
  fan: '/assets/pair-icons/fan.svg',
  camera: '/assets/pair-icons/camera.svg',
  button: '/assets/pair-icons/button.svg',
  doorbell: '/assets/pair-icons/doorbell.svg',
  siren: '/assets/pair-icons/siren.svg',
  appliance: '/assets/pair-icons/appliance.svg',
  media: '/assets/pair-icons/media.svg',
  vehicle: '/assets/pair-icons/vehicle.svg',
  water: '/assets/pair-icons/water.svg',
});

const PAIR_ICON_CLASS_GROUPS = Object.freeze({
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
});

function buildPairIconByHomeyClass(groups) {
  const byClass = {};
  for (const [iconKey, classes] of Object.entries(groups)) {
    const iconPath = PAIR_ICON_PATHS[iconKey] ?? PAIR_ICON_PATHS.other;
    for (const homeyClass of classes) {
      byClass[homeyClass] = iconPath;
    }
  }
  return byClass;
}

const PAIR_ICON_BY_HOMEY_CLASS = Object.freeze(buildPairIconByHomeyClass(PAIR_ICON_CLASS_GROUPS));

const SUPPORTED_HOMEY_PAIR_ICON_CLASSES = Object.freeze(
  Object.keys(PAIR_ICON_BY_HOMEY_CLASS).sort(),
);

function normalizeHomeyClassForPairIcon(value) {
  if (typeof value !== 'string') return 'other';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'other';
  if (Object.prototype.hasOwnProperty.call(PAIR_ICON_BY_HOMEY_CLASS, normalized)) {
    return normalized;
  }
  return 'other';
}

function resolvePairIconForHomeyClass(value) {
  const normalizedClass = normalizeHomeyClassForPairIcon(value);
  return PAIR_ICON_BY_HOMEY_CLASS[normalizedClass] ?? PAIR_ICON_PATHS.other;
}

module.exports = {
  PAIR_ICON_PATHS,
  PAIR_ICON_CLASS_GROUPS,
  PAIR_ICON_BY_HOMEY_CLASS,
  SUPPORTED_HOMEY_PAIR_ICON_CLASSES,
  normalizeHomeyClassForPairIcon,
  resolvePairIconForHomeyClass,
};

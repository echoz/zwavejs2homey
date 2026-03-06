"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_HOMEY_PAIR_ICON_CLASSES = exports.PAIR_ICON_BY_HOMEY_CLASS = exports.PAIR_ICON_CLASS_GROUPS = exports.PAIR_ICON_PATHS = void 0;
exports.normalizeHomeyClassForPairIcon = normalizeHomeyClassForPairIcon;
exports.resolvePairIconForHomeyClass = resolvePairIconForHomeyClass;
exports.resolveDriverPairIconForHomeyClass = resolveDriverPairIconForHomeyClass;
exports.PAIR_ICON_PATHS = Object.freeze({
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
});
exports.PAIR_ICON_CLASS_GROUPS = Object.freeze({
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
        const iconPath = exports.PAIR_ICON_PATHS[iconKey] ?? exports.PAIR_ICON_PATHS.other;
        for (const homeyClass of classes) {
            byClass[homeyClass] = iconPath;
        }
    }
    return byClass;
}
exports.PAIR_ICON_BY_HOMEY_CLASS = Object.freeze(buildPairIconByHomeyClass(exports.PAIR_ICON_CLASS_GROUPS));
exports.SUPPORTED_HOMEY_PAIR_ICON_CLASSES = Object.freeze(Object.keys(exports.PAIR_ICON_BY_HOMEY_CLASS).sort());
function normalizeHomeyClassForPairIcon(value) {
    if (typeof value !== 'string')
        return 'other';
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return 'other';
    if (Object.prototype.hasOwnProperty.call(exports.PAIR_ICON_BY_HOMEY_CLASS, normalized)) {
        return normalized;
    }
    return 'other';
}
function resolvePairIconForHomeyClass(value) {
    const normalizedClass = normalizeHomeyClassForPairIcon(value);
    return exports.PAIR_ICON_BY_HOMEY_CLASS[normalizedClass] ?? exports.PAIR_ICON_PATHS.other;
}
function resolveDriverPairIconForHomeyClass(value, driverId) {
    void driverId;
    return resolvePairIconForHomeyClass(value);
}

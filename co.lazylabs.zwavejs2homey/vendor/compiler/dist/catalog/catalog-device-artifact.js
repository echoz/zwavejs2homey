"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogDeviceArtifactError = void 0;
exports.assertCatalogDevicesArtifactV1 = assertCatalogDevicesArtifactV1;
exports.loadCatalogDevicesArtifact = loadCatalogDevicesArtifact;
const node_fs_1 = __importDefault(require("node:fs"));
class CatalogDeviceArtifactError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CatalogDeviceArtifactError';
    }
}
exports.CatalogDeviceArtifactError = CatalogDeviceArtifactError;
function assertRecord(record, index) {
    if (!record || typeof record !== 'object') {
        throw new CatalogDeviceArtifactError(`devices[${index}] must be an object`);
    }
    const obj = record;
    if (typeof obj.catalogId !== 'string' || obj.catalogId.length === 0) {
        throw new CatalogDeviceArtifactError(`devices[${index}].catalogId must be a non-empty string`);
    }
    for (const key of ['manufacturerId', 'productType', 'productId']) {
        if (obj[key] !== undefined && typeof obj[key] !== 'number') {
            throw new CatalogDeviceArtifactError(`devices[${index}].${key} must be a number`);
        }
    }
    if (obj.label !== undefined && typeof obj.label !== 'string') {
        throw new CatalogDeviceArtifactError(`devices[${index}].label must be a string`);
    }
    if (!Array.isArray(obj.sources)) {
        throw new CatalogDeviceArtifactError(`devices[${index}].sources must be an array`);
    }
    obj.sources.forEach((source, sourceIndex) => {
        if (!source || typeof source !== 'object') {
            throw new CatalogDeviceArtifactError(`devices[${index}].sources[${sourceIndex}] must be an object`);
        }
        const sourceObj = source;
        if (typeof sourceObj.source !== 'string' || sourceObj.source.length === 0) {
            throw new CatalogDeviceArtifactError(`devices[${index}].sources[${sourceIndex}].source must be a non-empty string`);
        }
        if (sourceObj.sourceId !== undefined && typeof sourceObj.sourceId !== 'string') {
            throw new CatalogDeviceArtifactError(`devices[${index}].sources[${sourceIndex}].sourceId must be a string`);
        }
        if (sourceObj.confidence !== undefined &&
            sourceObj.confidence !== 'high' &&
            sourceObj.confidence !== 'medium' &&
            sourceObj.confidence !== 'low') {
            throw new CatalogDeviceArtifactError(`devices[${index}].sources[${sourceIndex}].confidence must be high|medium|low`);
        }
    });
}
function assertCatalogDevicesArtifactV1(input) {
    if (!input || typeof input !== 'object') {
        throw new CatalogDeviceArtifactError('Catalog artifact must be an object');
    }
    const obj = input;
    if (obj.schemaVersion !== 'catalog-devices/v1') {
        throw new CatalogDeviceArtifactError('schemaVersion must be "catalog-devices/v1"');
    }
    if (!obj.source || typeof obj.source !== 'object') {
        throw new CatalogDeviceArtifactError('source must be an object');
    }
    const source = obj.source;
    if (typeof source.generatedAt !== 'string') {
        throw new CatalogDeviceArtifactError('source.generatedAt must be a string');
    }
    if (typeof source.sourceRef !== 'string') {
        throw new CatalogDeviceArtifactError('source.sourceRef must be a string');
    }
    if (!Array.isArray(obj.devices)) {
        throw new CatalogDeviceArtifactError('devices must be an array');
    }
    obj.devices.forEach((record, index) => assertRecord(record, index));
}
function loadCatalogDevicesArtifact(filePath) {
    const parsed = JSON.parse(node_fs_1.default.readFileSync(filePath, 'utf8'));
    assertCatalogDevicesArtifactV1(parsed);
    return parsed;
}

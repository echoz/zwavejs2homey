"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZwjsInspectCatalogSourceError = void 0;
exports.catalogDeviceRecordFromZwjsInspectNodeDetail = catalogDeviceRecordFromZwjsInspectNodeDetail;
exports.catalogArtifactFromZwjsInspectNodeDetail = catalogArtifactFromZwjsInspectNodeDetail;
exports.loadCatalogArtifactFromZwjsInspectNodeDetailFile = loadCatalogArtifactFromZwjsInspectNodeDetailFile;
const node_fs_1 = __importDefault(require("node:fs"));
class ZwjsInspectCatalogSourceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ZwjsInspectCatalogSourceError';
    }
}
exports.ZwjsInspectCatalogSourceError = ZwjsInspectCatalogSourceError;
function parseNumericId(input, field) {
    if (input === undefined || input === null || input === '')
        return undefined;
    if (typeof input === 'number') {
        if (!Number.isFinite(input) || input < 0) {
            throw new ZwjsInspectCatalogSourceError(`${field} must be a non-negative number`);
        }
        return input;
    }
    if (typeof input !== 'string') {
        throw new ZwjsInspectCatalogSourceError(`${field} must be a number or string`);
    }
    const trimmed = input.trim();
    if (!trimmed)
        return undefined;
    const hasHexPrefix = trimmed.toLowerCase().startsWith('0x');
    const normalized = hasHexPrefix ? trimmed.slice(2) : trimmed;
    const base = hasHexPrefix || /[a-f]/i.test(normalized) ? 16 : 10;
    const parsed = Number.parseInt(normalized, base);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ZwjsInspectCatalogSourceError(`${field} must be parseable as a non-negative integer`);
    }
    return parsed;
}
function toCatalogId(manufacturerId, productType, productId, nodeId) {
    if (manufacturerId !== undefined && productType !== undefined && productId !== undefined) {
        const hex = (value) => value.toString(16).padStart(4, '0');
        return `zwjs:${hex(manufacturerId)}-${hex(productType)}-${hex(productId)}`;
    }
    if (nodeId !== undefined) {
        return `zwjs-node:${nodeId}`;
    }
    throw new ZwjsInspectCatalogSourceError('Unable to derive catalogId from zwjs-inspect node detail (missing ids and nodeId)');
}
function catalogDeviceRecordFromZwjsInspectNodeDetail(input) {
    if (!input || typeof input !== 'object') {
        throw new ZwjsInspectCatalogSourceError('zwjs-inspect node detail payload must be an object');
    }
    const detail = input;
    if (!detail.state || typeof detail.state !== 'object') {
        throw new ZwjsInspectCatalogSourceError('zwjs-inspect node detail payload must include state');
    }
    const manufacturerId = parseNumericId(detail.state.manufacturerId, 'state.manufacturerId');
    const productType = parseNumericId(detail.state.productType, 'state.productType');
    const productId = parseNumericId(detail.state.productId, 'state.productId');
    const catalogId = toCatalogId(manufacturerId, productType, productId, detail.nodeId);
    const label = detail.state.deviceConfig?.label ?? detail.state.product ?? detail.state.name ?? undefined;
    return {
        catalogId,
        manufacturerId,
        productType,
        productId,
        label,
        sources: [
            {
                source: 'zwjs-inspect-node-detail',
                sourceId: detail.nodeId != null ? String(detail.nodeId) : undefined,
                confidence: manufacturerId !== undefined && productType !== undefined && productId !== undefined
                    ? 'medium'
                    : 'low',
            },
        ],
    };
}
function catalogArtifactFromZwjsInspectNodeDetail(input, options = { sourceRef: 'zwjs-inspect-node-detail' }) {
    const record = catalogDeviceRecordFromZwjsInspectNodeDetail(input);
    return {
        schemaVersion: 'catalog-devices/v1',
        source: {
            generatedAt: options.generatedAt ?? new Date().toISOString(),
            sourceRef: options.sourceRef,
        },
        devices: [record],
    };
}
function loadCatalogArtifactFromZwjsInspectNodeDetailFile(filePath) {
    const parsed = JSON.parse(node_fs_1.default.readFileSync(filePath, 'utf8'));
    return catalogArtifactFromZwjsInspectNodeDetail(parsed, {
        sourceRef: `zwjs-inspect-node-detail:${filePath}`,
    });
}

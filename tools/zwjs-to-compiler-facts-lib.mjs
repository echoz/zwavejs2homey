function parseHexish(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = trimmed.startsWith('0x')
    ? Number.parseInt(trimmed.slice(2), 16)
    : Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function isControllerLikeZwjsNodeDetail(detail) {
  const state = detail?.state ?? {};
  const nodeId = typeof detail?.nodeId === 'number' ? detail.nodeId : undefined;
  const genericClass = String(state?.deviceClass?.generic ?? '').toLowerCase();
  const basicClass = String(state?.deviceClass?.basic ?? '').toLowerCase();
  const label = String(state?.label ?? '').toLowerCase();
  const values = Array.isArray(detail?.values) ? detail.values : [];

  if (genericClass.includes('controller') || basicClass.includes('controller')) return true;
  if (label.includes('controller') && values.length === 0) return true;
  if (nodeId === 1 && values.length === 0 && genericClass.includes('static')) return true;
  return false;
}

export function normalizeCompilerDeviceFactsFromZwjsDetail(detail) {
  const state = detail?.state ?? {};
  const manufacturerId = parseHexish(state.manufacturerId);
  const productType = parseHexish(state.productType);
  const productId = parseHexish(state.productId);
  const values = Array.isArray(detail?.values)
    ? detail.values
        .filter((row) => row && row.valueId && !row._error)
        .map((row) => ({
          valueId: {
            commandClass: row.valueId.commandClass,
            endpoint: row.valueId.endpoint,
            property: row.valueId.property,
            propertyKey: row.valueId.propertyKey,
          },
          metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
          propertyName: row.valueId.propertyName,
          propertyKeyName: row.valueId.propertyKeyName,
          commandClassName: row.valueId.commandClassName,
        }))
    : [];
  const parts =
    manufacturerId !== undefined && productType !== undefined && productId !== undefined
      ? [manufacturerId, productType, productId]
          .map((n) => n.toString(16).padStart(4, '0'))
          .join('-')
      : `node-${detail?.nodeId ?? 'unknown'}`;
  return {
    deviceKey: `zwjs-live:${parts}`,
    nodeId: typeof detail?.nodeId === 'number' ? detail.nodeId : undefined,
    manufacturerId,
    productType,
    productId,
    firmwareVersion: typeof state.firmwareVersion === 'string' ? state.firmwareVersion : undefined,
    values,
  };
}

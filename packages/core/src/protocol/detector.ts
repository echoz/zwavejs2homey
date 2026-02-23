export interface DetectedProtocolInfo {
  serverVersion?: string;
}

export function detectProtocolInfo(message: unknown): DetectedProtocolInfo {
  if (typeof message !== 'object' || message === null) return {};
  const record = message as Record<string, unknown>;
  if (record.type === 'version') {
    return {
      serverVersion: typeof record.serverVersion === 'string' ? record.serverVersion : undefined,
    };
  }
  if (typeof record.version === 'string') return { serverVersion: record.version };
  if (typeof record.serverVersion === 'string') return { serverVersion: record.serverVersion };
  if (
    typeof record.type === 'string' &&
    record.type === 'server.info' &&
    typeof record.payload === 'object' &&
    record.payload
  ) {
    const payload = record.payload as Record<string, unknown>;
    if (typeof payload.serverVersion === 'string') return { serverVersion: payload.serverVersion };
  }
  return {};
}

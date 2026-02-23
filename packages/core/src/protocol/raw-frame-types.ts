export interface RawFrame {
  [key: string]: unknown;
}

export interface ZwjsVersionFrame extends RawFrame {
  type: 'version';
  driverVersion: string;
  serverVersion: string;
  homeId?: number;
  minSchemaVersion: number;
  maxSchemaVersion: number;
}

export interface ZwjsEventFrame extends RawFrame {
  type: 'event';
  event: {
    source: string;
    event: string;
    [key: string]: unknown;
  };
}

export interface ZwjsResultFrame<TResult = unknown> extends RawFrame {
  type: 'result';
  messageId: string;
  success: boolean;
  result?: TResult;
  error?: unknown;
}

export interface ZwjsProtocolCommandFrame<TArgs = Record<string, unknown>> extends RawFrame {
  messageId: string;
  command: string;
  [key: string]: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isZwjsVersionFrame(value: unknown): value is ZwjsVersionFrame {
  return (
    isRecord(value) &&
    value.type === 'version' &&
    typeof value.driverVersion === 'string' &&
    typeof value.serverVersion === 'string' &&
    typeof value.minSchemaVersion === 'number' &&
    typeof value.maxSchemaVersion === 'number'
  );
}

export function isZwjsEventFrame(value: unknown): value is ZwjsEventFrame {
  return (
    isRecord(value) &&
    value.type === 'event' &&
    isRecord(value.event) &&
    typeof value.event.source === 'string' &&
    typeof value.event.event === 'string'
  );
}

export function isZwjsResultFrame(value: unknown): value is ZwjsResultFrame {
  return (
    isRecord(value) &&
    value.type === 'result' &&
    typeof value.messageId === 'string' &&
    typeof value.success === 'boolean'
  );
}

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
export interface ZwjsResultSuccessFrame<TResult = unknown> extends RawFrame {
    type: 'result';
    messageId: string;
    success: true;
    result: TResult;
}
export interface ZwjsResultErrorFrame extends RawFrame {
    type: 'result';
    messageId: string;
    success: false;
    errorCode?: string;
    zwaveErrorCode?: number;
    zwaveErrorMessage?: string;
    error?: unknown;
}
export type ZwjsResultFrame<TResult = unknown> = ZwjsResultSuccessFrame<TResult> | ZwjsResultErrorFrame;
export interface ZwjsProtocolCommandFrame<TArgs = Record<string, unknown>> extends RawFrame {
    messageId: string;
    command: string;
    [key: string]: unknown;
}
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function isZwjsVersionFrame(value: unknown): value is ZwjsVersionFrame;
export declare function isZwjsEventFrame(value: unknown): value is ZwjsEventFrame;
export declare function isZwjsResultFrame(value: unknown): value is ZwjsResultFrame;
export declare function isZwjsResultSuccessFrame(value: unknown): value is ZwjsResultSuccessFrame;
export declare function isZwjsResultErrorFrame(value: unknown): value is ZwjsResultErrorFrame;
//# sourceMappingURL=raw-frame-types.d.ts.map
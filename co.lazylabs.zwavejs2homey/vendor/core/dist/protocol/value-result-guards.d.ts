import type { ZwjsDurationValue, ZwjsFirmwareVersionsValue, ZwjsLockHandleFlagsValue, ZwjsNodeValueEnvelopeResult, ZwjsNodeValueResult, ZwjsValueId } from '../client/types';
export declare function isZwjsNodeValueEnvelopeResult(value: unknown): value is ZwjsNodeValueEnvelopeResult;
export declare function extractZwjsNodeValue(result: ZwjsNodeValueResult | unknown): unknown;
export declare function hasZwjsNodeValue(result: ZwjsNodeValueResult | unknown): boolean;
export declare function isZwjsDurationValue(value: unknown): value is ZwjsDurationValue;
export declare function isZwjsLockHandleFlagsValue(value: unknown): value is ZwjsLockHandleFlagsValue;
export declare function isZwjsFirmwareVersionsValue(value: unknown): value is ZwjsFirmwareVersionsValue;
export declare function extractZwjsDurationValue(result: ZwjsNodeValueResult | unknown): ZwjsDurationValue | undefined;
export declare function extractZwjsLockHandleFlagsValue(result: ZwjsNodeValueResult | unknown): ZwjsLockHandleFlagsValue | undefined;
export declare function extractZwjsFirmwareVersionsValue(result: ZwjsNodeValueResult | unknown): ZwjsFirmwareVersionsValue | undefined;
export declare function isZwjsSwitchDurationValueSample(valueId: ZwjsValueId, result: ZwjsNodeValueResult | unknown): boolean;
export declare function isZwjsLockHandleFlagsValueSample(valueId: ZwjsValueId, result: ZwjsNodeValueResult | unknown): boolean;
export declare function isZwjsFirmwareVersionsValueSample(valueId: ZwjsValueId, result: ZwjsNodeValueResult | unknown): boolean;
//# sourceMappingURL=value-result-guards.d.ts.map
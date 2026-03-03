import type { ZwjsDefinedValueId, ZwjsDefinedValueIdsResult, ZwjsValueId } from '../client/types';
export declare function isZwjsValueId(value: unknown): value is ZwjsValueId;
export declare function isZwjsDefinedValueId(value: unknown): value is ZwjsDefinedValueId;
export declare function extractZwjsDefinedValueIds(result: ZwjsDefinedValueIdsResult | unknown): ZwjsDefinedValueId[];
//# sourceMappingURL=value-id-guards.d.ts.map
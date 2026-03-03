import type { RuntimeCurationPatchSetV1 } from './types';
export declare class RuntimeCurationPatchValidationError extends Error {
    constructor(message: string);
}
export declare function assertRuntimeCurationPatchSetV1(input: unknown): asserts input is RuntimeCurationPatchSetV1;
export declare function validateRuntimeCurationPatchSetV1(input: unknown): {
    ok: true;
    value: RuntimeCurationPatchSetV1;
} | {
    ok: false;
    error: RuntimeCurationPatchValidationError;
};

export interface HaPlatformOutput {
    homeyClass: string;
    driverTemplateId: string;
    capabilityId: string;
    [key: string]: unknown;
}
export interface HaPrimaryValueRef {
    commandClass: number;
    property?: string | number;
}
export interface HaCapabilityConflict {
    key: string;
    mode: 'exclusive' | 'allow-multi';
    priority: number;
}
export declare function resolveHaPlatformOutput(platform: string, primaryValue: HaPrimaryValueRef): HaPlatformOutput | null;
export declare function resolveHaCapabilityConflict(primaryValue: HaPrimaryValueRef, capabilityId: string | undefined): HaCapabilityConflict | undefined;

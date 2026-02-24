export type RuntimeCurationPatchSchemaVersion = 'runtime-curation-patches/v1';

export type RuntimeCurationPatchTarget =
  | {
      scope: 'device';
      slot: 'identity.homeyClass' | 'identity.driverTemplateId';
    }
  | {
      scope: 'capability';
      capabilityId: string;
      slot: 'inboundMapping' | 'outboundMapping' | 'flags';
    }
  | {
      scope: 'profile';
      slot: 'capabilities' | 'subscriptions' | 'ignoredValues';
    };

export interface RuntimeCurationPatchOpBase {
  opId?: string;
  target: RuntimeCurationPatchTarget;
}

export interface RuntimeCurationReplaceOperation extends RuntimeCurationPatchOpBase {
  op: 'replace';
  value: unknown;
}

export interface RuntimeCurationAddOperation extends RuntimeCurationPatchOpBase {
  op: 'add';
  value: unknown;
}

export interface RuntimeCurationRemoveOperation extends RuntimeCurationPatchOpBase {
  op: 'remove';
  value?: unknown;
}

export interface RuntimeCurationDisableOperation extends RuntimeCurationPatchOpBase {
  op: 'disable';
}

export type RuntimeCurationPatchOperation =
  | RuntimeCurationReplaceOperation
  | RuntimeCurationAddOperation
  | RuntimeCurationRemoveOperation
  | RuntimeCurationDisableOperation;

export interface RuntimeCurationPatchTargetDevice {
  catalogId?: string;
  diagnosticDeviceKey?: string;
}

export interface RuntimeCurationPatch {
  patchId: string;
  targetDevice: RuntimeCurationPatchTargetDevice;
  operations: RuntimeCurationPatchOperation[];
  note?: string;
}

export interface RuntimeCurationPatchSetV1 {
  schemaVersion: RuntimeCurationPatchSchemaVersion;
  generatedAt?: string;
  patches: RuntimeCurationPatch[];
}

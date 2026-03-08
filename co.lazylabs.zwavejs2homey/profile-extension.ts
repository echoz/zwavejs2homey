export const PROFILE_EXTENSION_SCHEMA_VERSION = 'homey-profile-extension-contract/v1';

export type ProfileExtensionSafetyCheckV1 =
  | 'requires-supported-profile'
  | 'requires-node-ready'
  | 'requires-write-access'
  | 'requires-selector-writeability'
  | 'requires-explicit-confirmation';

export type ProfileExtensionActionArgumentTypeV1 =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum';

export interface ProfileExtensionActionArgumentSchemaV1 {
  name: string;
  type: ProfileExtensionActionArgumentTypeV1;
  description?: string;
  required?: boolean;
  enumValues?: readonly string[];
}

export interface ProfileExtensionActionContractV1 {
  actionId: string;
  title: string;
  description: string;
  dryRunSupported: boolean;
  safetyChecks: readonly ProfileExtensionSafetyCheckV1[];
  arguments?: readonly ProfileExtensionActionArgumentSchemaV1[];
}

export interface ProfileExtensionReadSectionContractV1 {
  sectionId: string;
  title: string;
  description: string;
}

export interface ProfileExtensionMatchPredicateV1 {
  profileIds?: readonly string[];
  driverTemplateIds?: readonly string[];
  homeyClasses?: readonly string[];
}

export interface ProfileExtensionContractV1 {
  schemaVersion: typeof PROFILE_EXTENSION_SCHEMA_VERSION;
  extensionId: string;
  title: string;
  description: string;
  match: ProfileExtensionMatchPredicateV1;
  read: {
    sections: readonly ProfileExtensionReadSectionContractV1[];
  };
  actions: readonly ProfileExtensionActionContractV1[];
}

export interface ProfileExtensionMatchContextV1 {
  profileId?: string | null;
  driverTemplateId?: string | null;
  homeyClass?: string | null;
}

export type ProfileExtensionMatchReasonV1 =
  | 'matched'
  | 'missing-profile-id'
  | 'profile-id-mismatch'
  | 'missing-driver-template-id'
  | 'driver-template-id-mismatch'
  | 'missing-homey-class'
  | 'homey-class-mismatch'
  | 'extension-not-found';

export interface ProfileExtensionMatchExplanationV1 {
  extensionId: string;
  matched: boolean;
  reason: ProfileExtensionMatchReasonV1;
}

export class ProfileExtensionRegistryError extends Error {
  public readonly code: string;

  public readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ProfileExtensionRegistryError';
    this.code = code;
    this.details = details;
  }
}

const ACTION_ARGUMENT_TYPES = new Set<ProfileExtensionActionArgumentTypeV1>([
  'string',
  'number',
  'integer',
  'boolean',
  'enum',
]);

const SAFETY_CHECKS = new Set<ProfileExtensionSafetyCheckV1>([
  'requires-supported-profile',
  'requires-node-ready',
  'requires-write-access',
  'requires-selector-writeability',
  'requires-explicit-confirmation',
]);

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `${label} must be an object`,
      label,
    );
  }
}

function normalizeNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new ProfileExtensionRegistryError('invalid-contract', `${label} must be a string`, label);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `${label} must be a non-empty string`,
      label,
    );
  }
  return trimmed;
}

function normalizeStringList(value: unknown, label: string): string[] {
  if (typeof value === 'undefined') return [];
  if (!Array.isArray(value)) {
    throw new ProfileExtensionRegistryError('invalid-contract', `${label} must be an array`, label);
  }

  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = normalizeNonEmptyString(item, label);
    if (seen.has(normalized)) {
      throw new ProfileExtensionRegistryError(
        'invalid-contract',
        `${label} contains duplicate value: ${normalized}`,
        { label, value: normalized },
      );
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `${label} must be a boolean`,
      label,
    );
  }
  return value;
}

function normalizeOptionalDescription(value: unknown, label: string): string | undefined {
  if (typeof value === 'undefined') return undefined;
  return normalizeNonEmptyString(value, label);
}

function normalizeMatchPredicate(
  value: unknown,
  label: string,
): Required<ProfileExtensionMatchPredicateV1> {
  assertObject(value, label);
  const profileIds = normalizeStringList(value.profileIds, `${label}.profileIds`);
  const driverTemplateIds = normalizeStringList(
    value.driverTemplateIds,
    `${label}.driverTemplateIds`,
  );
  const homeyClasses = normalizeStringList(value.homeyClasses, `${label}.homeyClasses`);

  if (profileIds.length === 0 && driverTemplateIds.length === 0 && homeyClasses.length === 0) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `${label} must define at least one predicate list`,
      label,
    );
  }

  return {
    profileIds,
    driverTemplateIds,
    homeyClasses,
  };
}

function normalizeActionArgument(
  value: unknown,
  extensionId: string,
  actionId: string,
  index: number,
): ProfileExtensionActionArgumentSchemaV1 {
  const label = `extension(${extensionId}).actions(${actionId}).arguments[${index}]`;
  assertObject(value, label);

  const name = normalizeNonEmptyString(value.name, `${label}.name`);
  const rawType = normalizeNonEmptyString(value.type, `${label}.type`);
  if (!ACTION_ARGUMENT_TYPES.has(rawType as ProfileExtensionActionArgumentTypeV1)) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `${label}.type must be one of: ${Array.from(ACTION_ARGUMENT_TYPES).join(', ')}`,
      { label: `${label}.type`, value: rawType },
    );
  }

  const type = rawType as ProfileExtensionActionArgumentTypeV1;
  const description = normalizeOptionalDescription(value.description, `${label}.description`);
  const required =
    typeof value.required === 'undefined'
      ? false
      : normalizeBoolean(value.required, `${label}.required`);

  const enumValues = normalizeStringList(value.enumValues, `${label}.enumValues`);
  if (type === 'enum' && enumValues.length === 0) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `${label}.enumValues must be defined when argument type is enum`,
      label,
    );
  }
  if (type !== 'enum' && enumValues.length > 0) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `${label}.enumValues is only valid when argument type is enum`,
      label,
    );
  }

  return {
    name,
    type,
    description,
    required,
    enumValues: enumValues.length > 0 ? enumValues : undefined,
  };
}

function normalizeActionContract(
  value: unknown,
  extensionId: string,
  index: number,
): ProfileExtensionActionContractV1 {
  const label = `extension(${extensionId}).actions[${index}]`;
  assertObject(value, label);

  const actionId = normalizeNonEmptyString(value.actionId, `${label}.actionId`);
  const title = normalizeNonEmptyString(value.title, `${label}.title`);
  const description = normalizeNonEmptyString(value.description, `${label}.description`);
  const dryRunSupported = normalizeBoolean(value.dryRunSupported, `${label}.dryRunSupported`);

  const safetyChecks = normalizeStringList(value.safetyChecks, `${label}.safetyChecks`);
  if (safetyChecks.length === 0) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `${label}.safetyChecks must contain at least one entry`,
      label,
    );
  }
  for (const check of safetyChecks) {
    if (!SAFETY_CHECKS.has(check as ProfileExtensionSafetyCheckV1)) {
      throw new ProfileExtensionRegistryError(
        'invalid-contract',
        `${label}.safetyChecks includes unsupported check: ${check}`,
        { label: `${label}.safetyChecks`, value: check },
      );
    }
  }

  const argumentsValue = value.arguments;
  let normalizedArguments: ProfileExtensionActionArgumentSchemaV1[] = [];
  if (typeof argumentsValue !== 'undefined') {
    if (!Array.isArray(argumentsValue)) {
      throw new ProfileExtensionRegistryError(
        'invalid-contract',
        `${label}.arguments must be an array`,
        `${label}.arguments`,
      );
    }

    const seenArgumentNames = new Set<string>();
    normalizedArguments = argumentsValue.map((entry, argumentIndex) =>
      normalizeActionArgument(entry, extensionId, actionId, argumentIndex),
    );
    for (const entry of normalizedArguments) {
      if (seenArgumentNames.has(entry.name)) {
        throw new ProfileExtensionRegistryError(
          'invalid-contract',
          `${label}.arguments contains duplicate name: ${entry.name}`,
          { label: `${label}.arguments`, value: entry.name },
        );
      }
      seenArgumentNames.add(entry.name);
    }
  }

  return {
    actionId,
    title,
    description,
    dryRunSupported,
    safetyChecks: safetyChecks as ProfileExtensionSafetyCheckV1[],
    arguments: normalizedArguments.length > 0 ? normalizedArguments : undefined,
  };
}

function normalizeReadSections(
  value: unknown,
  extensionId: string,
): readonly ProfileExtensionReadSectionContractV1[] {
  const label = `extension(${extensionId}).read.sections`;
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `${label} must be a non-empty array`,
      label,
    );
  }

  const seenSectionIds = new Set<string>();
  return value.map((entry, index) => {
    const sectionLabel = `${label}[${index}]`;
    assertObject(entry, sectionLabel);
    const sectionId = normalizeNonEmptyString(entry.sectionId, `${sectionLabel}.sectionId`);
    if (seenSectionIds.has(sectionId)) {
      throw new ProfileExtensionRegistryError(
        'invalid-contract',
        `${label} contains duplicate sectionId: ${sectionId}`,
        { label, value: sectionId },
      );
    }
    seenSectionIds.add(sectionId);

    return {
      sectionId,
      title: normalizeNonEmptyString(entry.title, `${sectionLabel}.title`),
      description: normalizeNonEmptyString(entry.description, `${sectionLabel}.description`),
    };
  });
}

function normalizeContract(value: unknown): ProfileExtensionContractV1 {
  assertObject(value, 'extension');

  const extensionId = normalizeNonEmptyString(value.extensionId, 'extension.extensionId');
  const schemaVersion = normalizeNonEmptyString(
    value.schemaVersion,
    `extension(${extensionId}).schemaVersion`,
  );
  if (schemaVersion !== PROFILE_EXTENSION_SCHEMA_VERSION) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `extension(${extensionId}).schemaVersion must be ${PROFILE_EXTENSION_SCHEMA_VERSION}`,
      { extensionId, schemaVersion },
    );
  }

  const title = normalizeNonEmptyString(value.title, `extension(${extensionId}).title`);
  const description = normalizeNonEmptyString(
    value.description,
    `extension(${extensionId}).description`,
  );

  const match = normalizeMatchPredicate(value.match, `extension(${extensionId}).match`);

  assertObject(value.read, `extension(${extensionId}).read`);
  const sections = normalizeReadSections(value.read.sections, extensionId);

  if (!Array.isArray(value.actions)) {
    throw new ProfileExtensionRegistryError(
      'invalid-contract',
      `extension(${extensionId}).actions must be an array`,
      `extension(${extensionId}).actions`,
    );
  }

  const normalizedActions = value.actions.map((entry, index) =>
    normalizeActionContract(entry, extensionId, index),
  );
  const seenActionIds = new Set<string>();
  for (const action of normalizedActions) {
    if (seenActionIds.has(action.actionId)) {
      throw new ProfileExtensionRegistryError(
        'invalid-contract',
        `extension(${extensionId}).actions contains duplicate actionId: ${action.actionId}`,
        { extensionId, actionId: action.actionId },
      );
    }
    seenActionIds.add(action.actionId);
  }

  return {
    schemaVersion: PROFILE_EXTENSION_SCHEMA_VERSION,
    extensionId,
    title,
    description,
    match,
    read: {
      sections,
    },
    actions: normalizedActions,
  };
}

function normalizeMatchContextValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAllowedValue(value: string | null, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  if (!value) return false;
  return allowed.includes(value);
}

function explainPredicateMatch(
  contract: ProfileExtensionContractV1,
  context: ProfileExtensionMatchContextV1,
): ProfileExtensionMatchExplanationV1 {
  const profileId = normalizeMatchContextValue(context.profileId);
  if (!isAllowedValue(profileId, contract.match.profileIds ?? [])) {
    return {
      extensionId: contract.extensionId,
      matched: false,
      reason: profileId ? 'profile-id-mismatch' : 'missing-profile-id',
    };
  }

  const driverTemplateId = normalizeMatchContextValue(context.driverTemplateId);
  if (!isAllowedValue(driverTemplateId, contract.match.driverTemplateIds ?? [])) {
    return {
      extensionId: contract.extensionId,
      matched: false,
      reason: driverTemplateId ? 'driver-template-id-mismatch' : 'missing-driver-template-id',
    };
  }

  const homeyClass = normalizeMatchContextValue(context.homeyClass);
  if (!isAllowedValue(homeyClass, contract.match.homeyClasses ?? [])) {
    return {
      extensionId: contract.extensionId,
      matched: false,
      reason: homeyClass ? 'homey-class-mismatch' : 'missing-homey-class',
    };
  }

  return {
    extensionId: contract.extensionId,
    matched: true,
    reason: 'matched',
  };
}

export class ProfileExtensionRegistry {
  private readonly contracts: readonly ProfileExtensionContractV1[];

  private readonly contractsById: ReadonlyMap<string, ProfileExtensionContractV1>;

  constructor(contracts: readonly ProfileExtensionContractV1[]) {
    if (!Array.isArray(contracts)) {
      throw new ProfileExtensionRegistryError(
        'invalid-contract-list',
        'profile extension contracts must be an array',
      );
    }

    const normalizedContracts = contracts.map((contract) => normalizeContract(contract));
    const byId = new Map<string, ProfileExtensionContractV1>();
    for (const contract of normalizedContracts) {
      if (byId.has(contract.extensionId)) {
        throw new ProfileExtensionRegistryError(
          'duplicate-extension-id',
          `Duplicate profile extension id: ${contract.extensionId}`,
          contract.extensionId,
        );
      }
      byId.set(contract.extensionId, contract);
    }

    this.contracts = Object.freeze(normalizedContracts.map((entry) => Object.freeze(entry)));
    this.contractsById = byId;
  }

  list(): readonly ProfileExtensionContractV1[] {
    return this.contracts;
  }

  get(extensionId: string): ProfileExtensionContractV1 | undefined {
    const normalized = normalizeMatchContextValue(extensionId);
    if (!normalized) return undefined;
    return this.contractsById.get(normalized);
  }

  explain(context: ProfileExtensionMatchContextV1): readonly ProfileExtensionMatchExplanationV1[] {
    return this.contracts.map((contract) => explainPredicateMatch(contract, context));
  }

  explainMatch(
    extensionId: string,
    context: ProfileExtensionMatchContextV1,
  ): ProfileExtensionMatchExplanationV1 {
    const contract = this.get(extensionId);
    if (!contract) {
      return {
        extensionId: normalizeMatchContextValue(extensionId) ?? '',
        matched: false,
        reason: 'extension-not-found',
      };
    }
    return explainPredicateMatch(contract, context);
  }

  resolve(context: ProfileExtensionMatchContextV1): readonly ProfileExtensionContractV1[] {
    return this.explain(context)
      .filter((entry) => entry.matched)
      .map((entry) => this.contractsById.get(entry.extensionId))
      .filter((entry): entry is ProfileExtensionContractV1 => Boolean(entry));
  }

  resolveAction(
    extensionId: string,
    actionId: string,
  ): ProfileExtensionActionContractV1 | undefined {
    const contract = this.get(extensionId);
    if (!contract) return undefined;
    const normalizedActionId = normalizeMatchContextValue(actionId);
    if (!normalizedActionId) return undefined;
    return contract.actions.find((action) => action.actionId === normalizedActionId);
  }
}

export function createProfileExtensionRegistry(
  contracts: readonly ProfileExtensionContractV1[] = [],
): ProfileExtensionRegistry {
  return new ProfileExtensionRegistry(contracts);
}

export const PROFILE_EXTENSION_CONTRACTS_V1: readonly ProfileExtensionContractV1[] = Object.freeze(
  [],
);
